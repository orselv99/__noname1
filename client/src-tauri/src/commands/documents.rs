//! ==========================================================================
//! documents.rs - 문서 CRUD 커맨드
//! ==========================================================================
//!
//! C++ 개발자를 위한 설명:
//! - 문서 저장/목록/조회/삭제/복원 등 핵심 문서 관리 기능
//! - 모든 민감 데이터는 AES-256-GCM으로 암호화하여 저장
//! - 서버 동기화: 발행(Published) 상태에서만 서버에 RAG 데이터 전송
//!
//! 주요 기능:
//! - `save_document`: 문서 저장/수정 + 리비전 생성 + 서버 동기화
//! - `list_documents`: 그룹별/증분 동기화 문서 목록
//! - `get_document`: 단일 문서 조회
//! - `delete_document`: 소프트 삭제 (휴지통으로)
//! - `restore_document`: 휴지통에서 복원
//! - `empty_trash`: 영구 삭제
//!
//! 열거형:
//! - `DocumentState`: Draft(1), Feedback(2), Published(3)
//! - `VisibilityLevel`: Hidden(1), Metadata(2), Snippet(3), Public(4)
//! - `GroupType`: Department(0), Project(1), Private(2)
//! ==========================================================================
use crate::commands::auth::AuthState;
use crate::config;
use crate::crypto::{decrypt_content, encrypt_content};
use crate::database::DatabaseState;
use chrono::Utc;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

// ============================================================================
// 열거형 정의 (서버 acl.proto와 동기화)
// ============================================================================

/// 문서 상태
///
/// 서버와 동기화: server/pb/acl.proto의 DocumentState와 동일
/// #[repr(i32)]: 메모리 레이아웃을 i32로 고정 (C++ enum class : int 유사)
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq)]
#[repr(i32)]
pub enum DocumentState {
    /// 초안 (1): 로컬에만 존재, 서버 검색 불가
    #[default]
    Draft = 1,
    /// 피드백 (2): 검토 중
    Feedback = 2,
    /// 발행됨 (3): 서버에 RAG 데이터 동기화, 검색 가능
    Published = 3,
}

/// 문서 공개 수준
///
/// 다른 사용자가 검색 시 얼마나 많은 정보를 볼 수 있는지 결정
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq)]
#[repr(i32)]
pub enum VisibilityLevel {
    /// 숨김 (1): 검색 결과에 노출 안 됨
    #[default]
    Hidden = 1,
    /// 메타데이터 (2): 제목만 노출
    Metadata = 2,
    /// 스니펫 (3): 제목 + 요약 노출
    Snippet = 3,
    /// 공개 (4): 전체 내용 노출
    Public = 4,
}

/// 문서 그룹 유형
///
/// 문서가 속한 조직 단위를 구분
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq)]
#[repr(i32)]
pub enum GroupType {
    /// 부서 (0): 회사 조직도 기반
    Department = 0,
    /// 프로젝트 (1): 프로젝트 팀 기반
    Project = 1,
    /// 개인 (2): 본인만 접근 가능 (서버 동기화 안 됨)
    #[default]
    Private = 2,
}

// ============================================================================
// DTO 구조체 (Data Transfer Object)
// ============================================================================

/// 문서 태그 (AI 추출 또는 사용자 지정)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocumentTag {
    /// 태그 이름 (예: "자연선택", "진화론")
    pub tag: String,
    /// 근거 텍스트: 원문에서 발취한 문장
    pub evidence: Option<String>,
}

/// 문서 객체 (프론트엔드와 교환되는 전체 문서 정보)
///
/// 주의: 프론트엔드로 전달 시 복호화된 평문 상태
/// DB 저장 시에는 암호화된 BLOB 상태
#[derive(Debug, Serialize, Deserialize)]
pub struct Document {
    /// 문서 고유 ID (UUID v4)
    pub id: String,
    /// 소유자 ID
    pub user_id: String,
    /// 작성자 이름 (users 테이블에서 JOIN)
    pub creator_name: Option<String>,
    /// 제목 (암호화 대상)
    pub title: String,
    /// 본문 HTML (암호화 대상)
    pub content: String,
    /// 문서 상태 (DocumentState 열거형 값)
    pub document_state: i32,
    /// 공개 수준 (VisibilityLevel 열거형 값)
    pub visibility_level: i32,
    /// 그룹 유형 (GroupType 열거형 값)
    pub group_type: i32,
    /// 그룹 ID (부서/프로젝트 ID, Private일 경우 None)
    pub group_id: Option<String>,
    /// 상위 폴더 ID (계층 구조용)
    pub parent_id: Option<String>,
    /// 요약 (사용자 입력 또는 AI 생성, 암호화 대상)
    pub summary: Option<String>,
    /// 생성 시간 (ISO 8601, 암호화 대상)
    pub created_at: Option<String>,
    /// 수정 시간 (ISO 8601, 암호화 대상)
    pub updated_at: Option<String>,
    /// 마지막 동기화 타임스탬프 (평문, 증분 동기화용)
    pub last_synced_at: Option<i64>,
    /// 마지막 접근 시간 (암호화 대상)
    pub accessed_at: Option<String>,
    /// 텍스트 크기 (bytes, 암호화 대상)
    pub size: Option<String>,
    /// 즐겨찾기 여부
    pub is_favorite: bool,
    /// 태그 목록
    pub tags: Option<Vec<DocumentTag>>,
    /// 삭제 시간 (소프트 삭제 - 휴지통)
    pub deleted_at: Option<String>,
    /// 미디어 크기 (Base64 이미지 합계, 암호화 대상)
    pub media_size: Option<String>,
    /// 버전 번호 (리비전 추적용)
    pub version: i32,
}

/// 문서 저장 요청 DTO
///
/// 프론트엔드에서 invoke('save_document', { req: {...} })로 전달
#[derive(Deserialize)]
pub struct SaveDocumentRequest {
    /// 문서 ID (None이면 새 문서 생성, Some이면 업데이트)
    pub id: Option<String>,
    /// 제목 (평문 - Rust에서 암호화)
    pub title: String,
    /// 본문 HTML (평문 - Rust에서 암호화)
    pub content: String,
    /// 사용자 요약 (선택적)
    pub summary: Option<String>,
    /// 그룹 유형 (0=부서, 1=프로젝트, 2=개인)
    pub group_type: i32,
    /// 그룹 ID (부서/프로젝트 UUID)
    pub group_id: Option<String>,
    /// 상위 폴더 ID
    pub parent_id: Option<String>,
    /// 문서 상태 (1=초안, 2=피드백, 3=발행)
    pub document_state: i32,
    /// 공개 수준 (1=숨김, 2=메타, 3=스니펫, 4=공개)
    pub visibility_level: i32,
    /// 즐겨찾기 여부
    pub is_favorite: Option<bool>,
    /// 버전 번호 (리비전 생성용)
    pub version: Option<i32>,
    /// 태그 목록
    pub tags: Option<Vec<DocumentTag>>,
    /// 작성자 이름 (리비전에 저장)
    pub creator_name: Option<String>,
}

// ============================================================================
// Tauri 커맨드: 문서 저장
// ============================================================================

/// 문서 저장/수정 커맨드
///
/// # 처리 흐름
/// 1. 인증 확인 → user_id 추출
/// 2. 모든 민감 필드 암호화 (제목, 본문, 요약, 날짜 등)
/// 3. DB에 UPSERT (INSERT ... ON CONFLICT DO UPDATE)
/// 4. 태그 저장 (기존 태그 삭제 → 새로 삽입)
/// 5. 리비전 생성 (Private 아니고 version > 0일 때)
/// 6. 서버 동기화 (Published, 비Private일 때 RAG 데이터 전송)
///
/// # 서버 동기화 실패 시
/// - 문서 상태를 Draft로 롤백 + 버전 번호 감소
///
/// # 프론트엔드 호출 예시
/// ```typescript
/// const doc = await invoke('save_document', {
///   req: { title: '제목', content: '<p>내용</p>', documentState: 3, ... }
/// });
/// ```
#[tauri::command]
pub async fn save_document(
  auth_state: State<'_, Mutex<AuthState>>,
  db_state: State<'_, Mutex<DatabaseState>>,
  req: SaveDocumentRequest,
) -> Result<Document, String> {
  let user_id = {
    let auth = auth_state.lock().unwrap();
    auth.user_id.clone().ok_or("Not authenticated")?
  };

  let doc_id = req.id.unwrap_or_else(|| Uuid::new_v4().to_string());
  let now = chrono_now(); // ISO String
  let mut return_created_at = now.clone();
  let ts = Utc::now().timestamp(); // Integer timestamp
  let size_str = req.content.len().to_string();

  // Encrypt fields
  let title_enc = encrypt_content(&user_id, &req.title)?;
  let content_enc = encrypt_content(&user_id, &req.content)?;
  let summary_enc = req
    .summary
    .as_ref()
    .map(|s| encrypt_content(&user_id, s))
    .transpose()?;
  let mut created_at_enc = encrypt_content(&user_id, &now)?;
  let updated_at_enc = encrypt_content(&user_id, &now)?;
  let size_enc = encrypt_content(&user_id, &size_str)?;

  // Calculate media size from content
  let mut media_size_bytes = 0;
  // Regex to find data URLs: src="data:image/png;base64,..."
  // Simply summing up base64 lengths and converting to binary size
  // Note: This matches the frontend logic
  let re = regex::Regex::new(r#"src="data:[^;]+;base64,([^"]+)""#).unwrap();
  for cap in re.captures_iter(&req.content) {
    if let Some(base64_part) = cap.get(1) {
      media_size_bytes += (base64_part.as_str().len() as f64 * 0.75).floor() as u64;
    }
  }
  let media_size_str = media_size_bytes.to_string();
  let media_size_enc = encrypt_content(&user_id, &media_size_str)?;

  let mut creator_name = None;
  let mut return_summary = req.summary.clone();
  let mut return_tags = req.tags.clone();

  let _rag_data = {
    let db = db_state.lock().unwrap();
    if let Some(ref conn) = db.conn {
      // 1. Get username
      creator_name = conn
        .query_row(
          "SELECT username FROM users WHERE id = ?1",
          [&user_id],
          |row| row.get(0),
        )
        .optional()
        .unwrap_or(None);

      // Check for existing created_at
      let existing_created_at_blob: Option<Vec<u8>> = conn
        .query_row(
          "SELECT created_at FROM documents WHERE id = ?1",
          [&doc_id],
          |row| row.get(0),
        )
        .optional()
        .unwrap_or(None);

      if let Some(blob) = existing_created_at_blob {
        // Reuse existing encrypted timestamp for DB/Server
        created_at_enc = blob.clone();

        // Decrypt for return value
        if let Ok(decrypted) = decrypt_content(&user_id, &blob) {
          return_created_at = decrypted;
        }
      }

      // 2. Insert/Update
      conn.execute(
                "INSERT INTO documents (
                    id, user_id, document_state, visibility_level, group_type, group_id,
                    title, content, summary, size, created_at, updated_at, is_favorite, last_synced_at, parent_id, version, media_size
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
                    media_size = excluded.media_size
                ",
                rusqlite::params![
                    doc_id,
                    user_id,
                    req.document_state,
                    req.visibility_level,
                    req.group_type,
                    req.group_id,
                    title_enc,
                    content_enc,
                    summary_enc,
                    size_enc,
                    created_at_enc,
                    updated_at_enc,
                    req.is_favorite.unwrap_or(false),
                    ts, // Plaintext timestamp
                    req.parent_id,
                    req.version.unwrap_or(0),
                    media_size_enc
                ],
            )
            .map_err(|e| format!("Failed to save document: {}", e))?;

      // 3. Save Tags if provided
      if let Some(tags) = &req.tags {
        // Delete existing tags
        conn
          .execute(
            "DELETE FROM document_tags WHERE document_id = ?1",
            [&doc_id],
          )
          .map_err(|e| format!("Failed to clear tags: {}", e))?;

        for tag in tags {
          let tag_id = Uuid::new_v4().to_string();
          let tag_enc = encrypt_content(&user_id, &tag.tag)?;
          let evidence_enc = tag
            .evidence
            .as_ref()
            .map(|e| encrypt_content(&user_id, e))
            .transpose()?;
          let created_at_enc = encrypt_content(&user_id, &now)?; // reusing now

          conn
            .execute(
              "INSERT INTO document_tags (id, document_id, tag, evidence, created_at)
                          VALUES (?1, ?2, ?3, ?4, ?5)",
              rusqlite::params![tag_id, doc_id, tag_enc, evidence_enc, created_at_enc],
            )
            .map_err(|e| format!("Failed to save tag: {}", e))?;
        }
      }

      // 4. Save Revision (Snapshot)
      // Constraints: No Private Docs (2), No Version 0
      let current_version = req.version.unwrap_or(0);
      if req.group_type != 2 && current_version > 0 {
        let revision_id = Uuid::new_v4().to_string();
        // Use updated_at_enc for revision timestamp (current time)
        let revision_created_at_enc = encrypt_content(&user_id, &now)?;

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
              revision_id,
              doc_id,
              current_version,
              content_enc,
              title_enc,
              req.creator_name,
              revision_created_at_enc
            ],
          )
          .map_err(|e| format!("Failed to save revision: {}", e))?;
      }

      // 4. Server RAG Sync (if Published)
      if req.document_state == 3 {
        // Published
        // Spawn async task to not block save?
        // But we are in async fn, so we can await.
        // However, we hold DB lock. We should DROP DB lock before network call?
        // NO, we are iterating `req.tags` which is owned.
        // But we need `embedding` from `document_ai_data`.

        // Reuse conn to fetch embedding
        let embedding_blob: Option<Vec<u8>> = conn
          .query_row(
            "SELECT embedding FROM document_ai_data WHERE document_id = ?1",
            [&doc_id],
            |row| row.get(0),
          )
          .optional()
          .unwrap_or(None);

        // fetch tags from req (latest) or DB?
        // req.tags might be None if client didn't send them (partial update?).
        // But in `documentStore.ts`, we send everything.
        // Use `req.tags` if present, else empty? Or fetch from DB?
        // Safe to assume `req.tags` contains current tags if `saveDocument` sends full object.
        // But if `save_document` is called with partial... `documentStore` sends object spread `...doc`.

        let tags_to_send = req.tags.clone().unwrap_or_default();

        // Pass plaintext data to RAG sync for searchability
        (
          embedding_blob,
          tags_to_send,
          req.summary.clone(),
          req.title.clone(),
          return_created_at.clone(),
          now.clone(),
        )
      } else {
        (
          None,
          Vec::new(),
          None,
          String::new(),
          String::new(),
          String::new(),
        )
      }
    } else {
      return Err("Database not initialized".to_string());
    }
  }; // End of DB lock scope

  // Perform RAG Sync if we have data and state is Published (checked via returned tuple)
  // Actually we need to check state again or use the tuple.
  // If embedding_blob is Some, it means we attempted fetch.
  // But embedding might be missing even if Published.
  // Let's use `req.document_state` check again.

  // Perform RAG Sync if we have data and state is Published, AND NOT Private
  if req.document_state == 3 && req.group_type != 2 {
    // Prepare Payload
    // We need auth token
    let token = {
      let auth = auth_state.lock().unwrap();
      auth.token.clone()
    };

    if let Some(token) = token {
      use crate::commands::ai::bytes_to_embedding;

      let embedding_vec = if let Some(blob) = _rag_data.0 {
        bytes_to_embedding(&blob)
      } else {
        Vec::new()
      };

      // Clean content (remove images) for server-side embedding
      // 1. Remove Markdown images: ![alt](url)
      let re_md = regex::Regex::new(r"(?s)!\[.*?\]\(.*?\)").unwrap();
      let no_md = re_md.replace_all(&req.content, "");

      // 2. Remove HTML images: <img ... >
      let re_html = regex::Regex::new(r"(?s)<img[^>]*>").unwrap();
      let cleaned_content = re_html.replace_all(&no_md, "");

      // Construct JSON - Send plaintext data for server-side search
      let payload = serde_json::json!({
          "title": _rag_data.3,
          "summary": _rag_data.2.clone().unwrap_or_default(),
          "tag_evidences": _rag_data.1.iter().map(|t| {
              serde_json::json!({
                  "tag": t.tag,
                  "evidence": t.evidence.clone().unwrap_or_default()
              })
          }).collect::<Vec<_>>(),
          "embedding": embedding_vec,
          "content": cleaned_content.to_string(), // Send cleaned plaintext content
          "group_id": req.group_id,
          "group_type": req.group_type,
          "created_at": _rag_data.4,
          "updated_at": _rag_data.5
      });

      // Send Request
      let client = reqwest::Client::new();
      let res = client
        .post(&format!("{}/api/v1/docs", config::get_api_url()))
        .header("Authorization", format!("Bearer {}", token))
        .json(&payload)
        .send()
        .await;

      match res {
        Ok(r) => {
          if !r.status().is_success() {
            let status = r.status();
            let body = r.text().await.unwrap_or_default();

            // Rollback state to Draft AND revert version
            {
              let db = db_state.lock().unwrap();
              if let Some(ref conn) = db.conn {
                let _ = conn.execute(
                   "UPDATE documents SET document_state = 1, version = version - 1 WHERE id = ?1 AND user_id = ?2",
                   [&doc_id, &user_id],
                 );
              }
            }

            return Err(format!(
              "Server sync failed (Published): HTTP {} - {}",
              status, body
            ));
          } else {
            // Parse response to see if we got an embedding back
            if let Ok(json_body) = r.json::<serde_json::Value>().await {
              if let Some(embedding_val) = json_body.get("embedding") {
                if let Some(embedding_arr) = embedding_val.as_array() {
                  let embedding: Vec<f32> = embedding_arr
                    .iter()
                    .filter_map(|v| v.as_f64().map(|f| f as f32))
                    .collect();

                  if !embedding.is_empty() {
                    // Save returned embedding to local DB
                    let db = db_state.lock().unwrap();
                    if let Some(ref conn) = db.conn {
                      let embedding_bytes: Vec<u8> = embedding
                        .iter()
                        .flat_map(|f| f.to_le_bytes().to_vec())
                        .collect();

                      // 1. Save Embedding
                      let _ = conn.execute(
                        "INSERT OR REPLACE INTO document_ai_data (document_id, embedding) VALUES (?1, ?2)",
                        rusqlite::params![doc_id, embedding_bytes],
                      );
                      println!("Saved server-generated embedding for doc {}", doc_id);

                      // 2. Save Summary (if present)
                      // We receive plaintext summary, so we must encrypt it before saving to DB
                      if let Some(summary_text) = json_body.get("summary").and_then(|s| s.as_str())
                      {
                        if !summary_text.is_empty() {
                          return_summary = Some(summary_text.to_string());
                          if let Ok(summary_enc) = encrypt_content(&user_id, summary_text) {
                            let _ = conn.execute(
                              "UPDATE documents SET summary = ?1 WHERE id = ?2",
                              rusqlite::params![summary_enc, doc_id],
                            );
                            println!("Saved server-generated summary for doc {}", doc_id);
                          }
                        }
                      }

                      // 3. Save Tags (if present)
                      if let Some(tag_evidences) =
                        json_body.get("tag_evidences").and_then(|t| t.as_array())
                      {
                        if !tag_evidences.is_empty() {
                          // Delete existing tags first (to replace with AI generated ones)
                          let _ = conn.execute(
                            "DELETE FROM document_tags WHERE document_id = ?1",
                            [&doc_id],
                          );

                          let mut new_return_tags = Vec::new();

                          for tag_obj in tag_evidences {
                            if let (Some(tag), Some(evidence)) = (
                              tag_obj.get("tag").and_then(|t| t.as_str()),
                              tag_obj.get("evidence").and_then(|e| e.as_str()),
                            ) {
                              let tag_id = Uuid::new_v4().to_string();
                              let created_at_enc =
                                encrypt_content(&user_id, &now).unwrap_or_default();

                              if let Ok(tag_enc) = encrypt_content(&user_id, tag) {
                                let evidence_enc = encrypt_content(&user_id, evidence).ok();

                                let _ = conn.execute(
                                        "INSERT INTO document_tags (id, document_id, tag, evidence, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                                        rusqlite::params![tag_id, doc_id, tag_enc, evidence_enc, created_at_enc],
                                     );
                              }

                              new_return_tags.push(DocumentTag {
                                tag: tag.to_string(),
                                evidence: Some(evidence.to_string()),
                              });
                            }
                          }
                          return_tags = Some(new_return_tags);
                          println!(
                            "Saved {} server-generated tags for doc {}",
                            tag_evidences.len(),
                            doc_id
                          );
                        }
                      }
                    }
                  }
                }
              }
            }
            println!("RAG Sync Success for doc {}", doc_id);
          }
        }
        Err(e) => {
          // Rollback state to Draft AND revert version
          {
            let db = db_state.lock().unwrap();
            if let Some(ref conn) = db.conn {
              let _ = conn.execute(
                 "UPDATE documents SET document_state = 1, version = version - 1 WHERE id = ?1 AND user_id = ?2",
                 [&doc_id, &user_id],
               );
            }
          }

          return Err(format!(
            "Server sync failed (Published): Network error - {}",
            e
          ));
        }
      }
    } else {
      // Rollback state to Draft AND revert version
      {
        let db = db_state.lock().unwrap();
        if let Some(ref conn) = db.conn {
          let _ = conn.execute(
             "UPDATE documents SET document_state = 1, version = version - 1 WHERE id = ?1 AND user_id = ?2",
             [&doc_id, &user_id],
           );
        }
      }
      return Err("Cannot publish document: Not authenticated".to_string());
    }
  }

  // Return the saved document object
  Ok(Document {
    id: doc_id,
    user_id,
    creator_name,
    title: req.title,
    content: req.content,
    document_state: req.document_state,
    visibility_level: req.visibility_level,
    group_type: req.group_type,
    group_id: req.group_id,
    parent_id: req.parent_id,
    summary: return_summary,
    created_at: Some(return_created_at),
    updated_at: Some(now),
    last_synced_at: Some(ts),
    accessed_at: None,
    size: Some(size_str),
    is_favorite: req.is_favorite.unwrap_or(false),
    tags: return_tags, // Return updated tags
    deleted_at: None,
    media_size: Some(media_size_str),
    version: req.version.unwrap_or(0),
  })
}

#[derive(Serialize)]
pub struct ListDocumentsResponse {
  pub docs: Vec<Document>,
  pub last_synced_at: i64,
}

#[tauri::command]
pub async fn list_documents(
  auth_state: State<'_, Mutex<AuthState>>,
  db_state: State<'_, Mutex<DatabaseState>>,
  group_type: Option<i32>,
  group_id: Option<String>,
  last_synced_at: Option<i64>, // Incremental Sync
) -> Result<ListDocumentsResponse, String> {
  let user_id = {
    let auth = auth_state.lock().unwrap();
    auth.user_id.clone().ok_or("Not authenticated")?
  };

  let server_time = Utc::now().timestamp();

  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    // Prepare Query (unchanged logic)
    let mut query = "SELECT 
            d.id, d.user_id, d.document_state, d.visibility_level, d.group_type, d.group_id,
            d.title, d.content, d.summary, d.created_at, d.updated_at, d.accessed_at, d.size, d.is_favorite,
            u.username, d.last_synced_at, d.parent_id, d.version, d.deleted_at, d.media_size
            FROM documents d
            LEFT JOIN users u ON d.user_id = u.id
            WHERE d.user_id = ?1".to_string();

    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    params.push(Box::new(user_id.clone()));

    // Group filters
    if let Some(gt) = group_type {
      query.push_str(&format!(" AND d.group_type = {}", gt));
    }
    if let Some(ref gid) = group_id {
      query.push_str(" AND d.group_id = ?");
      params.push(Box::new(gid.clone()));
    }

    // Incremental Sync
    if let Some(last_sync) = last_synced_at {
      query.push_str(" AND d.last_synced_at >= ?");
      params.push(Box::new(last_sync));
    }

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;

    // 1. Fetch basic document info
    let rows = stmt
      .query_map(rusqlite::params_from_iter(params.iter()), |row| {
        let id: String = row.get(0)?;
        let uid: String = row.get(1)?;
        let state: i32 = row.get(2)?;
        let vis: i32 = row.get(3)?;
        let gtype: i32 = row.get(4)?;
        let gid: Option<String> = row.get(5)?;

        let title_blob: Vec<u8> = row.get(6).unwrap_or_default();
        let content_blob: Vec<u8> = row.get(7).unwrap_or_default();
        let summary_blob: Option<Vec<u8>> = row.get(8).ok();
        let created_blob: Option<Vec<u8>> = row.get(9).ok();
        let updated_blob: Option<Vec<u8>> = row.get(10).ok();
        let accessed_blob: Option<Vec<u8>> = row.get(11).ok();
        let size_blob: Option<Vec<u8>> = row.get(12).ok();
        let is_favorite: bool = row.get(13).unwrap_or(false);
        let username: Option<String> = row.get(14).ok();
        // Index 15 is last_synced_at
        let last_synced_at: Option<i64> = row.get(15).ok();
        let parent_id: Option<String> = row.get(16).ok();
        let version: i32 = row.get(17).unwrap_or(0);
        let deleted_at_blob: Option<Vec<u8>> = row.get(18).ok();
        let media_size_blob: Option<Vec<u8>> = row.get(19).ok();

        Ok((
          id,
          uid,
          state,
          vis,
          gtype,
          gid,
          title_blob,
          content_blob,
          summary_blob,
          created_blob,
          updated_blob,
          accessed_blob,
          size_blob,
          is_favorite,
          username,
          last_synced_at,
          parent_id,
          version,
          deleted_at_blob,
          media_size_blob,
        ))
      })
      .map_err(|e| e.to_string())?;

    let mut temp_docs = Vec::new();
    for row_res in rows {
      temp_docs.push(row_res.map_err(|e| e.to_string())?);
    }

    println!(
      "DEBUG: list_documents params - gt: {:?}, gid: {:?}, last_sync: {:?}",
      group_type, group_id, last_synced_at
    );
    println!("DEBUG: found {} rows", temp_docs.len());
    for (id, _, _, _, gtype, gid, _, _, _, _, _, _, _, _, _, _, pid, _, _, _) in &temp_docs {
      println!(
        "DEBUG: DOC id={}, gtype={}, gid={:?}, pid={:?}",
        id, gtype, gid, pid
      );
    }

    let mut docs = Vec::new();

    // 2. Process and fetch tags
    for (
      id,
      uid,
      state,
      vis,
      gtype,
      gid,
      t_blob,
      c_blob,
      s_blob,
      cr_blob,
      up_blob,
      acc_blob,
      sz_blob,
      is_fav,
      username,
      ls_at,
      pid,
      version,
      deleted_at_blob,
      media_size_blob,
    ) in temp_docs
    {
      // Fetch tags for this doc
      let mut tags = Vec::new();
      {
        // Inner scope for tag query
        let mut tag_stmt = conn
          .prepare("SELECT tag, evidence FROM document_tags WHERE document_id = ?1")
          .map_err(|e| e.to_string())?;
        let tag_rows = tag_stmt
          .query_map([&id], |row| {
            let tag_blob: Vec<u8> = row.get(0)?;
            let evidence_blob: Option<Vec<u8>> = row.get(1).ok();
            Ok((tag_blob, evidence_blob))
          })
          .map_err(|e| e.to_string())?;

        for r in tag_rows {
          if let Ok((t_blob, e_blob)) = r {
            if let Ok(tag) = decrypt_content(&uid, &t_blob) {
              let evidence = e_blob.and_then(|b| decrypt_content(&uid, &b).ok());
              tags.push(DocumentTag { tag, evidence });
            }
          }
        }
      }

      // Decrypt doc fields
      let title = decrypt_content(&uid, &t_blob).unwrap_or_default();
      let content = decrypt_content(&uid, &c_blob).unwrap_or_default();
      let summary = s_blob.and_then(|b| decrypt_content(&uid, &b).ok());
      let created_at = cr_blob.and_then(|b| decrypt_content(&uid, &b).ok());
      let updated_at = up_blob.and_then(|b| decrypt_content(&uid, &b).ok());
      let accessed_at = acc_blob.and_then(|b| decrypt_content(&uid, &b).ok());
      let size = sz_blob.and_then(|b| decrypt_content(&uid, &b).ok());
      let deleted_at = deleted_at_blob.and_then(|b| decrypt_content(&uid, &b).ok());
      let media_size = media_size_blob.and_then(|b| decrypt_content(&uid, &b).ok());

      docs.push(Document {
        id,
        user_id: uid,
        creator_name: username,
        title,
        content,
        document_state: state,
        visibility_level: vis,
        group_type: gtype,
        group_id: gid,
        parent_id: pid,
        summary,
        created_at,
        updated_at,
        last_synced_at: ls_at, // Renamed
        accessed_at,
        size,
        is_favorite: is_fav,
        tags: Some(tags),
        version,
        deleted_at,
        media_size,
      });
    }

    Ok(ListDocumentsResponse {
      docs,
      last_synced_at: server_time,
    })
  } else {
    Err("Database not initialized".to_string())
  }
}

#[tauri::command]
pub async fn get_document(
  auth_state: State<'_, Mutex<AuthState>>,
  db_state: State<'_, Mutex<DatabaseState>>,
  id: String,
) -> Result<Document, String> {
  let user_id = {
    let auth = auth_state.lock().unwrap();
    auth.user_id.clone().ok_or("Not authenticated")?
  };

  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    let mut stmt = conn.prepare("SELECT 
            d.id, d.user_id, d.document_state, d.visibility_level, d.group_type, d.group_id,
            d.title, d.content, d.summary, d.created_at, d.updated_at, d.accessed_at, d.size, d.is_favorite,
            u.username, d.last_synced_at, d.parent_id, d.version, d.deleted_at, d.media_size
            FROM documents d
            LEFT JOIN users u ON d.user_id = u.id
            WHERE d.id = ?1 AND d.user_id = ?2").map_err(|e| e.to_string())?;

    let row = stmt
      .query_row([&id, &user_id], |row| {
        let id: String = row.get(0)?;
        let uid: String = row.get(1)?;
        let state: i32 = row.get(2)?;
        let vis: i32 = row.get(3)?;
        let gtype: i32 = row.get(4)?;
        let gid: Option<String> = row.get(5)?;

        let title_blob: Vec<u8> = row.get(6).unwrap_or_default();
        let content_blob: Vec<u8> = row.get(7).unwrap_or_default();
        let summary_blob: Option<Vec<u8>> = row.get(8).ok();
        let created_blob: Option<Vec<u8>> = row.get(9).ok();
        let updated_blob: Option<Vec<u8>> = row.get(10).ok();
        let accessed_blob: Option<Vec<u8>> = row.get(11).ok();
        let size_blob: Option<Vec<u8>> = row.get(12).ok();
        let is_favorite: bool = row.get(13).unwrap_or(false);
        let username: Option<String> = row.get(14).ok();
        let last_synced_at: Option<i64> = row.get(15).ok();
        let parent_id: Option<String> = row.get(16).ok();
        let version: i32 = row.get(17).unwrap_or(0);
        let deleted_at_blob: Option<Vec<u8>> = row.get(18).ok();
        let media_size_blob: Option<Vec<u8>> = row.get(19).ok();

        Ok((
          id,
          uid,
          state,
          vis,
          gtype,
          gid,
          title_blob,
          content_blob,
          summary_blob,
          created_blob,
          updated_blob,
          accessed_blob,
          size_blob,
          is_favorite,
          username,
          last_synced_at,
          parent_id,
          version,
          deleted_at_blob,
          media_size_blob,
        ))
      })
      .map_err(|e| e.to_string())?;

    let (
      id,
      uid,
      state,
      vis,
      gtype,
      gid,
      title_blob,
      content_blob,
      summary_blob,
      created_blob,
      updated_blob,
      accessed_blob,
      size_blob,
      is_fav,
      username,
      ls_at,
      pid,
      version,
      deleted_at_blob,
      media_size_blob,
    ) = row;
    let mut tags = Vec::new();
    {
      let mut tag_stmt = conn
        .prepare("SELECT tag, evidence FROM document_tags WHERE document_id = ?1")
        .map_err(|e| e.to_string())?;
      let tag_rows = tag_stmt
        .query_map([&id], |row| {
          let tag_blob: Vec<u8> = row.get(0)?;
          let evidence_blob: Option<Vec<u8>> = row.get(1).ok();
          Ok((tag_blob, evidence_blob))
        })
        .map_err(|e| e.to_string())?;

      for r in tag_rows {
        if let Ok((t_blob, e_blob)) = r {
          if let Ok(tag) = decrypt_content(&uid, &t_blob) {
            let evidence = e_blob.and_then(|b| decrypt_content(&uid, &b).ok());
            tags.push(DocumentTag { tag, evidence });
          }
        }
      }
    }

    // Decrypt
    let title = decrypt_content(&uid, &title_blob).unwrap_or_default();
    let content = decrypt_content(&uid, &content_blob).unwrap_or_default();
    let summary = summary_blob.and_then(|b| decrypt_content(&uid, &b).ok());
    let created_at = created_blob.and_then(|b| decrypt_content(&uid, &b).ok());
    let updated_at = updated_blob.and_then(|b| decrypt_content(&uid, &b).ok());
    let accessed_at = accessed_blob.and_then(|b| decrypt_content(&uid, &b).ok());
    let size = size_blob.and_then(|b| decrypt_content(&uid, &b).ok());
    let deleted_at = deleted_at_blob.and_then(|b| decrypt_content(&uid, &b).ok());
    let media_size = media_size_blob.and_then(|b| decrypt_content(&uid, &b).ok());

    Ok(Document {
      id,
      user_id: uid,
      creator_name: username,
      title,
      content,
      document_state: state,
      visibility_level: vis,
      group_type: gtype,
      group_id: gid,
      parent_id: pid,
      summary,
      created_at,
      updated_at,
      last_synced_at: ls_at,
      accessed_at,
      size,
      is_favorite: is_fav,
      tags: Some(tags),
      version,
      deleted_at,
      media_size,
    })
  } else {
    Err("Database not initialized".to_string())
  }
}

fn chrono_now() -> String {
  Utc::now().to_rfc3339()
}

#[tauri::command]
pub async fn delete_document(
  auth_state: State<'_, Mutex<AuthState>>,
  db_state: State<'_, Mutex<DatabaseState>>,
  id: String,
) -> Result<(), String> {
  let user_id = {
    let auth = auth_state.lock().unwrap();
    auth.user_id.clone().ok_or("Not authenticated")?
  };

  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    // 1. Check if already deleted
    let deleted_at: Option<String> = conn
      .query_row(
        "SELECT deleted_at FROM documents WHERE id = ?1 AND user_id = ?2",
        [&id, &user_id],
        |row| row.get(0),
      )
      .map_err(|_| "Document not found".to_string())?;

    // 2. Find all descendants (recursive)
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
      .query_map([&id], |row| row.get::<_, String>(0))
      .map_err(|e| e.to_string())?;

    let mut ids_to_process = Vec::new();
    for r in rows {
      ids_to_process.push(r.map_err(|e| e.to_string())?);
    }

    if deleted_at.is_none() {
      // 3. Soft Delete (Recursive)
      let now = chrono_now();
      let now_enc = encrypt_content(&user_id, &now).map_err(|e| e.to_string())?;

      for target_id in &ids_to_process {
        // Only mark as deleted if NOT already deleted (preserve original deletion time for nested items)
        conn
          .execute(
            "UPDATE documents SET deleted_at = ?1, updated_at = ?2 WHERE id = ?3 AND user_id = ?4 AND deleted_at IS NULL",
            rusqlite::params![now_enc, now_enc, target_id, user_id],
          )
          .map_err(|e| format!("Failed to soft delete: {}", e))?;
      }
    } else {
      // 4. Hard Delete (Recursive)
      for target_id in &ids_to_process {
        let _ = conn.execute(
          "DELETE FROM document_tags WHERE document_id = ?1",
          [target_id],
        );
        let _ = conn.execute(
          "DELETE FROM document_deltas WHERE document_id = ?1",
          [target_id],
        );
        let _ = conn.execute(
          "DELETE FROM document_snapshots WHERE document_id = ?1",
          [target_id],
        );
        let _ = conn.execute(
          "DELETE FROM document_ai_queue WHERE document_id = ?1",
          [target_id],
        );
        let _ = conn.execute(
          "DELETE FROM document_revisions WHERE document_id = ?1",
          [target_id],
        );
        let _ = conn.execute(
          "DELETE FROM document_ai_data WHERE document_id = ?1",
          [target_id],
        );

        conn
          .execute(
            "DELETE FROM documents WHERE id = ?1 AND user_id = ?2",
            [target_id, &user_id],
          )
          .map_err(|e| e.to_string())?;
      }
    }

    Ok(())
  } else {
    Err("Database not initialized".to_string())
  }
}

#[tauri::command]
pub async fn restore_document(
  auth_state: State<'_, Mutex<AuthState>>,
  db_state: State<'_, Mutex<DatabaseState>>,
  id: String,
) -> Result<(), String> {
  let user_id = {
    let auth = auth_state.lock().unwrap();
    auth.user_id.clone().ok_or("Not authenticated")?
  };

  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    // 1. Get Target's Deleted Timestamp (Encrypted)
    let target_deleted_blob: Option<Vec<u8>> = conn
      .query_row(
        "SELECT deleted_at FROM documents WHERE id = ?1 AND user_id = ?2",
        [&id, &user_id],
        |row| row.get(0),
      )
      .optional()
      .map_err(|e| e.to_string())?
      .flatten();

    let target_deleted_time = match target_deleted_blob {
      Some(blob) => decrypt_content(&user_id, &blob)
        .map_err(|e| format!("Failed to decrypt timestamp: {}", e))?,
      None => return Err("Document is not deleted".to_string()),
    };

    // 2. Find all descendants (recursive) with their deleted_at
    let mut stmt = conn
      .prepare(
        "WITH RECURSIVE descendants(id) AS (
              VALUES(?1)
              UNION
              SELECT d.id FROM documents d JOIN descendants p ON d.parent_id = p.id
            )
            SELECT d.id, d.deleted_at FROM documents d JOIN descendants desc ON d.id = desc.id",
      )
      .map_err(|e| e.to_string())?;

    let rows = stmt
      .query_map([&id], |row| {
        let id: String = row.get(0)?;
        let del_blob: Option<Vec<u8>> = row.get(1).ok();
        Ok((id, del_blob))
      })
      .map_err(|e| e.to_string())?;

    let mut ids_to_restore = Vec::new();
    for r in rows {
      let (desc_id, desc_del_blob) = r.map_err(|e| e.to_string())?;

      if let Some(blob) = desc_del_blob {
        if let Ok(desc_time) = decrypt_content(&user_id, &blob) {
          // Compare timestamps: Only restore if deleted at the exact same time
          if desc_time == target_deleted_time {
            ids_to_restore.push(desc_id);
          }
        }
      }
    }

    // 3. Restore matching IDs
    let now = chrono_now();
    let now_enc = encrypt_content(&user_id, &now).map_err(|e| e.to_string())?;

    for target_id in &ids_to_restore {
      conn
        .execute(
          "UPDATE documents SET deleted_at = NULL, updated_at = ?1 WHERE id = ?2 AND user_id = ?3",
          rusqlite::params![now_enc, target_id, user_id],
        )
        .map_err(|e| format!("Failed to restore document: {}", e))?;
    }

    Ok(())
  } else {
    Err("Database not initialized".to_string())
  }
}

#[tauri::command]
pub async fn empty_recycle_bin(
  auth_state: State<'_, Mutex<AuthState>>,
  db_state: State<'_, Mutex<DatabaseState>>,
) -> Result<(), String> {
  let user_id = {
    let auth = auth_state.lock().unwrap();
    auth.user_id.clone().ok_or("Not authenticated")?
  };

  let mut db = db_state.lock().unwrap();
  if let Some(ref mut conn) = db.conn {
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    {
      // 1. Get IDs of all deleted documents for this user
      let mut stmt = tx
        .prepare("SELECT id FROM documents WHERE user_id = ?1 AND deleted_at IS NOT NULL")
        .map_err(|e| e.to_string())?;

      let deleted_ids: Vec<String> = stmt
        .query_map([&user_id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();

      if deleted_ids.is_empty() {
        return Ok(());
      }

      // 2. Delete related data for each ID
      // Note: We could use "WHERE document_id IN (...)" but SQLite limit is 999 vars.
      // Iterating is safer for now given the context, or we could chunk it.
      // Since it's a transaction, it's atomic.

      let mut delete_tags_stmt = tx
        .prepare("DELETE FROM document_tags WHERE document_id = ?1")
        .map_err(|e| e.to_string())?;
      let mut delete_deltas_stmt = tx
        .prepare("DELETE FROM document_deltas WHERE document_id = ?1")
        .map_err(|e| e.to_string())?;
      let mut delete_snapshots_stmt = tx
        .prepare("DELETE FROM document_snapshots WHERE document_id = ?1")
        .map_err(|e| e.to_string())?;
      let mut delete_ai_stmt = tx
        .prepare("DELETE FROM document_ai_queue WHERE document_id = ?1")
        .map_err(|e| e.to_string())?;
      let mut delete_revisions_stmt = tx
        .prepare("DELETE FROM document_revisions WHERE document_id = ?1")
        .map_err(|e| e.to_string())?;
      let mut delete_ai_data_stmt = tx
        .prepare("DELETE FROM document_ai_data WHERE document_id = ?1")
        .map_err(|e| e.to_string())?;
      let mut delete_doc_stmt = tx
        .prepare("DELETE FROM documents WHERE id = ?1 AND user_id = ?2")
        .map_err(|e| e.to_string())?;

      for id in deleted_ids {
        delete_tags_stmt.execute([&id]).map_err(|e| e.to_string())?;
        delete_deltas_stmt
          .execute([&id])
          .map_err(|e| e.to_string())?;
        delete_snapshots_stmt
          .execute([&id])
          .map_err(|e| e.to_string())?;
        delete_ai_stmt.execute([&id]).map_err(|e| e.to_string())?;
        delete_revisions_stmt
          .execute([&id])
          .map_err(|e| e.to_string())?;
        delete_ai_data_stmt
          .execute([&id])
          .map_err(|e| e.to_string())?;
        // Finally delete the doc
        delete_doc_stmt
          .execute([&id, &user_id])
          .map_err(|e| e.to_string())?;
      }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
  } else {
    Err("Database not initialized".to_string())
  }
}
