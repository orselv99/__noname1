# capabilities/default.json 설정 가이드

> **C++ 개발자를 위한 설명**: 안드로이드의 `AndroidManifest.xml` 권한 시스템 또는 macOS의 Entitlements와 유사

---

## 파일 개요

Tauri v2의 **Capabilities(권한) 시스템**은 프론트엔드에서 호출할 수 있는 Rust 명령과 API를 제한합니다. 
보안 강화를 위해 모든 API 접근은 명시적으로 허용되어야 합니다.

---

## 현재 설정 분석

### 기본 메타데이터

| 필드 | 값 | 설명 |
|------|---|------|
| `$schema` | `../gen/schemas/...` | JSON 스키마 (IDE 자동완성용) |
| `identifier` | `"default"` | 이 capability 파일의 고유 식별자 |
| `description` | `"Capability for..."` | 설명 텍스트 |
| `windows` | `["main"]` | 이 권한이 적용되는 윈도우 목록 |

---

### `permissions` 배열 - 허용된 권한 목록

#### 1. 코어 권한 (`core:*`)

| 권한 | 설명 |
|------|------|
| `core:default` | Tauri 기본 권한 세트 |
| `core:window:allow-start-dragging` | 커스텀 타이틀바 드래그 이동 허용 |
| `core:window:allow-minimize` | 최소화 버튼 동작 허용 |
| `core:window:allow-maximize` | 최대화 버튼 동작 허용 |
| `core:window:allow-unmaximize` | 최대화 해제 허용 |
| `core:window:allow-close` | 닫기 버튼 동작 허용 |
| `core:window:allow-is-maximized` | 최대화 상태 확인 API 허용 |

**참고**: `decorations: false`로 시스템 타이틀바를 숨기면, 이 권한들을 통해 커스텀 타이틀바 버튼을 구현합니다.

---

#### 2. Opener 플러그인 (`opener:*`)

| 권한 | 설명 |
|------|------|
| `opener:default` | 외부 URL, 파일 열기 기본 권한 |

---

#### 3. Shell 플러그인 (`shell:*`) - Sidecar 실행

```json
{
  "identifier": "shell:allow-execute",
  "allow": [
    {
      "name": "bin/llama-server",
      "args": true,
      "sidecar": true
    },
    {
      "name": "llama-server", 
      "args": true,
      "sidecar": true
    }
  ]
}
```

| 필드 | 설명 |
|------|------|
| `shell:allow-execute` | 외부 프로세스 실행 허용 |
| `name` | 실행 가능한 바이너리 이름 |
| `args: true` | 인자 전달 허용 |
| `sidecar: true` | Tauri 번들에 포함된 sidecar 바이너리 실행 |

**C++ 비교**: `CreateProcess()` 또는 `QProcess`를 사용하는 것과 유사하지만, 실행 가능한 프로세스를 화이트리스트로 제한

| 권한 | 설명 |
|------|------|
| `shell:allow-open` | 기본 프로그램으로 파일/URL 열기 (`ShellExecute` 유사) |

---

## 보안 모델 이해

### 왜 이런 권한 시스템이 필요한가?

1. **최소 권한 원칙**: 앱이 필요한 것만 접근 가능
2. **XSS 방어**: 프론트엔드 취약점이 있어도 시스템 명령 실행 불가
3. **명시적 허용**: 모든 민감한 API는 명시적으로 허용해야 함

### C++ 비교

| Tauri | C++ 상응 개념 |
|-------|--------------|
| `permissions` | 안드로이드 Manifest 권한 |
| `shell:allow-execute` | 샌드박스 정책 |
| capability 파일 | macOS Entitlements |

---

## 권한 추가 예시

### 파일 시스템 접근
```json
"fs:default",
"fs:allow-read",
"fs:allow-write"
```

### 클립보드 접근
```json
"clipboard:default"
```

### 시스템 정보 조회
```json
"os:default"
```
