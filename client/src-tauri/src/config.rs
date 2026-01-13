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
  0x0e, 0x05, 0x01, 0x10, 0x36, 0x66, 0x66, 0x04, 0x10, 0x0b, 0x05, 0x0f, 0x07, 0x18, 0x09, 0x35,
  0x43, 0x55, 0x42, 0x50,
];

// Original: "http://localhost:8081"
const EMBEDDING_URL_ENCRYPTED: &[u8] = &[
  0x0e, 0x05, 0x01, 0x10, 0x36, 0x66, 0x66, 0x04, 0x10, 0x0b, 0x05, 0x0f, 0x07, 0x18, 0x09, 0x35,
  0x43, 0x55, 0x42, 0x51,
];

// Original: "http://localhost:8082"
const COMPLETION_URL_ENCRYPTED: &[u8] = &[
  0x0e, 0x05, 0x01, 0x10, 0x36, 0x66, 0x66, 0x04, 0x10, 0x0b, 0x05, 0x0f, 0x07, 0x18, 0x09, 0x35,
  0x43, 0x55, 0x42, 0x52,
];

/// Get the API gateway URL
pub fn get_api_url() -> String {
  xor_decrypt(API_URL_ENCRYPTED)
}

/// Get the embedding server URL
pub fn get_embedding_url() -> String {
  xor_decrypt(EMBEDDING_URL_ENCRYPTED)
}

/// Get the completion server URL
pub fn get_completion_url() -> String {
  xor_decrypt(COMPLETION_URL_ENCRYPTED)
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
      "http://192.168.0.168:8080",
      "http://192.168.0.168:8081",
      "http://192.168.0.168:8082",
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
