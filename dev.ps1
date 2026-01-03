$ErrorActionPreference = "Stop"

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "   Fiery Horizon : Local Dev Environment Setup" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

# ---------------------------------------------------------
# Step 1: Generate Protos (Local Reflection)
# ---------------------------------------------------------
Write-Host "`n>>> [1/2] Generating Local Protos for IDE Support..." -ForegroundColor Yellow

# Define the docker command to run protoc
# - Use 'paths=import' to respect the 'go_package' directive (server/.protos/...)
# - Output to current directory (.) which maps to project root
$protoCmd = "apk add --no-cache protobuf-dev && " +
            "go install google.golang.org/protobuf/cmd/protoc-gen-go@latest && " +
            "go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest && " +
            "export PATH=`$PATH:`$(go env GOPATH)/bin && " +
            "protoc --proto_path=.protos --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import .protos/auth/auth.proto && " +
            "protoc --proto_path=.protos --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import .protos/index/index.proto && " +
            "protoc --proto_path=.protos --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import .protos/signaling/signaling.proto && " +
            "echo '   -> Proto compilation successful.'"

# Run Docker command (golang:alpine)
try {
    docker run --rm -v "${PWD}:/app" -w /app golang:alpine sh -c "$protoCmd"
    if ($LASTEXITCODE -ne 0) { throw "Docker command failed" }
} catch {
    Write-Host "   [!] Failed to generate protos. Check Docker status." -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------
# Step 2: Run Docker Compose
# ---------------------------------------------------------
Write-Host "`n>>> [2/2] Starting Services (Docker Compose)..." -ForegroundColor Yellow

docker-compose up -d --build

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n>>> DONE! All services are up and running." -ForegroundColor Green
    Write-Host "    - Web:   http://lvh.me:3000"
    Write-Host "    - Admin: http://lvh.me:3000/admin"
} else {
    Write-Host "`n   [!] Docker Compose failed." -ForegroundColor Red
    exit 1
}
