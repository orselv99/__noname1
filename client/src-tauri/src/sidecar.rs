// [DISABLED FOR TRANSFORMER.JS MIGRATION]
// Sidecar management module for llama-server processes
// All functionality commented out - using transformer.js in frontend instead

// Keeping imports commented for reference
// use std::process::Command;
// use std::sync::Mutex;
// use sysinfo::System;
// use tauri::{AppHandle, Manager};
// use tauri_plugin_shell::process::CommandChild;
// use tauri_plugin_shell::ShellExt;

use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// State to hold sidecar child handles for cleanup on exit
/// [DISABLED] - Using transformer.js instead of llama-server
pub struct SidecarState {
  // pub embedding_child: Option<CommandChild>,
  // pub generation_child: Option<CommandChild>,
  pub is_running: bool,
}

impl Default for SidecarState {
  fn default() -> Self {
    Self {
      // embedding_child: None,
      // generation_child: None,
      is_running: false,
    }
  }
}

/// Kill any orphan llama-server processes (cross-platform)
/// [DISABLED] - No longer spawning llama-server processes
pub fn kill_orphans() {
  // No-op: llama-server is no longer used
  // Original code commented out below for reference
  /*
  #[cfg(target_os = "windows")]
  {
    use std::os::windows::process::CommandExt;
    let _ = Command::new("taskkill")
      .args(["/F", "/IM", "llama-server-x86_64-pc-windows-msvc.exe", "/T"])
      .creation_flags(0x08000000)
      .output();

    let _ = Command::new("taskkill")
      .args(["/F", "/IM", "llama-server.exe", "/T"])
      .creation_flags(0x08000000)
      .output();
  }

  #[cfg(target_os = "macos")]
  {
    let _ = Command::new("pkill").args(["-f", "llama-server"]).output();
  }

  #[cfg(target_os = "linux")]
  {
    let _ = Command::new("pkill").args(["-f", "llama-server"]).output();
  }
  */
}

/// Calculate conservative thread count
/// [DISABLED] - No longer needed for transformer.js
#[allow(dead_code)]
fn get_conservative_thread_count() -> String {
  // No-op: returning default value
  "4".to_string()
  /*
  let mut sys = System::new_all();
  sys.refresh_cpu();
  let physical_cores = sys.physical_core_count().unwrap_or(4);
  let threads = std::cmp::max(1, physical_cores / 4);
  threads.to_string()
  */
}

/// Spawn the llama-server sidecars (called after successful login)
/// [DISABLED] - Using transformer.js in frontend instead
pub fn spawn_sidecars(app: &AppHandle) -> Result<(), String> {
  // No-op: llama-server is no longer used
  // Mark as "running" to satisfy any checks, but nothing is actually spawned
  {
    let state = app.state::<Mutex<SidecarState>>();
    let mut state = state.lock().unwrap();
    state.is_running = true;
  }
  println!("Debug: [DISABLED] Sidecars disabled - using transformer.js instead");
  Ok(())

  /*
  // Original llama-server spawn code commented out for reference
  // Check if already running
  {
    let state = app.state::<Mutex<SidecarState>>();
    let state = state.lock().unwrap();
    if state.is_running {
      println!("Debug: Sidecars already running, skipping spawn");
      return Ok(());
    }
  }

  kill_orphans();

  let resource_path = app
    .path()
    .resource_dir()
    .map_err(|e| format!("Failed to get resource dir: {}", e))?;

  let threads = get_conservative_thread_count();

  // Spawn Embedding Server (Port 8081)
  let embedding_model = resource_path
    .join("model")
    .join("nomic-embed-text-v1.5.Q4_K_M.gguf");

  let embedding_sidecar = app
    .shell()
    .sidecar("llama-server")
    .map_err(|e| format!("Failed to create embedding sidecar: {}", e))?
    .args([
      "--model", embedding_model.to_str().unwrap(),
      "--port", "8081",
      "--embedding",
      "-c", "2048", "-b", "2048", "-ub", "2048",
      "-np", "1", "-t", "4",
      "--cont-batching",
    ]);

  let (mut rx_emb, child_emb) = embedding_sidecar
    .spawn()
    .map_err(|e| format!("Failed to spawn embedding server: {}", e))?;

  // Store embedding child handle
  {
    let state = app.state::<Mutex<SidecarState>>();
    let mut state = state.lock().unwrap();
    state.embedding_child = Some(child_emb);
  }

  // ... (generation server spawn code omitted for brevity)

  println!("Debug: All sidecars spawned successfully");
  Ok(())
  */
}

/// Stop all sidecars (called on logout or app exit)
/// [DISABLED] - No sidecars to stop
pub fn stop_sidecars(app: &AppHandle) {
  println!("Debug: [DISABLED] Stop sidecars - nothing to stop (transformer.js mode)");

  // Mark as not running
  {
    let state = app.state::<Mutex<SidecarState>>();
    let mut state = state.lock().unwrap();
    state.is_running = false;
  }

  // No processes to kill
  // kill_orphans();
}
