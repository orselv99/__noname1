$ErrorActionPreference = "Stop"

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "   Fiery Horizon : Infrastructure Only" -ForegroundColor Cyan
Write-Host "   (For Local Go Debugging)" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

# Start only PostgreSQL and Redis
Write-Host "`n>>> Starting PostgreSQL and Redis..." -ForegroundColor Yellow

docker-compose -f docker-compose.infra.yml up -d

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n>>> Infrastructure is running!" -ForegroundColor Green
    Write-Host ""
    Write-Host "    Services:" -ForegroundColor Yellow
    Write-Host "    - PostgreSQL: localhost:5432"
    Write-Host "    - Redis:      localhost:6379"
    Write-Host ""
    Write-Host "[!] To debug Go services in VS Code:" -ForegroundColor Cyan
    Write-Host "    1. Open Run and Debug (Ctrl+Shift+D)"
    Write-Host "    2. Select 'Debug All Services (Local)' or individual service"
    Write-Host "    3. Press F5 to start debugging"
    Write-Host "    4. Set breakpoints - they will work immediately!"
} else {
    Write-Host "`n   [!] Failed to start infrastructure." -ForegroundColor Red
    exit 1
}
