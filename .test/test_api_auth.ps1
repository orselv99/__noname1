$ErrorActionPreference = "Stop"

# --- Setup Logging ---
$today = Get-Date -Format "yyyyMMdd"
$baseDir = Join-Path $PSScriptRoot "result"
if (!(Test-Path $baseDir)) { New-Item -ItemType Directory -Path $baseDir | Out-Null }

$featureName = "auth"
# Find next try count (1-indexed)
$nextIndex = 1
$existingLogs = Get-ChildItem -Path $baseDir -Filter "${today}_${featureName}_(*).log" -ErrorAction SilentlyContinue
if ($existingLogs) {
    $indices = $existingLogs.Name | ForEach-Object {
        if ($_ -match "_\((\d+)\)\.log$") { [int]$matches[1] }
    }
    if ($indices) {
        $nextIndex = ($indices | Measure-Object -Maximum).Maximum + 1
    }
}
$logFile = Join-Path $baseDir "${today}_${featureName}_($nextIndex).log"

Start-Transcript -Path $logFile

Write-Host "Test Started at $(Get-Date)"
Write-Host "Log File: $logFile"

# Random User for Isolation
$suffix = Get-Random
$user = "auth_test_$suffix"
$email = "$user@example.com"
$pass = "password123"

Write-Host "NOTE: Ensure Auth and Gateway services are running."

Write-Host "`n1. [Register] POST /api/v1/auth/register"
$regBody = @{
    username = $user
    email = $email
    password = $pass
} | ConvertTo-Json
try {
    $regResponse = Invoke-RestMethod -Uri "http://localhost:8080/api/v1/auth/register" -Method Post -ContentType "application/json" -Body $regBody
    Write-Host "   Success: $($regResponse | ConvertTo-Json -Depth 1)"
} catch {
    Write-Host "   Failed: $_"
    exit 1
}

Write-Host "`n2. [Login] POST /api/v1/auth/login"
$loginBody = @{
    email = $email
    password = $pass
} | ConvertTo-Json
try {
    $loginResponse = Invoke-RestMethod -Uri "http://localhost:8080/api/v1/auth/login" -Method Post -ContentType "application/json" -Body $loginBody
    $token = $loginResponse.access_token
    Write-Host "   Success. Token obtained."
} catch {
    Write-Host "   Failed: $_"
    exit 1
}

Write-Host "`nAll Auth tests passed."

Stop-Transcript

