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
