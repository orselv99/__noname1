# tauri.conf.json 설정 가이드

> **C++ 개발자를 위한 설명**: Qt의 `.pro` 파일 + Visual Studio 프로젝트 설정과 유사한 역할

---

## 파일 개요

Tauri 앱의 핵심 설정 파일로, 앱 메타데이터, 빌드 설정, 윈도우 구성, 보안 정책, 패키징 옵션을 정의합니다.

---

## 섹션별 설명

### 메타데이터
| 필드 | 설명 |
|------|------|
| `$schema` | JSON 스키마 URL (IDE 자동완성 지원) |
| `productName` | 앱 표시 이름 |
| `version` | 시맨틱 버저닝 (MAJOR.MINOR.PATCH) |
| `identifier` | 고유 앱 식별자 (번들 ID) |

---

### `build` 섹션 - 프론트엔드 빌드 설정

| 필드 | 설명 |
|------|------|
| `beforeDevCommand` | `tauri dev` 실행 전 명령 (예: Vite 개발 서버 시작) |
| `devUrl` | 개발 모드에서 로드할 프론트엔드 URL |
| `beforeBuildCommand` | `tauri build` 실행 전 명령 (프론트엔드 번들링) |
| `frontendDist` | 프로덕션 빌드된 프론트엔드 위치 (상대 경로) |

**C++ 비교**: CMake의 `add_custom_command(PRE_BUILD ...)` 와 유사

---

### `app` 섹션 - 앱 런타임 설정

#### `withGlobalTauri`
- `true`: 프론트엔드에서 `window.__TAURI__` 전역 객체로 Rust 함수 호출 가능
- C++ 비교: FFI 바인딩을 전역으로 노출하는 것과 유사

#### `windows` 배열 - 윈도우 속성

| 필드 | 값 | 설명 |
|------|---|------|
| `title` | `"tauri-app"` | 윈도우 제목 표시줄 텍스트 |
| `width` / `height` | `1200` / `800` | 초기 윈도우 크기 (픽셀) |
| `minWidth` / `minHeight` | `1024` / `700` | 최소 윈도우 크기 제한 |
| `decorations` | `false` | OS 기본 타이틀바 숨김 → 커스텀 타이틀바 사용 |
| `transparent` | `false` | 투명 배경 비활성화 |
| `dragDropEnabled` | `false` | 파일 드래그앤드롭 비활성화 |
| `backgroundColor` | `[9,9,11,255]` | RGBA 배경색 = `#09090BFF` (거의 검정) |

**C++ 비교**: Win32 `CreateWindowEx()` 또는 Qt `QMainWindow` 설정과 유사

#### `security` - 보안 설정

| 필드 | 설명 |
|------|------|
| `csp` | Content Security Policy. `null`이면 Tauri 기본 정책 사용 |

---

### `bundle` 섹션 - 앱 패키징/배포

| 필드 | 값 | 설명 |
|------|---|------|
| `externalBin` | `[]` | 번들에 포함할 외부 실행파일 (sidecar) |
| `resources` | `[]` | 추가 리소스 파일/폴더 |
| `active` | `true` | 번들 생성 활성화 |
| `targets` | `["nsis"]` | 생성할 인스톨러 형식 (Windows NSIS) |
| `icon` | 배열 | 다양한 크기/형식의 앱 아이콘 |

**C++ 비교**: 
- `externalBin`: 외부 프로세스 동봉 (Qt의 windeployqt + 수동 복사)
- `targets: ["nsis"]`: NSIS 또는 Inno Setup 스크립트 역할

---

## 주요 설정 변경 시나리오

### 개발 서버 포트 변경
```json
"devUrl": "http://localhost:3000"  // Vite 포트가 3000인 경우
```

### 윈도우 크기 조정
```json
"width": 1400,
"height": 900
```

### 시스템 타이틀바 사용
```json
"decorations": true
```

### macOS/Linux 번들 추가
```json
"targets": ["nsis", "dmg", "deb", "appimage"]
```
