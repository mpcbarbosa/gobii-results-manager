# Test: Sector Intelligence ingest endpoint
# Usage: .\test-ingest-sectors.ps1 [-baseUrl "http://localhost:3000"]

param([string]$baseUrl = "https://gobii-results-manager.onrender.com")

$token = $env:APP_INGEST_TOKEN
if (-not $token) { Write-Host "ERROR: APP_INGEST_TOKEN not set" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Sector Intelligence Ingest Test ===" -ForegroundColor Cyan
Write-Host "Base: $baseUrl" -ForegroundColor Gray

# Test 1: PT field names ("setor")
Write-Host "`n1) Ingesting with PT field names (setor)..." -ForegroundColor Gray
$payloadPT = @{
    meta = @{ agent = "SAP_S4HANA_SectorInvestmentScanner_Daily"; confidence = "Alta" }
    sectors = @(
        @{
            setor = "IndÃºstria FarmacÃªutica"
            growth = "high"
            investmentIntensity = "high"
            maturity = "mature"
            probabilidade_ERP = "Alta"
            fonte_principal = "https://example.com/pharma-report"
            detected_at = (Get-Date -Format "yyyy-MM-dd")
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $r1 = Invoke-RestMethod -Uri "$baseUrl/api/ingest/sectors" -Method Post -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } -Body $payloadPT
    Write-Host "  Created: $($r1.created) | Updated: $($r1.updated) | Skipped: $($r1.skipped)" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: EN field names ("sector") â€” should upsert
Write-Host "`n2) Ingesting with EN field names (sector, upsert)..." -ForegroundColor Gray
$payloadEN = @{
    meta = @{ agent = "SAP_S4HANA_SectorInvestmentScanner_Daily"; confidence = "High" }
    sectors = @(
        @{
            sector = "IndÃºstria FarmacÃªutica"
            growth = "high"
            investmentIntensity = "high"
            maturity = "mature"
            erpProbability = "HIGH"
            source = "https://example.com/pharma-report-v2"
            detected_at = (Get-Date -Format "yyyy-MM-dd")
        },
        @{
            sector = "LogÃ­stica e Transportes"
            growth = "moderate"
            investmentIntensity = "medium"
            maturity = "emerging"
            erpProbability = "MEDIUM"
            source = "https://example.com/logistics-report"
            detected_at = (Get-Date -Format "yyyy-MM-dd")
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $r2 = Invoke-RestMethod -Uri "$baseUrl/api/ingest/sectors" -Method Post -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } -Body $payloadEN
    Write-Host "  Created: $($r2.created) | Updated: $($r2.updated) | Skipped: $($r2.skipped)" -ForegroundColor Green
    $r2.items | ForEach-Object { Write-Host "    $($_.sector): $($_.action) - $($_.reason)" }
} catch {
    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Test Complete ===" -ForegroundColor Cyan


