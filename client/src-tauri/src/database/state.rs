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

  // 기본 데이터베이스 파일명 설정
  let mut db_filename = String::from("fiery_horizon.db");

  // --------------------------------------------------------------------------
  // [Debug Only] 사용자 ID 기반 DB 분리 로직 (환경 변수 버전)
  // --------------------------------------------------------------------------
  // #[cfg(debug_assertions)]는 C++의 #ifdef _DEBUG와 유사합니다.
  // 이 블록 안의 코드는 오직 '디버그 빌드' (cargo build 또는 npm run tauri dev)
  // 시에만 컴파일러에 의해 포함됩니다. 릴리즈 빌드에서는 완전히 제거됩니다.
  #[cfg(debug_assertions)]
  {
    // std::env::var("APP_USER_ID"): "APP_USER_ID"라는 이름의 환경 변수 값을 읽어옵니다.
    // CLI 인자 파싱 방식은 프레임워크(Tauri/Vite)의 내부 인자와 충돌할 수 있어,
    // 더 안전한 환경 변수 방식을 사용합니다.
    // - Ok(val): 환경 변수가 존재하면 그 값을 val로 반환합니다.
    // - Err(_): 환경 변수가  없으면 에러를 반환합니다 (여기서는 무시).
    if let Ok(user_id_env) = std::env::var("APP_USER_ID") {
      // format! 매크로를 사용하여 새로운 파일명 문자열을 생성합니다.
      // 예: 환경 변수가 "testuser1"이면 "fiery_horizon_testuser1.db"가 됩니다.
      db_filename = format!("fiery_horizon_{}.db", user_id_env);

      // 디버그용 로그 출력 (어떤 DB 파일을 쓰는지 확인용)
      println!(
        "Debug: 사용자 ID 환경 변수 감지됨 ('{}'). DB 파일명을 '{}'로 변경합니다.",
        user_id_env, db_filename
      );
    }
  }

  // 최종적으로 결정된 파일명을 경로에 합칩니다.
  // create_dir_all로 생성된 client_dir 경로 뒤에 파일명을 붙여서 전체 경로를 만듭니다.
  Ok(client_dir.join(db_filename))
}
