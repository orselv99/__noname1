//! ==========================================================================
//! state.rs - 데이터베이스 연결 상태 및 경로 관리
//! ==========================================================================

use rusqlite::Connection;
use std::path::PathBuf;

// ============================================================================
// 데이터베이스 상태 구조체
// ============================================================================

/// 데이터베이스 연결 상태
///
/// Tauri의 State<T>로 전역 관리됨 (lib.rs의 .manage() 참조)
/// Option<Connection>: 초기화 전에는 None, 초기화 후에는 Some
///
/// C++ 비교:
/// ```cpp
/// struct DatabaseState {
///     std::optional<sqlite3*> conn;
/// };
/// ```
pub struct DatabaseState {
  /// SQLite 연결 객체 (None = 미초기화)
  pub conn: Option<Connection>,
}

/// Default 트레이트 구현: 기본값으로 초기화
///
/// C++ 비교: 기본 생성자
impl Default for DatabaseState {
  fn default() -> Self {
    Self { conn: None }
  }
}

// ============================================================================
// 경로 유틸리티
// ============================================================================

/// 데이터베이스 파일 경로 반환
///
/// 위치: %APPDATA%/client/fiery_horizon.db (Windows 기준)
///
/// # 매개변수
/// - `app`: Tauri 앱 핸들 (경로 조회용)
///
/// # 반환값
/// 데이터베이스 파일 경로 또는 오류
///
/// C++ 비교: SHGetKnownFolderPath(FOLDERID_RoamingAppData, ...) 사용
pub fn get_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  use tauri::Manager;

  // Tauri가 제공하는 앱 데이터 디렉토리 가져오기
  let base_dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("앱 데이터 디렉토리 조회 실패: {}", e))?;

  // 상위 폴더로 이동 후 "client" 폴더 생성
  let client_dir = base_dir
    .parent()
    .ok_or("상위 디렉토리 조회 실패")?
    .join("client");

  // 폴더가 없으면 생성
  std::fs::create_dir_all(&client_dir).map_err(|e| format!("client 디렉토리 생성 실패: {}", e))?;

  Ok(client_dir.join("fiery_horizon.db"))
}
