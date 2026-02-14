# Test: Sector Intelligence cleanup
# Usage: .\test-sector-cleanup.ps1 [-baseUrl "http://localhost:3000"]

param([string]$baseUrl = "https://gobii-results-manager.onrender.com")

$token = $env:APP_ADMIN_TOKEN
if (-not $token) { Write-Host "ERROR: APP_ADMIN_TOKEN not set" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "=== Sector Cleanup Test ===" -ForegroundColor Cyan
Write-Host "Base: $baseUrl" -ForegroundColor Gray

# 1. Before
Write-Host ""
Write-Host "1) Before cleanup:" -ForegroundColor Gray
try {
    $before = Invoke-RestMethod -Uri "$baseUrl/api/admin/intelligence/sectors" -Headers @{ Authorization = "Bearer $token" }
    Write-Host "  Sectors: $($before.count)" -ForegroundColor White
    $corrupted = @()
    foreach ($item in $before.items) {
        if ($item.sector -match "[\u00C3\u00C2]" -or $item.sector -match "FFFD" -or $item.sector -match "\?") {
            $corrupted += $item
        }
    }
    Write-Host "  Potentially corrupted: $($corrupted.Count)" -ForegroundColor $(if ($corrupted.Count -gt 0) { "Red" } else { "Green" })
    foreach ($c in $corrupted) {
        Write-Host "    - $($c.sector)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 2. Run cleanup
Write-Host ""
Write-Host "2) Running cleanup..." -ForegroundColor Gray
try {
    $result = Invoke-RestMethod `
        -Uri "$baseUrl/api/admin/intelligence/sectors/cleanup" `
        -Method Post `
        -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } `
        -Body "{}"

    Write-Host "  Scanned: $($result.scanned)" -ForegroundColor White
    Write-Host "  Groups: $($result.groups)" -ForegroundColor White
    Write-Host "  Renamed: $($result.renamed)" -ForegroundColor Cyan
    Write-Host "  Merged: $($result.merged)" -ForegroundColor Cyan
    Write-Host "  Deleted: $($result.deleted)" -ForegroundColor Yellow

    if ($result.items -and $result.items.Count -gt 0) {
        Write-Host ""
        foreach ($item in $result.items) {
            Write-Host "    [$($item.action)] $($item.from) -> $($item.to) ($($item.reason))"
        }
    }
} catch {
    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) { Write-Host "  $($_.ErrorDetails.Message)" }
    exit 1
}

# 3. After
Write-Host ""
Write-Host "3) After cleanup:" -ForegroundColor Gray
try {
    $after = Invoke-RestMethod -Uri "$baseUrl/api/admin/intelligence/sectors" -Headers @{ Authorization = "Bearer $token" }
    Write-Host "  Sectors: $($after.count)" -ForegroundColor White
    foreach ($item in $after.items) {
        Write-Host "    - $($item.sector)" -ForegroundColor White
    }
} catch {
    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Test Complete ===" -ForegroundColor Cyan
