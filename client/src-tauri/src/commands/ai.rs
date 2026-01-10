// AI commands module for document processing
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

use crate::commands::auth::AuthState;
use crate::database::DatabaseState;
use crate::crypto::{self, encrypt_content, decrypt_content}; // Import from crypto
use sha2::{Digest, Sha256}; // Re-add for hashing content

// ============================================================================
// Types and Responses
// ============================================================================

// llama.cpp /embedding response: [{"index": 0, "embedding": [[...floats...]]}]
#[derive(serde::Deserialize, Debug)]
struct LlamaEmbeddingItem {
    pub index: i32,
    pub embedding: Vec<Vec<f32>>,  // 2D array
}

// Alias for response array
type LlamaEmbeddingResponse = Vec<LlamaEmbeddingItem>;

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct DocumentTag {
    pub tag: String,
    pub evidence: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ExtractInfoResult {
    pub document_id: String,
    pub summary: String,
    pub tags: Vec<DocumentTag>,
}

#[derive(serde::Deserialize)]
struct AiJsonItem {
    tag: String,
    evidence: String,
}

#[derive(serde::Deserialize)]
struct AiJsonResult {
    summary: String,
    analysis: Vec<AiJsonItem>,
}

// Encryption logic moved to crypto.rs
// ============================================================================
// Embedding Helpers
// ============================================================================

/// Convert Vec<f32> to bytes for BLOB storage
fn embedding_to_bytes(embedding: &[f32]) -> Vec<u8> {
    embedding
        .iter()
        .flat_map(|f| f.to_le_bytes())
        .collect()
}

/// Convert bytes back to Vec<f32>
pub fn bytes_to_embedding(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect()
}

// ============================================================================
// AI Response Parsing
// ============================================================================

/// Parse AI response to extract summary and tags with evidence
fn parse_ai_response(content: &str, _original_text: &str) -> (String, Vec<DocumentTag>) {
    // 1. Try to find markdown code block first
    let json_str = if let Some(start_marker) = content.find("```") {
         let code_start = start_marker + 3;
         // Check if it has a lang identifier like "json"
         let content_after = &content[code_start..];
         let start_offset = if content_after.starts_with("json") {
             4
         } else {
             0
         };
         
         let actual_start = code_start + start_offset;
         
         if let Some(end_marker) = content[actual_start..].find("```") {
             &content[actual_start..actual_start + end_marker]
         } else {
             &content[actual_start..]
         }
    } else if let (Some(start), Some(end)) = (content.find('{'), content.rfind('}')) {
        // Fallback: outermost braces
        &content[start..=end]
    } else {
        content
    };

    let cleaned_json = json_str.trim();

    match serde_json::from_str::<AiJsonResult>(cleaned_json) {
        Ok(res) => {
            let tags = res.analysis.into_iter().map(|item| DocumentTag {
                tag: item.tag,
                evidence: Some(item.evidence),
            }).collect();
            (res.summary, tags)
        },
        Err(e) => {
            println!("Failed to parse AI JSON: {}", e);
            println!("Raw AI content: {}", content);
            
            // Fallback: Try to manually extract summary if JSON failed
            let summary = if let Some(sum_start) = cleaned_json.find("\"summary\"") {
                if let Some(colon) = cleaned_json[sum_start..].find(':') {
                    let val_start = sum_start + colon + 1;
                    if let Some(quote_start) = cleaned_json[val_start..].find('"') {
                         let actual_start = val_start + quote_start + 1;
                         // Find end quote (ignoring escaped?) - naive for now
                         if let Some(quote_end) = cleaned_json[actual_start..].find('"') {
                             cleaned_json[actual_start..actual_start + quote_end].to_string()
                         } else {
                             String::new()
                         }
                    } else {
                        String::new()
                    }
                } else {
                    String::new()
                }
            } else {
                String::new()
            };

            // Fallback: Try to manually extract tags
            let mut tags = Vec::new();
            let mut search_start = 0;
            
            while let Some(tag_key_idx) = cleaned_json[search_start..].find("\"tag\"") {
                let absolute_tag_idx = search_start + tag_key_idx;
                
                // Extract Tag Value
                let mut tag_val = String::new();
                let mut current_pos = absolute_tag_idx;
                
                if let Some(colon) = cleaned_json[current_pos..].find(':') {
                    let val_start = current_pos + colon + 1;
                    if let Some(quote_start) = cleaned_json[val_start..].find('"') {
                        let actual_start = val_start + quote_start + 1;
                        if let Some(quote_end) = cleaned_json[actual_start..].find('"') {
                            tag_val = cleaned_json[actual_start..actual_start + quote_end].to_string();
                            current_pos = actual_start + quote_end + 1;
                        }
                    }
                }
                
                // Extract Evidence Value (Look ahead near this tag)
                let mut evidence_val = String::new();
                // Limit search for evidence to avoid jumping to next item's evidence if missing? 
                // Just search forward.
                if !tag_val.is_empty() {
                    if let Some(evi_key_idx) = cleaned_json[current_pos..].find("\"evidence\"") {
                        let absolute_evi_idx = current_pos + evi_key_idx;
                        // heuristic: if evidence is too far (e.g. > 200 chars), maybe it belongs to next?
                        // But for now simple sequential is better than nothing.
                        if let Some(colon) = cleaned_json[absolute_evi_idx..].find(':') {
                             let val_start = absolute_evi_idx + colon + 1;
                             if let Some(quote_start) = cleaned_json[val_start..].find('"') {
                                 let actual_start = val_start + quote_start + 1;
                                 if let Some(quote_end) = cleaned_json[actual_start..].find('"') {
                                     evidence_val = cleaned_json[actual_start..actual_start + quote_end].to_string();
                                     // Move search_start past this evidence to avoid re-finding
                                     current_pos = actual_start + quote_end + 1;
                                 }
                             }
                        }
                    }
                    
                    tags.push(DocumentTag {
                        tag: tag_val,
                        evidence: if evidence_val.is_empty() { None } else { Some(evidence_val) },
                    });
                }
                
                // Advance search_start
                // Ensure we move forward significantly
                if current_pos > search_start {
                    search_start = current_pos;
                } else {
                    search_start = absolute_tag_idx + 5; // force advance
                }
            }

            if !summary.is_empty() {
                return (summary, tags);
            }

            // Ultimate Fallback: Return raw content if it's not too long and looks like text
            if content.len() < 500 && !content.contains("```") {
                (content.to_string(), Vec::new())
            } else {
                (String::new(), Vec::new())
            }
        }
    }
}

/// Naive clean up of HTML and Markdown syntax for better AI prompt context
fn clean_input_text(input: &str) -> String {
    // 1. Basic HTML Tag Removal
    let mut no_html = String::with_capacity(input.len());
    let mut inside_tag = false;
    for c in input.chars() {
        if c == '<' {
            inside_tag = true;
            continue;
        }
        if c == '>' && inside_tag {
            inside_tag = false;
            continue;
        }
        if !inside_tag {
            no_html.push(c);
        }
    }

    // 2. Reduce Markdown Noise
    // Replace multi-char markers
    let s = no_html
        .replace("```", " ")
        .replace("**", " ")
        .replace("__", " ")
        .replace("==", " ")
        .replace("~~", " ");

    // Filter specific markdown chars
    // Keep [] and () as they often contain useful text/links, but maybe strip * # ` ~
    let s: String = s.chars()
        .filter(|&c| c != '*' && c != '#' && c != '`' && c != '~')
        .collect();

    // 3. Collapse whitespace
    let mut final_res = String::with_capacity(s.len());
    let mut last_ws = false;
    for c in s.chars() {
        if c.is_whitespace() {
            if !last_ws {
                final_res.push(' ');
                last_ws = true;
            }
        } else {
            final_res.push(c);
            last_ws = false;
        }
    }

    final_res.trim().to_string()
}

// ============================================================================
// Database Operations
// ============================================================================

/// DocumentState enum matching server acl.proto
#[derive(Debug, Clone, Copy, Default)]
#[repr(i32)]
pub enum DocumentState {
    #[default]
    Draft = 1,
    Feedback = 2,
    Published = 3,
}

/// VisibilityLevel enum matching server acl.proto
#[derive(Debug, Clone, Copy, Default)]
#[repr(i32)]
pub enum VisibilityLevel {
    #[default]
    Hidden = 1,
    Metadata = 2,
    Snippet = 3,
    Public = 4,
}

/// GroupType enum for document categorization
#[derive(Debug, Clone, Copy, Default)]
#[repr(i32)]
pub enum GroupType {
    Department = 0,
    Project = 1,
    #[default]
    Private = 2,
}


/// Calculate SHA-256 hash of content for change detection
fn calculate_content_hash(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Check if we already have AI data for this content hash
fn check_existing_ai_data(
    conn: &Connection,
    document_id: &str,
    content_hash: &str,
    user_id: &str,
) -> Result<Option<(String, Vec<DocumentTag>)>, String> {
    let mut stmt = conn.prepare(
        "SELECT ai_summary, ai_tags FROM document_ai_data 
         WHERE document_id = ?1 AND content_hash = ?2"
    ).map_err(|e| e.to_string())?;

    let exists = stmt.exists([document_id, content_hash])
        .map_err(|e| e.to_string())?;

    if exists {
        let (summary_blob, tags_blob): (Option<Vec<u8>>, Option<Vec<u8>>) = stmt.query_row(
            [document_id, content_hash], 
            |row| Ok((row.get(0)?, row.get(1)?))
        ).map_err(|e| e.to_string())?;

        let summary = summary_blob
            .and_then(|b| decrypt_content(user_id, &b).ok())
            .unwrap_or_default();
            
        let tags: Vec<DocumentTag> = tags_blob
            .and_then(|b| decrypt_content(user_id, &b).ok())
            .and_then(|json| serde_json::from_str(&json).ok())
            .unwrap_or_default();

        return Ok(Some((summary, tags)));
    }

    Ok(None)
}

fn save_document(
    conn: &Connection,
    user_id: &str,
    doc_id: &str,
    group_type: GroupType,
    group_id: Option<&str>,
    title: Option<&[u8]>,
    content: &[u8],
    summary: Option<&[u8]>, // User active summary
    size: &[u8],
    created_at: &[u8],
    updated_at: &[u8],
    document_state: DocumentState,
    visibility_level: VisibilityLevel,
) -> Result<(), String> {
    let ts = chrono::Utc::now().timestamp();
    conn.execute(
        "INSERT INTO documents (
            id, user_id, document_state, visibility_level, group_type, group_id,
            title, content, summary, size, created_at, updated_at, last_synced_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            content = excluded.content,
            summary = excluded.summary, 
            updated_at = excluded.updated_at,
            last_synced_at = excluded.last_synced_at",
        rusqlite::params![
            doc_id,
            user_id,
            document_state as i32,
            visibility_level as i32,
            group_type as i32,
            group_id,
            title,
            content,
            summary,
            size,
            created_at,
            updated_at,
            ts
        ],
    )
    .map_err(|e| format!("Failed to save document: {}", e))?;
    Ok(())
}

fn save_ai_data(
    conn: &Connection,
    document_id: &str,
    content_hash: &str,
    user_id: &str,
    embedding: &[u8],
    summary: Option<&str>,
    tags: &[DocumentTag],
    updated_at: &[u8],
) -> Result<(), String> {
    let summary_enc = summary.map(|s| encrypt_content(user_id, s)).transpose()?;
    
    let tags_json = serde_json::to_string(tags).map_err(|e| e.to_string())?;
    let tags_enc = encrypt_content(user_id, &tags_json)?;

    conn.execute(
        "INSERT INTO document_ai_data (
            document_id, content_hash, embedding, ai_summary, ai_tags, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT(document_id) DO UPDATE SET
            content_hash = excluded.content_hash,
            embedding = excluded.embedding,
            ai_summary = excluded.ai_summary,
            ai_tags = excluded.ai_tags,
            updated_at = excluded.updated_at",
        rusqlite::params![
            document_id,
            content_hash,
            embedding,
            summary_enc,
            tags_enc,
            updated_at
        ],
    ).map_err(|e| format!("Failed to save AI data: {}", e))?;

    Ok(())
}

fn save_document_tags(
    conn: &Connection,
    document_id: &str,
    user_id: &str,
    tags: &[DocumentTag],
) -> Result<(), String> {
    // Clear existing tags first (full replace strategy for active tags)
    conn.execute("DELETE FROM document_tags WHERE document_id = ?1", [document_id])
        .map_err(|e| format!("Failed to clear tags: {}", e))?;

    for tag in tags {
        let tag_id = Uuid::new_v4().to_string();
        
        // Encrypt tag, evidence, and created_at
        let tag_enc = encrypt_content(user_id, &tag.tag)?;
        let evidence_enc = tag.evidence.as_ref()
            .map(|e| encrypt_content(user_id, e))
            .transpose()?;
        let now = chrono_now();
        let created_at_enc = encrypt_content(user_id, &now)?;
        
        conn.execute(
            "INSERT INTO document_tags (id, document_id, tag, evidence, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![tag_id, document_id, tag_enc, evidence_enc, created_at_enc],
        )
        .map_err(|e| format!("Failed to save tag: {}", e))?;
    }
    Ok(())
}

/// Get current timestamp as ISO 8601 string
fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();
    let secs = duration.as_secs();
    // Simple ISO 8601 format
    format!("1970-01-01T00:00:00Z+{}s", secs)
}

// ============================================================================
// Main Command
// ============================================================================

#[tauri::command]
pub async fn extract_info(
    auth_state: State<'_, Mutex<AuthState>>,
    db_state: State<'_, Mutex<DatabaseState>>,
    text: String, // Plain text used for AI analysis
    content: Option<String>, // HTML content used for saving (to preserve formatting)
    title: Option<String>,
    id: Option<String>,
) -> Result<ExtractInfoResult, String> {
    // Get user_id from auth state
    let user_id = {
        let auth = auth_state.lock().unwrap();
        auth.user_id.clone().ok_or("Not authenticated")?
    };

    // Calculate content hash
    let content_hash = calculate_content_hash(&text);
    
    // Check for existing AI data (Optimization)
    // Use provided ID or generate a new one
    let doc_id = id.unwrap_or_else(|| Uuid::new_v4().to_string());
    
    // NOTE: In a 'save' flow, we usually know the ID. 
    // If this is just 'extract_info', we are generating a draft.
    // However, if we want to check PREVIOUSLY generated data for the SAME content, we need to query by content_hash OR doc_id?
    // Since this is a specialized extract command, let's check the DB.
    
    {
        let db = db_state.lock().unwrap();
        if let Some(ref conn) = db.conn {
             // We can check if ANY document (or maybe specifically THIS document if ID was passed) has this hash.
             // For now, let's assume we are creating a new doc or updating one. 
             // If the user wants to "extract", we check if we already have it.
        }
    }

    // 1. Generate embedding
    let chunk_size = 2000;
    let chunks: Vec<_> = text
        .chars()
        .collect::<Vec<_>>()
        .chunks(chunk_size)
        .map(|c| c.iter().collect::<String>())
        .collect();

    let mut all_vectors = Vec::new();
    let client = reqwest::Client::new();

    for chunk in chunks {
        let response = client
            .post("http://localhost:8081/embedding")
            .json(&serde_json::json!({ "content": chunk }))
            .send()
            .await
            .map_err(|e| format!("Embedding request failed: {}", e))?
            .json::<LlamaEmbeddingResponse>()
            .await
            .map_err(|e| format!("Failed to parse embedding response: {}", e))?;

        // Extract the first embedding from the 2D array
        // Response: [{"index": 0, "embedding": [[...floats...]]}]
        if let Some(item) = response.first() {
            if let Some(embedding) = item.embedding.first() {
                all_vectors.push(embedding.clone());
            }
        }
    }

    if all_vectors.is_empty() {
        return Err("No embeddings generated".to_string());
    }

    // Mean pooling
    let vector_dim = all_vectors[0].len();
    let num_chunks = all_vectors.len() as f32;
    let mut mean_vector = vec![0.0; vector_dim];

    for vec in &all_vectors {
        for i in 0..vector_dim {
            mean_vector[i] += vec[i];
        }
    }
    for i in 0..vector_dim {
        mean_vector[i] /= num_chunks;
    }

    // L2 normalize
    let norm = mean_vector.iter().map(|x| x * x).sum::<f32>().sqrt();
    let normalized_vector: Vec<f32> = mean_vector.iter().map(|&x| x / norm).collect();



    // 2. Generate summary and tags
    let cleaned_text = clean_input_text(&text);
    let prompt = format!(
        "<|im_start|>system\nYou are a professional document analyzer. Your task is to extract key information from the user's text and provide the results in Korean.\nFollow these instructions strictly:\n1. Summary: Write a concise one-sentence summary of the text.\n2. Tags: Identify exactly 3 essential keywords.\n3. Evidence: For each keyword, extract the exact sentence from the source text that serves as the basis for that keyword.\nOutput the results strictly in the following JSON format:\n{{\n\"summary\":\"one-sentence summary in Korean\",\n\"analysis\": [\n{{\"tag\":\"Actual Keyword 1\",\"evidence\":\"verbatim sentence from the text\"}},\n{{\"tag\":\"Actual Keyword 2\",\"evidence\":\"verbatim sentence from the text\"}},\n{{\"tag\":\"Actual Keyword 3\",\"evidence\":\"verbatim sentence from the text\"}}\n]}}<|im_end|><|im_start|>user\n{}\n<|im_end|><|im_start|>assistant\n",
        cleaned_text.chars().take(4000).collect::<String>() // Limit context
    );

    let gen_res = client
        .post("http://localhost:8082/completion")
        .json(&serde_json::json!({
            "prompt": prompt,
            "n_predict": 256,
            "stop": ["<|im_end|>"]
        }))
        .send()
        .await
        .map_err(|e| format!("Generation request failed: {}", e))?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Failed to parse generation response: {}", e))?;

    let ai_content = gen_res["content"].as_str().unwrap_or("").to_string();
    let (summary, tags) = parse_ai_response(&ai_content, &text);

    // 3. Encrypt content, title, summary, size, and created_at
    let content_enc = encrypt_content(&user_id, content.as_deref().unwrap_or(&text))?;
    let title_enc = title.as_ref()
        .map(|t| encrypt_content(&user_id, t))
        .transpose()?;
    let summary_enc = if !summary.is_empty() {
        Some(encrypt_content(&user_id, &summary)?)
    } else {
        None
    };
    
    // Encrypt size and created_at
    let size_str = text.len().to_string();
    let size_enc = encrypt_content(&user_id, &size_str)?;
    let now = chrono_now();
    let created_at_enc = encrypt_content(&user_id, &now)?;

    // 4. Save to database
    let embedding_bytes = embedding_to_bytes(&normalized_vector);

    {
        let db = db_state.lock().unwrap();
        if let Some(ref conn) = db.conn {
            // Check optimization again inside lock or just proceed (locking scope is small)
            
            // A. Save Active Document (User Visible / Parent)
            // MUST be saved first to satisfy Foreign Key in document_ai_data
            save_document(
                conn,
                &user_id,
                &doc_id,
                GroupType::Private,
                None, // group_id
                title_enc.as_deref(),
                &content_enc,
                summary_enc.as_deref(), // Copy AI summary to Active User Summary
                &size_enc,
                &created_at_enc,
                &created_at_enc, // updated_at (same as created/now for this action)
                DocumentState::Draft,
                VisibilityLevel::Hidden,
            )?;

            // B. Save Draft/AI Data (Child)
            save_ai_data(conn, &doc_id, &content_hash, &user_id, &embedding_bytes, Some(&summary), &tags, &created_at_enc)?;
            
            // C. Save Active Tags (User Visible)
            save_document_tags(conn, &doc_id, &user_id, &tags)?;
        } else {
            return Err("Database not initialized".to_string());
        }
    }

    println!("Debug: Saved document {} with {} tags", doc_id, tags.len());

    Ok(ExtractInfoResult {
        document_id: doc_id,
        summary,
        tags,
    })
}

// rand module removed
