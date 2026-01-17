// Server configuration with obfuscated URLs
// To change URLs for production, update the plaintext values and regenerate the XOR'd bytes

/// XOR key for simple obfuscation (not cryptographically secure, but hides from casual viewing)
const XOR_KEY: &[u8] = b"fiery-horizon-2024";

/// XOR decrypt helper
fn xor_decrypt(encrypted: &[u8]) -> String {
  encrypted
    .iter()
    .enumerate()
    .map(|(i, &b)| b ^ XOR_KEY[i % XOR_KEY.len()])
    .map(|b| b as char)
    .collect()
}

// Pre-computed XOR encrypted URLs
// Original: "http://localhost:8080"
const API_URL_ENCRYPTED: &[u8] = &[
  0x0e, 0x1d, 0x11, 0x02, 0x43, 0x02, 0x47, 0x03, 0x1d, 0x0a, 0x1b, 0x03, 0x06, 0x42, 0x41, 0x44,
  0x08, 0x0c, 0x56, 0x51, 0x55,
];

// Original: "http://localhost:8081"
const EMBEDDING_URL_ENCRYPTED: &[u8] = &[
  0x0e, 0x1d, 0x11, 0x02, 0x43, 0x02, 0x47, 0x03, 0x1d, 0x0a, 0x1b, 0x03, 0x06, 0x42, 0x41, 0x44,
  0x08, 0x0c, 0x56, 0x51, 0x54,
];

// Original: "http://localhost:8082"
const COMPLETION_URL_ENCRYPTED: &[u8] = &[
  0x0e, 0x1d, 0x11, 0x02, 0x43, 0x02, 0x47, 0x03, 0x1d, 0x0a, 0x1b, 0x03, 0x06, 0x42, 0x41, 0x44,
  0x08, 0x0c, 0x56, 0x51, 0x57,
];

/// Get the API gateway URL
pub fn get_api_url() -> String {
  "http://localhost:8080".to_string()
}

/// Get the embedding server URL (Routed via Gateway)
pub fn get_embedding_url() -> String {
  "http://localhost:8080/api/v1".to_string()
}

/// Get the completion server URL (Routed via Gateway)
pub fn get_completion_url() -> String {
  "http://localhost:8080/api/v1".to_string()
}

// ============================================================================
// Helper to generate encrypted bytes (for development use)
// Run with: cargo test -- --nocapture generate_encrypted_urls
// ============================================================================
#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn generate_encrypted_urls() {
    let urls = [
      "http://localhost:8080",
      "http://localhost:8081",
      "http://localhost:8082",
    ];

    for url in urls {
      let encrypted: Vec<u8> = url
        .bytes()
        .enumerate()
        .map(|(i, b)| b ^ XOR_KEY[i % XOR_KEY.len()])
        .collect();

      println!("// Original: \"{}\"", url);
      print!("const XXX_ENCRYPTED: &[u8] = &[");
      for (i, b) in encrypted.iter().enumerate() {
        if i > 0 {
          print!(", ");
        }
        if i % 16 == 0 && i > 0 {
          print!("\n    ");
        }
        print!("0x{:02x}", b);
      }
      println!("];");
      println!();
    }
  }

  #[test]
  fn test_decrypt() {
    assert_eq!(get_api_url(), "http://localhost:8080");
    assert_eq!(get_embedding_url(), "http://localhost:8081");
    assert_eq!(get_completion_url(), "http://localhost:8082");
  }
}
