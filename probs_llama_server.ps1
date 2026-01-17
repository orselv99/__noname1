$response = Invoke-RestMethod -Uri "http://localhost:8084/embedding" -Method Post -ContentType "application/json" -Body '{"content": "test"}'
$response | ConvertTo-Json -Depth 5
