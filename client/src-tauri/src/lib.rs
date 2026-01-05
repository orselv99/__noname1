// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
  format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(serde::Serialize, serde::Deserialize)]
struct AiResult {
  embedding: String,
  generation: String,
}

#[tauri::command]
async fn extract_info(text: String) -> Result<AiResult, String> {
  // 1. Get Embedding (Port 8081)
  let client = reqwest::Client::new();
  let embedding_res = client
    .post("http://localhost:8081/embedding")
    .json(&serde_json::json!({ "content": text }))
    .send()
    .await
    .map_err(|e| format!("Embedding request failed: {}", e))?
    .json::<serde_json::Value>()
    .await
    .map_err(|e| format!("Failed to parse embedding response: {}", e))?;

  println!("Debug - Raw Embedding Response: {:?}", embedding_res);

  // Handle various llama-server response formats
  // Format 1: [ { "embedding": [ [0.1, ...] ] } ] (Root array, nested embedding)
  // Format 2: { "embedding": [0.1, ...] } (Standard)
  
  let embedding_val = if let Some(arr) = embedding_res.as_array() {
      // Root is array
      let first = arr.get(0).ok_or("Empty embedding response array")?;
      let emb = first["embedding"].as_array().ok_or("Missing embedding field in object")?;
      // Check if it's nested [[...]] or flat [...]
      if let Some(inner) = emb.get(0).and_then(|v| v.as_array()) {
          inner // It's [[...]], take first inner
      } else {
          emb // It's [...], use as is
      }
  } else {
     // Root is object
     let emb = embedding_res["embedding"].as_array().ok_or("Invalid embedding format (root object)")?;
     // Check nesting here too just in case
     if let Some(inner) = emb.get(0).and_then(|v| v.as_array()) {
        inner
    } else {
        emb
    }
  };
  
  // Convert to Vec<f64> for preview
  let embedding_preview = format!(
      "[{:.4}, {:.4}, {:.4}, {:.4}, {:.4} ...]", 
      embedding_val.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0),
      embedding_val.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0),
      embedding_val.get(2).and_then(|v| v.as_f64()).unwrap_or(0.0),
      embedding_val.get(3).and_then(|v| v.as_f64()).unwrap_or(0.0),
      embedding_val.get(4).and_then(|v| v.as_f64()).unwrap_or(0.0)
  );

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
      embedding: embedding_preview,
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
            "-c", "8192",
            "-b", "4096",
            "-ub", "4096",
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
            "-c", "4096",
            "-b", "2048",
            "-ub", "2048",
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
