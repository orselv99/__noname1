//! ==========================================================================
//! database 모듈 - SQLite 로컬 데이터베이스 관리
//! ==========================================================================
//!
//! 이 모듈은 기능별로 분리된 하위 모듈들을 포함합니다:
//! - `state`: 데이터베이스 연결 상태 및 경로 관리
//! - `schema`: 테이블 생성 및 마이그레이션
//! - `auth`: 사용자 캐시 및 비밀번호 관리
//! - `documents`: 문서 관련 DB 함수 (향후 확장)
//! - `rag`: RAG 채팅 관련 DB 함수 (향후 확장)
//! ==========================================================================

// 하위 모듈 선언
pub mod auth;
pub mod documents;
pub mod rag;
pub mod schema;
pub mod state;

// ============================================================================
// 공개 API Re-export
// ============================================================================
// 외부에서 use crate::database::{...} 형태로 사용 가능

// state 모듈
pub use state::{get_db_path, DatabaseState};

// schema 모듈
pub use schema::init_database;

// auth 모듈
pub use auth::{
  clear_saved_tenant, get_saved_tenant, hash_password, save_user, update_cached_password,
  verify_offline_login, verify_password, CachedUser,
};

// documents 모듈
pub use documents::{
  delete_document_tags, get_deleted_document_ids, get_document_descendants, get_document_embedding,
  get_document_raw, get_document_tags_raw, get_existing_created_at, get_username,
  hard_delete_document, insert_document_tag, list_documents_query, restore_document_db,
  rollback_document_state, save_document_embedding, soft_delete_document, update_document_summary,
  upsert_document, upsert_revision, DocumentRaw, SaveDocumentParams, SaveRevisionParams,
};

// rag 모듈
pub use rag::{
  create_chat_session_db, delete_rag_chat_db, list_rag_chats_db, list_rag_messages_db,
  save_rag_message_db, search_similar_documents_db, update_chat_timestamp_db, update_chat_title_db,
  RagChatRaw, RagMessageRaw, SearchResultRaw,
};
