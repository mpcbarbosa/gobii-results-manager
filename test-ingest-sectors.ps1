# Test: Sector Intelligence ingest endpoint
# Usage: .\test-ingest-sectors.ps1

$baseUrl = "http://localhost:3000"
$token = $env:APP_INGEST_TOKEN

if (-not $token) { Write-Host "ERROR: APP_INGEST_TOKEN not set" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Sector Intelligence Ingest Test ===" -ForegroundColor Cyan

$payload = @{
    meta = @{
        agent = "SAP_S4HANA_SectorInvestmentScanner_Daily"
        confidence = "Alta"
    }
    sectors = @(
        @{
            sector = "Indústria Farmacêutica"
            growth = "high"
            investmentIntensity = "high"
            maturity = "mature"
            erpProbability = "HIGH"
            source = "https://example.com/pharma-report"
            detected_at = (Get-Date -Format "yyyy-MM-dd")
        },
        @{
            sector = "Logística e Transportes"
            growth = "moderate"
            investmentIntensity = "medium"
            maturity = "emerging"
            erpProbability = "MEDIUM"
            source = "https://example.com/logistics-report"
            detected_at = (Get-Date -Format "yyyy-MM-dd")
        },
        @{
            sector = "Energia Renovável"
            growth = "high"
            investmentIntensity = "high"
            maturity = "emerging"
            erpProbability = "Alta"
            source = "https://example.com/energy-report"
            detected_at = (Get-Date -Format "yyyy-MM-dd")
        }
    )
} | ConvertTo-Json -Depth 10

Write-Host "Ingesting 3 sectors..." -ForegroundColor Gray
try {
    $response = Invoke-RestMethod `
        -Uri "$baseUrl/api/ingest/sectors" `
        -Method Post `
        -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } `
        -Body $payload

    Write-Host "Processed: $($response.processed)" -ForegroundColor White
    Write-Host "Created: $($response.created) | Updated: $($response.updated) | Skipped: $($response.skipped)" -ForegroundColor Green

    $response.items | ForEach-Object {
        Write-Host "  $($_.sector): $($_.action) - $($_.reason)"
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
}

# Test upsert (re-run should update, not create)
Write-Host "`nRe-ingesting (upsert test)..." -ForegroundColor Gray
try {
    $r2 = Invoke-RestMethod `
        -Uri "$baseUrl/api/ingest/sectors" `
        -Method Post `
        -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } `
        -Body $payload

    Write-Host "Created: $($r2.created) | Updated: $($r2.updated) | Skipped: $($r2.skipped)" -ForegroundColor Cyan
    if ($r2.created -eq 0) {
        Write-Host "PASS: No duplicates created (upsert working)" -ForegroundColor Green
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
}
