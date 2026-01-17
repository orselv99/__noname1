// Sidecar management module - Disabled for Server-Side AI
use tauri::AppHandle;

/// State stub
pub struct SidecarState;

impl Default for SidecarState {
  fn default() -> Self {
    Self
  }
}

/// Kill any orphan llama-server processes (cross-platform)
pub fn kill_orphans() {
  // Disabled
}

/// Spawn the llama-server sidecars (Disabled)
pub fn spawn_sidecars(_app: &AppHandle) -> Result<(), String> {
  println!("Debug: Sidecars disabled (Server-Side AI active)");
  Ok(())
}

/// Stop all sidecars (Disabled)
pub fn stop_sidecars(_app: &AppHandle) {
  // Disabled
}
