//! ==========================================================================
//! alarm.rs - 알람 데이터베이스 관리
//! ==========================================================================
//!
//! 알람 관련 CRUD 작업을 수행합니다.
//! - alarms 테이블 사용
//! ==========================================================================

use rusqlite::{Connection, Result as SqliteResult};
use serde::{Deserialize, Serialize};

// ============================================================================
// 데이터 구조체
// ============================================================================

/// 알람 데이터 (DB에서 읽어온 원본)
///
/// 프론트엔드의 Alarm 인터페이스에 대응
#[derive(Debug, Serialize, Deserialize)]
pub struct AlarmRaw {
  pub id: String,
  pub title: Option<String>,
  pub message: String,
  pub type_: String, // type은 예약어라 type_으로 매핑 (SQL에서는 type)
  pub importance: String,
  pub is_read: bool,
  pub room_id: Option<String>,
  pub created_at: String,
}

// ============================================================================
// DB 작업 함수
// ============================================================================

/// 알람 추가
///
/// # 매개변수
/// - `conn`: SQLite 연결
/// - `id`: 알람 UUID
/// - `title`: 제목 (옵션)
/// - `message`: 내용
/// - `type`: 유형 (info, error 등)
/// - `importance`: 중요도 (low, medium, high)
/// - `room_id`: 채팅방 ID (옵션)
pub fn add_alarm(
  conn: &Connection,
  id: &str,
  title: Option<&str>,
  message: &str,
  type_: &str,
  importance: &str,
  room_id: Option<&str>,
) -> Result<(), String> {
  conn
    .execute(
      "INSERT INTO alarms (id, title, message, type, importance, room_id, is_read) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0)",
      rusqlite::params![id, title, message, type_, importance, room_id],
    )
    .map_err(|e| format!("알람 추가 실패: {}", e))?;

  Ok(())
}

/// 알람 목록 조회
///
/// 최신순으로 정렬하여 반환
///
/// # 매개변수
/// - `conn`: SQLite 연결
/// - `limit`: 조회할 개수 제한 (기본값 설정 권장)
pub fn get_alarms(conn: &Connection, limit: i32) -> Result<Vec<AlarmRaw>, String> {
  let mut stmt = conn
    .prepare(
      "SELECT id, title, message, type, importance, is_read, room_id, created_at 
             FROM alarms 
             ORDER BY created_at DESC 
             LIMIT ?1",
    )
    .map_err(|e| format!("알람 조회 쿼리 준비 실패: {}", e))?;

  let alarm_iter = stmt
    .query_map([limit], |row| {
      Ok(AlarmRaw {
        id: row.get(0)?,
        title: row.get(1)?,
        message: row.get(2)?,
        type_: row.get(3)?,
        importance: row.get(4)?,
        is_read: row.get::<_, i32>(5)? != 0, // 0/1 -> bool
        room_id: row.get(6)?,
        created_at: row.get(7)?,
      })
    })
    .map_err(|e| format!("알람 쿼리 실행 실패: {}", e))?;

  let mut alarms = Vec::new();
  for alarm in alarm_iter {
    alarms.push(alarm.map_err(|e| format!("알람 데이터 매핑 실패: {}", e))?);
  }

  Ok(alarms)
}

/// 알람 읽음 처리
///
/// # 매개변수
/// - `conn`: SQLite 연결
/// - `id`: 알람 ID
pub fn mark_alarm_read(conn: &Connection, id: &str) -> Result<(), String> {
  conn
    .execute("UPDATE alarms SET is_read = 1 WHERE id = ?1", [id])
    .map_err(|e| format!("알람 읽음 처리 실패: {}", e))?;

  Ok(())
}

/// 모든 알람 읽음 처리
pub fn mark_all_alarms_read(conn: &Connection) -> Result<(), String> {
  conn
    .execute("UPDATE alarms SET is_read = 1 WHERE is_read = 0", [])
    .map_err(|e| format!("모든 알람 읽음 처리 실패: {}", e))?;

  Ok(())
}

/// 알람 삭제
pub fn delete_alarm(conn: &Connection, id: &str) -> Result<(), String> {
  conn
    .execute("DELETE FROM alarms WHERE id = ?1", [id])
    .map_err(|e| format!("알람 삭제 실패: {}", e))?;

  Ok(())
}

/// 모든 알람 삭제
pub fn clear_alarms(conn: &Connection) -> Result<(), String> {
  conn
    .execute("DELETE FROM alarms", [])
    .map_err(|e| format!("모든 알람 삭제 실패: {}", e))?;
  Ok(())
}
