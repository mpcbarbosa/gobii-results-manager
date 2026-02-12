# Test: Expansion Scanner agent ingest
$baseUrl = "http://localhost:3000"
$token = $env:APP_INGEST_TOKEN
$adminToken = $env:APP_ADMIN_TOKEN

if (-not $token) { Write-Host "ERROR: APP_INGEST_TOKEN not set" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Expansion Scanner Test ===" -ForegroundColor Cyan

$payload = @{
    company = @{ name = "Grupo Exemplo"; domain = "exemplo.pt" }
    activity = @{
        title = "Expansão empresarial identificada"
        notes = "Empresa anunciou: Nova fábrica em Setúbal`nImpacto ERP: Alto - necessidade de novo módulo logístico`nFonte: https://example.com/expansion/123"
        meta = @{
            agent = "SAP_S4HANA_ExpansionScanner_Daily"
            category = "EXPANSION"
            confidence = "Alta"
            source_url = "https://example.com/expansion/123"
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

# Verify dedupe
Write-Host "`nDedupe test..." -ForegroundColor Gray
try {
    $r2 = Invoke-RestMethod -Uri "$baseUrl/api/ingest/activity" -Method Post -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } -Body $payload
    if ($r2.duplicated) { Write-Host "PASS: Duplicate detected" -ForegroundColor Green }
    else { Write-Host "Second ingest: activityId=$($r2.activityId)" -ForegroundColor Yellow }
} catch { Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red }
