//! ==========================================================================
//! content.rs - 콘텐츠 스토어 저장소 (Key-Value)
//! ==========================================================================
//!
//! ContentStore의 상태(Tabs, Calendar Events 등)를 JSON 형태로 저장합니다.
//! - contents 테이블 사용
//! ==========================================================================

use rusqlite::{Connection, OptionalExtension};

// ============================================================================
// DB 작업 함수
// ============================================================================

/// 콘텐츠 상태 저장 (Upsert)
///
/// 키가 존재하면 업데이트, 없으면 삽입 (SQLite ON CONFLICT)
///
/// # 매개변수
/// - `conn`: SQLite 연결
/// - `key`: 저장할 키 (예: 'tabs', 'active_tab')
/// - `value`: 저장할 JSON 문자열
pub fn save_content_state(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
  conn
    .execute(
      "INSERT INTO contents (key, value, updated_at) 
         VALUES (?1, ?2, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET 
            value = excluded.value, 
            updated_at = CURRENT_TIMESTAMP",
      [key, value],
    )
    .map_err(|e| format!("콘텐츠 저장 실패 (key={}): {}", key, e))?;

  Ok(())
}

/// 콘텐츠 상태 로드
///
/// # 매개변수
/// - `conn`: SQLite 연결
/// - `key`: 조회할 키
///
/// # 반환값
/// - `Option<String>`: 데이터가 있으면 JSON 문자열, 없으면 None
pub fn load_content_state(conn: &Connection, key: &str) -> Result<Option<String>, String> {
  let result: Option<String> = conn
    .query_row("SELECT value FROM contents WHERE key = ?1", [key], |row| {
      row.get(0)
    })
    .optional()
    .map_err(|e| format!("콘텐츠 조회 실패 (key={}): {}", key, e))?;

  Ok(result)
}

/// 콘텐츠 상태 삭제
///
/// # 매개변수
/// - `conn`: SQLite 연결
/// - `key`: 삭제할 키
pub fn delete_content_state(conn: &Connection, key: &str) -> Result<(), String> {
  conn
    .execute("DELETE FROM contents WHERE key = ?1", [key])
    .map_err(|e| format!("콘텐츠 삭제 실패 (key={}): {}", key, e))?;
  Ok(())
}

/// 모든 콘텐츠 상태 삭제 (초기화)
pub fn clear_content_state(conn: &Connection) -> Result<(), String> {
  conn
    .execute("DELETE FROM contents", [])
    .map_err(|e| format!("콘텐츠 전체 삭제 실패: {}", e))?;
  Ok(())
}
