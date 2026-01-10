use crate::commands::auth::AuthState;
use crate::database::DatabaseState;
use crate::crypto::{encrypt_content, decrypt_content};
use rusqlite::{Connection, OptionalExtension};
use std::sync::Mutex;
use tauri::State;
use serde_json::json;
use uuid::Uuid;
use chrono;

// Re-defining embedding struct to match ai.rs
#[derive(serde::Deserialize, Debug)]
struct LlamaEmbeddingItem {
    pub embedding: Vec<Vec<f32>>,
}

type LlamaEmbeddingResponse = Vec<LlamaEmbeddingItem>;

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct RagChat {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct RagMessage {
    pub id: String,
    pub chat_id: String,
    pub role: String,
    pub content: String,
    pub timestamp: i64, 
}

#[derive(serde::Serialize, Debug)]
pub struct AskAiResponse {
    pub answer: String,
    pub chat_id: String,
}

/// Naive clean up of HTML and Markdown syntax
fn clean_input_text(input: &str) -> String {
    let mut no_html = String::with_capacity(input.len());
    let mut inside_tag = false;
    for c in input.chars() {
        if c == '<' { inside_tag = true; continue; }
        if c == '>' && inside_tag { inside_tag = false; continue; }
        if !inside_tag { no_html.push(c); }
    }
    let s = no_html
        .replace("```", " ")
        .replace("**", " ")
        .replace("__", " ")
        .replace("==", " ")
        .replace("~~", " ");
    let s: String = s.chars()
        .filter(|&c| c != '*' && c != '#' && c != '`' && c != '~')
        .collect();
    let mut final_res = String::with_capacity(s.len());
    let mut last_ws = false;
    for c in s.chars() {
        if c.is_whitespace() {
            if !last_ws { final_res.push(' '); last_ws = true; }
        } else {
            final_res.push(c);
            last_ws = false;
        }
    }
    final_res.trim().to_string()
}

/// Helper to generate embedding for a string using local Llama service
async fn generate_embedding(text: &str) -> Result<Vec<f32>, String> {
    let client = reqwest::Client::new();
    let response = client
        .post("http://localhost:8081/embedding")
        .json(&json!({ "content": text }))
        .send()
        .await
        .map_err(|e| format!("Embedding request failed: {}", e))?
        .json::<LlamaEmbeddingResponse>()
        .await
        .map_err(|e| format!("Failed to parse embedding response: {}", e))?;

    if let Some(item) = response.first() {
        if let Some(embedding) = item.embedding.first() {
            return Ok(embedding.clone());
        }
    }
    Err("No embedding generated".to_string())
}

/// Search result struct
#[derive(Debug)]
struct SearchResult {
    document_id: String,
    distance: f32, 
    content: String,
    summary: Option<String>,
    tags: Vec<String>,
}

/// Helper to create a new chat session
fn create_chat_session(conn: &Connection, user_id: &str, title: Option<String>) -> Result<RagChat, String> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now();
    let now_str = now.to_rfc3339();
    let ts = now.timestamp_millis();
    
    let title_text = title.unwrap_or_else(|| "New Chat".to_string());
    
    // Encrypt fields
    let title_enc = encrypt_content(user_id, &title_text)?;
    let created_enc = encrypt_content(user_id, &now_str)?;
    let updated_enc = encrypt_content(user_id, &now_str)?;

    conn.execute(
        "INSERT INTO rag_chats (id, title, created_at, updated_at, updated_at_ts) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, title_enc, created_enc, updated_enc, ts],
    ).map_err(|e| e.to_string())?;

    Ok(RagChat {
        id,
        title: title_text,
        created_at: now_str.clone(),
        updated_at: now_str,
    })
}

fn save_rag_message_to_db(conn: &Connection, user_id: &str, chat_id: &str, role: &str, content: &str) -> Result<RagMessage, String> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now();
    let timestamp = now.timestamp_millis();
    let now_str = now.to_rfc3339();

    // Encrypt fields
    let role_enc = encrypt_content(user_id, role)?;
    let content_enc = encrypt_content(user_id, content)?;
    let created_enc = encrypt_content(user_id, &now_str)?;

    conn.execute(
        "INSERT INTO rag_messages (id, chat_id, role, content, created_at, timestamp) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, chat_id, role_enc, content_enc, created_enc, timestamp],
    ).map_err(|e| e.to_string())?;

    // Update chat updated_at
    conn.execute(
        "UPDATE rag_chats SET updated_at = ?1, updated_at_ts = ?2 WHERE id = ?3",
        rusqlite::params![created_enc, timestamp, chat_id]
    ).ok();

    Ok(RagMessage {
        id,
        chat_id: chat_id.to_string(),
        role: role.to_string(),
        content: content.to_string(),
        timestamp,
    })
}

#[tauri::command]
pub async fn create_new_chat(
    auth_state: State<'_, Mutex<AuthState>>,
    db_state: State<'_, Mutex<DatabaseState>>,
    title: Option<String>,
) -> Result<RagChat, String> {
    let user_id = {
        let auth = auth_state.lock().unwrap();
        auth.user_id.clone().ok_or("Not authenticated")?
    };
    
    let db = db_state.lock().unwrap();
    if let Some(ref conn) = db.conn {
        create_chat_session(conn, &user_id, title)
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_rag_chats(
    auth_state: State<'_, Mutex<AuthState>>,
    db_state: State<'_, Mutex<DatabaseState>>,
    search: Option<String>,
) -> Result<Vec<RagChat>, String> {
     let user_id = {
        let auth = auth_state.lock().unwrap();
        auth.user_id.clone().ok_or("Not authenticated")?
    };

    let db = db_state.lock().unwrap();
    if let Some(ref conn) = db.conn {
        let mut stmt = conn.prepare("SELECT id, title, created_at, updated_at FROM rag_chats ORDER BY updated_at_ts DESC").map_err(|e| e.to_string())?;
        
        let rows = stmt.query_map([], |row| {
             let id: String = row.get(0)?;
             let title_blob: Vec<u8> = row.get(1)?;
             let created_blob: Vec<u8> = row.get(2)?;
             let updated_blob: Vec<u8> = row.get(3)?;
             
             Ok(RagChat {
                 id,
                 title: decrypt_content(&user_id, &title_blob).unwrap_or_default(),
                 created_at: decrypt_content(&user_id, &created_blob).unwrap_or_default(),
                 updated_at: decrypt_content(&user_id, &updated_blob).unwrap_or_default(),
             })
        }).map_err(|e| e.to_string())?;

        let mut chats = Vec::new();
        for r in rows {
            let chat = r.map_err(|e| e.to_string())?;
            if let Some(q) = &search {
                if chat.title.to_lowercase().contains(&q.to_lowercase()) {
                    chats.push(chat);
                }
            } else {
                chats.push(chat);
            }
        }
        Ok(chats)
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub async fn delete_rag_chat(
    auth_state: State<'_, Mutex<AuthState>>,
    db_state: State<'_, Mutex<DatabaseState>>,
    chat_id: String,
) -> Result<(), String> {
    let _user_id = {
        let auth = auth_state.lock().unwrap();
        auth.user_id.clone().ok_or("Not authenticated")?
    };

    let db = db_state.lock().unwrap();
    if let Some(ref conn) = db.conn {
        // Delete messages first
        conn.execute(
            "DELETE FROM rag_messages WHERE chat_id = ?1",
            rusqlite::params![chat_id],
        ).map_err(|e| e.to_string())?;

        // Delete chat
        let count = conn.execute(
            "DELETE FROM rag_chats WHERE id = ?1",
            rusqlite::params![chat_id],
        ).map_err(|e| e.to_string())?;

        if count == 0 {
             return Err("Chat not found".to_string());
        }

        Ok(())
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub async fn update_rag_chat_title(
    auth_state: State<'_, Mutex<AuthState>>,
    db_state: State<'_, Mutex<DatabaseState>>,
    chat_id: String,
    new_title: String,
) -> Result<(), String> {
    let user_id = {
        let auth = auth_state.lock().unwrap();
        auth.user_id.clone().ok_or("Not authenticated")?
    };

    let db = db_state.lock().unwrap();
    if let Some(ref conn) = db.conn {
        let title_enc = encrypt_content(&user_id, &new_title)?;
        let count = conn.execute(
            "UPDATE rag_chats SET title = ?1 WHERE id = ?2",
            rusqlite::params![title_enc, chat_id],
        ).map_err(|e| e.to_string())?;

        if count == 0 {
             return Err("Chat not found".to_string());
        }
        Ok(())
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_rag_messages(
    auth_state: State<'_, Mutex<AuthState>>,
    db_state: State<'_, Mutex<DatabaseState>>,
    chat_id: String,
    limit: i64,
    before: Option<i64>, // timestamp to paginate before
) -> Result<Vec<RagMessage>, String> {
     let user_id = {
        let auth = auth_state.lock().unwrap();
        auth.user_id.clone().ok_or("Not authenticated")?
    };

    let db = db_state.lock().unwrap();
    if let Some(ref conn) = db.conn {
        let mut query = "SELECT id, role, content, timestamp FROM rag_messages WHERE chat_id = ?1".to_string();
        let mut messages = Vec::new();

        if let Some(before_ts) = before {
            query.push_str(" AND timestamp < ?2 ORDER BY timestamp DESC LIMIT ?3");
            let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
             let rows = stmt.query_map(rusqlite::params![chat_id, before_ts, limit], |row| {
                let id: String = row.get(0)?;
                let role_blob: Vec<u8> = row.get(1)?;
                let content_blob: Vec<u8> = row.get(2)?;
                let timestamp: i64 = row.get(3)?;

                Ok(RagMessage {
                    id,
                    chat_id: chat_id.clone(),
                    role: decrypt_content(&user_id, &role_blob).unwrap_or_default(),
                    content: decrypt_content(&user_id, &content_blob).unwrap_or_default(),
                    timestamp,
                })
            }).map_err(|e| e.to_string())?;
            for r in rows { messages.push(r.map_err(|e| e.to_string())?); }

        } else {
            query.push_str(" ORDER BY timestamp DESC LIMIT ?2");
            let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
             let rows = stmt.query_map(rusqlite::params![chat_id, limit], |row| {
                let id: String = row.get(0)?;
                let role_blob: Vec<u8> = row.get(1)?;
                let content_blob: Vec<u8> = row.get(2)?;
                let timestamp: i64 = row.get(3)?;

                Ok(RagMessage {
                    id,
                    chat_id: chat_id.clone(),
                    role: decrypt_content(&user_id, &role_blob).unwrap_or_default(),
                    content: decrypt_content(&user_id, &content_blob).unwrap_or_default(),
                    timestamp,
                })
            }).map_err(|e| e.to_string())?;
            for r in rows { messages.push(r.map_err(|e| e.to_string())?); }
        };

        messages.reverse();
        Ok(messages)
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub async fn ask_ai(
    auth_state: State<'_, Mutex<AuthState>>,
    db_state: State<'_, Mutex<DatabaseState>>,
    chat_id: Option<String>,
    question: String,
) -> Result<AskAiResponse, String> {
    let user_id = {
        let auth = auth_state.lock().unwrap();
        auth.user_id.clone().ok_or("Not authenticated")?
    };

    // Ensure session exists
    let active_chat_id = if let Some(id) = chat_id {
        id
    } else {
        // Create new session
         let db = db_state.lock().unwrap();
         if let Some(ref conn) = db.conn {
             let chat = create_chat_session(conn, &user_id, Some(question.chars().take(30).collect()))?;
             chat.id
         } else {
             return Err("Database not initialized".to_string());
         }
    };

    // Save User Message
    {
        let db = db_state.lock().unwrap();
        if let Some(ref conn) = db.conn {
            let _ = save_rag_message_to_db(conn, &user_id, &active_chat_id, "user", &question);
        }
    }

    // 1. Clean and Embed Question (same logic as before)
    let cleaned_question = clean_input_text(&question);
    let query_vec = generate_embedding(&cleaned_question).await?;
    let query_bytes: Vec<u8> = query_vec.iter().flat_map(|f| f.to_le_bytes()).collect();

    let mut results = Vec::new();

    {
        let db = db_state.lock().unwrap();
        if let Some(ref conn) = db.conn {
            let mut stmt = conn.prepare(
                "SELECT d.id, vec_distance_cosine(da.embedding, ?1) as distance, d.content, d.summary 
                 FROM document_ai_data da
                 JOIN documents d ON da.document_id = d.id
                 WHERE d.user_id = ?2
                 ORDER BY distance ASC
                 LIMIT 3"
            ).map_err(|e| e.to_string())?;

            let rows = stmt.query_map(rusqlite::params![query_bytes, user_id], |row| {
                let doc_id: String = row.get(0)?;
                let dist: f32 = row.get(1)?;
                let content_blob: Vec<u8> = row.get(2)?;
                let summary_blob: Option<Vec<u8>> = row.get(3).ok();

                Ok((doc_id, dist, content_blob, summary_blob))
            }).map_err(|e| e.to_string())?;

            // Collect temp results to release borrow on stmt/conn (if needed, but here simple map)
            // Actually we need to query tags for each, so we need the conn.
            // Let's collect raw data first.
            let mut temp_results = Vec::new();
            for r in rows { temp_results.push(r.map_err(|e| e.to_string())?); }

            for (doc_id, dist, c_blob, s_blob) in temp_results {
                let content = decrypt_content(&user_id, &c_blob).unwrap_or_default();
                let summary = s_blob.and_then(|b| decrypt_content(&user_id, &b).ok());
                
                // Fetch tags
                let mut tags = Vec::new();
                let mut tag_stmt = conn.prepare("SELECT tag FROM document_tags WHERE document_id = ?1").map_err(|e| e.to_string())?;
                let tag_rows = tag_stmt.query_map([&doc_id], |row| {
                    let t_blob: Vec<u8> = row.get(0)?;
                    Ok(t_blob)
                }).map_err(|e| e.to_string())?;

                for tr in tag_rows {
                     if let Ok(tb) = tr {
                         if let Ok(t) = decrypt_content(&user_id, &tb) {
                             tags.push(t);
                         }
                     }
                }

                results.push(SearchResult {
                    document_id: doc_id,
                    distance: dist,
                    content,
                    summary,
                    tags,
                });
            }
        }
    }

    let mut context_text = String::new();
    for (i, res) in results.iter().enumerate() {
        let safe_content: String = res.content.chars().take(1000).collect();
        let summary_text = res.summary.as_deref().unwrap_or("No summary");
        let tags_text = if res.tags.is_empty() { "None".to_string() } else { res.tags.join(", ") };

        context_text.push_str(&format!(
            "Document {}:\nSummary: {}\nTags: {}\nContent:\n{}\n\n", 
            i + 1, summary_text, tags_text, safe_content
        ));
    }

    if context_text.is_empty() {
        context_text = "No relevant documents found.".to_string();
    }

    let prompt = format!(
        "<|im_start|>system\nYou are a helpful AI assistant. Answer the user's question based ONLY on the following provided documents. Use the provided Summary and Tags to understand the context better. If the answer is not in the documents, say 'I cannot find the answer in the provided documents'. Answer in Korean.\n\nDocuments:\n{}\n<|im_end|><|im_start|>user\n{}\n<|im_end|><|im_start|>assistant\n",
        context_text,
        cleaned_question
    );

    // 4. Generate Answer
    let client = reqwest::Client::new();
    let gen_res = client
        .post("http://localhost:8082/completion")
        .json(&json!({
            "prompt": prompt,
            "n_predict": 512,
            "stop": ["<|im_end|>"]
        }))
        .send()
        .await
        .map_err(|e| format!("Generation request failed: {}", e))?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Failed to parse generation response: {}", e))?;

    let answer = gen_res["content"].as_str().unwrap_or("").to_string();

    // Save Assistant Message
    {
        let db = db_state.lock().unwrap();
        if let Some(ref conn) = db.conn {
             let _ = save_rag_message_to_db(conn, &user_id, &active_chat_id, "assistant", &answer);
        }
    }

    Ok(AskAiResponse {
        answer,
        chat_id: active_chat_id
    })
}
