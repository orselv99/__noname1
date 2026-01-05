// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
  format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(serde::Deserialize, Debug)]
struct LlamaEmbeddingResponse {
    pub embedding: Vec<f32>,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct AiResult {
  embedding: Vec<f32>,
  generation: String,
}

#[tauri::command]
async fn extract_info(text: String) -> Result<AiResult, String> {
  // 1. 텍스트 분할 (가장 간단하게 글자 수 기준으로 예시)
  // 실제로는 토크나이저를 쓰거나 단어 단위로 끊는 것이 좋습니다.
  let chunk_size = 2000; // 대략 2000토큰 내외로 설정
  let chunks: Vec<_> = text
      .chars()
      .collect::<Vec<_>>()
      .chunks(chunk_size)
      .map(|c| c.iter().collect::<String>())
      .collect();
  
  let mut all_vectors = Vec::new();

  // 2. 각 조각에 대해 임베딩 요청 (Port 8081)
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

      all_vectors.push(response.embedding);
  }
  
  // 3. 벡터 평균 계산 (Mean Pooling)
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

  // 4. L2 정규화 (Normalization) - 벡터 검색의 정확도를 위해 권장
  let norm = mean_vector.iter().map(|x| x * x).sum::<f32>().sqrt();
  let normalized_vector: Vec<f32> = mean_vector.iter().map(|&x| x / norm).collect();

  // 2. Get Summary/Tags (Port 8082)
  let prompt = format!(
    "<|im_start|>system\nYou are a helpful assistant. Extract a brief summary and 3-5 keywords from the user's text.\nOutput format:\nSummary: [One sentence summary]\nTags: [keyword1, keyword2, keyword3]\n<|im_end|>\n<|im_start|>user\n{}\n<|im_end|>\n<|im_start|>assistant\n",
    text
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

  let content = gen_res["content"].as_str().unwrap_or("").to_string();

  Ok(AiResult {
      embedding: normalized_vector,
      generation: content,
  })
}

use tauri::Manager;
use tauri_plugin_shell::ShellExt;

use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};

fn kill_orphans() {
  let _ = Command::new("taskkill")
    .args(["/F", "/IM", "llama-server-x86_64-pc-windows-msvc.exe", "/T"])
    .creation_flags(0x08000000) // CREATE_NO_WINDOW
    .output();

  let _ = Command::new("taskkill")
    .args(["/F", "/IM", "llama-server.exe", "/T"])
    .creation_flags(0x08000000) // CREATE_NO_WINDOW
    .output();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_shell::init())
    .invoke_handler(tauri::generate_handler![greet, extract_info])
    .setup(|app| {
      // Kill any existing sidecar processes to prevent orphans
      kill_orphans();

      let resource_path = app
        .path()
        .resource_dir()
        .expect("failed to get resource dir");

      println!("Debug: Resource path: {:?}", resource_path);

      // Spawn Embedding Server (Port 8081)
      let embedding_model = resource_path
        .join("model")
        .join("nomic-embed-text-v1.5.Q4_K_M.gguf");

      println!("Debug: Embedding model path: {:?}", embedding_model);



      // Resolve binary path (assumes llama-server.exe is in the same directory as the app)
      let current_exe = std::env::current_exe().unwrap();
      let bin_dir = current_exe.parent().unwrap();
      let sidecar_path = bin_dir.join("llama-server.exe");

      println!("Debug: Sidecar binary path: {:?}", sidecar_path);
      
      if !sidecar_path.exists() {
         println!("Error: Sidecar binary not found at {:?}", sidecar_path);
      }

      // Spawn Embedding Server (Port 8081)
      let embedding_model = resource_path
        .join("model")
        .join("nomic-embed-text-v1.5.Q4_K_M.gguf");

      println!("Debug: Embedding model path: {:?}", embedding_model);
      println!("Debug: Spawning Embedding Server (Native)...");

      let mut embedding_child = Command::new(&sidecar_path)
        .args([
            "--model", embedding_model.to_str().unwrap(),
            "--port", "8081",
            "--embedding",
            "-c", "2048",
            "-b", "2048",
            "-ub", "2048",
            "-np", "1"
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .spawn()
        .expect("Failed to spawn embedding server");

      let stdout_emb = embedding_child.stdout.take().unwrap();
      let stderr_emb = embedding_child.stderr.take().unwrap();

      tauri::async_runtime::spawn(async move {
          use std::io::{BufRead, BufReader};
          let reader = BufReader::new(stdout_emb);
          for line in reader.lines() {
              if let Ok(l) = line { println!("[Embedding-8081] {}", l); }
          }
      });
      
      tauri::async_runtime::spawn(async move {
          use std::io::{BufRead, BufReader};
          let reader = BufReader::new(stderr_emb);
          for line in reader.lines() {
              if let Ok(l) = line { println!("[Embedding-8081] {}", l); }
          }
      });


      // Spawn Generation Server (Port 8082)
      let gen_model = resource_path
        .join("model")
        .join("qwen2.5-1.5b-instruct-q4_k_m.gguf");
        
      println!("Debug: Spawning Generation Server (Native)...");
      let mut gen_child = Command::new(&sidecar_path)
        .args([
            "--model", gen_model.to_str().unwrap(),
            "--port", "8082",
            "-c", "8192",
            "-b", "8192",
            "-ub", "8192",
            "-np", "1"
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .spawn()
        .expect("Failed to spawn generation server");

      let stdout_gen = gen_child.stdout.take().unwrap();
      let stderr_gen = gen_child.stderr.take().unwrap();

      tauri::async_runtime::spawn(async move {
          use std::io::{BufRead, BufReader};
          let reader = BufReader::new(stdout_gen);
          for line in reader.lines() {
              if let Ok(l) = line { println!("[Generation-8082] {}", l); }
          }
      });
      
      tauri::async_runtime::spawn(async move {
          use std::io::{BufRead, BufReader};
          let reader = BufReader::new(stderr_gen);
          for line in reader.lines() {
              if let Ok(l) = line { println!("[Generation-8082] {}", l); }
          }
      });

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
