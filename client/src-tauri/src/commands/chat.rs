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

// ============================================================================
// [읽음 처리 명령]
// ============================================================================
// P2P 채팅에서 상대방이 메시지를 읽었을 때 호출됩니다.
// 메시지 상태를 'read'로 변경하여 DB에 영구 저장합니다.
// 이렇게 해야 앱을 다시 시작해도 읽음 상태가 유지됩니다.
// ============================================================================

/// 메시지 상태 일괄 업데이트 (읽음 처리용)
///
/// # 매개변수
/// - `message_ids`: 상태를 변경할 메시지 ID 목록
/// - `status`: 새 상태 ('read', 'delivered' 등)
#[tauri::command]
pub fn update_message_status(
  db_state: State<'_, Mutex<DatabaseState>>,
  message_ids: Vec<String>,
  status: String,
) -> Result<(), String> {
  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    // 트랜잭션으로 일괄 업데이트 (성능 최적화)
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    for id in &message_ids {
      tx.execute(
        "UPDATE chat_messages SET status = ?1 WHERE id = ?2",
        rusqlite::params![&status, id],
      )
      .map_err(|e| format!("메시지 상태 업데이트 실패 ({}): {}", id, e))?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    println!(
      "[Chat] {} 개 메시지 상태 '{}' 로 업데이트 완료",
      message_ids.len(),
      status
    );
    Ok(())
  } else {
    Err("데이터베이스 연결 안됨".to_string())
  }
}
