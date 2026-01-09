// Sidecar management module for llama-server processes
use std::sync::Mutex;
use std::process::Command;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;
use sysinfo::System;

/// State to hold sidecar child handles for cleanup on exit
pub struct SidecarState {
    pub embedding_child: Option<CommandChild>,
    pub generation_child: Option<CommandChild>,
    pub is_running: bool,
}

impl Default for SidecarState {
    fn default() -> Self {
        Self {
            embedding_child: None,
            generation_child: None,
            is_running: false,
        }
    }
}

/// Kill any orphan llama-server processes (cross-platform)
pub fn kill_orphans() {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill")
            .args(["/F", "/IM", "llama-server-x86_64-pc-windows-msvc.exe", "/T"])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output();

        let _ = Command::new("taskkill")
            .args(["/F", "/IM", "llama-server.exe", "/T"])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output();
    }

    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("pkill")
            .args(["-f", "llama-server"])
            .output();
    }

    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("pkill")
            .args(["-f", "llama-server"])
            .output();
    }
}

/// Calculate conservative thread count
fn get_conservative_thread_count() -> String {
    let mut sys = System::new_all();
    sys.refresh_cpu();
    
    // Getting physical core count is safer for "efficiency" logic implicitly.
    // Llama.cpp works best with physical cores.
    // Ideally, we want to start small.
    // If we have 16 logical, 8 physical -> 8 threads is max performance usually.
    // Conservative: Use half of physical cores.
    
    let physical_cores = sys.physical_core_count().unwrap_or(4);
    
    // Conservative = physical / 2. Min 1.
    // let threads = std::cmp::max(1, physical_cores / 2);
    let threads = std::cmp::max(1, physical_cores / 4);
    
    println!("Debug: Detected {} physical cores. Using {} threads for AI.", physical_cores, threads);
    threads.to_string()
}

/// Spawn the llama-server sidecars (called after successful login)
pub fn spawn_sidecars(app: &AppHandle) -> Result<(), String> {
    // Check if already running
    {
        let state = app.state::<Mutex<SidecarState>>();
        let state = state.lock().unwrap();
        if state.is_running {
            println!("Debug: Sidecars already running, skipping spawn");
            return Ok(());
        }
    }

    // Kill any existing orphan processes first
    kill_orphans();

    let resource_path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;

    println!("Debug: Resource path: {:?}", resource_path);

    let threads = get_conservative_thread_count();
    let threads_str = 2; //threads.as_str();

    // Spawn Embedding Server (Port 8081)
    let embedding_model = resource_path
        .join("model")
        .join("nomic-embed-text-v1.5.Q4_K_M.gguf");

    println!("Debug: Embedding model path: {:?}", embedding_model);
    println!("Debug: Spawning Embedding Server (Sidecar)...");

    let embedding_sidecar = app.shell().sidecar("llama-server")
        .map_err(|e| format!("Failed to create embedding sidecar: {}", e))?
        .args([
            "--model", embedding_model.to_str().unwrap(),
            "--port", "8081",
            "--embedding",
            "-c", "2048",
            "-b", "2048",
            "-ub", "2048",
            "-np", "1",
            "-t", "2"//threads_str
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

    // Log embedding server output
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        while let Some(event) = rx_emb.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    println!("[Embedding-8081] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    println!("[Embedding-8081] {}", String::from_utf8_lossy(&line));
                }
                _ => {}
            }
        }
    });

    // Spawn Generation Server (Port 8082)
    let gen_model = resource_path
        .join("model")
        .join("qwen2.5-1.5b-instruct-q4_k_m.gguf");
        //.join("gemma-2-2b-it-Q4_K_M.gguf");

    println!("Debug: Spawning Generation Server (Sidecar)...");
    let gen_sidecar = app.shell().sidecar("llama-server")
        .map_err(|e| format!("Failed to create generation sidecar: {}", e))?
        .args([
            "--model", gen_model.to_str().unwrap(),
            "--port", "8082",
            "-c", "8192",
            "-b", "8192",
            "-ub", "8192",
            "-np", "1",
            "-t", "2"//threads_str
        ]);

    let (mut rx_gen, child_gen) = gen_sidecar
        .spawn()
        .map_err(|e| format!("Failed to spawn generation server: {}", e))?;

    // Store generation child handle and mark as running
    {
        let state = app.state::<Mutex<SidecarState>>();
        let mut state = state.lock().unwrap();
        state.generation_child = Some(child_gen);
        state.is_running = true;
    }

    // Log generation server output
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        while let Some(event) = rx_gen.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    println!("[Generation-8082] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    println!("[Generation-8082] {}", String::from_utf8_lossy(&line));
                }
                _ => {}
            }
        }
    });

    println!("Debug: All sidecars spawned successfully");
    Ok(())
}

/// Stop all sidecars (called on logout or app exit)
pub fn stop_sidecars(app: &AppHandle) {
    println!("Debug: Stopping sidecars...");
    
    // Mark as not running
    {
        let state = app.state::<Mutex<SidecarState>>();
        let mut state = state.lock().unwrap();
        state.is_running = false;
        state.embedding_child = None;
        state.generation_child = None;
    }
    
    // Kill processes
    kill_orphans();
    println!("Debug: Sidecars stopped");
}
