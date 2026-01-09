// Database module for local SQLite storage (offline support)
use bcrypt::{hash, verify};
use rusqlite::{Connection, Result as SqliteResult};
use std::path::PathBuf;

// Use cost 10 to match Go's bcrypt.DefaultCost
const BCRYPT_COST: u32 = 10;

/// Database state to hold SQLite connection
pub struct DatabaseState {
  pub conn: Option<Connection>,
}

impl Default for DatabaseState {
  fn default() -> Self {
    Self { conn: None }
  }
}

/// Get the database path in %APPDATA%/client
pub fn get_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  use tauri::Manager;

  // Get base app data directory (%APPDATA% on Windows)
  let base_dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("Failed to get app data dir: {}", e))?;

  // Go up one level and create "client" directory
  let client_dir = base_dir
    .parent()
    .ok_or("Failed to get parent directory")?
    .join("client");

  // Create directory if it doesn't exist
  std::fs::create_dir_all(&client_dir)
    .map_err(|e| format!("Failed to create client dir: {}", e))?;

  Ok(client_dir.join("fiery_horizon.db"))
}

/// Initialize the SQLite database and create tables
pub fn init_database(app: &tauri::AppHandle) -> Result<Connection, String> {
  let db_path = get_db_path(app)?;
  println!("Debug: Database path: {:?}", db_path);

  // Register sqlite-vec extension
  unsafe {
    let _ = rusqlite::ffi::sqlite3_auto_extension(Some(std::mem::transmute(
      sqlite_vec::sqlite3_vec_init as *const (),
    )));
  }

  let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open database: {}", e))?;

  // Create users table matching server schema (server/auth/model.go User)
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
    .map_err(|e| format!("Failed to create users table: {}", e))?;

  // Create documents table (Core Metadata & Content)
  // Keeps 'summary' as the USER's active version.
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
            last_synced_at INTEGER DEFAULT 0,
            accessed_at BLOB,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )",
      [],
    )
    .map_err(|e| format!("Failed to create documents table: {}", e))?;

  // Create document_deltas table (Versioning)
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
    .map_err(|e| format!("Failed to create document_deltas table: {}", e))?;

  // Create document_snapshots table (Full Backup)
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
    .map_err(|e| format!("Failed to create document_snapshots table: {}", e))?;

  // Create document_ai_queue table (Task Queue)
  // status: 0=PENDING, 1=PROCESSING, 2=COMPLETED, 3=FAILED
  // task_type: 0=ALL, 1=EMBEDDING, 2=SUMMARY, 3=TAGS
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
    .map_err(|e| format!("Failed to create document_ai_queue table: {}", e))?;

  // Create document_ai_data table (Extracted Data - Read Only / Reset Source)
  // Stores original AI outputs: embedding, draft summary, draft tags
  // content_hash: To check if re-extraction is needed
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
    .map_err(|e| format!("Failed to create document_ai_data table: {}", e))?;

  // Create document_tags table (User Active Tags + Evidence)
  // All fields except id, document_id are encrypted (BLOB)
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
    .map_err(|e| format!("Failed to create document_tags table: {}", e))?;

  // Cleanup old table if exists
  conn.execute("DROP TABLE IF EXISTS chat_messages", []).ok();

  // Create rag_chats table (Sessions)
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
    .map_err(|e| format!("Failed to create rag_chats table: {}", e))?;

  // Create rag_messages table (Encrypted Content)
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
    .map_err(|e| format!("Failed to create rag_messages table: {}", e))?;

  // Create index for fast pagination
  conn
    .execute(
      "CREATE INDEX IF NOT EXISTS idx_rag_messages_chat_ts ON rag_messages(chat_id, timestamp)",
      [],
    )
    .map_err(|e| format!("Failed to create rag_messages index: {}", e))?;

  // Create index for faster document queries
  conn
    .execute(
      "CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id)",
      [],
    )
    .map_err(|e| format!("Failed to create documents index: {}", e))?;

  conn
    .execute(
      "CREATE INDEX IF NOT EXISTS idx_document_tags_document_id ON document_tags(document_id)",
      [],
    )
    .map_err(|e| format!("Failed to create document_tags index: {}", e))?;

  println!("Debug: Database initialized successfully");
  Ok(conn)
}

/// Hash a password using bcrypt with cost 10 (matches Go bcrypt.DefaultCost)
/// Note: Rust bcrypt uses $2b prefix, Go uses $2a - they are compatible for verification
pub fn hash_password(password: &str) -> Result<String, String> {
  hash(password, BCRYPT_COST).map_err(|e| format!("Failed to hash password: {}", e))
}

/// Verify a password against a bcrypt hash
/// Handles both $2a (Go) and $2b (Rust) prefixes
pub fn verify_password(password: &str, stored_hash: &str) -> bool {
  // bcrypt crate can verify both $2a and $2b hashes
  verify(password, stored_hash).unwrap_or(false)
}

/// CachedUser struct matching server User model
#[derive(Debug, Clone)]
pub struct CachedUser {
  pub id: String,
  pub email: String,
  pub password_hash: String,
  pub username: String,
  pub tenant_id: String,
  pub role: String,
  pub position_id: Option<String>,
  pub department_id: Option<String>,
  pub contact: Option<String>,
  pub birthday: Option<String>,
  pub phone_numbers: Option<String>,
  pub force_change_password: bool,
  pub created_at: Option<String>,
  pub updated_at: Option<String>,
}

/// Save or update user in local cache (called after successful online login)
pub fn save_user(conn: &Connection, user: &CachedUser, plain_password: &str) -> Result<(), String> {
  let password_hash = hash_password(plain_password)?;

  conn
    .execute(
      "INSERT INTO users (
            id, email, password_hash, username, tenant_id, role,
            position_id, department_id,
            contact, birthday, phone_numbers, force_change_password,
            created_at, updated_at, last_login_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, CURRENT_TIMESTAMP)
        ON CONFLICT(email) DO UPDATE SET
            id = excluded.id,
            password_hash = excluded.password_hash,
            username = excluded.username,
            tenant_id = excluded.tenant_id,
            role = excluded.role,
            position_id = excluded.position_id,
            department_id = excluded.department_id,
            contact = excluded.contact,
            birthday = excluded.birthday,
            phone_numbers = excluded.phone_numbers,
            force_change_password = excluded.force_change_password,
            updated_at = excluded.updated_at,
            last_login_at = CURRENT_TIMESTAMP",
      rusqlite::params![
        user.id,
        user.email,
        password_hash,
        user.username,
        user.tenant_id,
        user.role,
        user.position_id,
        user.department_id,
        user.contact,
        user.birthday,
        user.phone_numbers,
        user.force_change_password as i32,
        user.created_at,
        user.updated_at,
      ],
    )
    .map_err(|e| format!("Failed to save user: {}", e))?;

  println!(
    "Debug: Cached user: {} ({}) with id: {}",
    user.username, user.email, user.id
  );
  Ok(())
}

/// Attempt offline login using cached credentials
pub fn verify_offline_login(
  conn: &Connection,
  email: &str,
  password: &str,
) -> Result<CachedUser, String> {
  let mut stmt = conn
    .prepare(
      "SELECT id, email, password_hash, username, tenant_id, role,
                position_id, department_id,
                contact, birthday, phone_numbers, force_change_password,
                created_at, updated_at
         FROM users WHERE email = ?1",
    )
    .map_err(|e| format!("Failed to prepare query: {}", e))?;

  let result: SqliteResult<CachedUser> = stmt.query_row([email], |row| {
    Ok(CachedUser {
      id: row.get(0)?,
      email: row.get(1)?,
      password_hash: row.get(2)?,
      username: row.get(3)?,
      tenant_id: row.get(4)?,
      role: row.get(5)?,
      position_id: row.get(6)?,
      department_id: row.get(7)?,
      contact: row.get(8)?,
      birthday: row.get(9)?,
      phone_numbers: row.get(10)?,
      force_change_password: row.get::<_, i32>(11)? != 0,
      created_at: row.get(12)?,
      updated_at: row.get(13)?,
    })
  });

  match result {
    Ok(user) => {
      if verify_password(password, &user.password_hash) {
        println!("Debug: Offline login successful for: {}", email);
        Ok(user)
      } else {
        Err("Invalid password".to_string())
      }
    }
    Err(_) => Err("User not found in offline cache".to_string()),
  }
}

/// Update cached password after password change
pub fn update_cached_password(
  conn: &Connection,
  email: &str,
  new_password: &str,
) -> Result<(), String> {
  let password_hash = hash_password(new_password)?;

  conn.execute(
        "UPDATE users SET password_hash = ?1, force_change_password = 0, updated_at = CURRENT_TIMESTAMP WHERE email = ?2",
        rusqlite::params![password_hash, email],
    ).map_err(|e| format!("Failed to update password: {}", e))?;

  println!("Debug: Updated cached password for: {}", email);
  Ok(())
}

/// Get the saved tenant_id for an email (for auto-login without tenant lookup)
pub fn get_saved_tenant(conn: &Connection, email: &str) -> Option<String> {
  let result: SqliteResult<String> = conn.query_row(
    "SELECT tenant_id FROM users WHERE email = ?1",
    [email],
    |row| row.get(0),
  );

  match result {
    Ok(tenant_id) => {
      println!("Debug: Found cached tenant for {}: {}", email, tenant_id);
      Some(tenant_id)
    }
    Err(_) => {
      println!("Debug: No cached tenant found for: {}", email);
      None
    }
  }
}

/// Clear saved tenant for an email (called on login failure to force re-selection)
pub fn clear_saved_tenant(conn: &Connection, email: &str) -> Result<(), String> {
  conn
    .execute("DELETE FROM users WHERE email = ?1", [email])
    .map_err(|e| format!("Failed to clear saved tenant: {}", e))?;

  println!("Debug: Cleared cached tenant for: {}", email);
  Ok(())
}
