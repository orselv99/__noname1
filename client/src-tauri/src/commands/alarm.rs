//! ==========================================================================
//! alarm.rs - 알람 관련 커맨드
//! ==========================================================================
//!
//! 프론트엔드에서 알람을 저장, 조회, 읽음 처리할 때 호출됩니다.
//! ==========================================================================

use crate::database::{self, AlarmRaw, DatabaseState};
use std::sync::Mutex;
use tauri::State;

// ============================================================================
// 알람 커맨드
// ============================================================================

/// 알람 추가
///
/// # 매개변수
/// - `id`: 알람 UUID
/// - `title`: 제목 (옵션)
/// - `message`: 내용
/// - `type`: 유형 (info, error 등)
/// - `importance`: 중요도 (low, medium, high)
/// - `room_id`: 채팅방 ID (옵션)
#[tauri::command]
pub fn add_alarm(
  db_state: State<'_, Mutex<DatabaseState>>,
  id: String,
  title: Option<String>,
  message: String,
  alarm_type: String, // Changed from type_ to alarm_type
  importance: String,
  room_id: Option<String>,
) -> Result<(), String> {
  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    database::add_alarm(
      conn,
      &id,
      title.as_deref(),
      &message,
      &alarm_type,
      &importance,
      room_id.as_deref(),
    )?;
    Ok(())
  } else {
    Err("데이터베이스 연결 안됨".to_string())
  }
}

/// 알람 목록 조회
///
/// # 매개변수
/// - `limit`: 조회할 개수 제한 (기본값 50)
#[tauri::command]
pub fn get_alarms(
  db_state: State<'_, Mutex<DatabaseState>>,
  limit: Option<i32>,
) -> Result<Vec<AlarmRaw>, String> {
  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    let limit_val = limit.unwrap_or(50);
    let alarms = database::get_alarms(conn, limit_val)?;
    Ok(alarms)
  } else {
    Ok(Vec::new()) // DB 없으면 빈 목록 반환 (오류 아님)
  }
}

/// 알람 읽음 처리
#[tauri::command]
pub fn mark_alarm_read(
  db_state: State<'_, Mutex<DatabaseState>>,
  id: String,
) -> Result<(), String> {
  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    database::mark_alarm_read(conn, &id)?;
    Ok(())
  } else {
    Err("데이터베이스 연결 안됨".to_string())
  }
}

/// 모든 알람 읽음 처리
#[tauri::command]
pub fn mark_all_alarms_read(db_state: State<'_, Mutex<DatabaseState>>) -> Result<(), String> {
  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    database::mark_all_alarms_read(conn)?;
    Ok(())
  } else {
    Err("데이터베이스 연결 안됨".to_string())
  }
}

/// 알람 삭제
#[tauri::command]
pub fn delete_alarm(db_state: State<'_, Mutex<DatabaseState>>, id: String) -> Result<(), String> {
  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    database::delete_alarm(conn, &id)?;
    Ok(())
  } else {
    Err("데이터베이스 연결 안됨".to_string())
  }
}

/// 모든 알람 삭제
#[tauri::command]
pub fn clear_alarms(db_state: State<'_, Mutex<DatabaseState>>) -> Result<(), String> {
  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    database::clear_alarms(conn)?;
    Ok(())
  } else {
    Err("데이터베이스 연결 안됨".to_string())
  }
}
