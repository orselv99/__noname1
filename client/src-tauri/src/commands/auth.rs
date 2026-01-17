use crate::config;
use crate::database::{self, CachedUser, DatabaseState};

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
pub struct AuthState {
  pub token: Option<String>,
  pub tenant_id: Option<String>,
  pub email: Option<String>,
  pub user_id: Option<String>,
  pub username: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct LoginRequest {
  email: String,
  password: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct LoginResponse {
  pub access_token: String,
  #[serde(default)]
  pub force_change_password: bool,
  #[serde(default)]
  pub tenant_id: String,
  #[serde(default)]
  pub role: String,
  #[serde(default)]
  pub is_offline: bool,
  // Extended user info from server
  #[serde(default)]
  pub user_id: String,
  #[serde(default)]
  pub username: String,
  #[serde(default)]
  pub position_id: Option<String>,
  #[serde(default)]
  pub position_name: Option<String>,
  #[serde(default)]
  pub phone_numbers: Vec<String>,
  #[serde(default)]
  pub contact: Option<String>,
  #[serde(default)]
  pub birthday: Option<String>,
  #[serde(default)]
  pub created_at: Option<String>,
  #[serde(default)]
  pub updated_at: Option<String>,
  #[serde(default)]
  pub department: Option<DepartmentInfo>,
  #[serde(default)]
  pub joined_projects: Vec<ProjectInfo>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DepartmentInfo {
  pub id: String,
  pub name: String,
  #[serde(rename = "default_visibility_level")]
  pub visibility: i32, // Mapped from default_visibility_level
}

#[derive(Serialize, Deserialize)]
struct ChangePasswordRequest {
  current_password: String,
  new_password: String,
}

// Tenant lookup response types
#[derive(Serialize, Deserialize, Clone)]
pub struct TenantInfo {
  pub tenant_id: String,
  pub name: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ProjectInfo {
  pub id: String,
  pub name: String,
  #[serde(default, rename = "default_visibility_level")]
  pub visibility: i32,
}

#[derive(Serialize, Deserialize)]
struct LookupTenantResponse {
  tenants: Vec<TenantInfo>,
}

#[tauri::command]
pub async fn login(
  app: AppHandle,
  state: State<'_, Mutex<AuthState>>,
  db_state: State<'_, Mutex<DatabaseState>>,
  email: String,
  password: String,
  tenant_id: Option<String>, // Now accepts optional tenant_id
) -> Result<LoginResponse, String> {
  let client = reqwest::Client::new();

  // Build login request with tenant_id header if provided
  let mut request = client
    .post(&format!("{}/api/v1/auth/login", config::get_api_url()))
    .json(&LoginRequest {
      email: email.clone(),
      password: password.clone(),
    });

  if let Some(ref tid) = tenant_id {
    request = request.header("X-Tenant-ID", tid);
  }

  let online_result = request.send().await;

  match online_result {
    Ok(res) if res.status().is_success() => {
      // Online login successful
      let login_res: LoginResponse = res.json().await.map_err(|e| e.to_string())?;

      // Update State
      {
        let mut auth = state.lock().unwrap();
        auth.token = Some(login_res.access_token.clone());
        auth.tenant_id = Some(login_res.tenant_id.clone());
        auth.email = Some(email.clone());
        auth.user_id = Some(login_res.user_id.clone());
        auth.username = Some(login_res.username.clone());
      }

      // Cache user for offline use
      {
        let db = db_state.lock().unwrap();
        if let Some(ref conn) = db.conn {
          // Convert phone_numbers Vec to comma-separated string for SQLite
          let phone_numbers_str = if login_res.phone_numbers.is_empty() {
            None
          } else {
            Some(login_res.phone_numbers.join(","))
          };

          let cached_user = CachedUser {
            id: login_res.user_id.clone(),
            email: email.clone(),
            password_hash: String::new(), // Will be hashed in save_user
            username: login_res.username.clone(),
            tenant_id: login_res.tenant_id.clone(),
            role: login_res.role.clone(),
            position_id: login_res.position_id.clone(),
            department_id: login_res.department.as_ref().map(|d| d.id.clone()),
            contact: login_res.contact.clone(),
            birthday: login_res.birthday.clone(),
            phone_numbers: phone_numbers_str,
            force_change_password: login_res.force_change_password,
            created_at: login_res.created_at.clone(),
            updated_at: login_res.updated_at.clone(),
          };

          if let Err(e) = database::save_user(conn, &cached_user, &password) {
            println!("Warning: Failed to cache user: {}", e);
          }
        }
      }

      Ok(login_res)
    }
    Ok(res) => {
      // Online login failed (wrong credentials, etc.)
      let err_text = res.text().await.unwrap_or("Unknown error".to_string());

      // Try offline login as fallback
      try_offline_login(&app, &state, &db_state, &email, &password, Some(&err_text))
    }
    Err(e) => {
      // Network error - try offline login
      println!("Warning: Online login failed (network): {}", e);
      try_offline_login(&app, &state, &db_state, &email, &password, None)
    }
  }
}

/// Attempt offline login using cached credentials
fn try_offline_login(
  app: &AppHandle,
  state: &State<'_, Mutex<AuthState>>,
  db_state: &State<'_, Mutex<DatabaseState>>,
  email: &str,
  password: &str,
  online_error: Option<&str>,
) -> Result<LoginResponse, String> {
  let db = db_state.lock().unwrap();

  if let Some(ref conn) = db.conn {
    match database::verify_offline_login(conn, email, password) {
      Ok(user) => {
        // Update state
        {
          let mut auth = state.lock().unwrap();
          auth.token = None; // No token for offline mode
          auth.tenant_id = Some(user.tenant_id.clone());
          auth.email = Some(email.to_string());
          auth.user_id = Some(user.id.clone());
          auth.username = Some(user.username.clone());
        }

        println!("Debug: Offline login successful for: {}", email);

        // Convert phone_numbers from comma-separated back to Vec
        let phone_numbers = user
          .phone_numbers
          .as_ref()
          .map(|s| s.split(',').map(|p| p.to_string()).collect())
          .unwrap_or_default();

        Ok(LoginResponse {
          access_token: String::new(),
          force_change_password: user.force_change_password,
          tenant_id: user.tenant_id,
          role: user.role,
          is_offline: true,
          user_id: user.id,
          username: user.username,
          position_id: user.position_id,
          position_name: None,
          // department_id/name removed
          phone_numbers,
          contact: user.contact,
          birthday: user.birthday,
          created_at: user.created_at,
          updated_at: user.updated_at,
          joined_projects: Vec::new(), // Offline: empty for now
          department: user.department_id.map(|id| DepartmentInfo {
            id,
            name: "Offline Department".to_string(), // TODO: Cache dept name
            visibility: 1,                          // Default to Hidden if unknown
          }),
        })
      }
      Err(offline_err) => {
        // Both online and offline failed
        if let Some(online_err) = online_error {
          Err(online_err.to_string())
        } else {
          Err(format!("Offline login failed: {}", offline_err))
        }
      }
    }
  } else {
    // No database connection
    if let Some(online_err) = online_error {
      Err(online_err.to_string())
    } else {
      Err("Network error and no offline data available".to_string())
    }
  }
}

#[tauri::command]
pub async fn change_password(
  db_state: State<'_, Mutex<DatabaseState>>,
  state: State<'_, Mutex<AuthState>>,
  current_password: String,
  new_password: String,
) -> Result<bool, String> {
  let (token, tenant_id, email) = {
    let auth = state.lock().unwrap();
    match &auth.token {
      Some(t) => (t.clone(), auth.tenant_id.clone(), auth.email.clone()),
      None => return Err("Not authenticated".to_string()),
    }
  };

  let client = reqwest::Client::new();
  let mut request = client
    .post(&format!(
      "{}/api/v1/auth/change-password",
      config::get_api_url()
    ))
    .header("Authorization", format!("Bearer {}", token));

  if let Some(tid) = &tenant_id {
    request = request.header("X-Tenant-ID", tid);
  }

  let res = request
    .json(&ChangePasswordRequest {
      current_password,
      new_password: new_password.clone(),
    })
    .send()
    .await
    .map_err(|e| e.to_string())?;

  if !res.status().is_success() {
    let err_text = res.text().await.unwrap_or("Unknown error".to_string());
    return Err(err_text);
  }

  // Update cached password
  if let Some(email) = email {
    let db = db_state.lock().unwrap();
    if let Some(ref conn) = db.conn {
      if let Err(e) = database::update_cached_password(conn, &email, &new_password) {
        println!("Warning: Failed to update cached password: {}", e);
      }
    }
  }

  Ok(true)
}

#[tauri::command]
pub async fn logout(app: AppHandle, state: State<'_, Mutex<AuthState>>) -> Result<(), String> {
  let token = {
    let auth = state.lock().unwrap();
    auth.token.clone()
  };

  if let Some(t) = token {
    let client = reqwest::Client::new();
    // Fire and forget logout request
    let _ = client
      .post(&format!("{}/api/v1/auth/logout", config::get_api_url()))
      .header("Authorization", format!("Bearer {}", t))
      .send()
      .await;
  }

  let mut auth = state.lock().unwrap();
  auth.token = None;
  auth.tenant_id = None;
  auth.email = None;
  auth.user_id = None;
  auth.username = None;
  Ok(())
}

/// Lookup tenants by email - returns list of tenants the email belongs to
#[tauri::command]
pub async fn lookup_tenants(email: String) -> Result<Vec<TenantInfo>, String> {
  let client = reqwest::Client::new();

  let url = format!(
    "{}/api/v1/auth/lookup-tenant?email={}",
    config::get_api_url(),
    urlencoding::encode(&email)
  );

  let res = client
    .get(&url)
    .send()
    .await
    .map_err(|e| format!("Network error: {}", e))?;

  if !res.status().is_success() {
    let err_text = res
      .text()
      .await
      .unwrap_or_else(|_| "Unknown error".to_string());
    return Err(err_text);
  }

  let response: LookupTenantResponse = res.json().await.map_err(|e| e.to_string())?;
  Ok(response.tenants)
}

/// Get saved tenant from local DB (for auto-login without tenant lookup)
#[tauri::command]
pub fn get_saved_tenant(
  db_state: State<'_, Mutex<DatabaseState>>,
  email: String,
) -> Option<String> {
  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    database::get_saved_tenant(conn, &email)
  } else {
    None
  }
}

/// Clear saved tenant from local DB (on login failure requiring re-selection)
#[tauri::command]
pub fn clear_saved_tenant(
  db_state: State<'_, Mutex<DatabaseState>>,
  email: String,
) -> Result<(), String> {
  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    database::clear_saved_tenant(conn, &email)
  } else {
    Ok(()) // No DB connection, nothing to clear
  }
}
