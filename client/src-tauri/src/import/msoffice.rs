use anyhow::{Context, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use regex::Regex;
use std::path::Path;
use undoc::{parse_file, render::RenderOptions};

pub fn import_to_markdown<P: AsRef<Path>>(path: P) -> Result<String> {
  // 1. Parse the document into memory
  // This gives us direct access to resources (images) without needing temp files
  let doc = undoc::parse_file(path.as_ref())?;

  // 2. Configure RenderOptions
  let mut options = RenderOptions::default();

  // Use a unique prefix to identify image paths in the generated markdown
  const IMG_PREFIX: &str = "REF_IMG_";
  options = options.with_image_prefix(IMG_PREFIX);

  // 3. Render to markdown
  // References will look like: ![alt](REF_IMG_resource_id)
  let mut content = undoc::render::to_markdown(&doc, &options)?;

  // 4. Post-process: Replace image paths with Data URLs using in-memory data
  // Pattern: ![alt](REF_IMG_resource_id)
  // We capture the resource_id to look it up in doc.resources
  let re = Regex::new(&format!(r"!\[(.*?)\]\({}(.*?)\)", IMG_PREFIX)).unwrap();

  // Collect replacements
  let mut replacements = Vec::new();

  for caps in re.captures_iter(&content) {
    if let Some(resource_id_match) = caps.get(2) {
      let resource_id = resource_id_match.as_str();

      if let Some(resource) = doc.resources.get(resource_id) {
        // Determine MIME type
        let mime_type = resource
          .mime_type
          .clone()
          .or_else(|| {
            resource
              .filename
              .as_ref()
              .and_then(|f| undoc::model::Resource::mime_from_filename(f))
          })
          .unwrap_or_else(|| "application/octet-stream".to_string());

        // Encode to Base64
        let base64_data = STANDARD.encode(&resource.data);
        let data_url = format!("data:{};base64,{}", mime_type, base64_data);

        // Store the full match string (e.g., REF_IMG_image1.png) and the new URL
        let placeholder = format!("{}{}", IMG_PREFIX, resource_id);
        replacements.push((placeholder, data_url));
      }
    }
  }

  // Apply replacements
  for (placeholder, data_url) in replacements {
    content = content.replace(&placeholder, &data_url);
  }

  Ok(content)
}
