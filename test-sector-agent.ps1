# Test: Sector Intelligence endpoint
$baseUrl = "http://localhost:3000"
$token = $env:APP_ADMIN_TOKEN

if (-not $token) { Write-Host "ERROR: APP_ADMIN_TOKEN not set" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Sector Intelligence Test ===" -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/admin/intelligence/sectors" -Headers @{ Authorization = "Bearer $token" }
    Write-Host "Sectors: $($response.count)" -ForegroundColor Green
    if ($response.count -gt 0) {
        $response.items | Select-Object -First 5 | ForEach-Object {
            Write-Host "  $($_.sector) | Growth: $($_.growth) | ERP: $($_.erpProbability) | $($_.detectedAt)"
        }
    } else {
        Write-Host "  No sector data yet (ingest via SectorInvestmentScanner)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

