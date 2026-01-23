//! ==========================================================================
//! ai.rs - AI 분석 커맨드 (요약, 태그, 임베딩)
//! ==========================================================================
//!
//! C++ 개발자를 위한 설명:
//! - 문서 내용을 AI로 분석하여 요약 및 키워드(태그) 추출
//! - 벡터 임베딩 생성으로 유사 문서 검색 지원
//! - 결과는 암호화되어 로컬 SQLite에 저장
//!
//! AI 처리 흐름:
//! ┌─────────────────────────────────────────────────────────┐
//! │  1. 텍스트 전처리 (HTML/마크다운 제거)                   │
//! │  2. 임베딩 생성 (청킹 → 평균 풀링 → L2 정규화)           │
//! │  3. 요약/태그 생성 (LLM 완성 API)                       │
//! │  4. 결과 암호화 후 DB 저장                              │
//! └─────────────────────────────────────────────────────────┘
//!
//! 주요 구조체:
//! - `DocumentTag`: 태그 + 근거 텍스트
//! - `ExtractInfoResult`: extract_info 커맨드 반환값
//! - `DocumentState`, `VisibilityLevel`, `GroupType`: 문서 상태 열거형
//! ==========================================================================
// AI 커맨드 모듈 (문서 처리용)
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

use crate::commands::auth::AuthState;
use crate::crypto::{self, decrypt_content, encrypt_content}; // Import from crypto
use crate::database::DatabaseState;
use regex::Regex;
use sha2::{Digest, Sha256}; // Re-add for hashing content
use crate::config;

// ============================================================================
// Types and Responses
// ============================================================================

// ============================================================================
// 임베딩 API 응답 구조체
// ============================================================================

/// llama.cpp /embedding 엔드포인트 응답 항목
///
/// 서버 응답 형식: [{"index": 0, "embedding": [[...float32...]]}]
/// 2D 배열 형식으로 반환됨 (llama.cpp 특성)
#[derive(serde::Deserialize, Debug)]
struct LlamaEmbeddingItem {
    /// 챭크 인덱스 (0부터 시작)
    #[allow(dead_code)]
    pub index: i32,
    /// 임베딩 벡터 (2D 배열 - 첫 번째 요소가 실제 벡터)
    pub embedding: Vec<Vec<f32>>,
}

/// 임베딩 API 응답 타입 별칭
type LlamaEmbeddingResponse = Vec<LlamaEmbeddingItem>;

// ============================================================================
// AI 분석 결과 구조체
// ============================================================================

/// 문서 태그 (키워드 + 근거)
///
/// AI가 추출한 핵심 키워드와 해당 키워드의 근거가 되는 원문
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct DocumentTag {
    /// 태그 이름 (예: "자연선택", "진화론")
    pub tag: String,
    /// 근거 텍스트: 원문에서 발취한 문장
    pub evidence: Option<String>,
}

/// extract_info 커맨드 반환값
///
/// AI 분석 결과를 프론트엔드에 전달
#[derive(serde::Serialize, serde::Deserialize)]
pub struct ExtractInfoResult {
    /// 생성/업데이트된 문서 ID
    pub document_id: String,
    /// AI 생성 요약 (1문장)
    pub summary: String,
    /// AI 추출 태그 목록 (3개)
    pub tags: Vec<DocumentTag>,
}

/// AI JSON 응답 내 개별 분석 항목 (내부용)
#[derive(serde::Deserialize)]
struct AiJsonItem {
    tag: String,
    evidence: String,
}

/// AI JSON 응답 전체 구조 (내부용)
#[derive(serde::Deserialize)]
struct AiJsonResult {
    summary: String,
    analysis: Vec<AiJsonItem>,
}

// ============================================================================
// 임베딩 변환 헬퍼 함수
// ============================================================================

/// 임베딩 벡터를 바이트 배열로 변환 (DB BLOB 저장용)
///
/// float32 배열을 little-endian 바이트로 직렬화
/// C++ 비교: memcpy(벡터, &float_arr, sizeof(float) * len)
fn embedding_to_bytes(embedding: &[f32]) -> Vec<u8> {
    embedding.iter().flat_map(|f| f.to_le_bytes()).collect()
}

/// 바이트 배열을 임베딩 벡터로 변환 (DB BLOB 읽기용)
///
/// little-endian 바이트를 float32 배열로 역직렬화
pub fn bytes_to_embedding(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect()
}

// ============================================================================
// AI 응답 파싱
// ============================================================================

/// AI 응답에서 요약과 태그 추출
///
/// LLM 응답에서 JSON을 파싱하여 요약과 태그 배열 추출
/// 마크다운 코드 블록 내 JSON 또는 외부 중괄호 JSON 파싱 시도
///
/// # 매개변수
/// - `content`: LLM 원시 응답 텍스트
/// - `_original_text`: 원문 (미사용 - 향후 폴백용)
///
/// # 반환값
/// (summary, tags) 튜플
fn parse_ai_response(content: &str, _original_text: &str) -> (String, Vec<DocumentTag>) {
  // 1. 마크다운 코드 블록 우선 검색
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
      let tags = res
        .analysis
        .into_iter()
        .map(|item| DocumentTag {
          tag: item.tag,
          evidence: Some(item.evidence),
        })
        .collect();
      (res.summary, tags)
    }
    Err(e) => {
      println!("Failed to parse AI JSON: {}", e);
      println!("Raw AI content: {}", content);

      // Fallback: JSON 파싱 실패 시 수동으로 요약 추출 시도
      let summary = if let Some(sum_start) = cleaned_json.find("\"summary\"") {
        if let Some(colon) = cleaned_json[sum_start..].find(':') {
          let val_start = sum_start + colon + 1;
          if let Some(quote_start) = cleaned_json[val_start..].find('"') {
            let actual_start = val_start + quote_start + 1;
            // 끝 따옴표 찾기 (이스케이프 무시 등은 현재 미구현 - 단순 검색)
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

      // Fallback: 태그 수동 추출 시도
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

        // 근거(Evidence) 값 추출 (해당 태그 근처에서 검색)
        let mut evidence_val = String::new();
        // Limit search for evidence to avoid jumping to next item's evidence if missing?
        // Just search forward.
        if !tag_val.is_empty() {
          if let Some(evi_key_idx) = cleaned_json[current_pos..].find("\"evidence\"") {
            let absolute_evi_idx = current_pos + evi_key_idx;
            // 휴리스틱: 근거가 너무 멀리 떨어져 있으면(예: 200자 이상) 다음 항목일 가능성?
            // 현재는 단순하게 순차 검색.
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
            evidence: if evidence_val.is_empty() {
              None
            } else {
              Some(evidence_val)
            },
          });
        }

        // 검색 시작 위치 전진
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

      // 최후의 수단: 내용이 너무 길지 않고 코드가 아니면 원본 반환
      if content.len() < 500 && !content.contains("```") {
        (content.to_string(), Vec::new())
      } else {
        (String::new(), Vec::new())
      }
    }
  }
}

/// AI 프롬프트 컨텍스트를 위해 HTML 및 마크다운 구문 정리
/// 굵게(bold) 같은 중요한 마커는 유지 (대괄호로 변환)
fn clean_input_text(input: &str) -> String {
  // 1. HTML Tag 제거
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

  // 2. 마크다운 처리
  // **text** 강조를 [text]로 변환하여 유지
  let mut s = no_html
    .replace("```", " ") // 코드 블록 제거
    .replace("__", "") // 밑줄 제거
    .replace("==", "") // 하이라이트 제거
    .replace("~~", ""); // 취소선 제거

  // 3. [편집], [1], [주석] 등 이런거 제거
  if let Ok(re_noise) = Regex::new(r"\[.*?\]") {
    s = re_noise.replace_all(&s, "").to_string();
  }

  // 4. Base64 Image Pattern 제거 (data:image/...;base64,...)
  // OCR을 원치 않으므로 이미지 데이터가 텍스트로 유입될 경우 제거
  if let Ok(re_base64) = Regex::new(r"data:image\/[a-zA-Z]+\;base64,[a-zA-Z0-9+\/=]+") {
      s = re_base64.replace_all(&s, "").to_string();
  }

  // Markdown 기호제거
  s = s
    .chars()
    .filter(|&c| c != '*' && c != '#' && c != '`')
    .collect();

  // 3. 공백 축소 (연속된 공백을 하나로)
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

/// 서버 acl.proto와 일치하는 문서 상태 열거형
#[derive(Debug, Clone, Copy, Default)]
#[repr(i32)]
pub enum DocumentState {
  #[default]
  Draft = 1,
  Feedback = 2,
  Published = 3,
}

/// 서버 acl.proto와 일치하는 공개 수준 열거형
#[derive(Debug, Clone, Copy, Default)]
#[repr(i32)]
pub enum VisibilityLevel {
  #[default]
  Hidden = 1,
  Metadata = 2,
  Snippet = 3,
  Public = 4,
}

/// 문서 분류를 위한 그룹 타입 열거형
#[derive(Debug, Clone, Copy, Default)]
#[repr(i32)]
pub enum GroupType {
  Department = 0,
  Project = 1,
  #[default]
  Private = 2,
}

/// 변경 감지를 위한 콘텐츠 SHA-256 해시 계산
fn calculate_content_hash(content: &str) -> String {
  let mut hasher = Sha256::new();
  hasher.update(content.as_bytes());
  format!("{:x}", hasher.finalize())
}

/// 해당 콘텐츠 해시에 대한 AI 데이터가 이미 존재하는지 확인
fn check_existing_ai_data(
  conn: &Connection,
  document_id: &str,
  content_hash: &str,
  user_id: &str,
) -> Result<Option<(String, Vec<DocumentTag>)>, String> {
  let mut stmt = conn
    .prepare(
      "SELECT ai_summary, ai_tags FROM document_ai_data 
         WHERE document_id = ?1 AND content_hash = ?2",
    )
    .map_err(|e| e.to_string())?;

  let exists = stmt
    .exists([document_id, content_hash])
    .map_err(|e| e.to_string())?;

  if exists {
    let (summary_blob, tags_blob): (Option<Vec<u8>>, Option<Vec<u8>>) = stmt
      .query_row([document_id, content_hash], |row| {
        Ok((row.get(0)?, row.get(1)?))
      })
      .map_err(|e| e.to_string())?;

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
  conn
    .execute(
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

  conn
    .execute(
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
    )
    .map_err(|e| format!("Failed to save AI data: {}", e))?;

  Ok(())
}

fn save_document_tags(
  conn: &Connection,
  document_id: &str,
  user_id: &str,
  tags: &[DocumentTag],
) -> Result<(), String> {
  // 기존 태그 먼저 삭제 (전체 교체 전략)
  conn
    .execute(
      "DELETE FROM document_tags WHERE document_id = ?1",
      [document_id],
    )
    .map_err(|e| format!("Failed to clear tags: {}", e))?;

  for tag in tags {
    let tag_id = Uuid::new_v4().to_string();

    // 태그, 근거, 생성일 암호화
    let tag_enc = encrypt_content(user_id, &tag.tag)?;
    let evidence_enc = tag
      .evidence
      .as_ref()
      .map(|e| encrypt_content(user_id, e))
      .transpose()?;
    let now = chrono_now();
    let created_at_enc = encrypt_content(user_id, &now)?;

    conn
      .execute(
        "INSERT INTO document_tags (id, document_id, tag, evidence, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![tag_id, document_id, tag_enc, evidence_enc, created_at_enc],
      )
      .map_err(|e| format!("Failed to save tag: {}", e))?;
  }
  Ok(())
}

/// 현재 시간을 ISO 8601 문자열로 반환
fn chrono_now() -> String {
  chrono::Utc::now().to_rfc3339()
}

// ============================================================================
// Main Command
// ============================================================================

#[tauri::command]
pub async fn extract_info(
  auth_state: State<'_, Mutex<AuthState>>,
  db_state: State<'_, Mutex<DatabaseState>>,
  text: String,            // AI 분석에 사용할 평문 텍스트
  content: Option<String>, // 저장 시 원본 서식 유지를 위한 HTML 콘텐츠
  title: Option<String>,
  id: Option<String>,
) -> Result<ExtractInfoResult, String> {
  // 인증 상태에서 user_id 가져오기
  let user_id = {
    let auth = auth_state.lock().unwrap();
    auth.user_id.clone().ok_or("Not authenticated")?
  };

  // 임베딩 및 요약의 맥락을 돕기 위해 텍스트 앞에 제목 추가
  let text = if let Some(ref t) = title {
    if !t.trim().is_empty() {
      format!("{}\n\n{}", t, text)
    } else {
      text
    }
  } else {
    text
  };

  // 콘텐츠 해시 계산
  let content_hash = calculate_content_hash(&text);

  // 기존 AI 데이터 확인 (최적화)
  // 제공된 ID 사용 또는 새로 생성
  let doc_id = id.unwrap_or_else(|| Uuid::new_v4().to_string());

  // 참고: '저장' 흐름에서는 보통 ID를 알고 있습니다.
  // 이 커맨드가 단순 '정보 추출'용이라면 초안을 생성하는 것입니다.
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

  // 1. 임베딩 생성
  let chunk_size = 2000;
  let chunks: Vec<_> = text
    .chars()
    .collect::<Vec<_>>()
    .chunks(chunk_size)
    .map(|c| c.iter().collect::<String>())
    .collect();

  println!("[AI] Starting embedding: {} chunks", chunks.len());
  let mut all_vectors = Vec::new();
  let client = reqwest::Client::new();

  for (i, chunk) in chunks.iter().enumerate() {
    let response = client
      .post(&format!("{}/embedding", config::get_embedding_url()))
      .json(&serde_json::json!({ "content": chunk }))
      .send()
      .await
      .map_err(|e| format!("Embedding request failed: {}", e))?
      .json::<LlamaEmbeddingResponse>()
      .await
      .map_err(|e| format!("Failed to parse embedding response: {}", e))?;

    // 2D 배열에서 첫 번째 임베딩 추출
    // Response: [{"index": 0, "embedding": [[...floats...]]}]
    if let Some(item) = response.first() {
      if let Some(embedding) = item.embedding.first() {
        all_vectors.push(embedding.clone());
      }
    }
    if chunks.len() > 1 {
      println!("[AI] Embedded chunk {}/{}", i + 1, chunks.len());
    }
  }
  println!("[AI] Embedding complete: {} vectors", all_vectors.len());

  if all_vectors.is_empty() {
    return Err("No embeddings generated".to_string());
  }

  // 평균 풀링 (Mean Pooling)
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

  // L2 정규화
  let norm = mean_vector.iter().map(|x| x * x).sum::<f32>().sqrt();
  let normalized_vector: Vec<f32> = mean_vector.iter().map(|&x| x / norm).collect();

  // 2. 요약 및 태그 생성
  println!("[AI] Starting document analysis...");
  let cleaned_text = clean_input_text(&text);
  let text_len = cleaned_text.len();
  println!("[AI] Preprocessed text: {} chars", text_len);

  //         "<|im_start|>system\nYou are a professional document analyzer. Your task is to extract key information from the user's text and provide the results in Korean.\nFollow these instructions strictly:\n1. Summary: Write a concise one-sentence summary of the text.\n2. Tags: Identify exactly 3 essential keywords.\n3. Evidence: For each keyword, extract the exact sentence from the source text that serves as the basis for that keyword.\nOutput the results strictly in the following JSON format:\n{{\n\"summary\":\"one-sentence summary in Korean\",\n\"analysis\": [\n{{\"tag\":\"Actual Keyword 1\",\"evidence\":\"verbatim sentence from the text\"}},\n{{\"tag\":\"Actual Keyword 2\",\"evidence\":\"verbatim sentence from the text\"}},\n{{\"tag\":\"Actual Keyword 3\",\"evidence\":\"verbatim sentence from the text\"}}\n]}}<|im_end|><|im_start|>user\n{}\n<|im_end|><|im_start|>assistant\n",

  //   JSON format:
  // {{
  // "summary":"summary",
  // "analysis": [{{"tag":"semantic_tag_1","evidence":"verbatim_sentence_1"}},
  // {{"tag":"semantic_tag_2","evidence":"verbatim_sentence_2"}},
  // {{"tag":"semantic_tag_3","evidence":"verbatim_sentence_3"}}]
  // }}

  // Gemma 2 프롬프트 형식 (시스템 턴 없음 - 사용자 메시지에 지시 포함)
  let prompt = format!(
    r#"<start_of_turn>user
You are a professional document analyzer specializing in high-density information extraction.
Your task is to identify the core identity of the provided text and summarize it precisely in Korean.
Follow these instructions strictly:
1. Summary: Write a concise one-sentence summary that captures the "core intent" or "main conclusion" of the text. 
   - Format: "이 문서는 [subject]에 대해 설명합니다."
2. Tags (Semantic Keywords): Identify exactly 3 essential keywords.
   - Do NOT use generic category names (e.g., 개요, 특징, 결론).
   - DO select keywords that represent the "Unique Value Proposition" or "Core Concept" that distinguishes this document from others.
   - Each tag should be a high-density noun or a short phrase (e.g., "자연선택적 진화" instead of "진화").
3. Evidences (Contextual Justification): For each tag, extract the most "definition-heavy" verbatim sentence.
   - The sentence must clearly explain the significance or the reason why the tag was chosen.
   - Do not truncate or modify the sentence; it must be 100% verbatim.
JSON format:{{"summary":"...", "analysis":[{{"tag":"...", "evidence":"..."}}, ...]}}

Document:
{}<end_of_turn>
<start_of_turn>model
"#,
    cleaned_text.chars().take(3000).collect::<String>()
  );

  println!("[AI] Prompt: {}", prompt);

  // Gemma 3 prompt format: <bos><start_of_turn>user ... <end_of_turn><start_of_turn>model
  //   let prompt = format!(
  //     r#"<start_of_turn>user
  // You are a document analyzer. Output ONLY valid JSON.

  // TASK:
  // 1. SUMMARY: Write in Korean. Start with "이 문서는 [주제]에 대해 설명합니다."
  // 2. TAGS: Extract 3 named entities (main topic, creator/origin, related term).
  //    GOOD: "랙돌", "앤 베이커", "TICA" / BAD: "고양이", "특징", "성격"
  // 3. EVIDENCE: Short phrase (max 15 chars) from text containing each tag.

  // JSON format:
  // {{"summary":"Korean summary","analysis":[{{"tag":"name1","evidence":"phrase"}},{{"tag":"name2","evidence":"phrase"}},{{"tag":"name3","evidence":"phrase"}}]}}

  // Document:
  // {}
  // <end_of_turn>
  // <start_of_turn>model
  // "#,
  //     cleaned_text.chars().take(3000).collect::<String>()
  //   );

  println!("[AI] Sending completion request...");
  let gen_res = client
    .post(&format!("{}/completion", config::get_completion_url()))
    .json(&serde_json::json!({
        "prompt": prompt,
        "n_predict": 1024,
        "temperature": 0.1,
        "top_k": 40,
        "top_p": 0.9,
        "stop": ["<end_of_turn>", "\n\n\n"],
        "json_schema":{
            "type": "object",
            "properties":{
                "summary": { "type": "string" },
                "analysis": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "tag": { "type": "string" },
                            "evidence": { "type": "string" }
                        },
                        "required": ["tag", "evidence"]
                    },
                    "minItems": 3,
                    "maxItems": 3
                }
            },
            "required": ["summary", "analysis"]
        }
    }))
    .send()
    .await
    .map_err(|e| format!("Generation request failed: {}", e))?
    .json::<serde_json::Value>()
    .await
    .map_err(|e| format!("Failed to parse generation response: {}", e))?;

  let ai_content = gen_res["content"].as_str().unwrap_or("").to_string();
  println!(
    "[AI] Received response ({} chars): {}",
    ai_content.len(),
    ai_content
  );

  // 빈 AI 응답 예외 처리
  let (summary, tags) = if ai_content.trim().is_empty() {
    println!("[AI] Warning: Empty response");
    (String::new(), Vec::new())
  } else {
    let result = parse_ai_response(&ai_content, &text);
    println!(
      "[AI] Parsed: summary={} chars, tags={}",
      result.0.len(),
      result.1.len()
    );
    result
  };

  // 3. 콘텐츠, 제목, 요약, 크기, 생성일 암호화
  let content_enc = encrypt_content(&user_id, content.as_deref().unwrap_or(&text))?;
  let title_enc = title
    .as_ref()
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
      save_ai_data(
        conn,
        &doc_id,
        &content_hash,
        &user_id,
        &embedding_bytes,
        Some(&summary),
        &tags,
        &created_at_enc,
      )?;

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
