//! ==========================================================================
//! chat.rs - 채팅 관련 Tauri 명령
//! ==========================================================================

use crate::database::{self, ChatMessage, ChatRoom, DatabaseState};
use std::sync::Mutex;
use tauri::State;

// ============================================================================
// 채팅방 관련 명령
// ============================================================================

/// 채팅방 저장 (생성/수정)
#[tauri::command]
pub fn save_chat_room(
  db_state: State<'_, Mutex<DatabaseState>>,
  id: String,
  name: Option<String>,
  participants: Vec<String>,
) -> Result<(), String> {
  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    database::save_chat_room(conn, &id, name.as_deref(), &participants)
  } else {
    Err("데이터베이스 연결 안됨".to_string())
  }
}

/// 채팅방 목록 조회
#[tauri::command]
pub fn list_chat_rooms(db_state: State<'_, Mutex<DatabaseState>>) -> Result<Vec<ChatRoom>, String> {
  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    database::list_chat_rooms(conn)
  } else {
    Err("데이터베이스 연결 안됨".to_string())
  }
}

/// 특정 채팅방 조회
#[tauri::command]
pub fn get_chat_room(
  db_state: State<'_, Mutex<DatabaseState>>,
  id: String,
) -> Result<Option<ChatRoom>, String> {
  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    database::get_chat_room(conn, &id)
  } else {
    Err("데이터베이스 연결 안됨".to_string())
  }
}

// ============================================================================
// 메시지 관련 명령
// ============================================================================

/// 메시지 저장
#[tauri::command]
pub fn save_chat_message(
  db_state: State<'_, Mutex<DatabaseState>>,
  message: ChatMessage,
) -> Result<(), String> {
  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    database::save_chat_message(conn, &message)
  } else {
    Err("데이터베이스 연결 안됨".to_string())
  }
}

/// 특정 방의 메시지 목록 조회
#[tauri::command]
pub fn get_chat_messages(
  db_state: State<'_, Mutex<DatabaseState>>,
  room_id: String,
) -> Result<Vec<ChatMessage>, String> {
  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    database::get_chat_messages(conn, &room_id)
  } else {
    Err("데이터베이스 연결 안됨".to_string())
  }
}
