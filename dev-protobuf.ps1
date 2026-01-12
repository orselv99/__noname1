$ErrorActionPreference = "Stop"

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "   Fiery Horizon : Protobuf Generator" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

Write-Host "`n>>> [1/1] Generating Local Protos for IDE Support..." -ForegroundColor Yellow

$protoCmd = "apk add --no-cache protobuf-dev && " +
            "go install google.golang.org/protobuf/cmd/protoc-gen-go@latest && " +
            "go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest && " +
            "export PATH=`$PATH:`$(go env GOPATH)/bin && " +
            "protoc --proto_path=server/.protos/ --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import server/.protos/auth/user.proto && " +
            "protoc --proto_path=server/.protos/ --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import server/.protos/auth/tenant.proto && " +
            "protoc --proto_path=server/.protos/ --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import server/.protos/auth/acl.proto && " +
            "protoc --proto_path=server/.protos/ --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import server/.protos/auth/document.proto && " +
            "protoc --proto_path=server/.protos/ --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import server/.protos/auth/department.proto && " +
            "protoc --proto_path=server/.protos/ --go_out=. --go_opt=paths=import --go-grpc_out=. --go-grpc_opt=paths=import server/.protos/auth/position.proto && " +
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
