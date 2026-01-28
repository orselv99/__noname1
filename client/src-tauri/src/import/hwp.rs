use anyhow::Result;
use std::path::Path;

pub fn import_to_markdown<P: AsRef<Path>>(path: P) -> Result<String> {
  // hwpers usage: typically reads file and converts to model, then text.
  let hwp = hwpers::HwpReader::from_file(path)?;

  // Use the built-in text extraction method
  Ok(hwp.extract_text())
}
