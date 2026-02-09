# Test script for POST /api/ingest/activity endpoint
# Usage: .\test-activity-ingest.ps1

$baseUrl = "http://localhost:3000"
$token = $env:APP_INGEST_TOKEN

if (-not $token) {
    Write-Host "ERROR: APP_INGEST_TOKEN environment variable not set" -ForegroundColor Red
    Write-Host "Set it with: `$env:APP_INGEST_TOKEN = 'your-token-here'" -ForegroundColor Yellow
    exit 1
}

# Test payload
$payload = @{
    company = @{
        name = "Grupo Exemplo"
        domain = "exemplo.pt"
    }
    activity = @{
        title = "RFP identificado para ERP"
        notes = "Entidade lançou concurso com referência a ERP / SAP S/4HANA."
        meta = @{
            agent = "SAP_S4HANA_RFPScanner_Daily"
            category = "RFP"
            confidence = "HIGH"
            source_url = "https://example.com/rfp/12345"
            detected_at = "2026-02-09"
        }
    }
} | ConvertTo-Json -Depth 10

Write-Host "Testing POST /api/ingest/activity..." -ForegroundColor Cyan
Write-Host "Payload:" -ForegroundColor Yellow
Write-Host $payload

try {
    $response = Invoke-RestMethod `
        -Uri "$baseUrl/api/ingest/activity" `
        -Method Post `
        -Headers @{
            "Authorization" = "Bearer $token"
            "Content-Type" = "application/json"
        } `
        -Body $payload
    
    Write-Host "`nSUCCESS!" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Yellow
    $response | ConvertTo-Json -Depth 10
    
} catch {
    Write-Host "`nERROR!" -ForegroundColor Red
    Write-Host "Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "Message: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        Write-Host "Details:" -ForegroundColor Yellow
        Write-Host $_.ErrorDetails.Message
    }
}
