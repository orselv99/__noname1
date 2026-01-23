# Gateway Service 구현 계획

## 기능
Gateway는 클라이언트(Tauri/React)로부터 들어오는 HTTP 요청을 받아 적절한 gRPC 마이크로서비스로 라우팅합니다.

## 엔드포인트 매핑
| Method | Path | Service | gRPC Method |
|---|---|---|---|
| POST | `/api/v1/auth/register` | AuthService | `Register` |
| POST | `/api/v1/auth/login` | AuthService | `Login` |
| GET | `/api/v1/auth/refresh` | AuthService | `RefreshToken` |
| POST | `/api/v1/docs` | IndexService | `IndexDocument` |
| GET | `/api/v1/docs/search` | IndexService | `SearchDocuments` |

## 구현 상세
1. **Gin 서버 설정**: `main.go` 또는 `gateway/main.go`
2. **CORS 미들웨어**: Tauri (localhost:1420) 등에서의 접근 허용
3. **gRPC 클라이언트 연결**: 
    - `auth:50051`
    - `index:50052`
    - `signaling:50053`
4. **핸들러 구현**: HTTP JSON 요청 -> gRPC 메시지 변환 -> 응답 반환

## 파일 구조
- `server/gateway/`: Gateway 서비스 코드
  - `main.go`: 엔트리포인트 및 설정
  - `router.go`: 라우팅 정의
  - `handlers/`: 각 서비스별 HTTP 핸들러
  - `middleware/`: Auth 등 미들웨어
