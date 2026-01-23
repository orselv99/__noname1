$ErrorActionPreference = "Stop"

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "   Fiery Horizon : DB Reset Script" -ForegroundColor Cyan
Write-Host "   (Clears all database data and volumes)" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

# ---------------------------------------------------------
# Step 1: Generate Protos (Local Reflection)
# ---------------------------------------------------------
Write-Host "`n>>> [1/3] Generating Local Protos for IDE Support..." -ForegroundColor Yellow

$protoCmd = "apk add --no-cache protobuf-dev && " +
            "go install google.golang.org/protobuf/cmd/protoc-gen-go@latest && " +
            "go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest && " +
            "export PATH=`$PATH:`$(go env GOPATH)/bin && " +
            "protoc --proto_path=server/.protos/ --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import server/.protos/auth/user.proto && " +
            "protoc --proto_path=server/.protos/ --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import server/.protos/auth/tenant.proto && " +
            "protoc --proto_path=server/.protos/ --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import server/.protos/auth/acl.proto && " +
            "protoc --proto_path=server/.protos/ --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import server/.protos/auth/document.proto && " +
            "protoc --proto_path=server/.protos/ --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import server/.protos/auth/department.proto && " +
            "protoc --proto_path=server/.protos/ --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import server/.protos/auth/project.proto && " +
            "protoc --proto_path=server/.protos/ --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import server/.protos/auth/auth.proto && " +
            "protoc --proto_path=server/.protos/ --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import server/.protos/index/index.proto && " +
            "protoc --proto_path=server/.protos/ --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import server/.protos/signaling/signaling.proto && " +
            "echo '   -> Proto compilation successful.'"

try {
    docker run --rm -v "${PWD}:/app" -w /app golang:alpine sh -c "$protoCmd"
    if ($LASTEXITCODE -ne 0) { throw "Docker command failed" }
} catch {
    Write-Host "   [!] Failed to generate protos. Check Docker status." -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------
# Step 2: Stop all running containers
# ---------------------------------------------------------
Write-Host "`n>>> [2/3] Stopping all running containers..." -ForegroundColor Yellow

docker-compose down

if ($LASTEXITCODE -ne 0) {
    Write-Host "   [!] Warning: docker-compose down returned non-zero exit code." -ForegroundColor Yellow
}

# ---------------------------------------------------------
# Step 3: Remove the PostgreSQL volume to clear all data
# ---------------------------------------------------------
Write-Host "`n>>> [2/3] Removing PostgreSQL volume (pgdata)..." -ForegroundColor Yellow

# Get the full volume name (project_volumename format)
$volumeName = docker volume ls -q | Where-Object { $_ -match "fiery-horizon.*pgdata" }

if ($volumeName) {
    docker volume rm $volumeName
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   -> Volume '$volumeName' removed successfully." -ForegroundColor Green
    } else {
        Write-Host "   [!] Failed to remove volume. It may be in use." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "   -> No pgdata volume found. Skipping..." -ForegroundColor Yellow
}

# ---------------------------------------------------------
# Step 4: Restart services (fresh DB will be created)
# ---------------------------------------------------------
Write-Host "`n>>> [3/3] Restarting backend services with fresh database..." -ForegroundColor Yellow

docker-compose up -d --build gateway auth signaling index postgres redis

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n>>> DONE! All services restarted with a fresh database." -ForegroundColor Green
    Write-Host "    - Gateway API: http://localhost:8080"
    Write-Host "    - PostgreSQL:  localhost:5432 (fiery_auth, fiery_index)"
    Write-Host "`n[!] Databases have been reset. All tables will be recreated by GORM auto-migration." -ForegroundColor Cyan
} else {
    Write-Host "`n   [!] Docker Compose failed." -ForegroundColor Red
    exit 1
}
