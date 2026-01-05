// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
  format!("Hello, {}! You've been greeted from Rust!", name)
}

use tauri::Manager;
use tauri_plugin_shell::ShellExt;

use std::os::windows::process::CommandExt;
use std::process::Command;

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
    .invoke_handler(tauri::generate_handler![greet])
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

      let embedding_sidecar = app.shell().sidecar("llama-server").unwrap().args([
        "--model",
        embedding_model.to_str().unwrap(),
        "--port",
        "8081",
        "--embedding",
      ]);

      let spawn_result = embedding_sidecar.spawn();
      match spawn_result {
        Ok(_) => println!("Debug: Embedding server spawned successfully"),
        Err(e) => println!("Debug: Failed to spawn embedding server: {:?}", e),
      }

      // Spawn Generation Server (Port 8082)
      let gen_model = resource_path
        .join("model")
        .join("qwen2.5-1.5b-instruct-q4_k_m.gguf");
      let gen_sidecar = app.shell().sidecar("llama-server").unwrap().args([
        "--model",
        gen_model.to_str().unwrap(),
        "--port",
        "8082",
        "-c",
        "2048",
      ]);

      let (mut _rx2, _child2) = gen_sidecar
        .spawn()
        .expect("Failed to spawn generation server");

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
