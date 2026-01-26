//! ==========================================================================
//! auth.rs - 인증 커맨드 (로그인, 로그아웃, 비밀번호, 테넌트)
//! ==========================================================================
//!
//! C++ 개발자를 위한 설명:
//! - 프론트엔드에서 invoke('login', { email, password })로 호출
//! - 온라인 로그인 실패 시 오프라인 캐시로 폴백
//! - 멀티테넌트: 하나의 이메일이 여러 조직에 속할 수 있음
//! ==========================================================================

use crate::config;
use crate::database::{self, CachedUser, DatabaseState};

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

// ============================================================================
// 인증 상태 구조체
// ============================================================================

/// 앱 전역 인증 상태
///
/// Tauri의 State<Mutex<AuthState>>로 관리됨
/// 로그인 성공 시 토큰, 테넌트, 사용자 정보 저장
///
/// C++ 비교: 싱글톤 세션 매니저
#[derive(Default)]
pub struct AuthState {
  /// JWT 액세스 토큰 (오프라인 모드에서는 None)
  pub token: Option<String>,
  /// 현재 로그인한 테넌트(조직) ID
  pub tenant_id: Option<String>,
  /// 로그인한 이메일
  pub email: Option<String>,
  /// 사용자 고유 ID (UUID)
  pub user_id: Option<String>,
  /// 표시 이름
  pub username: Option<String>,
  /// 리프레시 토큰 (JWT, Rotation)
  pub refresh_token: Option<String>,
}

// ============================================================================
// 요청/응답 DTO (Data Transfer Object)
// ============================================================================

/// 로그인 API 요청 본문
#[derive(Serialize, Deserialize)]
struct LoginRequest {
  email: String,
  password: String,
}

/// 로그인 API 응답
///
/// 서버 응답과 오프라인 캐시 모두 이 구조체로 통일
/// #[serde(default)]: 필드가 없으면 기본값 사용
#[derive(Serialize, Deserialize, Clone)]
pub struct LoginResponse {
  /// JWT 액세스 토큰
  pub access_token: String,
  /// JWT 리프레시 토큰
  #[serde(default)]
  pub refresh_token: String,
  /// 토큰 만료 시간 (초)
  #[serde(default)]
  pub expires_in: i64,
  /// 비밀번호 변경 필요 여부 (첫 로그인, 관리자 리셋 등)
  #[serde(default)]
  pub force_change_password: bool,
  /// 테넌트(조직) ID
  #[serde(default)]
  pub tenant_id: String,
  /// 역할 (user, admin 등)
  #[serde(default)]
  pub role: String,
  /// 오프라인 로그인 여부
  #[serde(default)]
  pub is_offline: bool,

  // 확장 사용자 정보
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

/// 부서 정보
#[derive(Serialize, Deserialize, Clone)]
pub struct DepartmentInfo {
  pub id: String,
  pub name: String,
  /// 기본 공개 수준 (#[serde(rename)]: JSON 필드명 매핑)
  #[serde(rename = "default_visibility_level")]
  pub visibility: i32,
}

/// 비밀번호 변경 요청
#[derive(Serialize, Deserialize)]
struct ChangePasswordRequest {
  current_password: String,
  new_password: String,
}

/// 테넌트 정보 (이메일로 조회 시)
#[derive(Serialize, Deserialize, Clone)]
pub struct TenantInfo {
  pub tenant_id: String,
  pub name: String,
}

/// 프로젝트 정보
#[derive(Serialize, Deserialize, Clone)]
pub struct ProjectInfo {
  pub id: String,
  pub name: String,
  #[serde(default, rename = "default_visibility_level")]
  pub visibility: i32,
}

/// 테넌트 조회 응답 (내부용)
#[derive(Serialize, Deserialize)]
struct LookupTenantResponse {
  tenants: Vec<TenantInfo>,
}

// ============================================================================
// Tauri 커맨드: 로그인
// ============================================================================

/// 리프레시 토큰 요청 본문
#[derive(Serialize, Deserialize)]
struct RefreshTokenRequest {
  refresh_token: String,
}

/// 리프레시 토큰 응답
#[derive(Serialize, Deserialize, Clone)]
pub struct RefreshTokenResponse {
  pub access_token: String,
  pub refresh_token: String,
  pub expires_in: i64,
}

/// 로그인 커맨드
///
/// # 동작 흐름
/// 1. 서버에 로그인 요청
/// 2. 성공: 상태 업데이트 + 캐시 저장
/// 3. 실패: 오프라인 캐시로 폴백 시도
///
/// # 매개변수
/// - `app`: Tauri 앱 핸들
/// - `state`: 인증 상태 (Mutex로 보호)
/// - `db_state`: 데이터베이스 상태
/// - `email`: 로그인 이메일
/// - `password`: 비밀번호
/// - `tenant_id`: 선택적 테넌트 ID (멀티테넌트 환경)
///
/// # 프론트엔드 호출 예시
/// ```typescript
/// const result = await invoke('login', {
///   email: 'user@example.com',
///   password: 'secret',
///   tenantId: 'org-123'  // 선택적
/// });
/// ```
#[tauri::command]
pub async fn login(
  app: AppHandle,
  state: State<'_, Mutex<AuthState>>,
  db_state: State<'_, Mutex<DatabaseState>>,
  email: String,
  password: String,
  tenant_id: Option<String>,
) -> Result<LoginResponse, String> {
  let client = reqwest::Client::new();

  // 로그인 요청 빌드 (테넌트 ID 헤더 포함)
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
    // 온라인 로그인 성공
    Ok(res) if res.status().is_success() => {
      let login_res: LoginResponse = res.json().await.map_err(|e| e.to_string())?;

      // 전역 상태 업데이트
      {
        let mut auth = state.lock().unwrap();
        auth.token = Some(login_res.access_token.clone());
        auth.tenant_id = Some(login_res.tenant_id.clone());
        auth.email = Some(email.clone());
        auth.user_id = Some(login_res.user_id.clone());
        auth.username = Some(login_res.username.clone());
        auth.refresh_token = Some(login_res.refresh_token.clone());
      }

      // 오프라인 캐시에 저장 (다음 번 오프라인 로그인용)
      {
        let db = db_state.lock().unwrap();
        if let Some(ref conn) = db.conn {
          let phone_numbers_str = if login_res.phone_numbers.is_empty() {
            None
          } else {
            Some(login_res.phone_numbers.join(","))
          };

          let cached_user = CachedUser {
            id: login_res.user_id.clone(),
            email: email.clone(),
            password_hash: String::new(), // save_user에서 해싱
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
            refresh_token: Some(login_res.refresh_token.clone()), // 리프레시 토큰 저장
          };

          // save_user 함수 호출 수정 (refresh_token 전달)
          if let Err(e) = database::save_user(
            conn,
            &cached_user,
            &password,
            Some(&login_res.refresh_token),
          ) {
            println!("Warning: 사용자 캐시 실패: {}", e);
          }
        }
      }

      Ok(login_res)
    }

    // 온라인 로그인 실패 (인증 오류 등)
    Ok(res) => {
      let err_text = res.text().await.unwrap_or("Unknown error".to_string());
      // 오프라인 폴백 시도
      try_offline_login(&app, &state, &db_state, &email, &password, Some(&err_text))
    }

    // 네트워크 오류
    Err(e) => {
      println!("Warning: 온라인 로그인 실패 (네트워크): {}", e);
      try_offline_login(&app, &state, &db_state, &email, &password, None)
    }
  }
}

// ============================================================================
// Tauri 커맨드: 토큰 갱신
// ============================================================================

/// 토큰 갱신 커맨드
///
/// 리프레시 토큰을 사용하여 새로운 액세스 토큰 발급
#[tauri::command]
pub async fn refresh_token(
  state: State<'_, Mutex<AuthState>>,
  refresh_token: String,
) -> Result<RefreshTokenResponse, String> {
  let client = reqwest::Client::new();

  let res = client
    .post(&format!(
      "{}/api/v1/auth/refresh-token",
      config::get_api_url()
    ))
    .json(&RefreshTokenRequest {
      refresh_token: refresh_token.clone(),
    })
    .send()
    .await
    .map_err(|e| format!("Network error: {}", e))?;

  if !res.status().is_success() {
    return Err("Invalid refresh token".to_string());
  }

  let refresh_res: RefreshTokenResponse = res.json().await.map_err(|e| e.to_string())?;

  // 전역 상태 업데이트
  {
    let mut auth = state.lock().unwrap();
    auth.token = Some(refresh_res.access_token.clone());
    auth.refresh_token = Some(refresh_res.refresh_token.clone());
  }

  Ok(refresh_res)
}

// ============================================================================
// 오프라인 로그인 헬퍼
// ============================================================================

/// 오프라인 캐시로 로그인 시도
///
/// 로컬 SQLite에 저장된 자격 증명으로 검증
fn try_offline_login(
  _app: &AppHandle,
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
        // 상태 업데이트
        {
          let mut auth = state.lock().unwrap();
          auth.token = None; // 오프라인 모드: 토큰 없음
          auth.tenant_id = Some(user.tenant_id.clone());
          auth.email = Some(email.to_string());
          auth.user_id = Some(user.id.clone());
          auth.username = Some(user.username.clone());
        }

        println!("Debug: 오프라인 로그인 성공: {}", email);

        // 전화번호 변환 (CSV → Vec)
        let phone_numbers = user
          .phone_numbers
          .as_ref()
          .map(|s| s.split(',').map(|p| p.to_string()).collect())
          .unwrap_or_default();

        Ok(LoginResponse {
          access_token: String::new(),
          refresh_token: String::new(),
          expires_in: 0,
          force_change_password: user.force_change_password,
          tenant_id: user.tenant_id,
          role: user.role,
          is_offline: true,
          user_id: user.id,
          username: user.username,
          position_id: user.position_id,
          position_name: None,
          phone_numbers,
          contact: user.contact,
          birthday: user.birthday,
          created_at: user.created_at,
          updated_at: user.updated_at,
          joined_projects: Vec::new(),
          department: user.department_id.map(|id| DepartmentInfo {
            id,
            name: "Offline Department".to_string(),
            visibility: 1,
          }),
        })
      }
      Err(offline_err) => {
        // 온라인/오프라인 모두 실패
        if let Some(online_err) = online_error {
          Err(online_err.to_string())
        } else {
          Err(format!("오프라인 로그인 실패: {}", offline_err))
        }
      }
    }
  } else {
    // DB 연결 없음
    if let Some(online_err) = online_error {
      Err(online_err.to_string())
    } else {
      Err("네트워크 오류, 오프라인 데이터 없음".to_string())
    }
  }
}

// ============================================================================
// Tauri 커맨드: 비밀번호 변경
// ============================================================================

/// 비밀번호 변경 커맨드
///
/// 서버에서 변경 후 로컬 캐시도 업데이트
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
      None => return Err("인증되지 않음".to_string()),
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

  // 로컬 캐시 비밀번호 업데이트
  if let Some(email) = email {
    let db = db_state.lock().unwrap();
    if let Some(ref conn) = db.conn {
      if let Err(e) = database::update_cached_password(conn, &email, &new_password) {
        println!("Warning: 캐시 비밀번호 업데이트 실패: {}", e);
      }
    }
  }

  Ok(true)
}

// ============================================================================
// Tauri 커맨드: 로그아웃
// ============================================================================

/// 로그아웃 커맨드
///
/// 서버에 로그아웃 요청 후 로컬 상태 초기화
#[tauri::command]
pub async fn logout(_app: AppHandle, state: State<'_, Mutex<AuthState>>) -> Result<(), String> {
  let token = {
    let auth = state.lock().unwrap();
    auth.token.clone()
  };

  // 서버에 로그아웃 알림 (실패해도 무시)
  if let Some(t) = token {
    let client = reqwest::Client::new();
    let _ = client
      .post(&format!("{}/api/v1/auth/logout", config::get_api_url()))
      .header("Authorization", format!("Bearer {}", t))
      .send()
      .await;
  }

  // 로컬 상태 초기화
  let mut auth = state.lock().unwrap();
  auth.token = None;
  auth.tenant_id = None;
  auth.email = None;
  auth.user_id = None;
  auth.username = None;
  auth.refresh_token = None;
  Ok(())
}

// ============================================================================
// Tauri 커맨드: 테넌트 관리
// ============================================================================

/// 이메일로 테넌트 목록 조회
///
/// 멀티테넌트: 하나의 이메일이 여러 조직에 속할 수 있음
/// 로그인 전에 호출하여 테넌트 선택 UI 표시
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
    .map_err(|e| format!("네트워크 오류: {}", e))?;

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

/// 로컬 캐시에서 저장된 테넌트 조회
///
/// 이전에 로그인한 테넌트를 기억하여 자동 선택
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

/// 저장된 테넌트 정보 삭제
///
/// 로그인 실패 시 테넌트 재선택 강제
#[tauri::command]
pub fn clear_saved_tenant(
  db_state: State<'_, Mutex<DatabaseState>>,
  email: String,
) -> Result<(), String> {
  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    database::clear_saved_tenant(conn, &email)
  } else {
    Ok(())
  }
}

// ============================================================================
// 사용자 목록 조회 (Crew List)
// ============================================================================

/// 마지막 로그인한 사용자 조회 (자동 로그인용)
///
/// AuthState도 업데이트하여 list_documents 등 후속 명령이 작동하도록 함
#[tauri::command]
pub fn get_last_user(
  state: State<'_, Mutex<AuthState>>,
  db_state: State<'_, Mutex<DatabaseState>>,
) -> Result<Option<LoginResponse>, String> {
  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    match database::get_last_user(conn) {
      Ok(Some(user)) => {
        // AuthState 업데이트 (토큰은 없지만 user_id, tenant_id 등은 설정)
        {
          let mut auth = state.lock().unwrap();
          auth.token = None; // 토큰은 refresh_token으로 갱신 필요
          auth.tenant_id = Some(user.tenant_id.clone());
          auth.email = Some(user.email.clone());
          auth.user_id = Some(user.id.clone());
          auth.username = Some(user.username.clone());
          auth.refresh_token = user.refresh_token.clone();
        }

        // 전화번호 변환 (CSV → Vec)
        let phone_numbers = user
          .phone_numbers
          .as_ref()
          .map(|s| s.split(',').map(|p| p.to_string()).collect())
          .unwrap_or_default();

        Ok(Some(LoginResponse {
          access_token: String::new(), // 토큰은 갱신 필요
          refresh_token: user.refresh_token.clone().unwrap_or_default(),
          expires_in: 0,
          force_change_password: user.force_change_password,
          tenant_id: user.tenant_id,
          role: user.role,
          is_offline: true, // DB에서 가져왔으므로 일단 오프라인 상태로 간주
          user_id: user.id,
          username: user.username,
          position_id: user.position_id,
          position_name: None,
          phone_numbers,
          contact: user.contact,
          birthday: user.birthday,
          created_at: user.created_at,
          updated_at: user.updated_at,
          joined_projects: Vec::new(),
          department: user.department_id.map(|id| DepartmentInfo {
            id,
            name: "Offline Department".to_string(), // 저장된 부서명 없음 (필요시 user 테이블 확장)
            visibility: 1,
          }),
        }))
      }
      Ok(None) => Ok(None),
      Err(e) => Err(e),
    }
  } else {
    Ok(None)
  }
}

// Server Wire Format (Proto JSON)
#[derive(Serialize, Deserialize)]
pub struct RawUserInfo {
  pub id: String,
  pub email: String,
  pub username: String,
  pub tenant_id: String,
  #[serde(default)]
  pub role: i32, // Proto Enum is int
  #[serde(default)]
  pub department_id: String,
  #[serde(default)]
  pub position_id: String,
  #[serde(default)]
  pub position_name: String,
  #[serde(default)]
  pub department_name: String,
  #[serde(default)]
  pub contact: String,
  #[serde(default)]
  pub birthday: String,
  #[serde(default)]
  pub phone_numbers: Vec<String>,
  #[serde(default)]
  pub created_at: String,
  #[serde(default)]
  pub updated_at: String,
  #[serde(default)]
  pub last_login_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct RawListUsersResponse {
  pub users: Vec<RawUserInfo>,
  #[serde(default)]
  pub total_count: i32,
}

// Frontend Friendly Format
#[derive(Serialize, Deserialize, Clone)]
pub struct UserInfo {
  pub id: String,
  pub email: String,
  pub username: String,
  pub tenant_id: String,
  pub role: String,
  pub department_id: String,
  pub position_name: String,
  pub department_name: String,
  pub contact: String,
  pub birthday: String,
  pub phone_numbers: Vec<String>,
  pub created_at: String,
  pub updated_at: String,
  pub last_login_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct ListUsersResponse {
  pub users: Vec<UserInfo>,
  pub total_count: i32,
}

fn role_int_to_str(role: i32) -> String {
  match role {
    1 => "super".to_string(),
    2 => "admin".to_string(),
    3 => "viewer".to_string(),
    4 => "user".to_string(),
    _ => "user".to_string(), // Default or unspecified
  }
}

#[tauri::command]
pub async fn list_users(
  state: State<'_, Mutex<AuthState>>,
  page: i32,
  page_size: i32,
  include_all_roles: bool,
) -> Result<ListUsersResponse, String> {
  let (token, tenant_id) = {
    let auth = state.lock().unwrap();
    match (&auth.token, &auth.tenant_id) {
      (Some(t), Some(tid)) => (t.clone(), tid.clone()),
      _ => return Err("인증되지 않음".to_string()),
    }
  };

  let client = reqwest::Client::new();

  let url = format!(
    "{}/api/v1/users?page={}&page_size={}&include_all_roles={}",
    config::get_api_url(),
    page,
    page_size,
    include_all_roles
  );

  let res = client
    .get(&url)
    .header("Authorization", format!("Bearer {}", token))
    .header("X-Tenant-ID", tenant_id)
    .send()
    .await
    .map_err(|e| format!("네트워크 오류: {}", e))?;

  if !res.status().is_success() {
    let err_text = res.text().await.unwrap_or("Unknown error".to_string());
    return Err(err_text);
  }

  // Decode as Raw response first
  let raw_response: RawListUsersResponse = res
    .json()
    .await
    .map_err(|e| format!("JSON 파싱 오류: {}", e))?;

  // Map to Frontend format
  let users = raw_response
    .users
    .into_iter()
    .map(|raw| UserInfo {
      id: raw.id,
      email: raw.email,
      username: raw.username,
      tenant_id: raw.tenant_id,
      role: role_int_to_str(raw.role),
      department_id: raw.department_id,
      position_name: raw.position_name,
      department_name: raw.department_name,
      contact: raw.contact,
      birthday: raw.birthday,
      phone_numbers: raw.phone_numbers,
      created_at: raw.created_at,
      updated_at: raw.updated_at,
      last_login_at: raw.last_login_at,
    })
    .collect();

  Ok(ListUsersResponse {
    users,
    total_count: raw_response.total_count,
  })
}
