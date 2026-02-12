# Test: CLevel Scanner agent ingest
$baseUrl = "http://localhost:3000"
$token = $env:APP_INGEST_TOKEN

if (-not $token) { Write-Host "ERROR: APP_INGEST_TOKEN not set" -ForegroundColor Red; exit 1 }

Write-Host "`n=== CLevel Scanner Test ===" -ForegroundColor Cyan

$payload = @{
    company = @{ name = "Grupo Exemplo"; domain = "exemplo.pt" }
    activity = @{
        title = "Mudança C-Level identificada"
        notes = "Cargo alterado: CTO`nNome: João Silva`nImpacto ERP: Revisão tecnológica provável`nFonte: https://example.com/clevel/456"
        meta = @{
            agent = "SAP_S4HANA_CLevelScanner_Daily"
            category = "CLEVEL"
            confidence = "Alta"
            source_url = "https://example.com/clevel/456"
            detected_at = (Get-Date -Format "yyyy-MM-dd")
        }
    }
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/ingest/activity" -Method Post -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } -Body $payload
    Write-Host "Activity: $($response.activityId)" -ForegroundColor Green
    if ($response.autoTaskId) { Write-Host "Auto-task: $($response.autoTaskId)" -ForegroundColor Green }
    else { Write-Host "No auto-task (may exist)" -ForegroundColor Yellow }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
}
