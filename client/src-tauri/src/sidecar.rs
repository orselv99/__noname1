//! ==========================================================================
//! sidecar.rs - Sidecar(외부 프로세스) 관리 모듈
//! ==========================================================================
//!
//! C++ 개발자를 위한 설명:
//! - Sidecar: Tauri 앱과 함께 배포되는 별도의 실행파일
//! - 예: llama-server (로컬 AI 추론 서버)
//! - C++ 비교: CreateProcess()로 자식 프로세스 실행/관리
//!
//! ⚠️ 현재 상태: 비활성화됨
//! 이 프로젝트는 서버 사이드 AI를 사용하므로 로컬 sidecar가 필요 없습니다.
//! 만약 로컬 AI가 필요하면 이 모듈을 활성화하고 구현을 추가하세요.
//!
//! 활성화 시 필요한 작업:
//! 1. tauri.conf.json의 "externalBin"에 sidecar 경로 추가
//! 2. capabilities/default.json에 shell:allow-execute 권한 추가
//! 3. build.rs에서 sidecar 바이너리 복사 로직 활성화
//! 4. 아래 함수들 구현
//! ==========================================================================

use tauri::AppHandle;

// ============================================================================
// Sidecar 상태 구조체
// ============================================================================

/// Sidecar 상태 (Stub - 비활성화됨)
///
/// 활성화 시 예상 구조:
/// ```rust
/// pub struct SidecarState {
///     pub embedder_child: Option<Child>,   // 임베딩 서버 프로세스
///     pub completer_child: Option<Child>,  // 완성 서버 프로세스
/// }
/// ```
///
/// C++ 비교:
/// ```cpp
/// struct SidecarState {
///     HANDLE embedder_process;
///     HANDLE completer_process;
/// };
/// ```
pub struct SidecarState;

/// Default 구현 (빈 상태)
impl Default for SidecarState {
  fn default() -> Self {
    Self
  }
}

// ============================================================================
// Sidecar 관리 함수
// ============================================================================

/// 고아(orphan) 프로세스 종료
///
/// 앱이 비정상 종료되었을 때 남아있는 llama-server 프로세스를 정리합니다.
///
/// 활성화 시 구현 예:
/// ```rust
/// pub fn kill_orphans() {
///     use sysinfo::{System, ProcessToUpdate};
///     let mut sys = System::new();
///     sys.refresh_processes();
///     
///     for (pid, process) in sys.processes() {
///         if process.name().contains("llama-server") {
///             process.kill();
///         }
///     }
/// }
/// ```
///
/// C++ 비교: EnumProcesses() + TerminateProcess()
#[allow(dead_code)]
pub fn kill_orphans() {
  // [비활성화됨] 서버 사이드 AI 사용 중
}

/// Sidecar 프로세스 시작
///
/// 앱 시작 시 로컬 AI 서버를 실행합니다.
///
/// # 매개변수
/// - `_app`: Tauri 앱 핸들 (sidecar 경로 조회용)
///
/// # 반환값
/// 성공 또는 오류 메시지
///
/// 활성화 시 구현 예:
/// ```rust
/// pub fn spawn_sidecars(app: &AppHandle) -> Result<(), String> {
///     use tauri_plugin_shell::ShellExt;
///     
///     let sidecar = app.shell()
///         .sidecar("llama-server")
///         .map_err(|e| e.to_string())?
///         .args(&["--port", "8081", "--model", "model/embedding.gguf"]);
///     
///     let (mut _rx, child) = sidecar.spawn()
///         .map_err(|e| e.to_string())?;
///     
///     // child를 상태에 저장
///     Ok(())
/// }
/// ```
///
/// C++ 비교: CreateProcess() 또는 QProcess::start()
#[allow(dead_code)]
pub fn spawn_sidecars(_app: &AppHandle) -> Result<(), String> {
  println!("Debug: Sidecar 비활성화됨 (서버 사이드 AI 사용 중)");
  Ok(())
}

/// Sidecar 프로세스 종료
///
/// 앱 종료 시 실행 중인 로컬 AI 서버를 정리합니다.
///
/// # 매개변수
/// - `_app`: Tauri 앱 핸들
///
/// C++ 비교: TerminateProcess() 또는 QProcess::kill()
#[allow(dead_code)]
pub fn stop_sidecars(_app: &AppHandle) {
  // [비활성화됨] 서버 사이드 AI 사용 중
}
