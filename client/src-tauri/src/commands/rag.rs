use crate::commands::auth::AuthState;
use crate::database::DatabaseState;
use crate::crypto::decrypt_content;
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::State;
use serde_json::json;

// Re-defining embedding struct to match ai.rs
#[derive(serde::Deserialize, Debug)]
struct LlamaEmbeddingItem {
    pub embedding: Vec<Vec<f32>>,
}

type LlamaEmbeddingResponse = Vec<LlamaEmbeddingItem>;

/// Naive clean up of HTML and Markdown syntax (Copied from ai.rs for isolation)
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
}

#[tauri::command]
pub async fn ask_ai(
    auth_state: State<'_, Mutex<AuthState>>,
    db_state: State<'_, Mutex<DatabaseState>>,
    question: String,
) -> Result<String, String> {
    let user_id = {
        let auth = auth_state.lock().unwrap();
        auth.user_id.clone().ok_or("Not authenticated")?
    };

    // 1. Clean and Embed Question
    let cleaned_question = clean_input_text(&question);
    let query_vec = generate_embedding(&cleaned_question).await?;
    
    // Prepare bytes for sqlite-vec (f32 to le bytes)
    let query_bytes: Vec<u8> = query_vec.iter().flat_map(|f| f.to_le_bytes()).collect();

    let mut results = Vec::new();

    // 2. Search Database
    {
        let db = db_state.lock().unwrap();
        if let Some(ref conn) = db.conn {
            // Use vec_distance_cosine from sqlite-vec
            // We join with documents table to get content (which is encrypted)
            let mut stmt = conn.prepare(
                "SELECT d.id, vec_distance_cosine(da.embedding, ?1) as distance, d.content 
                 FROM document_ai_data da
                 JOIN documents d ON da.document_id = d.id
                 WHERE d.user_id = ?2
                 ORDER BY distance ASC
                 LIMIT 3"
            ).map_err(|e| e.to_string())?;

            let rows = stmt.query_map(rusqlite::params![query_bytes, user_id], |row| {
                Ok(SearchResult {
                    document_id: row.get(0)?,
                    distance: row.get(1)?,
                    content: {
                        let blob: Vec<u8> = row.get(2)?;
                        // Decrypt content immediately
                        decrypt_content(&user_id, &blob).unwrap_or_default()
                    }
                })
            }).map_err(|e| e.to_string())?;

            for r in rows {
                results.push(r.map_err(|e| e.to_string())?);
            }
        } else {
            return Err("Database not initialized".to_string());
        }
    }

    // 3. Construct Prompt
    let mut context_text = String::new();
    for (i, res) in results.iter().enumerate() {
        // Truncate content to avoid token limits per doc
        let safe_content: String = res.content.chars().take(1000).collect();
        context_text.push_str(&format!("Document {}:\n{}\n\n", i + 1, safe_content));
    }

    if context_text.is_empty() {
        context_text = "No relevant documents found.".to_string();
    }

    let prompt = format!(
        "<|im_start|>system\nYou are a helpful AI assistant. Answer the user's question based ONLY on the following provided documents. If the answer is not in the documents, say 'I cannot find the answer in the provided documents'. Answer in Korean.\n\nDocuments:\n{}\n<|im_end|><|im_start|>user\n{}\n<|im_end|><|im_start|>assistant\n",
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

    Ok(answer)
}
