//! ==========================================================================
//! media.rs - 미디어 처리 커맨드 (이미지 다운로드, 파일 읽기)
//! ==========================================================================
//!
//! C++ 개발자를 위한 설명:
//! - 외부 이미지 URL → Base64 Data URL 변환
//! - 로컬 파일 → Base64 Data URL 변환
//! - Data URL: HTML/CSS에 인라인으로 미디어 삽입 가능
//!
//! Data URL 형식: data:image/png;base64,iVBORw0KGgo...
//! ==========================================================================

use base64::{engine::general_purpose::STANDARD, Engine};

// ============================================================================
// Tauri 커맨드: 이미지 다운로드
// ============================================================================

/// URL에서 이미지 다운로드 → Base64 Data URL 반환
///
/// # 용도
/// - 외부 이미지를 에디터에 임베딩
/// - CORS 우회 (프론트엔드에서 직접 접근 불가한 이미지)
/// - 오프라인 저장을 위한 인라인화
///
/// # 프론트엔드 호출 예시
/// ```typescript
/// const dataUrl = await invoke('download_image', {
///   url: 'https://example.com/image.png'
/// });
/// // dataUrl = "data:image/png;base64,iVBORw0KGgo..."
/// ```
///
/// C++ 비교: libcurl로 다운로드 + base64 인코딩
#[tauri::command]
pub async fn download_image(url: String) -> Result<String, String> {
    // 이미 Data URL이면 그대로 반환
    if url.starts_with("data:") {
        return Ok(url);
    }

    // HTTP 클라이언트 생성 (30초 타임아웃)
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("HTTP 클라이언트 생성 실패: {}", e))?;

    // 이미지 다운로드 (브라우저 User-Agent로 차단 우회)
    let response = client
        .get(&url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        )
        .send()
        .await
        .map_err(|e| format!("이미지 다운로드 실패: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP 오류: {}", response.status()));
    }

    // Content-Type 헤더에서 MIME 타입 추출 또는 URL로 추측
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|h| h.to_str().ok())
        .map(|s| s.split(';').next().unwrap_or(s).trim().to_string())
        .unwrap_or_else(|| guess_mime_from_url(&url));

    // 이미지 타입 검증
    if !content_type.starts_with("image/") {
        return Err(format!("이미지가 아님: {}", content_type));
    }

    // 바이트 읽기
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("이미지 데이터 읽기 실패: {}", e))?;

    // Base64 인코딩 → Data URL 생성
    let base64_data = STANDARD.encode(&bytes);
    let data_url = format!("data:{};base64,{}", content_type, base64_data);

    Ok(data_url)
}

// ============================================================================
// Tauri 커맨드: 로컬 파일 읽기
// ============================================================================

/// 로컬 파일 → Base64 Data URL 반환
///
/// # 용도
/// - 로컬 이미지/미디어를 에디터에 삽입
/// - 파일 시스템 접근은 Rust에서만 가능 (프론트엔드 보안 제한)
///
/// # 지원 형식
/// 이미지: jpg, png, gif, webp, svg, bmp, ico
/// 비디오: mp4, webm
/// 오디오: mp3, wav, ogg
#[tauri::command]
pub async fn read_local_file_as_data_url(path: String) -> Result<String, String> {
    use std::fs;
    use std::path::Path;

    let file_path = Path::new(&path);

    if !file_path.exists() {
        return Err("파일을 찾을 수 없음".to_string());
    }

    // 확장자에서 MIME 타입 결정
    let extension = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let mime_type = match extension.as_str() {
        // 이미지
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        // 비디오
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        // 오디오
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        _ => return Err(format!("지원하지 않는 파일 형식: {}", extension)),
    };

    // 파일 읽기
    let bytes = fs::read(file_path).map_err(|e| format!("파일 읽기 실패: {}", e))?;

    // Base64 인코딩 → Data URL 생성
    let base64_data = STANDARD.encode(&bytes);
    let data_url = format!("data:{};base64,{}", mime_type, base64_data);

    Ok(data_url)
}

// ============================================================================
// 헬퍼 함수
// ============================================================================

/// URL 확장자로 MIME 타입 추측
///
/// Content-Type 헤더가 없을 때 폴백으로 사용
fn guess_mime_from_url(url: &str) -> String {
    let url_lower = url.to_lowercase();

    if url_lower.contains(".jpg") || url_lower.contains(".jpeg") {
        "image/jpeg".to_string()
    } else if url_lower.contains(".png") {
        "image/png".to_string()
    } else if url_lower.contains(".gif") {
        "image/gif".to_string()
    } else if url_lower.contains(".webp") {
        "image/webp".to_string()
    } else if url_lower.contains(".svg") {
        "image/svg+xml".to_string()
    } else if url_lower.contains(".bmp") {
        "image/bmp".to_string()
    } else {
        // 기본값: JPEG
        "image/jpeg".to_string()
    }
}
