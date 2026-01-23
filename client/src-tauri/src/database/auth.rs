//! ==========================================================================
//! auth.rs - 사용자 캐시 및 비밀번호 관리 (users 테이블)
//! ==========================================================================
//!
//! 오프라인 로그인을 위한 사용자 정보 캐싱 및 비밀번호 해싱/검증
//! ==========================================================================

use bcrypt::{hash, verify};
use rusqlite::{Connection, Result as SqliteResult};

// ============================================================================
// 상수 정의
// ============================================================================

/// bcrypt 해시 비용 (Go의 bcrypt.DefaultCost와 동일)
///
/// 비용이 높을수록 안전하지만 느림 (10 = ~100ms)
const BCRYPT_COST: u32 = 10;

// ============================================================================
// 비밀번호 해싱 함수
// ============================================================================

/// bcrypt로 비밀번호 해싱
///
/// Go 서버의 bcrypt.DefaultCost와 호환되도록 cost=10 사용
///
/// # 매개변수
/// - `password`: 평문 비밀번호
///
/// # 반환값
/// bcrypt 해시 문자열 (예: "$2b$10$...")
///
/// # 참고
/// - Rust bcrypt: $2b prefix
/// - Go bcrypt: $2a prefix
/// - 둘 다 상호 검증 가능
pub fn hash_password(password: &str) -> Result<String, String> {
  hash(password, BCRYPT_COST).map_err(|e| format!("비밀번호 해싱 실패: {}", e))
}

/// 비밀번호 검증
///
/// 저장된 해시와 입력 비밀번호 비교
///
/// # 매개변수
/// - `password`: 검증할 평문 비밀번호
/// - `stored_hash`: 저장된 bcrypt 해시
///
/// # 반환값
/// 일치하면 true, 아니면 false
pub fn verify_password(password: &str, stored_hash: &str) -> bool {
  verify(password, stored_hash).unwrap_or(false)
}

// ============================================================================
// 사용자 캐시 구조체
// ============================================================================

/// 캐시된 사용자 정보
///
/// 서버의 User 모델과 동일한 구조
/// 오프라인 로그인 및 사용자 정보 표시에 사용
///
/// #[derive(Debug, Clone)]:
/// - Debug: 디버그 출력 가능 ({:?} 포맷)
/// - Clone: 복사본 생성 가능
#[derive(Debug, Clone)]
pub struct CachedUser {
  pub id: String,
  pub email: String,
  pub password_hash: String,
  pub username: String,
  pub tenant_id: String,
  pub role: String,
  pub position_id: Option<String>,
  pub department_id: Option<String>,
  pub contact: Option<String>,
  pub birthday: Option<String>,
  pub phone_numbers: Option<String>,
  pub force_change_password: bool,
  pub created_at: Option<String>,
  pub updated_at: Option<String>,
}

// ============================================================================
// 사용자 캐시 함수
// ============================================================================

/// 사용자 정보 저장/업데이트 (온라인 로그인 후)
///
/// UPSERT 패턴: INSERT ... ON CONFLICT DO UPDATE
/// 이메일이 이미 있으면 업데이트, 없으면 삽입
///
/// # 매개변수
/// - `conn`: SQLite 연결
/// - `user`: 저장할 사용자 정보
/// - `plain_password`: 해싱할 평문 비밀번호
pub fn save_user(conn: &Connection, user: &CachedUser, plain_password: &str) -> Result<(), String> {
  let password_hash = hash_password(plain_password)?;

  conn
    .execute(
      "INSERT INTO users (
            id, email, password_hash, username, tenant_id, role,
            position_id, department_id,
            contact, birthday, phone_numbers, force_change_password,
            created_at, updated_at, last_login_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, CURRENT_TIMESTAMP)
        ON CONFLICT(email) DO UPDATE SET
            id = excluded.id,
            password_hash = excluded.password_hash,
            username = excluded.username,
            tenant_id = excluded.tenant_id,
            role = excluded.role,
            position_id = excluded.position_id,
            department_id = excluded.department_id,
            contact = excluded.contact,
            birthday = excluded.birthday,
            phone_numbers = excluded.phone_numbers,
            force_change_password = excluded.force_change_password,
            updated_at = excluded.updated_at,
            last_login_at = CURRENT_TIMESTAMP",
      rusqlite::params![
        user.id,
        user.email,
        password_hash,
        user.username,
        user.tenant_id,
        user.role,
        user.position_id,
        user.department_id,
        user.contact,
        user.birthday,
        user.phone_numbers,
        user.force_change_password as i32,
        user.created_at,
        user.updated_at,
      ],
    )
    .map_err(|e| format!("사용자 저장 실패: {}", e))?;

  println!(
    "Debug: 사용자 캐시됨: {} ({}) ID: {}",
    user.username, user.email, user.id
  );
  Ok(())
}

/// 오프라인 로그인 시도
///
/// 캐시된 자격 증명으로 로그인 검증
///
/// # 매개변수
/// - `conn`: SQLite 연결
/// - `email`: 로그인 이메일
/// - `password`: 입력 비밀번호
///
/// # 반환값
/// 성공 시 CachedUser, 실패 시 오류 메시지
pub fn verify_offline_login(
  conn: &Connection,
  email: &str,
  password: &str,
) -> Result<CachedUser, String> {
  let mut stmt = conn
    .prepare(
      "SELECT id, email, password_hash, username, tenant_id, role,
                position_id, department_id,
                contact, birthday, phone_numbers, force_change_password,
                created_at, updated_at
         FROM users WHERE email = ?1",
    )
    .map_err(|e| format!("쿼리 준비 실패: {}", e))?;

  let result: SqliteResult<CachedUser> = stmt.query_row([email], |row| {
    Ok(CachedUser {
      id: row.get(0)?,
      email: row.get(1)?,
      password_hash: row.get(2)?,
      username: row.get(3)?,
      tenant_id: row.get(4)?,
      role: row.get(5)?,
      position_id: row.get(6)?,
      department_id: row.get(7)?,
      contact: row.get(8)?,
      birthday: row.get(9)?,
      phone_numbers: row.get(10)?,
      force_change_password: row.get::<_, i32>(11)? != 0,
      created_at: row.get(12)?,
      updated_at: row.get(13)?,
    })
  });

  match result {
    Ok(user) => {
      if verify_password(password, &user.password_hash) {
        println!("Debug: 오프라인 로그인 성공: {}", email);
        Ok(user)
      } else {
        Err("잘못된 비밀번호".to_string())
      }
    }
    Err(_) => Err("오프라인 캐시에 사용자 없음".to_string()),
  }
}

/// 캐시된 비밀번호 업데이트 (비밀번호 변경 후)
///
/// 온라인에서 비밀번호 변경 성공 후 로컬 캐시도 업데이트
pub fn update_cached_password(
  conn: &Connection,
  email: &str,
  new_password: &str,
) -> Result<(), String> {
  let password_hash = hash_password(new_password)?;

  conn
    .execute(
      "UPDATE users SET password_hash = ?1, force_change_password = 0, 
         updated_at = CURRENT_TIMESTAMP WHERE email = ?2",
      rusqlite::params![password_hash, email],
    )
    .map_err(|e| format!("비밀번호 업데이트 실패: {}", e))?;

  println!("Debug: 캐시된 비밀번호 업데이트됨: {}", email);
  Ok(())
}

/// 저장된 테넌트 ID 조회 (자동 로그인용)
///
/// 이전에 로그인한 테넌트를 기억하여 재선택 없이 자동 로그인
pub fn get_saved_tenant(conn: &Connection, email: &str) -> Option<String> {
  let result: SqliteResult<String> = conn.query_row(
    "SELECT tenant_id FROM users WHERE email = ?1",
    [email],
    |row| row.get(0),
  );

  match result {
    Ok(tenant_id) => {
      println!("Debug: 캐시된 테넌트 조회됨 ({}): {}", email, tenant_id);
      Some(tenant_id)
    }
    Err(_) => {
      println!("Debug: 캐시된 테넌트 없음: {}", email);
      None
    }
  }
}

/// 저장된 테넌트 정보 삭제 (로그인 실패 시)
///
/// 테넌트 재선택이 필요할 때 캐시를 지움
pub fn clear_saved_tenant(conn: &Connection, email: &str) -> Result<(), String> {
  conn
    .execute("DELETE FROM users WHERE email = ?1", [email])
    .map_err(|e| format!("캐시된 테넌트 삭제 실패: {}", e))?;

  println!("Debug: 캐시된 테넌트 삭제됨: {}", email);
  Ok(())
}
