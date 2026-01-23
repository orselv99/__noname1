# P2P Whiteboard 다중 인스턴스 테스트 스크립트
# 사용법: .\dev-client-multi.ps1 -UserIds @("user1", "user2", "user3")
# 기본값으로 실행 시 user1, user2 두 개의 인스턴스가 실행됩니다.

param(
    # [array] $UserIds: 실행할 사용자 아이디 목록 배열
    # 기본값은 "user1", "user2" 입니다.
    [array]$UserIds = @("user1", "user2")
)

# 배열의 크기를 카운트로 설정합니다.
$Count = $UserIds.Count

Write-Host "=== P2P Whiteboard Multi-Instance Test ===" -ForegroundColor Cyan
Write-Host "Starting $Count instances for users: $($UserIds -join ', ')..." -ForegroundColor Yellow

for ($i = 0; $i -lt $Count; $i++) {
    # 각 인스턴스마다 고유한 포트를 할당합니다.
    $vitePort = 1420 + $i
    $p2pPort = 9000 + $i
    
    # 현재 순서의 사용자 ID를 가져옵니다.
    $userId = $UserIds[$i]
    
    Write-Host "`nStarting Instance $i ($userId)" -ForegroundColor Green
    Write-Host "  - Vite dev server: http://localhost:$vitePort" -ForegroundColor Gray
    Write-Host "  - P2P listening port: $p2pPort" -ForegroundColor Gray
    
    # JSON config를 파일로 저장하여 이스케이프 문제 회피
    # devUrl: 각 인스턴스가 사용할 프론트엔드 주소입니다.
    $configJson = @"
{"build":{"devUrl":"http://localhost:$vitePort"}}
"@
    
    # 각 인스턴스를 별도 PowerShell 창에서 실행합니다.
    # --config: Tauri 설정 JSON을 전달합니다.
    # APP_USER_ID: Rust 백엔드에서 DB 분리를 위해 사용할 환경 변수입니다.
    # VITE_PORT: Vite 개발 서버 포트를 설정합니다.
    $command = @"
cd '$PWD/client'
`$env:INSTANCE_ID = $i
`$env:VITE_PORT = $vitePort
`$env:APP_USER_ID = '$userId'
npm run tauri dev -- --config '$configJson'
"@
    
    # Start-Process를 사용하여 새로운 PowerShell 창을 엽니다.
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $command
    
    # 인스턴스 간 시작 딜레이 (빌드 충돌 방지 및 포트 점유 시간 확보)
    if ($i -lt ($Count - 1)) {
        Write-Host "  Waiting 5 seconds before starting next instance..." -ForegroundColor DarkGray
        Start-Sleep -Seconds 5
    }
}

Write-Host "`n=== All $Count instances started! ===" -ForegroundColor Cyan
Write-Host @"

테스트 방법:
1. 각 인스턴스의 '연결 주소'를 확인합니다 (오른쪽 패널).
2. 인스턴스 0의 주소를 복사합니다.
3. 인스턴스 1의 '피어 연결' 입력창에 붙여넣고 연결합니다.
4. 한쪽에서 그림을 그리면 다른쪽에서 실시간으로 동기화됩니다!
5. 각 인스턴스는 'fiery_horizon_{UserID}.db' 파일을 별도로 사용합니다.

각 인스턴스 설정:
"@ -ForegroundColor White

for ($i = 0; $i -lt $Count; $i++) {
    $vitePort = 1420 + $i
    $userId = $UserIds[$i]
    Write-Host "  Instance $i ($userId) - Vite: $vitePort" -ForegroundColor Yellow
}