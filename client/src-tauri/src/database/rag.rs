use rusqlite::Connection;

// ============================================================================
// 구조체 정의 (Raw Data)
// ============================================================================

/// RAG 채팅 세션 (Raw Data - 암호화 상태)
pub struct RagChatRaw {
  pub id: String,
  pub title_blob: Vec<u8>,
  pub created_at_blob: Vec<u8>,
  pub updated_at_blob: Vec<u8>,
}

/// RAG 메시지 (Raw Data - 암호화 상태)
pub struct RagMessageRaw {
  pub id: String,
  pub role_blob: Vec<u8>,
  pub content_blob: Vec<u8>,
  pub timestamp: i64,
}

/// 벡터 검색 결과 (Raw Data - 암호화 상태)
pub struct SearchResultRaw {
  pub document_id: String,
  pub distance: f32,
  pub content_blob: Vec<u8>,
  pub summary_blob: Option<Vec<u8>>,
  pub title_blob: Option<Vec<u8>>,
  pub parent_id: Option<String>,
  pub document_state: i32,
  pub visibility_level: i32,
  pub group_type: i32,
  pub group_id: Option<String>,
  pub size_blob: Option<Vec<u8>>,
  pub media_size_blob: Option<Vec<u8>>,
  pub current_version: i32,
  pub version: i32,
  pub is_favorite: bool,
  pub created_at_blob: Option<Vec<u8>>,
  pub updated_at_blob: Option<Vec<u8>>,
  pub accessed_at_blob: Option<Vec<u8>>,
  pub group_name: Option<String>,
}

// ============================================================================
// 채팅 세션 관리
// ============================================================================

/// 새 채팅 세션 생성
pub fn create_chat_session_db(
  conn: &Connection,
  id: &str,
  title_enc: &[u8],
  created_at_enc: &[u8],
  updated_at_enc: &[u8],
  timestamp: i64,
) -> Result<(), String> {
  conn.execute(
        "INSERT INTO rag_chats (id, title, created_at, updated_at, updated_at_ts) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, title_enc, created_at_enc, updated_at_enc, timestamp],
    )
    .map_err(|e| format!("채팅 세션 생성 실패: {}", e))?;
  Ok(())
}

/// 채팅 목록 조회
pub fn list_rag_chats_db(conn: &Connection) -> Result<Vec<RagChatRaw>, String> {
  let mut stmt = conn
    .prepare("SELECT id, title, created_at, updated_at FROM rag_chats ORDER BY updated_at_ts DESC")
    .map_err(|e| e.to_string())?;

  let rows = stmt
    .query_map([], |row| {
      Ok(RagChatRaw {
        id: row.get(0)?,
        title_blob: row.get(1)?,
        created_at_blob: row.get(2)?,
        updated_at_blob: row.get(3)?,
      })
    })
    .map_err(|e| e.to_string())?;

  let mut chats = Vec::new();
  for r in rows {
    chats.push(r.map_err(|e| e.to_string())?);
  }
  Ok(chats)
}

/// 채팅 삭제
pub fn delete_rag_chat_db(conn: &Connection, chat_id: &str) -> Result<(), String> {
  conn
    .execute("DELETE FROM rag_messages WHERE chat_id = ?1", [chat_id])
    .map_err(|e| e.to_string())?;
  conn
    .execute("DELETE FROM rag_chats WHERE id = ?1", [chat_id])
    .map_err(|e| e.to_string())?;
  Ok(())
}

/// 채팅 제목 수정
pub fn update_chat_title_db(
  conn: &Connection,
  chat_id: &str,
  title_enc: &[u8],
) -> Result<(), String> {
  conn
    .execute(
      "UPDATE rag_chats SET title = ?1 WHERE id = ?2",
      rusqlite::params![title_enc, chat_id],
    )
    .map_err(|e| e.to_string())?;
  Ok(())
}

// ============================================================================
// 메시지 관리
// ============================================================================

/// 메시지 저장
pub fn save_rag_message_db(
  conn: &Connection,
  id: &str,
  chat_id: &str,
  role_enc: &[u8],
  content_enc: &[u8],
  created_at_enc: &[u8],
  timestamp: i64,
) -> Result<(), String> {
  conn.execute(
        "INSERT INTO rag_messages (id, chat_id, role, content, created_at, timestamp) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, chat_id, role_enc, content_enc, created_at_enc, timestamp],
    )
    .map_err(|e| format!("메시지 저장 실패: {}", e))?;
  Ok(())
}

/// 채팅 타임스탬프 업데이트
pub fn update_chat_timestamp_db(
  conn: &Connection,
  chat_id: &str,
  updated_at_enc: &[u8],
  timestamp: i64,
) -> Result<(), String> {
  conn
    .execute(
      "UPDATE rag_chats SET updated_at = ?1, updated_at_ts = ?2 WHERE id = ?3",
      rusqlite::params![updated_at_enc, timestamp, chat_id],
    )
    .map_err(|e| format!("채팅 시간 업데이트 실패: {}", e))?;
  Ok(())
}

/// 메시지 목록 조회
pub fn list_rag_messages_db(
  conn: &Connection,
  chat_id: &str,
) -> Result<Vec<RagMessageRaw>, String> {
  let mut stmt = conn
        .prepare("SELECT id, role, content, timestamp FROM rag_messages WHERE chat_id = ?1 ORDER BY timestamp ASC")
        .map_err(|e| e.to_string())?;

  let rows = stmt
    .query_map([chat_id], |row| {
      Ok(RagMessageRaw {
        id: row.get(0)?,
        role_blob: row.get(1)?,
        content_blob: row.get(2)?,
        timestamp: row.get(3)?,
      })
    })
    .map_err(|e| e.to_string())?;

  let mut messages = Vec::new();
  for r in rows {
    messages.push(r.map_err(|e| e.to_string())?);
  }
  Ok(messages)
}

// ============================================================================
// 검색
// ============================================================================

/// 유사 문서 검색 (Vector Search)
pub fn search_similar_documents_db(
  conn: &Connection,
  query_bytes: &[u8],
  user_id: &str,
  limit: i32,
) -> Result<Vec<SearchResultRaw>, String> {
  let mut stmt = conn
    .prepare(
      "SELECT 
          d.id, 
          vec_distance_cosine(da.embedding, ?1) as distance, 
          d.content, 
          d.summary,
          d.title,
          d.parent_id,
          d.document_state,
          d.visibility_level,
          d.group_type,
          d.group_id,
          d.size,
          d.media_size,
          d.current_version,
          d.version,
          d.is_favorite,
          d.created_at,
          d.updated_at,
          d.accessed_at,
          CASE 
            WHEN d.group_type = 0 THEN dep.name 
            WHEN d.group_type = 1 THEN proj.name 
            ELSE 'Private' 
          END as group_name
        FROM document_ai_data da
        JOIN documents d ON da.document_id = d.id
        LEFT JOIN departments dep ON d.group_type = 0 AND d.group_id = dep.id
        LEFT JOIN projects proj ON d.group_type = 1 AND d.group_id = proj.id
        WHERE d.user_id = ?2
        ORDER BY distance ASC
        LIMIT ?3",
    )
    .map_err(|e| e.to_string())?;

  let rows = stmt
    .query_map(rusqlite::params![query_bytes, user_id, limit], |row| {
      Ok(SearchResultRaw {
        document_id: row.get(0)?,
        distance: row.get(1)?,
        content_blob: row.get(2)?,
        summary_blob: row.get(3)?,
        title_blob: row.get(4)?,
        parent_id: row.get(5)?,
        document_state: row.get(6)?,
        visibility_level: row.get(7)?,
        group_type: row.get(8)?,
        group_id: row.get(9)?,
        size_blob: row.get(10)?,
        media_size_blob: row.get(11)?,
        current_version: row.get(12)?,
        version: row.get(13)?,
        is_favorite: row.get::<_, i32>(14)? != 0,
        created_at_blob: row.get(15)?,
        updated_at_blob: row.get(16)?,
        accessed_at_blob: row.get(17)?,
        group_name: row.get(18)?,
      })
    })
    .map_err(|e| e.to_string())?;

  let mut results = Vec::new();
  for r in rows {
    results.push(r.map_err(|e| e.to_string())?);
  }
  Ok(results)
}
