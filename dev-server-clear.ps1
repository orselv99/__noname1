$ErrorActionPreference = "Stop"

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "   Fiery Horizon : DB Reset Script" -ForegroundColor Cyan
Write-Host "   (Clears all database data and volumes)" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

# ---------------------------------------------------------
# Step 1: Stop all running containers
# ---------------------------------------------------------
Write-Host "`n>>> [1/3] Stopping all running containers..." -ForegroundColor Yellow

docker-compose down

if ($LASTEXITCODE -ne 0) {
    Write-Host "   [!] Warning: docker-compose down returned non-zero exit code." -ForegroundColor Yellow
}

# ---------------------------------------------------------
# Step 2: Remove the PostgreSQL volume to clear all data
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
# Step 3: Restart services (fresh DB will be created)
# ---------------------------------------------------------
Write-Host "`n>>> [3/3] Restarting backend services with fresh database..." -ForegroundColor Yellow

docker-compose up -d --build gateway auth signaling index-service postgres redis

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n>>> DONE! All services restarted with a fresh database." -ForegroundColor Green
    Write-Host "    - Gateway API: http://localhost:8080"
    Write-Host "    - PostgreSQL:  localhost:5432 (fiery_auth, fiery_index)"
    Write-Host "`n[!] Databases have been reset. All tables will be recreated by GORM auto-migration." -ForegroundColor Cyan
} else {
    Write-Host "`n   [!] Docker Compose failed." -ForegroundColor Red
    exit 1
}
