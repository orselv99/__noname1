//! ==========================================================================
//! schema.rs - 테이블 생성 및 마이그레이션
//! ==========================================================================
//!
//! 앱 시작 시 데이터베이스를 초기화하고 필요한 테이블을 생성합니다.
//! ==========================================================================

use super::state::get_db_path;
use rusqlite::Connection;

// ============================================================================
// 데이터베이스 초기화
// ============================================================================

/// 데이터베이스 초기화 및 테이블 생성
///
/// 앱 시작 시 한 번 호출되어 테이블을 생성하고 마이그레이션을 수행합니다.
///
/// # 주요 기능
/// 1. sqlite-vec 확장 등록 (벡터 유사도 검색용)
/// 2. 테이블 생성 (없으면)
/// 3. 스키마 마이그레이션 (컬럼 추가 등)
/// 4. 인덱스 생성
///
/// # 매개변수
/// - `app`: Tauri 앱 핸들
///
/// # 반환값
/// SQLite 연결 객체 또는 오류
pub fn init_database(app: &tauri::AppHandle) -> Result<Connection, String> {
  let db_path = get_db_path(app)?;
  println!("Debug: 데이터베이스 경로: {:?}", db_path);

  // ========================================================================
  // sqlite-vec 확장 등록 (벡터 임베딩 검색용)
  // ========================================================================
  unsafe {
    let _ = rusqlite::ffi::sqlite3_auto_extension(Some(std::mem::transmute(
      sqlite_vec::sqlite3_vec_init as *const (),
    )));
  }

  let conn = Connection::open(&db_path).map_err(|e| format!("데이터베이스 열기 실패: {}", e))?;

  // 외래키 제약 비활성화 (로컬 DB 유연성)
  conn
    .execute("PRAGMA foreign_keys = OFF", [])
    .map_err(|e| format!("외래키 비활성화 실패: {}", e))?;

  // 테이블 생성
  create_users_table(&conn)?;
  create_documents_tables(&conn)?;
  create_rag_tables(&conn)?;
  create_cache_tables(&conn)?;

  // 마이그레이션
  run_migrations(&conn)?;

  // 인덱스 생성
  create_indexes(&conn)?;

  println!("Debug: 데이터베이스 초기화 완료");
  Ok(conn)
}

// ============================================================================
// 테이블 생성 함수 (Users)
// ============================================================================

fn create_users_table(conn: &Connection) -> Result<(), String> {
  conn
    .execute(
      "CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            username TEXT NOT NULL,
            tenant_id TEXT NOT NULL,
            role TEXT DEFAULT 'user' NOT NULL,
            position_id TEXT,
            department_id TEXT,
            contact TEXT,
            birthday TEXT,
            phone_numbers TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login_at DATETIME,
            force_change_password INTEGER DEFAULT 1
        )",
      [],
    )
    .map_err(|e| format!("users 테이블 생성 실패: {}", e))?;
  Ok(())
}

// ============================================================================
// 테이블 생성 함수 (Documents 관련)
// ============================================================================

fn create_documents_tables(conn: &Connection) -> Result<(), String> {
  // 문서 테이블
  conn
    .execute(
      "CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            parent_id TEXT,
            user_id TEXT NOT NULL,
            document_state INTEGER DEFAULT 1,
            visibility_level INTEGER DEFAULT 1,
            group_type INTEGER DEFAULT 2,
            group_id TEXT,
            title BLOB,
            content BLOB NOT NULL,
            summary BLOB,
            size BLOB,
            current_version INTEGER DEFAULT 0,
            is_favorite INTEGER DEFAULT 0,
            created_at BLOB,
            updated_at BLOB,
            deleted_at DATETIME,
            last_synced_at INTEGER DEFAULT 0,
            accessed_at BLOB,
            version INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )",
      [],
    )
    .map_err(|e| format!("documents 테이블 생성 실패: {}", e))?;

  // 문서 델타 테이블
  conn
    .execute(
      "CREATE TABLE IF NOT EXISTS document_deltas (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            version INTEGER NOT NULL,
            delta BLOB NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (document_id) REFERENCES documents(id)
        )",
      [],
    )
    .map_err(|e| format!("document_deltas 테이블 생성 실패: {}", e))?;

  // 문서 스냅샷 테이블
  conn
    .execute(
      "CREATE TABLE IF NOT EXISTS document_snapshots (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            version INTEGER NOT NULL,
            full_content BLOB NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (document_id) REFERENCES documents(id)
        )",
      [],
    )
    .map_err(|e| format!("document_snapshots 테이블 생성 실패: {}", e))?;

  // AI 작업 큐 테이블
  conn
    .execute(
      "CREATE TABLE IF NOT EXISTS document_ai_queue (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            task_type INTEGER DEFAULT 0,
            status INTEGER DEFAULT 0,
            error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
        )",
      [],
    )
    .map_err(|e| format!("document_ai_queue 테이블 생성 실패: {}", e))?;

  // AI 분석 데이터 테이블
  conn
    .execute(
      "CREATE TABLE IF NOT EXISTS document_ai_data (
            document_id TEXT PRIMARY KEY,
            content_hash TEXT,
            embedding BLOB,
            ai_summary BLOB,
            ai_tags BLOB,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
        )",
      [],
    )
    .map_err(|e| format!("document_ai_data 테이블 생성 실패: {}", e))?;

  // 문서 태그 테이블
  conn
    .execute(
      "CREATE TABLE IF NOT EXISTS document_tags (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            tag BLOB NOT NULL,
            evidence BLOB,
            created_at BLOB,
            FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
        )",
      [],
    )
    .map_err(|e| format!("document_tags 테이블 생성 실패: {}", e))?;

  // 문서 리비전 테이블
  conn
    .execute(
      "CREATE TABLE IF NOT EXISTS document_revisions (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            version INTEGER NOT NULL,
            delta BLOB,
            snapshot BLOB,
            title BLOB,
            creator_name TEXT,
            created_at BLOB,
            FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
        )",
      [],
    )
    .map_err(|e| format!("document_revisions 테이블 생성 실패: {}", e))?;

  Ok(())
}

// ============================================================================
// 테이블 생성 함수 (RAG 관련)
// ============================================================================

fn create_rag_tables(conn: &Connection) -> Result<(), String> {
  // 이전 테이블 정리
  conn.execute("DROP TABLE IF EXISTS chat_messages", []).ok();

  // RAG 채팅 세션 테이블
  conn
    .execute(
      "CREATE TABLE IF NOT EXISTS rag_chats (
            id TEXT PRIMARY KEY,
            title BLOB,
            created_at BLOB,
            updated_at BLOB,
            updated_at_ts INTEGER DEFAULT 0
        )",
      [],
    )
    .map_err(|e| format!("rag_chats 테이블 생성 실패: {}", e))?;

  // RAG 메시지 테이블
  conn
    .execute(
      "CREATE TABLE IF NOT EXISTS rag_messages (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL,
            role BLOB NOT NULL,
            content BLOB NOT NULL,
            created_at BLOB,
            timestamp INTEGER NOT NULL,
            FOREIGN KEY (chat_id) REFERENCES rag_chats(id) ON DELETE CASCADE
        )",
      [],
    )
    .map_err(|e| format!("rag_messages 테이블 생성 실패: {}", e))?;

  Ok(())
}

// ============================================================================
// 테이블 생성 함수 (캐시 테이블)
// ============================================================================

fn create_cache_tables(conn: &Connection) -> Result<(), String> {
  conn
    .execute(
      "CREATE TABLE IF NOT EXISTS departments (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL
        )",
      [],
    )
    .map_err(|e| format!("departments 테이블 생성 실패: {}", e))?;

  conn
    .execute(
      "CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL
        )",
      [],
    )
    .map_err(|e| format!("projects 테이블 생성 실패: {}", e))?;

  Ok(())
}

// ============================================================================
// 마이그레이션
// ============================================================================

fn run_migrations(conn: &Connection) -> Result<(), String> {
  // deleted_at 컬럼 마이그레이션
  let deleted_at_exists: bool = conn
    .query_row(
      "SELECT COUNT(*) FROM pragma_table_info('documents') WHERE name='deleted_at'",
      [],
      |row| row.get(0),
    )
    .unwrap_or(0)
    > 0;

  if !deleted_at_exists {
    println!("Debug: 마이그레이션 - documents에 deleted_at 컬럼 추가");
    conn
      .execute("ALTER TABLE documents ADD COLUMN deleted_at DATETIME", [])
      .map_err(|e| format!("deleted_at 컬럼 추가 실패: {}", e))?;
  }

  // version 컬럼 마이그레이션
  let version_exists: bool = conn
    .query_row(
      "SELECT COUNT(*) FROM pragma_table_info('documents') WHERE name='version'",
      [],
      |row| row.get(0),
    )
    .unwrap_or(0)
    > 0;

  if !version_exists {
    println!("Debug: 마이그레이션 - documents에 version 컬럼 추가");
    conn
      .execute(
        "ALTER TABLE documents ADD COLUMN version INTEGER DEFAULT 0",
        [],
      )
      .map_err(|e| format!("version 컬럼 추가 실패: {}", e))?;
  }

  // media_size 컬럼 마이그레이션
  let media_size_exists: bool = conn
    .query_row(
      "SELECT COUNT(*) FROM pragma_table_info('documents') WHERE name='media_size'",
      [],
      |row| row.get(0),
    )
    .unwrap_or(0)
    > 0;

  if !media_size_exists {
    println!("Debug: 마이그레이션 - documents에 media_size 컬럼 추가");
    conn
      .execute("ALTER TABLE documents ADD COLUMN media_size BLOB", [])
      .map_err(|e| format!("media_size 컬럼 추가 실패: {}", e))?;
  }

  // 레거시 데이터 수정
  conn
    .execute(
      "UPDATE documents SET version = 0 WHERE document_state != 3 AND version = 1",
      [],
    )
    .ok();

  Ok(())
}

// ============================================================================
// 인덱스 생성
// ============================================================================

fn create_indexes(conn: &Connection) -> Result<(), String> {
  // 리비전 유니크 인덱스
  conn
    .execute("DROP INDEX IF EXISTS idx_revisions_document", [])
    .ok();
  conn
    .execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_revisions_document_unique 
         ON document_revisions(document_id, version)",
      [],
    )
    .map_err(|e| format!("document_revisions 유니크 인덱스 생성 실패: {}", e))?;

  // 메시지 페이지네이션 인덱스
  conn
    .execute(
      "CREATE INDEX IF NOT EXISTS idx_rag_messages_chat_ts 
         ON rag_messages(chat_id, timestamp)",
      [],
    )
    .map_err(|e| format!("rag_messages 인덱스 생성 실패: {}", e))?;

  // 문서 인덱스
  conn
    .execute(
      "CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id)",
      [],
    )
    .map_err(|e| format!("documents 인덱스 생성 실패: {}", e))?;

  conn
    .execute(
      "CREATE INDEX IF NOT EXISTS idx_document_tags_document_id ON document_tags(document_id)",
      [],
    )
    .map_err(|e| format!("document_tags 인덱스 생성 실패: {}", e))?;

  Ok(())
}
