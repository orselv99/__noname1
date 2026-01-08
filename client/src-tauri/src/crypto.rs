use aes_gcm::{
  aead::{Aead, KeyInit},
  Aes256Gcm, Nonce,
};
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

/// Derive a 256-bit key from user_id using SHA-256
pub fn derive_key(user_id: &str) -> [u8; 32] {
  let mut hasher = Sha256::new();
  hasher.update(user_id.as_bytes());
  hasher.finalize().into()
}

/// Encrypt text using AES-256-GCM with user_id derived key
pub fn encrypt_content(user_id: &str, plaintext: &str) -> Result<Vec<u8>, String> {
  let key = derive_key(user_id);
  let cipher =
    Aes256Gcm::new_from_slice(&key).map_err(|e| format!("Failed to create cipher: {}", e))?;

  // Generate random nonce (12 bytes)
  let nonce_bytes = generate_nonce();
  let nonce = Nonce::from_slice(&nonce_bytes);

  let ciphertext = cipher
    .encrypt(nonce, plaintext.as_bytes())
    .map_err(|e| format!("Encryption failed: {}", e))?;

  // Prepend nonce to ciphertext for later decryption
  let mut result = nonce_bytes.to_vec();
  result.extend(ciphertext);
  Ok(result)
}

/// Decrypt content using AES-256-GCM with user_id derived key
pub fn decrypt_content(user_id: &str, encrypted: &[u8]) -> Result<String, String> {
  if encrypted.len() < 12 {
    return Err("Invalid encrypted data".to_string());
  }

  let key = derive_key(user_id);
  let cipher =
    Aes256Gcm::new_from_slice(&key).map_err(|e| format!("Failed to create cipher: {}", e))?;

  let nonce = Nonce::from_slice(&encrypted[..12]);
  let ciphertext = &encrypted[12..];

  let plaintext = cipher
    .decrypt(nonce, ciphertext)
    .map_err(|e| format!("Decryption failed: {}", e))?;

  String::from_utf8(plaintext).map_err(|e| format!("Invalid UTF-8: {}", e))
}

fn generate_nonce() -> [u8; 12] {
  let mut result = [0u8; 12];
  let seed = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap()
    .as_nanos();

  for (i, byte) in result.iter_mut().enumerate() {
    *byte = ((seed >> (i * 8)) & 0xFF) as u8;
  }
  result
}
