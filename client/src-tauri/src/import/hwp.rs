use anyhow::{Context, Result};
use std::fs;
use std::path::Path;

pub fn import_to_markdown<P: AsRef<Path>>(path: P) -> Result<String> {
  // Read the entire file into memory first to avoid potential file handle issues
  // and ensure we have the full content before parsing.
  let bytes = fs::read(path.as_ref()).context("Failed to read HWP file from disk")?;

  // Check magic bytes
  if bytes.len() >= 8 {
    // Check for OLE signature (HWP 5.0)
    // D0 CF 11 E0 A1 B1 1A E1
    let ole_magic = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];

    // Check for Zip signature (HWPX)
    // 50 4B 03 04
    let zip_magic = [0x50, 0x4B, 0x03, 0x04];

    if bytes.starts_with(&zip_magic) {
      return Err(anyhow::anyhow!(
        "HWPX (open XML) files are not currently supported. Please save as HWP 5.0 format."
      ));
    }

    if !bytes.starts_with(&ole_magic) {
      return Err(anyhow::anyhow!(
        "Invalid HWP file format: Missing OLE signature."
      ));
    }
  }

  // Parse using official usage pattern (from_file)
  let document = match hwpers::HwpReader::from_file(path.as_ref()) {
    Ok(doc) => doc,
    Err(e) => {
      let err_str = e.to_string();
      if err_str.contains("failed to fill whole buffer") {
        return Err(anyhow::anyhow!("HWP Import Failed: The file content appears to be truncated or damaged (IO error: prematurely ended)."));
      } else {
        return Err(anyhow::anyhow!("HWP Import Failed: {}", e));
      }
    }
  };

  // Extract text manually (as requested)
  let mut text_output = String::new();

  // Iterate through sections and paragraphs
  for section in document.sections() {
    for paragraph in &section.paragraphs {
      if let Some(text) = &paragraph.text {
        text_output.push_str(&text.content);
        text_output.push('\n');
      }
    }
    text_output.push_str("\n---\n\n");
  }

  Ok(text_output)
}
