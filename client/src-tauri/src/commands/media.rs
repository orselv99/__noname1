// Media commands for downloading and embedding external resources
use base64::{engine::general_purpose::STANDARD, Engine};

/// Download an image from URL and return as base64 data URL
#[tauri::command]
pub async fn download_image(url: String) -> Result<String, String> {
  // Skip if already a data URL
  if url.starts_with("data:") {
    return Ok(url);
  }

  let client = reqwest::Client::builder()
    .timeout(std::time::Duration::from_secs(30))
    .build()
    .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

  let response = client
    .get(&url)
    .header(
      "User-Agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    )
    .send()
    .await
    .map_err(|e| format!("Failed to download image: {}", e))?;

  if !response.status().is_success() {
    return Err(format!("HTTP error: {}", response.status()));
  }

  // Get content type from header or guess from URL
  let content_type = response
    .headers()
    .get("content-type")
    .and_then(|h| h.to_str().ok())
    .map(|s| s.split(';').next().unwrap_or(s).trim().to_string())
    .unwrap_or_else(|| guess_mime_from_url(&url));

  // Validate it's an image
  if !content_type.starts_with("image/") {
    return Err(format!("Not an image: {}", content_type));
  }

  let bytes = response
    .bytes()
    .await
    .map_err(|e| format!("Failed to read image data: {}", e))?;

  // Convert to base64 data URL
  let base64_data = STANDARD.encode(&bytes);
  let data_url = format!("data:{};base64,{}", content_type, base64_data);

  Ok(data_url)
}

/// Read a local file and return as base64 data URL
#[tauri::command]
pub async fn read_local_file_as_data_url(path: String) -> Result<String, String> {
  use std::fs;
  use std::path::Path;

  let file_path = Path::new(&path);

  if !file_path.exists() {
    return Err("File not found".to_string());
  }

  // Get MIME type from extension
  let extension = file_path
    .extension()
    .and_then(|e| e.to_str())
    .unwrap_or("")
    .to_lowercase();

  let mime_type = match extension.as_str() {
    "jpg" | "jpeg" => "image/jpeg",
    "png" => "image/png",
    "gif" => "image/gif",
    "webp" => "image/webp",
    "svg" => "image/svg+xml",
    "bmp" => "image/bmp",
    "ico" => "image/x-icon",
    "mp4" => "video/mp4",
    "webm" => "video/webm",
    "mp3" => "audio/mpeg",
    "wav" => "audio/wav",
    "ogg" => "audio/ogg",
    _ => return Err(format!("Unsupported file type: {}", extension)),
  };

  let bytes = fs::read(file_path).map_err(|e| format!("Failed to read file: {}", e))?;

  let base64_data = STANDARD.encode(&bytes);
  let data_url = format!("data:{};base64,{}", mime_type, base64_data);

  Ok(data_url)
}

/// Guess MIME type from URL extension
fn guess_mime_from_url(url: &str) -> String {
  let url_lower = url.to_lowercase();

  if url_lower.contains(".jpg") || url_lower.contains(".jpeg") {
    "image/jpeg".to_string()
  } else if url_lower.contains(".png") {
    "image/png".to_string()
  } else if url_lower.contains(".gif") {
    "image/gif".to_string()
  } else if url_lower.contains(".webp") {
    "image/webp".to_string()
  } else if url_lower.contains(".svg") {
    "image/svg+xml".to_string()
  } else if url_lower.contains(".bmp") {
    "image/bmp".to_string()
  } else {
    // Default to JPEG for unknown types
    "image/jpeg".to_string()
  }
}
