use std::sync::Mutex;
use tauri::State;
use serde::{Deserialize, Serialize};

#[derive(Default)]
pub struct AuthState {
    pub token: Option<String>,
    pub tenant_id: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct LoginRequest {
    email: String,
    password: String,
}

#[derive(Serialize, Deserialize)]
pub struct LoginResponse {
    pub access_token: String,
    #[serde(default)]
    pub force_change_password: bool,
    #[serde(default)]
    pub tenant_id: String,
    #[serde(default)]
    pub role: String,
}

#[derive(Serialize, Deserialize)]
struct ChangePasswordRequest {
    current_password: String,
    new_password: String,
}

#[tauri::command]
pub async fn login(state: State<'_, Mutex<AuthState>>, email: String, password: String) -> Result<LoginResponse, String> {
    let client = reqwest::Client::new();
    let res = client.post("http://localhost:8080/api/v1/auth/login")
        .json(&LoginRequest { email, password })
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or("Unknown error".to_string());
        return Err(err_text);
    }

    let login_res: LoginResponse = res.json().await.map_err(|e| e.to_string())?;

    // Update State
    let mut auth = state.lock().unwrap();
    auth.token = Some(login_res.access_token.clone());
    auth.tenant_id = Some(login_res.tenant_id.clone());

    Ok(login_res)
}

#[tauri::command]
pub async fn change_password(state: State<'_, Mutex<AuthState>>, current_password: String, new_password: String) -> Result<bool, String> {
    let (token, tenant_id) = {
        let auth = state.lock().unwrap();
        match &auth.token {
            Some(t) => (t.clone(), auth.tenant_id.clone()),
            None => return Err("Not authenticated".to_string()),
        }
    };

    let client = reqwest::Client::new();
    let mut request = client.post("http://localhost:8080/api/v1/auth/change-password")
        .header("Authorization", format!("Bearer {}", token));
    
    if let Some(tid) = tenant_id {
        request = request.header("X-Tenant-ID", tid);
    }

    let res = request
        .json(&ChangePasswordRequest { current_password, new_password })
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
         let err_text = res.text().await.unwrap_or("Unknown error".to_string());
         return Err(err_text);
    }

    Ok(true)
}

#[tauri::command]
pub async fn logout(state: State<'_, Mutex<AuthState>>) -> Result<(), String> {
    let token = {
        let auth = state.lock().unwrap();
        auth.token.clone()
    };

    if let Some(t) = token {
        let client = reqwest::Client::new();
        // Fire and forget logout request
        let _ = client.post("http://localhost:8080/api/v1/auth/logout")
            .header("Authorization", format!("Bearer {}", t))
            .send()
            .await;
    }

    let mut auth = state.lock().unwrap();
    auth.token = None;
    auth.tenant_id = None;
    Ok(())
}
