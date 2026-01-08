// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::sync::Mutex;
use tauri::Manager;

pub mod commands;
pub mod crypto;
pub mod database;
pub mod sidecar;

#[tauri::command]
fn greet(name: &str) -> String {
  format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_shell::init())
    .manage(Mutex::new(commands::auth::AuthState::default()))
    .manage(Mutex::new(sidecar::SidecarState::default()))
    .manage(Mutex::new(database::DatabaseState::default()))
    .invoke_handler(tauri::generate_handler![
      greet,
      commands::ai::extract_info,
      commands::auth::login,
      commands::auth::lookup_tenants,
      commands::auth::get_saved_tenant,
      commands::auth::clear_saved_tenant,
      commands::auth::change_password,
      commands::auth::logout,
      commands::documents::save_document,
      commands::documents::list_documents,
      commands::documents::get_document
    ])
    .setup(|app| {
      // Kill any existing sidecar processes to prevent orphans on startup
      sidecar::kill_orphans();

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

      // Note: Sidecars are now spawned after successful login, not at app startup
      println!("Debug: App started. Sidecars will spawn after login.");
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|_app_handle, event| {
      if let tauri::RunEvent::Exit = event {
        println!("Debug: App exiting, killing sidecars...");
        sidecar::kill_orphans();
        println!("Debug: Killed sidecars via taskkill");
      }
    });
}
