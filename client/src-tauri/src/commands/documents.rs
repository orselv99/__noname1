use crate::commands::auth::AuthState;
use crate::crypto::{self, encrypt_content, decrypt_content};
use crate::database::DatabaseState;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq)]
#[repr(i32)]
pub enum DocumentState {
    #[default]
    Draft = 1,
    Feedback = 2,
    Published = 3,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq)]
#[repr(i32)]
pub enum VisibilityLevel {
    #[default]
    Hidden = 1,
    Metadata = 2,
    Snippet = 3,
    Public = 4,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq)]
#[repr(i32)]
pub enum GroupType {
    Department = 0,
    Project = 1,
    #[default]
    Private = 2,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Document {
    pub id: String,
    pub user_id: String,
    pub title: String,
    pub content: String,
    pub document_state: i32,
    pub visibility_level: i32,
    pub group_type: i32,
    pub group_id: Option<String>,
    pub summary: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub accessed_at: Option<String>,
    pub size: Option<String>,
    pub is_favorite: bool,
}

#[derive(Deserialize)]
pub struct SaveDocumentRequest {
    pub id: Option<String>,
    pub title: String,
    pub content: String,
    pub summary: Option<String>,
    pub group_type: i32,
    pub group_id: Option<String>,
    pub document_state: i32,
    pub visibility_level: i32,
    pub is_favorite: Option<bool>,
}

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
    let now = chrono_now();
    let size_str = req.content.len().to_string();

    // Encrypt fields
    let title_enc = encrypt_content(&user_id, &req.title)?;
    let content_enc = encrypt_content(&user_id, &req.content)?;
    let summary_enc = req.summary.as_ref()
        .map(|s| encrypt_content(&user_id, s))
        .transpose()?;
    let created_at_enc = encrypt_content(&user_id, &now)?;
    let updated_at_enc = encrypt_content(&user_id, &now)?;
    let size_enc = encrypt_content(&user_id, &size_str)?;

    // Note: Embedding is handled by AI logic separately.

    {
        let db = db_state.lock().unwrap();
        if let Some(ref conn) = db.conn {
            conn.execute(
                "INSERT INTO documents (
                    id, user_id, document_state, visibility_level, group_type, group_id,
                    title, content, summary, size, created_at, updated_at, is_favorite
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
                ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    content = excluded.content,
                    summary = COALESCE(excluded.summary, documents.summary),
                    document_state = excluded.document_state,
                    visibility_level = excluded.visibility_level,
                    group_type = excluded.group_type,
                    group_id = excluded.group_id,
                    size = excluded.size,
                    is_favorite = COALESCE(excluded.is_favorite, documents.is_favorite),
                    updated_at = excluded.updated_at
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
                    req.is_favorite.unwrap_or(false)
                ],
            )
            .map_err(|e| format!("Failed to save document: {}", e))?;
        } else {
            return Err("Database not initialized".to_string());
        }
    }

    // Return the saved document object
    Ok(Document {
        id: doc_id,
        user_id,
        title: req.title,
        content: req.content,
        document_state: req.document_state,
        visibility_level: req.visibility_level,
        group_type: req.group_type,
        group_id: req.group_id,
        summary: None,
        created_at: Some(now.clone()),
        updated_at: Some(now),
        accessed_at: None,
        size: Some(size_str),
        is_favorite: req.is_favorite.unwrap_or(false),
    })
}

#[tauri::command]
pub async fn list_documents(
    auth_state: State<'_, Mutex<AuthState>>,
    db_state: State<'_, Mutex<DatabaseState>>,
    group_type: Option<i32>,
    group_id: Option<String>,
) -> Result<Vec<Document>, String> {
    let user_id = {
        let auth = auth_state.lock().unwrap();
        auth.user_id.clone().ok_or("Not authenticated")?
    };

    let db = db_state.lock().unwrap();
    if let Some(ref conn) = db.conn {
        let mut query = "SELECT 
            id, user_id, document_state, visibility_level, group_type, group_id,
            title, content, summary, created_at, updated_at, accessed_at, size, is_favorite
            FROM documents WHERE user_id = ?1".to_string();
        
        // Basic filtering
        if let Some(gt) = group_type {
            query.push_str(&format!(" AND group_type = {}", gt));
        }
        if let Some(ref gid) = group_id {
             query.push_str(&format!(" AND group_id = '{}'", gid));
        }

        let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
        
        let rows = stmt.query_map([&user_id], |row| {
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

             Ok((id, uid, state, vis, gtype, gid, title_blob, content_blob, summary_blob, created_blob, updated_blob, accessed_blob, size_blob, is_favorite))
        }).map_err(|e| e.to_string())?;

        let mut docs = Vec::new();
        for row_res in rows {
            let (id, uid, state, vis, gtype, gid, t_blob, c_blob, s_blob, cr_blob, up_blob, acc_blob, sz_blob, is_fav) = row_res.map_err(|e| e.to_string())?;

            // Decrypt
            let title = decrypt_content(&uid, &t_blob).unwrap_or_default();
            let content = decrypt_content(&uid, &c_blob).unwrap_or_default();
            let summary = s_blob.and_then(|b| decrypt_content(&uid, &b).ok());
            let created_at = cr_blob.and_then(|b| decrypt_content(&uid, &b).ok());
            let updated_at = up_blob.and_then(|b| decrypt_content(&uid, &b).ok());
            let accessed_at = acc_blob.and_then(|b| decrypt_content(&uid, &b).ok());
            let size = sz_blob.and_then(|b| decrypt_content(&uid, &b).ok());

            docs.push(Document {
                id,
                user_id: uid,
                title,
                content,
                document_state: state,
                visibility_level: vis,
                group_type: gtype,
                group_id: gid,
                summary,
                created_at,
                updated_at,
                accessed_at,
                size,
                is_favorite: is_fav,
            });
        }
        Ok(docs)
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
            id, user_id, document_state, visibility_level, group_type, group_id,
            title, content, summary, created_at, updated_at, accessed_at, size, is_favorite
            FROM documents WHERE id = ?1 AND user_id = ?2").map_err(|e| e.to_string())?;
        
        let row = stmt.query_row([&id, &user_id], |row| {
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

             Ok((id, uid, state, vis, gtype, gid, title_blob, content_blob, summary_blob, created_blob, updated_blob, accessed_blob, size_blob, is_favorite))
        }).map_err(|e| e.to_string())?;

        let (id, uid, state, vis, gtype, gid, t_blob, c_blob, s_blob, cr_blob, up_blob, acc_blob, sz_blob, is_fav) = row;

        let title = decrypt_content(&uid, &t_blob).unwrap_or_default();
        let content = decrypt_content(&uid, &c_blob).unwrap_or_default();
        let summary = s_blob.and_then(|b| decrypt_content(&uid, &b).ok());
        let created_at = cr_blob.and_then(|b| decrypt_content(&uid, &b).ok());
        let updated_at = up_blob.and_then(|b| decrypt_content(&uid, &b).ok());
        let accessed_at = acc_blob.and_then(|b| decrypt_content(&uid, &b).ok());
        let size = sz_blob.and_then(|b| decrypt_content(&uid, &b).ok());

        Ok(Document {
            id,
            user_id: uid,
            title,
            content,
            document_state: state,
            visibility_level: vis,
            group_type: gtype,
            group_id: gid,
            summary,
            created_at,
            updated_at,
            accessed_at,
            size,
            is_favorite: is_fav,
        })
    } else {
        Err("Database not initialized".to_string())
    }
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();
    let secs = duration.as_secs();
    format!("1970-01-01T00:00:00Z+{}s", secs)
}
