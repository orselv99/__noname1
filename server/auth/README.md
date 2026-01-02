# Auth Service 구현 계획

## 기능
사용자 회원가입, 로그인, 토큰 검증 및 갱신을 담당하는 gRPC 서비스입니다.

## 기술 스택
- **Framework**: gRPC (Native Go implementation)
- **Database**: PostgreSQL
- **ORM**: GORM
- **Auth**: JWT (JSON Web Tokens), BCrypt (Password Hashing)

## 주요 구성 요소
1. **Model (`model.go`)**
    - `User`: ID (UUID), Email (Unique), PasswordHash, CreatedAt, UpdatedAt
2. **Util (`jwt.go`)**
    - `GenerateToken(userID)`: Access/Refresh Token 생성
    - `ValidateToken(token)`: 토큰 파싱 및 유효성 검사
3. **Service (`service.go`)**
    - gRPC `AuthService` 인터페이스 구현 (`Register`, `Login`, `ValidateToken`, `RefreshToken`)
4. **Entrypoint (`main.go`)**
    - DB 연결 초기화 (Auto Migration)
    - gRPC 서버 리스닝 (:50051)

## 환경 변수 (예상)
- `DB_DSN`: `host=localhost user=postgres password=secret dbname=fiery_auth port=5432 sslmode=disable`
- `JWT_SECRET`: `my_super_secret_key`
