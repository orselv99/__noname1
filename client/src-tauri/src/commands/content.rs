//! ==========================================================================
//! content.rs - 콘텐츠 스토어 관련 커맨드
//! ==========================================================================
//!
//! 프론트엔드 ContentStore의 상태(Tabs 등)를 영속화하기 위한 Key-Value 인터페이스입니다.
//! ==========================================================================

use crate::database::{self, DatabaseState};
use std::sync::Mutex;
use tauri::State;

// ============================================================================
// 콘텐츠 커맨드
// ============================================================================

/// 콘텐츠 상태 저장
///
/// # 매개변수
/// - `key`: 저장할 키 (예: 'tabs')
/// - `value`: JSON 문자열
#[tauri::command]
pub fn save_content_state(
  db_state: State<'_, Mutex<DatabaseState>>,
  key: String,
  value: String,
) -> Result<(), String> {
  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    database::save_content_state(conn, &key, &value)?;
    Ok(())
  } else {
    Err("데이터베이스 연결 안됨".to_string())
  }
}

/// 콘텐츠 상태 로드
///
/// # 매개변수
/// - `key`: 조회할 키
///
/// # 반환값
/// - JSON 문자열 (없으면 null 반환 가능하지만, 여기서는 Option<String>으로 처리)
#[tauri::command]
pub fn load_content_state(
  db_state: State<'_, Mutex<DatabaseState>>,
  key: String,
) -> Result<Option<String>, String> {
  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    let val = database::load_content_state(conn, &key)?;
    Ok(val)
  } else {
    Ok(None) // DB 없으면 None
  }
}

/// 콘텐츠 상태 삭제
#[tauri::command]
pub fn delete_content_state(
  db_state: State<'_, Mutex<DatabaseState>>,
  key: String,
) -> Result<(), String> {
  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    database::delete_content_state(conn, &key)?;
    Ok(())
  } else {
    Err("데이터베이스 연결 안됨".to_string())
  }
}

/// 모든 콘텐츠 상태 삭제 (초기화)
#[tauri::command]
pub fn clear_content_state(db_state: State<'_, Mutex<DatabaseState>>) -> Result<(), String> {
  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    database::clear_content_state(conn)?;
    Ok(())
  } else {
    Err("데이터베이스 연결 안됨".to_string())
  }
}
