//! ==========================================================================
//! documents.rs - 문서 관련 DB 함수
//! ==========================================================================
//!
//! commands/documents.rs에서 분리된 순수 DB 접근 함수
//! 암호화/복호화는 호출자(commands)에서 처리
//! ==========================================================================

use rusqlite::{Connection, OptionalExtension};

// ============================================================================
// 사용자 정보 조회
// ============================================================================

/// 사용자 ID로 username 조회
pub fn get_username(conn: &Connection, user_id: &str) -> Option<String> {
  conn
    .query_row(
      "SELECT username FROM users WHERE id = ?1",
      [user_id],
      |row| row.get(0),
    )
    .optional()
    .unwrap_or(None)
}

// ============================================================================
// 문서 CRUD
// ============================================================================

/// 문서 ID로 기존 created_at BLOB 조회
///
/// 업데이트 시 기존 생성일 유지용
pub fn get_existing_created_at(conn: &Connection, doc_id: &str) -> Option<Vec<u8>> {
  conn
    .query_row(
      "SELECT created_at FROM documents WHERE id = ?1",
      [doc_id],
      |row| row.get(0),
    )
    .optional()
    .unwrap_or(None)
}

/// 문서 저장 파라미터 (암호화된 상태)
pub struct SaveDocumentParams<'a> {
  pub id: &'a str,
  pub user_id: &'a str,
  pub document_state: i32,
  pub visibility_level: i32,
  pub group_type: i32,
  pub group_id: Option<&'a str>,
  pub parent_id: Option<&'a str>,
  pub title_enc: &'a [u8],
  pub content_enc: &'a [u8],
  pub summary_enc: Option<&'a [u8]>,
  pub size_enc: &'a [u8],
  pub created_at_enc: &'a [u8],
  pub updated_at_enc: &'a [u8],
  pub is_favorite: bool,
  pub last_synced_at: i64,
  pub version: i32,
  pub media_size_enc: &'a [u8],
}

/// 문서 UPSERT (INSERT ... ON CONFLICT DO UPDATE)
pub fn upsert_document(conn: &Connection, p: &SaveDocumentParams) -> Result<(), String> {
  conn
    .execute(
      "INSERT INTO documents (
            id, user_id, document_state, visibility_level, group_type, group_id,
            title, content, summary, size, created_at, updated_at, is_favorite, 
            last_synced_at, parent_id, version, media_size
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            content = excluded.content,
            summary = COALESCE(excluded.summary, documents.summary),
            document_state = excluded.document_state,
            visibility_level = excluded.visibility_level,
            group_type = excluded.group_type,
            group_id = excluded.group_id,
            parent_id = excluded.parent_id,
            size = excluded.size,
            is_favorite = COALESCE(excluded.is_favorite, documents.is_favorite),
            updated_at = excluded.updated_at,
            last_synced_at = excluded.last_synced_at,
            version = excluded.version,
            media_size = excluded.media_size",
      rusqlite::params![
        p.id,
        p.user_id,
        p.document_state,
        p.visibility_level,
        p.group_type,
        p.group_id,
        p.title_enc,
        p.content_enc,
        p.summary_enc,
        p.size_enc,
        p.created_at_enc,
        p.updated_at_enc,
        p.is_favorite,
        p.last_synced_at,
        p.parent_id,
        p.version,
        p.media_size_enc
      ],
    )
    .map_err(|e| format!("문서 저장 실패: {}", e))?;
  Ok(())
}

// ============================================================================
// 문서 조회 (Raw Data)
// ============================================================================

/// DB에서 조회된 Raw 문서 데이터 (복호화 전)
pub struct DocumentRaw {
  pub id: String,
  pub user_id: String,
  pub document_state: i32,
  pub visibility_level: i32,
  pub group_type: i32,
  pub group_id: Option<String>,
  pub title_blob: Vec<u8>,
  pub content_blob: Vec<u8>,
  pub summary_blob: Option<Vec<u8>>,
  pub created_blob: Option<Vec<u8>>,
  pub updated_blob: Option<Vec<u8>>,
  pub accessed_blob: Option<Vec<u8>>,
  pub size_blob: Option<Vec<u8>>,
  pub is_favorite: bool,
  pub username: Option<String>,
  pub last_synced_at: Option<i64>,
  pub parent_id: Option<String>,
  pub version: i32,
  pub deleted_at_blob: Option<Vec<u8>>,
  pub media_size_blob: Option<Vec<u8>>,
}

/// 문서 목록 조회 (Raw Data)
///
/// 필터링 조건에 따라 문서 목록 조회.
/// 암호화된 데이터를 그대로 반환하며, 복호화는 호출자에서 수행
pub fn list_documents_query(
  conn: &Connection,
  user_id: &str,
  group_type: Option<i32>,
  group_id: Option<String>,
  last_synced_at: Option<i64>,
) -> Result<Vec<DocumentRaw>, String> {
  let mut query = "SELECT 
        d.id, d.user_id, d.document_state, d.visibility_level, d.group_type, d.group_id,
        d.title, d.content, d.summary, d.created_at, d.updated_at, d.accessed_at, d.size, d.is_favorite,
        u.username, d.last_synced_at, d.parent_id, d.version, d.deleted_at, d.media_size
        FROM documents d
        LEFT JOIN users u ON d.user_id = u.id
        WHERE d.user_id = ?1 AND d.deleted_at IS NULL"
        .to_string();

  let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
  params.push(Box::new(user_id.to_string()));

  let mut param_idx = 2;

  if let Some(gt) = group_type {
    query.push_str(&format!(" AND d.group_type = ?{}", param_idx));
    params.push(Box::new(gt));
    param_idx += 1;
  }

  if let Some(gid) = group_id {
    query.push_str(&format!(" AND d.group_id = ?{}", param_idx));
    params.push(Box::new(gid));
    param_idx += 1;
  }

  if let Some(lsa) = last_synced_at {
    query.push_str(&format!(" AND d.last_synced_at > ?{}", param_idx));
    params.push(Box::new(lsa));
    param_idx += 1; // Not strictly needed as it's the last param
  } else {
    query.push_str(" ORDER BY d.updated_at DESC");
  }

  let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;

  // rusqlite params_from_iter expects a slice of references to dyn ToSql
  let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

  let rows = stmt
    .query_map(params_refs.as_slice(), |row| {
      Ok(DocumentRaw {
        id: row.get(0)?,
        user_id: row.get(1)?,
        document_state: row.get(2)?,
        visibility_level: row.get(3)?,
        group_type: row.get(4)?,
        group_id: row.get(5)?,
        title_blob: row.get(6).unwrap_or_default(),
        content_blob: row.get(7).unwrap_or_default(),
        summary_blob: row.get(8).ok(),
        created_blob: row.get(9).ok(),
        updated_blob: row.get(10).ok(),
        accessed_blob: row.get(11).ok(),
        size_blob: row.get(12).ok(),
        is_favorite: row.get(13).unwrap_or(false),
        username: row.get(14).ok(),
        last_synced_at: row.get(15).ok(),
        parent_id: row.get(16).ok(),
        version: row.get(17).unwrap_or(0),
        deleted_at_blob: row.get(18).ok(),
        media_size_blob: row.get(19).ok(),
      })
    })
    .map_err(|e| e.to_string())?;

  let mut docs = Vec::new();
  for r in rows {
    docs.push(r.map_err(|e| e.to_string())?);
  }

  Ok(docs)
}

/// 단일 문서 조회 (Raw Data)
pub fn get_document_raw(
  conn: &Connection,
  doc_id: &str,
  user_id: &str,
) -> Result<DocumentRaw, String> {
  let mut stmt = conn
        .prepare(
            "SELECT 
            d.id, d.user_id, d.document_state, d.visibility_level, d.group_type, d.group_id,
            d.title, d.content, d.summary, d.created_at, d.updated_at, d.accessed_at, d.size, d.is_favorite,
            u.username, d.last_synced_at, d.parent_id, d.version, d.deleted_at, d.media_size
            FROM documents d
            LEFT JOIN users u ON d.user_id = u.id
            WHERE d.id = ?1 AND d.user_id = ?2",
        )
        .map_err(|e| e.to_string())?;

  stmt
    .query_row([doc_id, user_id], |row| {
      Ok(DocumentRaw {
        id: row.get(0)?,
        user_id: row.get(1)?,
        document_state: row.get(2)?,
        visibility_level: row.get(3)?,
        group_type: row.get(4)?,
        group_id: row.get(5)?,
        title_blob: row.get(6).unwrap_or_default(),
        content_blob: row.get(7).unwrap_or_default(),
        summary_blob: row.get(8).ok(),
        created_blob: row.get(9).ok(),
        updated_blob: row.get(10).ok(),
        accessed_blob: row.get(11).ok(),
        size_blob: row.get(12).ok(),
        is_favorite: row.get(13).unwrap_or(false),
        username: row.get(14).ok(),
        last_synced_at: row.get(15).ok(),
        parent_id: row.get(16).ok(),
        version: row.get(17).unwrap_or(0),
        deleted_at_blob: row.get(18).ok(),
        media_size_blob: row.get(19).ok(),
      })
    })
    .map_err(|e| e.to_string())
}

// ============================================================================
// 태그 관리
// ============================================================================

/// 문서의 기존 태그 삭제
pub fn delete_document_tags(conn: &Connection, doc_id: &str) -> Result<(), String> {
  conn
    .execute("DELETE FROM document_tags WHERE document_id = ?1", [doc_id])
    .map_err(|e| format!("태그 삭제 실패: {}", e))?;
  Ok(())
}

/// 단일 태그 저장 (암호화된 상태)
pub fn insert_document_tag(
  conn: &Connection,
  tag_id: &str,
  doc_id: &str,
  tag_enc: &[u8],
  evidence_enc: Option<&[u8]>,
  created_at_enc: &[u8],
) -> Result<(), String> {
  conn
    .execute(
      "INSERT INTO document_tags (id, document_id, tag, evidence, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
      rusqlite::params![tag_id, doc_id, tag_enc, evidence_enc, created_at_enc],
    )
    .map_err(|e| format!("태그 저장 실패: {}", e))?;
  Ok(())
}

/// 문서의 태그 조회 (암호화된 BLOB 반환)
pub fn get_document_tags_raw(
  conn: &Connection,
  doc_id: &str,
) -> Result<Vec<(Vec<u8>, Option<Vec<u8>>)>, String> {
  let mut stmt = conn
    .prepare("SELECT tag, evidence FROM document_tags WHERE document_id = ?1")
    .map_err(|e| e.to_string())?;

  let rows = stmt
    .query_map([doc_id], |row| {
      let tag_blob: Vec<u8> = row.get(0)?;
      let evidence_blob: Option<Vec<u8>> = row.get(1).ok();
      Ok((tag_blob, evidence_blob))
    })
    .map_err(|e| e.to_string())?;

  let mut result = Vec::new();
  for r in rows {
    result.push(r.map_err(|e| e.to_string())?);
  }
  Ok(result)
}

// ============================================================================
// 리비전 관리
// ============================================================================

/// 리비전 저장 파라미터
pub struct SaveRevisionParams<'a> {
  pub id: &'a str,
  pub document_id: &'a str,
  pub version: i32,
  pub snapshot_enc: &'a [u8],
  pub title_enc: &'a [u8],
  pub creator_name: Option<&'a str>,
  pub created_at_enc: &'a [u8],
}

/// 리비전 UPSERT
pub fn upsert_revision(conn: &Connection, p: &SaveRevisionParams) -> Result<(), String> {
  conn
    .execute(
      "INSERT INTO document_revisions (
            id, document_id, version, snapshot, title, creator_name, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ON CONFLICT(document_id, version) DO UPDATE SET
            snapshot = excluded.snapshot,
            title = excluded.title,
            created_at = excluded.created_at",
      rusqlite::params![
        p.id,
        p.document_id,
        p.version,
        p.snapshot_enc,
        p.title_enc,
        p.creator_name,
        p.created_at_enc
      ],
    )
    .map_err(|e| format!("리비전 저장 실패: {}", e))?;
  Ok(())
}

// ============================================================================
// AI 데이터 조회
// ============================================================================

/// 문서의 임베딩 조회
pub fn get_document_embedding(conn: &Connection, doc_id: &str) -> Option<Vec<u8>> {
  conn
    .query_row(
      "SELECT embedding FROM document_ai_data WHERE document_id = ?1",
      [doc_id],
      |row| row.get(0),
    )
    .optional()
    .unwrap_or(None)
}

/// 임베딩 저장 (서버에서 받은 경우)
pub fn save_document_embedding(
  conn: &Connection,
  doc_id: &str,
  embedding: &[u8],
) -> Result<(), String> {
  conn
    .execute(
      "INSERT OR REPLACE INTO document_ai_data (document_id, embedding) VALUES (?1, ?2)",
      rusqlite::params![doc_id, embedding],
    )
    .map_err(|e| format!("임베딩 저장 실패: {}", e))?;
  Ok(())
}

/// 문서 요약 업데이트 (암호화된 상태)
pub fn update_document_summary(
  conn: &Connection,
  doc_id: &str,
  summary_enc: &[u8],
) -> Result<(), String> {
  conn
    .execute(
      "UPDATE documents SET summary = ?1 WHERE id = ?2",
      rusqlite::params![summary_enc, doc_id],
    )
    .map_err(|e| format!("요약 업데이트 실패: {}", e))?;
  Ok(())
}

// ============================================================================
// 문서 상태 변경
// ============================================================================

/// 문서 상태를 Draft로 롤백 + 버전 감소
pub fn rollback_document_state(
  conn: &Connection,
  doc_id: &str,
  user_id: &str,
) -> Result<(), String> {
  conn
    .execute(
      "UPDATE documents SET document_state = 1, version = version - 1 
         WHERE id = ?1 AND user_id = ?2",
      [doc_id, user_id],
    )
    .map_err(|e| format!("상태 롤백 실패: {}", e))?;
  Ok(())
}

// ============================================================================
// 소프트 삭제 / 복원 / 영구 삭제
// ============================================================================

/// 소프트 삭제 (deleted_at 설정)
pub fn soft_delete_document(
  conn: &Connection,
  doc_id: &str,
  user_id: &str,
  deleted_at_enc: &[u8],
) -> Result<usize, String> {
  conn
    .execute(
      "UPDATE documents SET deleted_at = ?1 WHERE id = ?2 AND user_id = ?3",
      rusqlite::params![deleted_at_enc, doc_id, user_id],
    )
    .map_err(|e| format!("소프트 삭제 실패: {}", e))
}

/// 문서 복원 (deleted_at = NULL)
pub fn restore_document_db(
  conn: &Connection,
  doc_id: &str,
  user_id: &str,
) -> Result<usize, String> {
  conn
    .execute(
      "UPDATE documents SET deleted_at = NULL WHERE id = ?1 AND user_id = ?2",
      [doc_id, user_id],
    )
    .map_err(|e| format!("복원 실패: {}", e))
}

/// 문서의 모든 하위 문서 ID 조회 (재귀)
pub fn get_document_descendants(conn: &Connection, root_id: &str) -> Result<Vec<String>, String> {
  let mut stmt = conn
    .prepare(
      "WITH RECURSIVE descendants(id) AS (
                VALUES(?1)
                UNION
                SELECT d.id FROM documents d JOIN descendants p ON d.parent_id = p.id
             )
             SELECT id FROM descendants",
    )
    .map_err(|e| e.to_string())?;

  let rows = stmt
    .query_map([root_id], |row| row.get::<_, String>(0))
    .map_err(|e| e.to_string())?;

  let mut ids = Vec::new();
  for r in rows {
    ids.push(r.map_err(|e| e.to_string())?);
  }
  Ok(ids)
}

/// 휴지통 문서 ID 목록 조회
pub fn get_deleted_document_ids(conn: &Connection, user_id: &str) -> Result<Vec<String>, String> {
  let mut stmt = conn
    .prepare("SELECT id FROM documents WHERE user_id = ?1 AND deleted_at IS NOT NULL")
    .map_err(|e| e.to_string())?;

  let rows = stmt
    .query_map([user_id], |row| row.get(0))
    .map_err(|e| e.to_string())?;

  let mut ids = Vec::new();
  for r in rows {
    ids.push(r.map_err(|e| e.to_string())?);
  }
  Ok(ids)
}

/// 문서 영구 삭제 (관련 데이터 포함)
pub fn hard_delete_document(conn: &Connection, doc_id: &str) -> Result<(), String> {
  // 1. 태그 삭제
  conn
    .execute("DELETE FROM document_tags WHERE document_id = ?1", [doc_id])
    .map_err(|e| format!("태그 삭제 실패: {}", e))?;

  // 2. AI 데이터 삭제
  conn
    .execute(
      "DELETE FROM document_ai_data WHERE document_id = ?1",
      [doc_id],
    )
    .map_err(|e| format!("AI 데이터 삭제 실패: {}", e))?;

  // 3. 리비전 삭제
  conn
    .execute(
      "DELETE FROM document_revisions WHERE document_id = ?1",
      [doc_id],
    )
    .map_err(|e| format!("리비전 삭제 실패: {}", e))?;

  // 4. 기타 관련 테이블 삭제 (Snapshots, Deltas, AI Queue)
  conn
    .execute(
      "DELETE FROM document_snapshots WHERE document_id = ?1",
      [doc_id],
    )
    .map_err(|e| format!("스냅샷 삭제 실패: {}", e))?;

  conn
    .execute(
      "DELETE FROM document_deltas WHERE document_id = ?1",
      [doc_id],
    )
    .map_err(|e| format!("델타 삭제 실패: {}", e))?;

  conn
    .execute(
      "DELETE FROM document_ai_queue WHERE document_id = ?1",
      [doc_id],
    )
    .map_err(|e| format!("AI Queue 삭제 실패: {}", e))?;

  // 5. 문서 삭제
  conn
    .execute("DELETE FROM documents WHERE id = ?1", [doc_id])
    .map_err(|e| format!("문서 삭제 실패: {}", e))?;

  Ok(())
}
