//! ==========================================================================
//! build.rs - Rust 빌드 스크립트 (컴파일 전 실행)
//! ==========================================================================
//!
//! C++ 개발자를 위한 설명:
//! - CMake의 add_custom_command(PRE_BUILD ...) 또는 Pre-Build Event와 유사
//! - Cargo가 이 파일을 감지하면 컴파일 전에 먼저 실행함
//! - 주로 코드 생성, 리소스 복사, 환경 설정에 사용
//!
//! 이 스크립트의 역할:
//! 1. Sidecar 실행파일(llama-server)을 bin/ 폴더로 복사
//! 2. Tauri 빌드 수행
//! 3. 런타임에 필요한 DLL과 모델 파일을 target/ 폴더로 복사
//! ==========================================================================

use std::env;
use std::fs;
use std::path::PathBuf;

/// 빌드 스크립트 메인 함수
///
/// Cargo는 이 함수를 컴파일 전에 자동으로 실행합니다.
/// stdout에 `cargo:` 접두사로 출력하면 Cargo가 특별히 해석합니다.
///
/// C++ 비교: CMake의 configure 단계 + Pre-Build 이벤트
fn main() {
  // ========================================================================
  // 1단계: Sidecar 실행파일 복사 (tauri_build 호출 전에 수행해야 함)
  // ========================================================================
  // Sidecar: Tauri 앱에 포함되어 함께 배포되는 외부 실행파일
  // C++ 비교: 배포 시 함께 복사해야 하는 외부 .exe 파일

  // CARGO_MANIFEST_DIR: Cargo.toml이 위치한 디렉토리 (src-tauri/)
  let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());

  // 소스 디렉토리: llama-server.exe가 위치한 곳
  let source_dir = manifest_dir.join("../../client-ai-service");

  // 대상 디렉토리: Tauri가 sidecar를 찾는 위치
  let bin_dir = manifest_dir.join("bin");

  // bin 폴더가 없으면 생성
  if !bin_dir.exists() {
    let _ = fs::create_dir_all(&bin_dir);
  }

  // ------------------------------------------------------------------------
  // 타겟 트리플 결정 (플랫폼-아키텍처-OS-ABI 조합)
  // ------------------------------------------------------------------------
  // Tauri sidecar 명명 규칙: {name}-{target_triple}.exe
  // 예: llama-server-x86_64-pc-windows-msvc.exe
  //
  // C++ 비교: CMake의 CMAKE_SYSTEM_PROCESSOR, CMAKE_SYSTEM_NAME 조합
  let target_triple = "x86_64-pc-windows-msvc"; // Windows 64비트 MSVC
  let exe_name = "llama-server.exe";
  let sidecar_name = format!("llama-server-{}.exe", target_triple);

  let src_exe = source_dir.join(exe_name);
  let dest_exe = bin_dir.join(sidecar_name);

  // ------------------------------------------------------------------------
  // 조건부 복사: 파일 크기가 다를 때만 복사 (빌드 시간 최적화)
  // ------------------------------------------------------------------------
  if src_exe.exists() {
    let should_copy = if dest_exe.exists() {
      // 파일 크기 비교로 변경 여부 판단 (해시보다 빠름)
      let src_len = fs::metadata(&src_exe).map(|m| m.len()).unwrap_or(0);
      let dest_len = fs::metadata(&dest_exe).map(|m| m.len()).unwrap_or(0);
      src_len != dest_len
    } else {
      true // 대상 파일이 없으면 복사 필요
    };

    if should_copy {
      // fs::copy(): 파일 복사 함수
      // C++ 비교: std::filesystem::copy() 또는 CopyFile() Win32 API
      if let Err(e) = fs::copy(&src_exe, &dest_exe) {
        // cargo:warning= 접두사: Cargo가 경고 메시지로 표시
        println!(
          "cargo:warning=Sidecar 복사 실패 (파일 사용 중일 수 있음): {}",
          e
        );
      } else {
        println!("cargo:warning=Sidecar 복사 완료: {:?}", dest_exe);
      }
    }
  } else {
    println!(
      "cargo:warning=Sidecar 실행파일을 찾을 수 없음: {:?}",
      src_exe
    );
  }

  // ========================================================================
  // 2단계: Tauri 빌드 수행
  // ========================================================================
  // tauri-build 크레이트가 Tauri 관련 설정 생성
  // - 아이콘 리소스 임베딩
  // - 윈도우 매니페스트 생성
  // - capability 스키마 검증
  tauri_build::build();

  // ========================================================================
  // 3단계: 런타임 파일 복사 (DLL, 모델)
  // ========================================================================
  // tauri_build 이후에 실행해야 target 디렉토리가 확실히 존재함

  // PROFILE 환경변수: "debug" 또는 "release"
  // C++ 비교: CMAKE_BUILD_TYPE 또는 $(Configuration)
  let profile = env::var("PROFILE").unwrap_or_else(|_| "debug".to_string());
  let target_dir = manifest_dir.join("target").join(&profile);

  if !target_dir.exists() {
    let _ = fs::create_dir_all(&target_dir);
  }

  // ------------------------------------------------------------------------
  // DLL 복사: llama-server가 의존하는 동적 라이브러리
  // ------------------------------------------------------------------------
  // C++ 비교: windeployqt 또는 수동 DLL 복사
  if let Ok(entries) = fs::read_dir(&source_dir) {
    // entries.flatten(): Result<DirEntry>에서 에러를 건너뛰고 성공만 처리
    for entry in entries.flatten() {
      let path = entry.path();
      // 확장자가 .dll인 파일만 복사
      if let Some(extension) = path.extension() {
        if extension == "dll" {
          let file_name = path.file_name().unwrap();
          let dest_path = target_dir.join(file_name);
          // 복사 실패 무시: 앱 실행 중이면 DLL이 잠겨있을 수 있음
          if let Err(e) = fs::copy(&path, &dest_path) {
            println!("cargo:warning=DLL 복사 실패 (사용 중): {}", e);
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------------
  // 모델 디렉토리 복사: AI 모델 파일들
  // ------------------------------------------------------------------------
  let model_source = source_dir.join("model");
  let model_dest = target_dir.join("model");

  if model_source.exists() {
    // 대상 model 폴더 생성
    if !model_dest.exists() {
      let _ = fs::create_dir_all(&model_dest);
    }

    // 모델 폴더 내 모든 파일 복사
    if let Ok(entries) = fs::read_dir(&model_source) {
      for entry in entries.flatten() {
        let path = entry.path();
        // 파일만 복사 (하위 폴더는 무시)
        if path.is_file() {
          let file_name = path.file_name().unwrap();
          let dest_path = model_dest.join(file_name);
          // 에러 무시: 빌드 속도를 위해 조용히 실패
          let _ = fs::copy(&path, &dest_path);
        }
      }
    }
    println!("cargo:warning=모델 디렉토리 복사 완료: {:?}", model_dest);
  } else {
    println!(
      "cargo:warning=모델 소스 디렉토리를 찾을 수 없음: {:?}",
      model_source
    );
  }
}
