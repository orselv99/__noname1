use crate::import;
use std::path::Path;
use tauri::command;

#[command]
pub fn import_file(path: String) -> Result<String, String> {
  let path_obj = Path::new(&path);
  let extension = path_obj
    .extension()
    .and_then(|e| e.to_str())
    .map(|s| s.to_lowercase())
    .unwrap_or_default();

  match extension.as_str() {
    "docx" | "pptx" | "xlsx" => import::msoffice::import_to_markdown(path_obj)
      .map_err(|e| format!("Office Import Failed: {}", e)),
    "hwp" => {
      import::hwp::import_to_markdown(path_obj).map_err(|e| format!("HWP Import Failed: {}", e))
    }
    _ => Err(format!("Unsupported file extension: {}", extension)),
  }
}
