use std::sync::Mutex;
use std::io::{Read, Write};
use std::net::TcpListener;
use tauri::{AppHandle, Manager, Emitter};
use serde::{Deserialize, Serialize};

use tauri_plugin_shell::ShellExt;

// --- 설정 (개발자 설정 필요) ---
// 실제 배포 시에는 빌드 타임 환경변수나 비밀 저장소를 사용해야 합니다.
const GOOGLE_CLIENT_ID: &str = "350522583564-rtfcdvrv9npbgih5k0addjt4631v9r3j.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET: &str = "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"; // Native App에서는 Secret이 노출될 수밖에 없음 (PKCE 권장)
const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";

// --- 데이터 모델 ---

#[derive(Default)]
pub struct GoogleDriveState {
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct GoogleFile {
    pub id: String,
    pub name: String,
    pub mimeType: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct GoogleFileListResponse {
    files: Vec<GoogleFile>,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    // expires_in, etc.
}

// --- 커맨드 ---

#[tauri::command]
pub async fn init_google_auth(app: AppHandle, state: tauri::State<'_, Mutex<GoogleDriveState>>) -> Result<String, String> {
    // 1. 로컬 리스너 시작 (랜덤 포트)
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    
    // 2. 인증 URL 생성
    let redirect_uri = format!("http://127.0.0.1:{}", port);
    let url = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope=https://www.googleapis.com/auth/drive.readonly",
        AUTH_URL, GOOGLE_CLIENT_ID, redirect_uri
    );

    // 3. 브라우저 열기
    app.shell().open(&url, None).map_err(|e| e.to_string())?;

    // 4. 콜백 대기 (블로킹이지만 async 함수라 스레드풀에서 실행됨)
    // 간단한 처리를 위해 첫 번째 연결만 수락
    let (mut stream, _) = listener.accept().map_err(|e| e.to_string())?;
    
    let mut buffer = [0; 1024];
    stream.read(&mut buffer).map_err(|e| e.to_string())?;
    let request = String::from_utf8_lossy(&buffer);

    // 5. 코드 추출
    // GET /?code=... HTTP/1.1
    let code = if let Some(start) = request.find("code=") {
        let rest = &request[start + 5..];
        let end = rest.find(' ').or_else(|| rest.find('&')).unwrap_or(rest.len());
        &rest[..end]
    } else {
        return Err("Failed to extract auth code".to_string());
    };

    // 6. 응답 전송
    let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n
    <html><body><h1>Login Successful!</h1><p>You can close this window and return to the app.</p>
    <script>window.close();</script></body></html>";
    stream.write_all(response.as_bytes()).map_err(|e| e.to_string())?;
    stream.flush().map_err(|e| e.to_string())?;

    // 7. 토큰 교환
    // 이전 단계와 동일: Code -> Token
    // finish_google_auth 로직을 여기서 바로 수행
    // (TcpListener 방식은 한 흐름에서 완료되므로 별도 finish 커멘드 불필요)
    
    let client = reqwest::Client::new();
    let params = [
        ("client_id", GOOGLE_CLIENT_ID),
        ("client_secret", GOOGLE_CLIENT_SECRET),
        ("code", code),
        ("grant_type", "authorization_code"),
        ("redirect_uri", &redirect_uri),
    ];

    let res = client.post(TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Token exchange failed: {}", res.status()));
    }

    let token_data: TokenResponse = res.json().await.map_err(|e| e.to_string())?;

    {
        let mut drive_state = state.lock().unwrap();
        drive_state.access_token = Some(token_data.access_token);
        if let Some(rt) = token_data.refresh_token {
            drive_state.refresh_token = Some(rt);
        }
    }
    
    // 성공 이벤트 발송 (프론트엔드 UI 갱신용)
    app.emit("google-auth-success", ()).map_err(|e| e.to_string())?;

    Ok("Authentication successful".to_string())
}

// finish_google_auth는 딥링크용이었으나, Loopback 방식에서는 init 내에서 완료되므로
// 더 이상 사용하지 않음 (또는 딥링크를 고집할 경우를 위해 남겨두되, 호출되지 않음)
// 하지만 컴파일 에러 방지를 위해 삭제하거나 더미로 남김.
// 여기서는 삭제하고 lib.rs에서 등록을 해제하는 것이 깔끔함.




#[tauri::command]
pub async fn list_google_drive_files(
    state: tauri::State<'_, Mutex<GoogleDriveState>>,
    _folder_id: Option<String>
) -> Result<Vec<GoogleFile>, String> {
    let access_token = {
        let drive_state = state.lock().unwrap();
        drive_state.access_token.clone().ok_or("Not authenticated")?
    };

    let client = reqwest::Client::new();
    
    let parent = _folder_id.unwrap_or_else(|| "root".to_string());
    
    // Google Drive v3 API: List files
    // q parameter for filtering
    // trashed = false
    // AND 'parent_id' in parents
    // AND (folder OR google_doc OR text/plain OR markdown)
    let query = format!(
        "trashed = false and '{}' in parents and (mimeType = 'application/vnd.google-apps.folder' or mimeType = 'application/vnd.google-apps.document' or mimeType = 'text/plain' or mimeType = 'text/markdown' or fileExtension = 'md')",
        parent
    );

    let res = client.get("https://www.googleapis.com/drive/v3/files")
        .bearer_auth(access_token)
        .query(&[
            ("q", query.as_str()),
            ("fields", "files(id, name, mimeType)"),
            ("pageSize", "100"),
            ("orderBy", "folder,name") // 폴더 먼저, 그 다음 이름순
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Failed to list files: {}", res.status()));
    }

    let data: GoogleFileListResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(data.files)
}

#[tauri::command]
pub async fn download_google_drive_file(
    state: tauri::State<'_, Mutex<GoogleDriveState>>,
    file_id: String,
    mime_type: String
) -> Result<String, String> {
    let access_token = {
        let drive_state = state.lock().unwrap();
        drive_state.access_token.clone().ok_or("Not authenticated")?
    };

    let client = reqwest::Client::new();
    
    // Google Docs/Sheets need export, binary files need get with alt=media
    let is_google_doc = mime_type.starts_with("application/vnd.google-apps.");
    
    let (url, query) = if is_google_doc {
        let export_mime = match mime_type.as_str() {
            "application/vnd.google-apps.document" => "text/plain", // or text/markdown if supported? text/plain is safer for raw
            "application/vnd.google-apps.spreadsheet" => "text/csv",
            _ => "text/plain" // fallback
        };
        (
            format!("https://www.googleapis.com/drive/v3/files/{}/export", file_id),
            vec![("mimeType", export_mime)]
        )
    } else {
        (
            format!("https://www.googleapis.com/drive/v3/files/{}", file_id),
            vec![("alt", "media")]
        )
    };

    let res = client.get(&url)
        .bearer_auth(access_token)
        .query(&query)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Failed to download file: {}", res.status()));
    }

    let content = res.text().await.map_err(|e| e.to_string())?;
    
    // TODO: if imported as CSV/binary, conversion to markdown might be needed here
    // For now, return raw text
    Ok(content)
}
