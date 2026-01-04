$ErrorActionPreference = "Stop"

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "   Fiery Horizon : DEBUG Mode" -ForegroundColor Cyan
Write-Host "   (Delve Debugger Enabled)" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

# ---------------------------------------------------------
# Step 1: Generate Protos (Local Reflection)
# ---------------------------------------------------------
Write-Host "`n>>> [1/2] Generating Local Protos for IDE Support..." -ForegroundColor Yellow

$protoCmd = "apk add --no-cache protobuf-dev && " +
            "go install google.golang.org/protobuf/cmd/protoc-gen-go@latest && " +
            "go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest && " +
            "export PATH=`$PATH:`$(go env GOPATH)/bin && " +
            "protoc --proto_path=.protos --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import .protos/auth/user.proto && " +
            "protoc --proto_path=.protos --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import .protos/auth/tenant.proto && " +
            "protoc --proto_path=.protos --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import .protos/auth/acl.proto && " +
            "protoc --proto_path=.protos --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import .protos/auth/document.proto && " +
            "protoc --proto_path=.protos --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import .protos/auth/department.proto && " +
            "protoc --proto_path=.protos --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import .protos/auth/project.proto && " +
            "protoc --proto_path=.protos --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import .protos/auth/auth.proto && " +
            "protoc --proto_path=.protos --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import .protos/index/index.proto && " +
            "protoc --proto_path=.protos --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import .protos/signaling/signaling.proto && " +
            "echo '   -> Proto compilation successful.'"

try {
    docker run --rm -v "${PWD}:/app" -w /app golang:alpine sh -c "$protoCmd"
    if ($LASTEXITCODE -ne 0) { throw "Docker command failed" }
} catch {
    Write-Host "   [!] Failed to generate protos. Check Docker status." -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------
# Step 2: Run Docker Compose with Debug Configuration
# ---------------------------------------------------------
Write-Host "`n>>> [2/2] Starting Backend Services in DEBUG mode..." -ForegroundColor Yellow

docker-compose -f docker-compose.debug.yml up -d --build

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n>>> DEBUG MODE ACTIVE!" -ForegroundColor Green
    Write-Host ""
    Write-Host "    Delve Debug Ports:" -ForegroundColor Yellow
    Write-Host "    - Gateway:       localhost:40000"
    Write-Host "    - Auth Service:  localhost:40001"
    Write-Host "    - Index Service: localhost:40002"
    Write-Host "    - Signaling:     localhost:40003"
    Write-Host ""
    Write-Host "    Service Ports:" -ForegroundColor Yellow
    Write-Host "    - Gateway API:   http://localhost:8080"
    Write-Host ""
    Write-Host "[!] To attach debugger in VS Code:" -ForegroundColor Cyan
    Write-Host "    1. Open Run and Debug (Ctrl+Shift+D)"
    Write-Host "    2. Select 'Debug Gateway (Docker)' or 'Debug Auth Service (Docker)'"
    Write-Host "    3. Press F5 to attach"
    Write-Host "    4. Set breakpoints in your Go code"
} else {
    Write-Host "`n   [!] Docker Compose failed." -ForegroundColor Red
    exit 1
}
