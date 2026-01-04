$ErrorActionPreference = "Stop"

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "   Fiery Horizon : Backend Dev Environment" -ForegroundColor Cyan
Write-Host "   (Web Service Excluded for Local Dev)" -ForegroundColor Cyan
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

# Run Docker command (golang:alpine)
try {
    docker run --rm -v "${PWD}:/app" -w /app golang:alpine sh -c "$protoCmd"
    if ($LASTEXITCODE -ne 0) { throw "Docker command failed" }
} catch {
    Write-Host "   [!] Failed to generate protos. Check Docker status." -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------
# Step 2: Run Docker Compose (Backend Only)
# ---------------------------------------------------------
Write-Host "`n>>> [2/2] Starting Backend Services..." -ForegroundColor Yellow

# Explicitly list services excluding 'web'
docker-compose up -d --build gateway auth signaling index-service postgres redis

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n>>> DONE! Backend services are running." -ForegroundColor Green
    Write-Host "    - Gateway API: http://localhost:8080"
    Write-Host "`n[!] Ready for Local Web Development:" -ForegroundColor Cyan
    Write-Host "    1. Open a new terminal"
    Write-Host "    2. cd web"
    Write-Host "    3. npm run dev"
} else {
    Write-Host "`n   [!] Docker Compose failed." -ForegroundColor Red
    exit 1
}
