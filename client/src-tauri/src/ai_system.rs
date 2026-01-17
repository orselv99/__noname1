use futures_util::StreamExt;
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, System};
use tauri::{AppHandle, Emitter, Manager, Runtime};

#[derive(serde::Serialize, Clone)]
struct DownloadProgress {
  model_id: String,
  file: String,
  downloaded: u64,
  total: Option<u64>,
  status: String,
}

#[derive(serde::Serialize)]
pub struct SystemInfo {
  cpu_cores: usize,
  total_memory_mb: u64,
  used_memory_mb: u64,
  cpu_usage_percent: f32,
}

#[tauri::command]
pub fn get_system_info() -> SystemInfo {
  let mut sys = System::new_all();
  sys.refresh_cpu_specifics(CpuRefreshKind::everything());
  sys.refresh_memory_specifics(MemoryRefreshKind::everything());

  // Simple wait to get CPU usage reading if needed, but for instantaneous snap:
  // sys.refresh_cpu(); // Refresh again to get usage calc change?
  // Usually usage needs a delta. We'll just return static info + current load if available.

  let total_memory = sys.total_memory() / 1024 / 1024;
  let used_memory = sys.used_memory() / 1024 / 1024;
  let cpu_cores = sys.cpus().len();
  let cpu_usage = sys.global_cpu_info().cpu_usage();

  SystemInfo {
    cpu_cores,
    total_memory_mb: total_memory,
    used_memory_mb: used_memory,
    cpu_usage_percent: cpu_usage,
  }
}

#[tauri::command]
pub async fn check_model_exists(app: AppHandle, model_path: String) -> Result<bool, String> {
  let app_data_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
  let path = app_data_dir.join("models").join(&model_path);
  let exists = path.exists();
  println!("Debug: check_model_exists for {} -> {}", model_path, exists);
  Ok(exists)
}

#[tauri::command]
pub async fn download_model_file(
  app: AppHandle,
  url: String,
  relative_path: String,
  model_id: String, // for event grouping
) -> Result<String, String> {
  let app_data_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
  let dest_path = app_data_dir.join("models").join(&relative_path);

  if let Some(parent) = dest_path.parent() {
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }

  // Check if file exists and size matches? For now just overwrite or simple check
  // We will simple overwrite for robustness if requested

  let client = reqwest::Client::new();
  let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
  let total_size = res.content_length();

  if !res.status().is_success() {
    return Err(format!("Failed to download {}: {}", url, res.status()));
  }

  let mut file = File::create(&dest_path).map_err(|e| e.to_string())?;
  let mut stream = res.bytes_stream();
  let mut downloaded: u64 = 0;

  while let Some(item) = stream.next().await {
    let chunk = item.map_err(|e| e.to_string())?;
    file.write_all(&chunk).map_err(|e| e.to_string())?;
    downloaded += chunk.len() as u64;

    // Emit progress
    let _ = app.emit(
      "model-download-progress",
      DownloadProgress {
        model_id: model_id.clone(),
        file: relative_path.clone(),
        downloaded,
        total: total_size,
        status: "downloading".to_string(),
      },
    );
  }

  let _ = app.emit(
    "model-download-progress",
    DownloadProgress {
      model_id: model_id.clone(),
      file: relative_path.clone(),
      downloaded,
      total: total_size,
      status: "complete".to_string(),
    },
  );

  Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn read_model_file(app: AppHandle, relative_path: String) -> Result<Vec<u8>, String> {
  let app_data_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
  let file_path = app_data_dir.join("models").join(&relative_path);

  // Security check: ensure strictly inside models dir?
  // Basic join prevents traversal if relative_path is clean, but checking components is better.
  // For now trust the relative_path is constructed by our trusted frontend code (ID/filename).

  println!("Debug: Reading model file: {:?}", file_path);
  std::fs::read(file_path).map_err(|e| e.to_string())
}
