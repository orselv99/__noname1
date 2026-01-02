$ErrorActionPreference = "Stop"

# --- Setup Logging ---
$today = Get-Date -Format "yyyyMMdd"
$baseDir = Join-Path $PSScriptRoot "result"
if (!(Test-Path $baseDir)) { New-Item -ItemType Directory -Path $baseDir | Out-Null }

$featureName = "index"
# Find next try count (1-indexed)
$nextIndex = 1
$existingLogs = Get-ChildItem -Path $baseDir -Filter "${today}_${featureName}_(*).log" -ErrorAction SilentlyContinue
if ($existingLogs) {
    $indices = $existingLogs.Name | ForEach-Object {
        # Extract the number from filenames like "20231027_index_(1).log"
        if ($_ -match "_\((\d+)\)\.log$") { [int]$matches[1] }
    }
    if ($indices) {
        $nextIndex = ($indices | Measure-Object -Maximum).Maximum + 1
    }
}
$logFile = Join-Path $baseDir "${today}_${featureName}_($nextIndex).log"

Start-Transcript -Path $logFile

Write-Host "Test Started at $(Get-Date)"
Write-Host "Log Archive: $logFile"
# ---------------------

# 1. User Registration & Login
$suffix = Get-Random
$user = "testuser_$suffix"
$email = "$user@example.com"
$pass = "password123"

Write-Host "`n1. Registering User: $user"
$regBody = @{
    username = $user
    email = $email
    password = $pass
} | ConvertTo-Json
try {
    $regResponse = Invoke-RestMethod -Uri "http://localhost:8080/api/v1/auth/register" -Method Post -ContentType "application/json" -Body $regBody
    Write-Host "   Registration Success"
} catch {
    Write-Host "   Registration Failed: $_"
    Stop-Transcript
    exit 1
}

Write-Host "`n2. Logging in..."
$loginBody = @{
    email = $email
    password = $pass
} | ConvertTo-Json
try {
    $loginResponse = Invoke-RestMethod -Uri "http://localhost:8080/api/v1/auth/login" -Method Post -ContentType "application/json" -Body $loginBody
    $token = $loginResponse.access_token
    if (-not $token) { throw "Token is empty" }
    Write-Host "   Login Success. Token acquired."
} catch {
    Write-Host "   Login Failed: $_"
    Stop-Transcript
    exit 1
}

# 2. Indexing Document
Write-Host "`n3. Indexing Document..."
$headers = @{ Authorization = "Bearer $token" }
try {
    $docPath = Join-Path $PSScriptRoot "test_doc.json"
    if (!(Test-Path $docPath)) { throw "test_doc.json not found at $docPath" }
    
    $docBody = Get-Content -Raw -Path $docPath
    $indexResponse = Invoke-RestMethod -Uri "http://localhost:8080/api/v1/docs" -Method Post -ContentType "application/json" -Headers $headers -Body $docBody
    Write-Host "   Index Success. DocID: $($indexResponse.document_id)"
} catch {
    Write-Host "   Index Failed: $_"
    Stop-Transcript
    exit 1
}

# 3. Search Document
Write-Host "`n4. Searching Document (Query: AI)..."
try {
    $searchResponse = Invoke-RestMethod -Uri "http://localhost:8080/api/v1/docs/search?query=AI&limit=5" -Method Get -Headers $headers
    Write-Host "   Search Success. Found $($searchResponse.results.Count) documents."
    $searchResponse.results | ForEach-Object {
        Write-Host "   - Title: $($_.document.title)"
        Write-Host "   - Summary: $($_.document.summary)"
        Write-Host "   - OwnerID: $($_.document.owner_id)"
    }
} catch {
    Write-Host "   Search Failed: $_"
    Stop-Transcript
    exit 1
}

Stop-Transcript
