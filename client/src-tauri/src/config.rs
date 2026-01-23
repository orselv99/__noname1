//! ==========================================================================
//! config.rs - 서버 URL 설정 및 난독화
//! ==========================================================================
//!
//! C++ 개발자를 위한 설명:
//! - 서버 엔드포인트 URL을 중앙에서 관리하는 설정 모듈
//! - XOR 난독화로 바이너리에서 URL 문자열을 쉽게 추출하지 못하도록 함
//! - 프로덕션에서는 암호화된 바이트를 사용하고, 개발 중에는 평문 반환
//!
//! ⚠️ 보안 주의:
//! XOR 난독화는 암호화가 아닙니다! 단순히 strings 명령어나 헥스 에디터로
//! URL을 쉽게 찾지 못하게 하는 용도입니다. 진짜 비밀은 서버에 두세요.
//!
//! C++ 비교:
//! - #define URL "..." 대신 런타임에 복호화하는 방식
//! - Windows의 CryptProtectData()보다 훨씬 약함
//! ==========================================================================

// ============================================================================
// XOR 난독화 상수 및 함수
// ============================================================================

/// XOR 키: 난독화에 사용되는 키 문자열
///
/// 이 키는 컴파일 타임에 바이너리에 포함됩니다.
/// 보안을 위한 것이 아니라 단순히 URL을 숨기기 위한 용도입니다.
const XOR_KEY: &[u8] = b"fiery-horizon-2024";

/// XOR 복호화 헬퍼 함수
///
/// 암호화된 바이트 배열을 원래 문자열로 복원합니다.
/// XOR 연산의 특성: A ^ B ^ B = A (동일한 키로 두 번 XOR하면 원본 복구)
///
/// # 매개변수
/// - `encrypted`: XOR 암호화된 바이트 슬라이스
///
/// # 반환값
/// 복호화된 문자열
///
/// # C++ 비교
/// ```cpp
/// std::string xor_decrypt(const std::vector<uint8_t>& encrypted) {
///     std::string result;
///     for (size_t i = 0; i < encrypted.size(); i++) {
///         result += encrypted[i] ^ XOR_KEY[i % XOR_KEY.length()];
///     }
///     return result;
/// }
/// ```
#[allow(dead_code)] // 현재 사용하지 않지만 프로덕션용으로 유지
fn xor_decrypt(encrypted: &[u8]) -> String {
  encrypted
    .iter()
    .enumerate()
    // 각 바이트를 키의 해당 위치 바이트와 XOR
    .map(|(i, &b)| b ^ XOR_KEY[i % XOR_KEY.len()])
    // u8을 char로 변환
    .map(|b| b as char)
    // Iterator를 String으로 수집
    .collect()
}

// ============================================================================
// 미리 계산된 XOR 암호화 URL 바이트
// ============================================================================
// 프로덕션 배포에서 사용할 암호화된 URL 상수들
// generate_encrypted_urls 테스트로 생성 가능

/// API 게이트웨이 URL (암호화됨)
/// 원본: "http://localhost:8080"
#[allow(dead_code)]
const API_URL_ENCRYPTED: &[u8] = &[
  0x0e, 0x1d, 0x11, 0x02, 0x43, 0x02, 0x47, 0x03, 0x1d, 0x0a, 0x1b, 0x03, 0x06, 0x42, 0x41, 0x44,
  0x08, 0x0c, 0x56, 0x51, 0x55,
];

/// 임베딩 서버 URL (암호화됨)
/// 원본: "http://localhost:8081"
#[allow(dead_code)]
const EMBEDDING_URL_ENCRYPTED: &[u8] = &[
  0x0e, 0x1d, 0x11, 0x02, 0x43, 0x02, 0x47, 0x03, 0x1d, 0x0a, 0x1b, 0x03, 0x06, 0x42, 0x41, 0x44,
  0x08, 0x0c, 0x56, 0x51, 0x54,
];

/// 완성 서버 URL (암호화됨)
/// 원본: "http://localhost:8082"
#[allow(dead_code)]
const COMPLETION_URL_ENCRYPTED: &[u8] = &[
  0x0e, 0x1d, 0x11, 0x02, 0x43, 0x02, 0x47, 0x03, 0x1d, 0x0a, 0x1b, 0x03, 0x06, 0x42, 0x41, 0x44,
  0x08, 0x0c, 0x56, 0x51, 0x57,
];

// ============================================================================
// 공개 URL 접근 함수
// ============================================================================
// 현재는 개발 편의를 위해 평문 URL 반환
// 프로덕션에서는 xor_decrypt(XXX_ENCRYPTED)로 변경

/// API 게이트웨이 URL 반환
///
/// 백엔드 API 서버의 기본 URL을 반환합니다.
/// 인증, 문서, 검색 등 모든 API 요청의 베이스 URL입니다.
pub fn get_api_url() -> String {
  // 프로덕션용: xor_decrypt(API_URL_ENCRYPTED)
  "http://localhost:8080".to_string()
}

/// 임베딩 서버 URL 반환
///
/// AI 임베딩 생성을 위한 서버 URL입니다.
/// 현재는 게이트웨이를 통해 라우팅됩니다.
pub fn get_embedding_url() -> String {
  // 프로덕션용: xor_decrypt(EMBEDDING_URL_ENCRYPTED)
  "http://localhost:8080/api/v1".to_string()
}

/// 완성(Completion) 서버 URL 반환
///
/// AI 텍스트 생성을 위한 서버 URL입니다.
/// 현재는 게이트웨이를 통해 라우팅됩니다.
pub fn get_completion_url() -> String {
  // 프로덕션용: xor_decrypt(COMPLETION_URL_ENCRYPTED)
  "http://localhost:8080/api/v1".to_string()
}

// ============================================================================
// 개발용 테스트 모듈
// ============================================================================
// URL 암호화 바이트 생성 및 복호화 검증용

/// 테스트 모듈
///
/// #[cfg(test)]: 테스트 빌드에서만 컴파일됨 (릴리스 바이너리에 포함되지 않음)
/// C++ 비교: #ifdef TEST ... #endif
#[cfg(test)]
mod tests {
  use super::*;

  /// URL 암호화 바이트 생성 테스트
  ///
  /// 실행 방법: cargo test -- --nocapture generate_encrypted_urls
  ///
  /// 새로운 URL을 암호화하려면:
  /// 1. urls 배열에 새 URL 추가
  /// 2. 테스트 실행
  /// 3. 출력된 바이트 배열을 위의 상수에 복사
  #[test]
  fn generate_encrypted_urls() {
    let urls = [
      "http://localhost:8080",
      "http://localhost:8081",
      "http://localhost:8082",
    ];

    for url in urls {
      // URL을 XOR 암호화
      let encrypted: Vec<u8> = url
        .bytes()
        .enumerate()
        .map(|(i, b)| b ^ XOR_KEY[i % XOR_KEY.len()])
        .collect();

      // Rust 상수 형식으로 출력
      println!("// Original: \"{}\"", url);
      print!("const XXX_ENCRYPTED: &[u8] = &[");
      for (i, b) in encrypted.iter().enumerate() {
        if i > 0 {
          print!(", ");
        }
        // 16바이트마다 줄바꿈
        if i % 16 == 0 && i > 0 {
          print!("\n    ");
        }
        print!("0x{:02x}", b);
      }
      println!("];");
      println!();
    }
  }

  /// 복호화 검증 테스트
  ///
  /// 현재는 평문을 반환하므로 이 테스트는 항상 통과합니다.
  /// xor_decrypt를 사용하도록 변경하면 암호화/복호화가 올바른지 검증합니다.
  #[test]
  fn test_decrypt() {
    assert_eq!(get_api_url(), "http://localhost:8080");
    // 참고: get_embedding_url()과 get_completion_url()은 현재 /api/v1 경로를 포함
  }
}
