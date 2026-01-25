//! ==========================================================================
//! chat.rs - P2P 채팅 데이터베이스 관리
//! ==========================================================================
//!
//! 채팅방(Rooms)과 메시지(Messages)의 저장, 조회, 업데이트를 담당합니다.
//! ==========================================================================

use rusqlite::{Connection, OptionalExtension, Result as SqliteResult};
use serde::{Deserialize, Serialize};

// ============================================================================
// 구조체 정의 (Models)
// ============================================================================

/// 채팅방 정보
#[derive(Debug, Serialize, Deserialize)]
pub struct ChatRoom {
  pub id: String,
  pub name: Option<String>,
  pub participants: Vec<String>, // JSON 파싱됨
  pub created_at: String,
  pub updated_at: String,
}

/// 채팅 메시지
#[derive(Debug, Serialize, Deserialize)]
pub struct ChatMessage {
  pub id: String,
  pub room_id: String,
  pub sender_id: String,
  pub content: String,
  pub status: String,
  pub timestamp: i64,
}

// ============================================================================
// 채팅방 (Rooms) 함수
// ============================================================================

/// 채팅방 생성 또는 업데이트 (Upsert)
///
/// 이미 존재하는 방이면 업데이트, 없으면 생성합니다.
/// participants는 JSON 문자열로 저장됩니다.
pub fn save_chat_room(
  conn: &Connection,
  id: &str,
  name: Option<&str>,
  participants: &[String],
) -> Result<(), String> {
  let participants_json = serde_json::to_string(participants).unwrap_or_default();

  conn
    .execute(
      "INSERT INTO chat_rooms (id, name, participants, updated_at)
       VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         participants = excluded.participants,
         updated_at = CURRENT_TIMESTAMP",
      rusqlite::params![id, name, participants_json],
    )
    .map_err(|e| format!("채팅방 저장 실패: {}", e))?;

  Ok(())
}

/// 특정 채팅방 조회
pub fn get_chat_room(conn: &Connection, id: &str) -> Result<Option<ChatRoom>, String> {
  conn
    .query_row(
      "SELECT id, name, participants, created_at, updated_at FROM chat_rooms WHERE id = ?1",
      [id],
      |row| {
        let participants_str: String = row.get(2)?;
        let participants: Vec<String> = serde_json::from_str(&participants_str).unwrap_or_default();

        Ok(ChatRoom {
          id: row.get(0)?,
          name: row.get(1)?,
          participants,
          created_at: row.get(3)?,
          updated_at: row.get(4)?,
        })
      },
    )
    .optional()
    .map_err(|e| format!("채팅방 조회 실패: {}", e))
}

/// 모든 채팅방 목록 조회 (최근 업데이트순)
pub fn list_chat_rooms(conn: &Connection) -> Result<Vec<ChatRoom>, String> {
  let mut stmt = conn
    .prepare("SELECT id, name, participants, created_at, updated_at FROM chat_rooms ORDER BY updated_at DESC")
    .map_err(|e| format!("쿼리 준비 실패: {}", e))?;

  let rooms_iter = stmt
    .query_map([], |row| {
      let participants_str: String = row.get(2)?;
      let participants: Vec<String> = serde_json::from_str(&participants_str).unwrap_or_default();

      Ok(ChatRoom {
        id: row.get(0)?,
        name: row.get(1)?,
        participants,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
      })
    })
    .map_err(|e| format!("쿼리 실행 실패: {}", e))?;

  let mut rooms = Vec::new();
  for room in rooms_iter {
    rooms.push(room.map_err(|e| format!("데이터 파싱 실패: {}", e))?);
  }

  Ok(rooms)
}

// ============================================================================
// 채팅 메시지 (Messages) 함수
// ============================================================================

/// 메시지 저장
///
/// 메시지를 저장하고, 해당 채팅방의 updated_at을 갱신합니다.
pub fn save_chat_message(conn: &Connection, message: &ChatMessage) -> Result<(), String> {
  // 1. 메시지 저장
  conn
    .execute(
      "INSERT OR REPLACE INTO chat_messages (id, room_id, sender_id, content, status, timestamp)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      rusqlite::params![
        message.id,
        message.room_id,
        message.sender_id,
        message.content,
        message.status,
        message.timestamp
      ],
    )
    .map_err(|e| format!("메시지 저장 실패: {}", e))?;

  // 2. 채팅방 updated_at 갱신 (목록 상단 노출용)
  conn
    .execute(
      "UPDATE chat_rooms SET updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
      [&message.room_id],
    )
    .map_err(|e| format!("채팅방 시간 갱신 실패: {}", e))?;

  Ok(())
}

/// 특정 채팅방의 메시지 목록 조회
pub fn get_chat_messages(conn: &Connection, room_id: &str) -> Result<Vec<ChatMessage>, String> {
  let mut stmt = conn
    .prepare(
      "SELECT id, room_id, sender_id, content, status, timestamp
       FROM chat_messages
       WHERE room_id = ?1
       ORDER BY timestamp ASC",
    )
    .map_err(|e| format!("쿼리 준비 실패: {}", e))?;

  let msgs_iter = stmt
    .query_map([room_id], |row| {
      Ok(ChatMessage {
        id: row.get(0)?,
        room_id: row.get(1)?,
        sender_id: row.get(2)?,
        content: row.get(3)?,
        status: row.get(4)?,
        timestamp: row.get(5)?,
      })
    })
    .map_err(|e| format!("쿼리 실행 실패: {}", e))?;

  let mut messages = Vec::new();
  for msg in msgs_iter {
    messages.push(msg.map_err(|e| format!("데이터 파싱 실패: {}", e))?);
  }

  Ok(messages)
}
