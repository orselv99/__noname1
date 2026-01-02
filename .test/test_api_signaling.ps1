$ErrorActionPreference = "Stop"

# --- Setup Logging ---
$today = Get-Date -Format "yyyyMMdd"
$baseDir = Join-Path $PSScriptRoot "result"
if (!(Test-Path $baseDir)) { New-Item -ItemType Directory -Path $baseDir | Out-Null }

$featureName = "signaling"
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

# 1. Register User & Login
Write-Host "`n1. Setting up User..."
$uniqueID = Get-Random
$email = "signaluser_$uniqueID@example.com"
$username = "signal_user"
$password = "password123"

$registerBody = @{ email = $email; password = $password; username = $username } | ConvertTo-Json
try {
    $regResponse = Invoke-RestMethod -Uri "http://localhost:8080/api/v1/auth/register" -Method Post -Body $registerBody -ContentType "application/json"
    Write-Host "   Registration Success: $($regResponse.user_id)"
} catch {
    Write-Host "   Registration Failed: $_"
    exit 1
}

$loginBody = @{ email = $email; password = $password } | ConvertTo-Json
try {
    $loginResponse = Invoke-RestMethod -Uri "http://localhost:8080/api/v1/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.access_token
    Write-Host "   Login Success. Token acquired."
} catch {
    Write-Host "   Login Failed: $_"
    exit 1
}

# 2. WebSocket Connection Test
Write-Host "`n2. Connecting to WebSocket Signaling..."

# PowerShell doesn't have built-in WebSocket client easily accessible. 
# We'll use a simple C# inline script or Node.js if available. 
# Checking if node is available...
try {
    $nodeVersion = node --version
    Write-Host "   Node.js found: $nodeVersion"
    
    # Create simple node script for WS test
    $wsScript = @"
const WebSocket = require('ws');
const token = '$token';
const wsUrl = 'ws://localhost:8080/api/v1/ws/signaling?token=' + token;

console.log('Connecting to ' + wsUrl);
const ws = new WebSocket(wsUrl);

ws.on('open', function open() {
  console.log('WS Open');
  // Send a signal
  ws.send(JSON.stringify({
    type: 1, // OFFER
    target_peer_id: 'some_other_id',
    sdp: 'dummy_sdp',
    ice_candidate: 'dummy_ice'
  }));
  
  // Close after short delay
  setTimeout(() => {
    ws.close();
    process.exit(0);
  }, 1000);
});

ws.on('message', function incoming(data) {
  console.log('WS Message: ' + data);
});

ws.on('error', function error(err) {
  console.error('WS Error: ' + err);
  process.exit(1);
});
"@
    $wsScript | Out-File ".test/test_api_signaling_ws_client.js" -Encoding utf8
    
    # Install ws package if needed (local)
    if (-not (Test-Path "node_modules/ws")) {
        Write-Host "   Installing 'ws' package..."
        npm install ws --no-save | Out-Null
    }

    Write-Host "   Running Node.js WS Client..."
    node .test/test_api_signaling_ws_client.js
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   WS Test Passed (Check detailed log for 'WS Open')"
    } else {
        Write-Host "   WS Test Failed"
    }

} catch {
    Write-Host "   Node.js not found or error. Skipping WS test."
}

Stop-Transcript
