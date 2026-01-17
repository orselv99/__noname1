// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::sync::Mutex;
use tauri::Manager;

pub mod ai_system;
pub mod commands;
pub mod config;
pub mod crypto;
pub mod database;
pub mod text_processor;

#[tauri::command]
fn greet(name: &str) -> String {
  format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_shell::init())
    .register_uri_scheme_protocol("model", |_app, request| {
      let uri = request.uri().to_string();

      // Handle both standard scheme and Windows http://<scheme>.localhost format
      // IMPORTANT: WebView2 on Windows converts `http://model.localhost/` to `model://localhost/` in the protocol handler.
      // We must strip `model://localhost/` specifically to avoid "localhost" becoming part of the path.
      let clean_path = if let Some(p) = uri.strip_prefix("http://model.localhost/") {
        p
      } else if let Some(p) = uri.strip_prefix("model://localhost/") {
        p
      } else if let Some(p) = uri.strip_prefix("model://") {
        p
      } else {
        &uri
      };

      // Remove query params and decode percent-encoding
      let path_str = clean_path.split('?').next().unwrap_or(&clean_path);
      let decoded_path = urlencoding::decode(path_str).expect("UTF-8").to_string();

      // Sanitization: Remove leading slash to ensure it's treated as relative by join
      let relative_path = decoded_path.trim_start_matches('/');

      // Windows path normalization: replace / with \
      let relative_path = relative_path.replace('/', std::path::MAIN_SEPARATOR_STR);

      // Security: prevent traversal ..
      if relative_path.contains("..") {
        return tauri::http::Response::builder()
          .status(403)
          .header("Access-Control-Allow-Origin", "*")
          .body(Vec::new())
          .unwrap();
      }

      // Use `_app.app_handle()` to get the handle, then resolve path.
      let app_data = _app.app_handle().path().app_local_data_dir().unwrap();
      let file_path = app_data.join("models").join(relative_path);

      // Serve file
      if file_path.exists() {
        let mut content = std::fs::read(&file_path).unwrap_or_default();
        let mime_type = if file_path.extension().map_or(false, |e| e == "json") {
          "application/json"
        } else if file_path.extension().map_or(false, |e| e == "onnx") {
          "application/octet-stream"
        } else {
          "text/plain"
        };

        tauri::http::Response::builder()
          .header("Access-Control-Allow-Origin", "*") // Important for fetch
          .header("Content-Type", mime_type)
          .body(content)
          .unwrap()
      } else {
        let error_msg = format!("File not found: {:?}\nURI: {}", file_path, uri);
        println!("Debug: {}", error_msg);
        tauri::http::Response::builder()
          .status(404)
          .header("Access-Control-Allow-Origin", "*") // CORS header needed even for errors
          .body(error_msg.as_bytes().to_vec())
          .unwrap()
      }
    })
    .manage(Mutex::new(commands::auth::AuthState::default()))
    .manage(Mutex::new(database::DatabaseState::default()))
    .invoke_handler(tauri::generate_handler![
      greet,
      ai_system::get_system_info,
      ai_system::check_model_exists,
      ai_system::download_model_file,
      ai_system::read_model_file,
      commands::ai::extract_info,
      commands::ai::save_embedding,
      commands::ai::save_tags,
      commands::ai::process_text,
      commands::auth::login,
      commands::auth::lookup_tenants,
      commands::auth::get_saved_tenant,
      commands::auth::clear_saved_tenant,
      commands::auth::change_password,
      commands::auth::logout,
      commands::documents::save_document,
      commands::documents::list_documents,
      commands::documents::get_document,
      commands::documents::delete_document,
      commands::documents::restore_document,
      commands::documents::empty_recycle_bin,
      commands::media::download_image,
      commands::media::read_local_file_as_data_url,
      commands::rag::ask_ai,
      commands::rag::create_new_chat,
      commands::rag::get_rag_chats,
      commands::rag::get_rag_messages,
      commands::rag::delete_rag_chat,
      commands::rag::update_rag_chat_title
    ])
    .setup(|app| {
      // Initialize SQLite database for offline support
      match database::init_database(&app.handle()) {
        Ok(conn) => {
          let db_state = app.state::<Mutex<database::DatabaseState>>();
          let mut state = db_state.lock().unwrap();
          state.conn = Some(conn);
          println!("Debug: SQLite database initialized");
        }
        Err(e) => {
          println!("Warning: Failed to initialize database: {}", e);
        }
      }
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|_app_handle, event| {
      // App exit handling can remain empty if no cleanup needed
    });
}
