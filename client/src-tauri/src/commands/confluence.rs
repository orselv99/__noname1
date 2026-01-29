use std::sync::Mutex;
use tauri::{AppHandle, Manager, Emitter};
use serde::{Deserialize, Serialize};
use reqwest::Client;
use std::collections::HashMap;

// --- 설정 (개발자 설정 필요) ---
// 실제 배포 시에는 빌드 타임 환경변수나 비밀 저장소를 사용해야 합니다.
// Atlassian App에서 생성한 Client ID/Secret
const CONFLUENCE_CLIENT_ID: &str = "oK0hcU6uVO22708DaBmvaG7hN9KtM3Kv";
const CONFLUENCE_CLIENT_SECRET: &str = "ATOAWt0Lrt4Bf5eMzWlOUghEOs8TryHaoI-Ons8befV2c5eZWsn7Du0jF2t9lBbaI3Em29B957FA";
const REDIRECT_URI: &str = "fiery-horizon://auth/confluence"; // 또는 fiery-horizon://callback
const AUTH_URL: &str = "https://auth.atlassian.com/authorize";
const TOKEN_URL: &str = "https://auth.atlassian.com/oauth/token";
const API_BASE_URL: &str = "https://api.atlassian.com/ex/confluence";

// --- 데이터 모델 ---

#[derive(Default)]
pub struct ConfluenceState {
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub cloud_id: Option<String>, // Confluence Cloud ID (Tenant ID)
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ConfluenceSpace {
    pub id: String,
    pub key: String,
    pub name: String,
    pub _type: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ConfluencePage {
    pub id: String,
    pub title: String,
    pub space_key: String,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    #[serde(default)] 
    expires_in: u64,
}

#[derive(Deserialize, Debug)]
struct AccessibleResource {
    id: String,
    name: String,
    url: String,
    #[serde(default)]
    scopes: Vec<String>,
}

// --- 커맨드 ---

#[tauri::command]
pub async fn init_confluence_auth(app: AppHandle) -> Result<String, String> {
    // 1. 인증 URL 생성 (Offline Access 스코프 필수)
    // Classic + Granular Scopes 혼용 요청 (호환성 확보)
    let scope_raw = "read:confluence-content.all read:confluence-space.summary read:confluence-user read:page:confluence offline_access";
    let scope_encoded = scope_raw.replace(" ", "%20");
    let state = uuid::Uuid::new_v4().to_string(); // 보안용 State (CSRF 방지)
    
    let url = format!(
        "{}?audience=api.atlassian.com&client_id={}&scope={}&redirect_uri={}&state={}&response_type=code&prompt=consent",
        AUTH_URL, CONFLUENCE_CLIENT_ID, scope_encoded, REDIRECT_URI, state
    );

    println!("Debug: Confluence Auth URL: {}", url);

    // 2. 브라우저 열기 (Deep Link 흐름 가정)
    
    use tauri_plugin_shell::ShellExt;
    app.shell().open(&url, None).map_err(|e| e.to_string())?;

    Ok("Auth initiated".to_string())
}

#[tauri::command]
pub async fn finish_confluence_auth(
    app: AppHandle,
    state: tauri::State<'_, Mutex<ConfluenceState>>,
    code: String
) -> Result<String, String> {
    // 1. 토큰 교환
    let client = Client::new();
    let params = HashMap::from([
        ("grant_type", "authorization_code"),
        ("client_id", CONFLUENCE_CLIENT_ID),
        ("client_secret", CONFLUENCE_CLIENT_SECRET),
        ("code", code.as_str()),
        ("redirect_uri", REDIRECT_URI),
    ]);

    let res = client.post(TOKEN_URL)
        .json(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Token exchange failed: {}", err_text));
    }

    let token_data: TokenResponse = res.json().await.map_err(|e| e.to_string())?;

    // 2. Cloud ID 조회 (Accessible Resources)
    let resources_res = client.get("https://api.atlassian.com/oauth/token/accessible-resources")
        .bearer_auth(&token_data.access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
        
    let resources: Vec<AccessibleResource> = resources_res.json().await.map_err(|e| e.to_string())?;
    
    println!("Debug: Accessible Resources: {:?}", resources);
    
    if resources.is_empty() {
        return Err("No accessible Confluence resources found".to_string());
    }
    
    // 첫 번째 리소스 사용
    let cloud_id = resources[0].id.clone();
    let cloud_name = resources[0].name.clone();
    let site_url = resources[0].url.clone(); // Capture site URL

    // 3. 상태 저장
    {
        let mut conf_state = state.lock().unwrap();
        conf_state.access_token = Some(token_data.access_token.clone());
        conf_state.refresh_token = token_data.refresh_token;
        conf_state.cloud_id = Some(cloud_id.clone());
    }
    
    println!("Debug: Confluence Auth Success. Cloud ID: {} (Name: {})", cloud_id, cloud_name);
    // println!("Debug: Access Token: {}", &token_data.access_token);
    
    // Test API Access: Try utilizing the Site URL directly with /wiki/rest/api/space
    // Some configurations work better with direct site access for OAuth if gateway fails.
    let test_url_gateway = format!("{}/{}/rest/api/space", API_BASE_URL, cloud_id); // Original Gateway URL
    let test_url_site = format!("{}/wiki/rest/api/space", site_url); // Site Direct URL
    
    println!("Debug: Testing Gateway URL: {}", test_url_gateway);
    let res_gateway = client.get(&test_url_gateway)
        .bearer_auth(&token_data.access_token)
        .query(&[("limit", "1")])
        .send()
        .await;
        
    match res_gateway {
        Ok(r) => println!("Debug: Gateway Test Status: {}", r.status()),
        Err(e) => println!("Error: Gateway Test Failed: {}", e),
    }

    println!("Debug: Testing Site URL: {}", test_url_site);
    let res_site = client.get(&test_url_site)
        .bearer_auth(&token_data.access_token)
        .query(&[("limit", "1")])
        .send()
        .await;

    match res_site {
        Ok(r) => {
             println!("Debug: Site Test Status: {}", r.status());
             if !r.status().is_success() {
                 let body = r.text().await.unwrap_or_default();
                 println!("Debug: Site Test Body: {}", body);
             }
        },
        Err(e) => println!("Error: Site Test Failed: {}", e),
    }

    app.emit("confluence-auth-success", &cloud_id).map_err(|e| e.to_string())?;

    Ok(cloud_id)
}

#[tauri::command]
pub async fn list_confluence_spaces(
    state: tauri::State<'_, Mutex<ConfluenceState>>
) -> Result<Vec<ConfluenceSpace>, String> {
    let (access_token, cloud_id) = {
        let s = state.lock().unwrap();
        (s.access_token.clone().ok_or("Not authenticated")?, s.cloud_id.clone().ok_or("No Cloud ID")?)
    };

    let client = Client::new();
    // Revert: Remove /wiki path segment
    let url = format!("{}/{}/rest/api/space", API_BASE_URL, cloud_id);

    let res = client.get(&url)
        .bearer_auth(access_token)
        .query(&[("limit", "50"), ("type", "global")]) // Global spaces only for now
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Failed to list spaces: {}", res.status()));
    }

    // Response structure parsing (Simplified)
    #[derive(Deserialize)]
    struct SpaceResponse {
        results: Vec<serde_json::Value>, // Using Value to manually map
    }
    
    let data: SpaceResponse = res.json().await.map_err(|e| e.to_string())?;
    
    let spaces = data.results.into_iter().map(|s| {
        ConfluenceSpace {
            id: s["id"].as_u64().map(|i| i.to_string()).unwrap_or_default(), // ID is int in API often
            key: s["key"].as_str().unwrap_or_default().to_string(),
            name: s["name"].as_str().unwrap_or_default().to_string(),
            _type: s["type"].as_str().unwrap_or_default().to_string(),
        }
    }).collect();

    Ok(spaces)
}

#[tauri::command]
pub async fn search_confluence_pages(
    state: tauri::State<'_, Mutex<ConfluenceState>>,
    query: String
) -> Result<Vec<ConfluencePage>, String> {
    let (access_token, cloud_id) = {
        let s = state.lock().unwrap();
        (s.access_token.clone().ok_or("Not authenticated")?, s.cloud_id.clone().ok_or("No Cloud ID")?)
    };

    println!("Debug: Searching Confluence with Cloud ID: {}", cloud_id);

    let client = Client::new();
    // Revert: Remove /wiki path segment
    let url = format!("{}/{}/rest/api/content/search", API_BASE_URL, cloud_id);
    
    // CQL: title ~ "query" AND type = "page"
    let cql = format!("title ~ \"{}\" AND type = \"page\"", query);

    let res = client.get(&url)
        .bearer_auth(access_token)
        .query(&[("cql", cql.as_str()), ("limit", "20")])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let headers = res.headers().clone();
        let err_body = res.text().await.unwrap_or_default();
        println!("Error: Search Failed: {} - {}", status, err_body);
        println!("Debug: Response Headers: {:?}", headers);
        return Err(format!("Search failed: {} - {}", status, err_body));
    }

    #[derive(Deserialize)]
    struct SearchResponse {
        results: Vec<serde_json::Value>,
    }
    
    let data: SearchResponse = res.json().await.map_err(|e| e.to_string())?;
    
    let pages = data.results.into_iter().map(|p| {
        ConfluencePage {
            id: p["id"].as_str().unwrap_or_default().to_string(),
            title: p["title"].as_str().unwrap_or_default().to_string(),
            space_key: p["space"]["key"].as_str().unwrap_or_default().to_string(),
        }
    }).collect();

    Ok(pages)
}

#[tauri::command]
pub async fn import_confluence_page(
    state: tauri::State<'_, Mutex<ConfluenceState>>,
    page_id: String
) -> Result<String, String> {
    let (access_token, cloud_id) = {
        let s = state.lock().unwrap();
        (s.access_token.clone().ok_or("Not authenticated")?, s.cloud_id.clone().ok_or("No Cloud ID")?)
    };

    let client = Client::new();
    // Get content with body.storage (XHTML) or body.atlas_doc_format (ADF)
    // Let's try to get 'body.storage' (XHTML) and convert to Markdown, 
    // or 'body.view' if simpler. 
    // Storage format is standard XHTML-based.
    
    // Revert: Remove /wiki path segment
    let url = format!("{}/{}/rest/api/content/{}?expand=body.storage", API_BASE_URL, cloud_id, page_id);

    let res = client.get(&url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
        
    if !res.status().is_success() {
        return Err(format!("Failed to fetch page: {}", res.status()));
    }
    
    let data: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let storage_value = &data["body"]["storage"]["value"];
    
    if let Some(xhtml) = storage_value.as_str() {
        // Simple conversion: use scraper or regex to strip tags, or specific crate.
        // For this task, we'll return the raw XHTML or a very simple text extraction.
        // Ideally we should use `turndown` logic in JS side or `html2md` crate in Rust.
        // Let's use a placeholder message + title.
        let title = data["title"].as_str().unwrap_or("Untitled");
        
        // Quick & Dirty HTML to Text (Real implementation needs html2md crate)
        // Since we don't have html2md in Cargo.toml yet (checking...),
        // We will just wrap it in a code block for now to show it works.
        // TODO: Add `html2md` crate to Cargo.toml next.
        
        Ok(format!("# {}\n\n(Confluence Import - Raw XHTML)\n\n```html\n{}\n```", title, xhtml))
    } else {
        Err("No content found".to_string())
    }
}
