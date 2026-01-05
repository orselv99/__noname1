use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
  // 1. Copy sidecar executable to src-tauri/bin BEFORE tauri_build::build()
  let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
  let source_dir = manifest_dir.join("../../client-ai-service");
  let bin_dir = manifest_dir.join("bin");

  if !bin_dir.exists() {
    let _ = fs::create_dir_all(&bin_dir);
  }

  // Determine target triple (simplification for Windows x64 per user OS)
  let target_triple = "x86_64-pc-windows-msvc";
  let exe_name = "llama-server.exe";
  let sidecar_name = format!("llama-server-{}.exe", target_triple);

  let src_exe = source_dir.join(exe_name);
  let dest_exe = bin_dir.join(sidecar_name);

  if src_exe.exists() {
    let should_copy = if dest_exe.exists() {
      let src_len = fs::metadata(&src_exe).map(|m| m.len()).unwrap_or(0);
      let dest_len = fs::metadata(&dest_exe).map(|m| m.len()).unwrap_or(0);
      src_len != dest_len
    } else {
      true
    };

    if should_copy {
      if let Err(e) = fs::copy(&src_exe, &dest_exe) {
        println!(
          "cargo:warning=Failed to copy sidecar to bin (likely locked): {}",
          e
        );
      } else {
        println!("cargo:warning=Copied sidecar to {:?}", dest_exe);
      }
    }
  } else {
    println!(
      "cargo:warning=Sidecar executable not found at {:?}",
      src_exe
    );
  }

  // 2. Run Tauri Build
  tauri_build::build();

  // 3. Copy DLLs and Model folder to TARGET directory for runtime
  let profile = env::var("PROFILE").unwrap_or_else(|_| "debug".to_string());
  let target_dir = manifest_dir.join("target").join(&profile);

  if !target_dir.exists() {
    let _ = fs::create_dir_all(&target_dir);
  }

  // Copy DLLs
  if let Ok(entries) = fs::read_dir(&source_dir) {
    for entry in entries.flatten() {
      let path = entry.path();
      if let Some(extension) = path.extension() {
        if extension == "dll" {
          let file_name = path.file_name().unwrap();
          let dest_path = target_dir.join(file_name);
          // Use copy, ignore error if locked (DLLs in use by running app)
          if let Err(e) = fs::copy(&path, &dest_path) {
            println!("cargo:warning=Failed to copy DLL (likely in use): {}", e);
          } else {
            // println!("cargo:warning=Copied {} to {:?}", file_name.to_string_lossy(), dest_path);
          }
        }
      }
    }
  }

  // Copy Model Directory
  let model_source = source_dir.join("model");
  let model_dest = target_dir.join("model");

  if model_source.exists() {
    if !model_dest.exists() {
      let _ = fs::create_dir_all(&model_dest);
    }

    if let Ok(entries) = fs::read_dir(&model_source) {
      for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
          let file_name = path.file_name().unwrap();
          let dest_path = model_dest.join(file_name);
          if let Err(_e) = fs::copy(&path, &dest_path) {
            // println!("cargo:warning=Failed to copy model file: {}", _e);
          }
        }
      }
    }
    println!("cargo:warning=Copied model directory to {:?}", model_dest);
  } else {
    println!(
      "cargo:warning=Model source directory not found: {:?}",
      model_source
    );
  }
}
