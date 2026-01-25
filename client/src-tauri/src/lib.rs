//! ==========================================================================
//! lib.rs - Tauri 앱 초기화 및 명령 등록
//! ==========================================================================
//!
//! C++ 개발자를 위한 설명:
//! - 이 파일은 앱의 "뼈대"를 구성합니다 (Qt의 QApplication 초기화와 유사)
//! - 프론트엔드에서 호출 가능한 Rust 함수(커맨드)를 등록합니다
//! - 전역 상태(State)를 관리합니다 (의존성 주입 패턴)
//!
//! Tauri 아키텍처 개요:
//! ┌─────────────────────────────────────────────────────────┐
//! │  프론트엔드 (React/Vue/etc.)                             │
//! │    invoke('command_name', { args })                     │
//! └─────────────────────────────────────────────────────────┘
//!                         │ IPC (JSON)
//!                         ▼
//! ┌─────────────────────────────────────────────────────────┐
//! │  Rust 백엔드 (이 파일)                                   │
//! │    #[tauri::command] fn command_name(...) { ... }       │
//! └─────────────────────────────────────────────────────────┘
//! ==========================================================================

// ============================================================================
// 표준 라이브러리 및 외부 크레이트 임포트
// ============================================================================
use std::sync::Mutex; // 스레드 안전한 상호 배제 락
use tauri::Manager; // Tauri 앱 핸들 관리 트레이트

// ============================================================================
// 모듈 선언 (pub mod = 외부에서 접근 가능)
// ============================================================================
// C++ 비교: #include 또는 namespace 선언과 유사
// 각 모듈은 동일 이름의 .rs 파일 또는 폴더/mod.rs에 정의됨

pub mod commands;
/// commands 모듈 : 프론트엔드에서 호출 가능한 Tauri 커맨드 함수들
pub mod config;
/// config 모듈   : 서버 URL 등 앱 설정
pub mod crypto;
/// crypto 모듈   : AES-GCM 암호화/복호화 유틸리티
pub mod database;
/// database 모듈 : SQLite 로컬 데이터베이스 관리
pub mod sidecar;
/// sidecar 모듈  : 외부 프로세스(llama-server) 관리 (현재 비활성화)

// ============================================================================
// Tauri 앱 초기화 및 실행
// ============================================================================
/// Tauri 앱의 메인 실행 함수
///
/// C++ 비교: QApplication 생성 + exec() 호출과 유사
pub fn run() {
  tauri::Builder::default()
    // ====================================================================
    // 플러그인 등록
    // ====================================================================
    // 플러그인: Tauri 기능을 확장하는 모듈 (미들웨어와 유사)
    // opener 플러그인: 외부 URL/파일을 기본 프로그램으로 열기
    // C++ 비교: ShellExecute() 또는 QDesktopServices::openUrl()
    .plugin(tauri_plugin_opener::init())
    // shell 플러그인: 외부 프로세스 실행 (sidecar 지원)
    // C++ 비교: CreateProcess() 또는 QProcess
    .plugin(tauri_plugin_shell::init())
    // ====================================================================
    // 전역 상태 등록 (.manage)
    // ====================================================================
    // State<T>: Tauri의 의존성 주입 시스템
    // - 커맨드 함수에서 State<'_, Mutex<AuthState>>로 주입받아 사용
    // - C++ 비교: 싱글톤 패턴 또는 서비스 로케이터 패턴
    // 인증 상태: 로그인한 사용자 정보, 토큰 등
    .manage(Mutex::new(commands::auth::AuthState::default()))
    // 데이터베이스 상태: SQLite 연결 객체
    .manage(Mutex::new(database::DatabaseState::default()))
    // ====================================================================
    // 커맨드 핸들러 등록 (invoke_handler)
    // ====================================================================
    // tauri::generate_handler![]: 매크로로 커맨드 함수들을 IPC 핸들러로 등록
    // - 프론트엔드에서 invoke('함수명', {인자})로 호출 가능
    // - C++ 비교: Qt의 시그널/슬롯 연결 또는 RPC 메서드 등록
    .invoke_handler(tauri::generate_handler![
      // ----------------------------------------------------------------
      // AI 명령: 문서 분석, 임베딩 생성, 태그 추출
      // ----------------------------------------------------------------
      commands::ai::extract_info,
      // ----------------------------------------------------------------
      // 인증 명령: 로그인, 로그아웃, 비밀번호 변경
      // ----------------------------------------------------------------
      commands::auth::login,
      commands::auth::refresh_token,
      commands::auth::lookup_tenants,
      commands::auth::get_saved_tenant,
      commands::auth::clear_saved_tenant,
      commands::auth::change_password,
      commands::auth::logout,
      commands::auth::list_users,
      // ----------------------------------------------------------------
      // 문서 명령: CRUD, 휴지통, 동기화
      // ----------------------------------------------------------------
      commands::documents::save_document,
      commands::documents::list_documents,
      commands::documents::get_document,
      commands::documents::delete_document,
      commands::documents::restore_document,
      commands::documents::empty_recycle_bin,
      // ----------------------------------------------------------------
      // 미디어 명령: 이미지 다운로드, 파일 읽기
      // ----------------------------------------------------------------
      commands::media::download_image,
      commands::media::read_local_file_as_data_url,
      // ----------------------------------------------------------------
      // RAG 명령: AI 질의응답, 채팅, 검색
      // ----------------------------------------------------------------
      commands::rag::ask_ai,
      commands::rag::add_rag_message,
      commands::rag::create_new_chat,
      commands::rag::get_rag_chats,
      commands::rag::get_rag_messages,
      commands::rag::delete_rag_chat,
      commands::rag::update_rag_chat_title,
      commands::rag::search_local,
      commands::rag::search_web,
      commands::rag::search_local,
      commands::rag::search_web,
      commands::rag::search_server,
      // ----------------------------------------------------------------
      // 알람 명령
      // ----------------------------------------------------------------
      commands::alarm::add_alarm,
      commands::alarm::get_alarms,
      commands::alarm::mark_alarm_read,
      commands::alarm::mark_all_alarms_read,
      commands::alarm::delete_alarm,
      commands::alarm::clear_alarms,
      // ----------------------------------------------------------------
      // 콘텐츠 명령
      // ----------------------------------------------------------------
      commands::content::save_content_state,
      commands::content::load_content_state,
      commands::content::delete_content_state,
      commands::content::clear_content_state
    ])
    // ====================================================================
    // 앱 초기화 콜백 (.setup)
    // ====================================================================
    // 앱이 시작될 때 한 번 실행되는 초기화 로직
    // C++ 비교: QApplication 생성 후, exec() 호출 전 초기화 코드
    .setup(|app| {
      // SQLite 데이터베이스 초기화 (오프라인 지원용)
      match database::init_database(&app.handle()) {
        Ok(conn) => {
          // 초기화 성공: 연결 객체를 전역 상태에 저장
          // app.state::<T>(): .manage()로 등록한 상태 가져오기
          let db_state = app.state::<Mutex<database::DatabaseState>>();

          // .lock(): Mutex 락 획득 (C++의 std::lock_guard와 유사)
          let mut state = db_state.lock().unwrap();
          state.conn = Some(conn);

          println!("Debug: SQLite 데이터베이스 초기화 완료");
        }
        Err(e) => {
          // 초기화 실패: 경고만 출력 (앱은 계속 실행)
          println!("Warning: 데이터베이스 초기화 실패: {}", e);
        }
      }

      println!("Debug: 앱 시작됨. 서버 사이드 AI 활성화.");
      Ok(()) // setup 성공
    })
    // ====================================================================
    // 앱 빌드 및 실행
    // ====================================================================
    // tauri::generate_context!(): tauri.conf.json 설정을 컴파일 타임에 포함
    .build(tauri::generate_context!())
    .expect("Tauri 앱 빌드 중 오류 발생")
    // .run(): 이벤트 루프 시작 (앱 종료까지 블로킹)
    // C++ 비교: QApplication::exec() 또는 Win32 메시지 루프
    .run(|_app_handle, event| {
      // 앱 이벤트 처리 콜백
      if let tauri::RunEvent::Exit = event {
        println!("Debug: 앱 종료 중.");
      }
    });
}
