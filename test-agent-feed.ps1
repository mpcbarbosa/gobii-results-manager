# Test: Agent Feed endpoint
# Usage: .\test-agent-feed.ps1

param([string]$baseUrl = "https://gobii-results-manager.onrender.com")

$token = $env:APP_ADMIN_TOKEN
if (-not $token) { Write-Host "ERROR: APP_ADMIN_TOKEN not set" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Agent Feed Test ===" -ForegroundColor Cyan
Write-Host "Base: $baseUrl" -ForegroundColor Gray

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/admin/agents/runs?window=24h&take=20" -Headers @{ Authorization = "Bearer $token" }

    Write-Host "`nSummary (24h):" -ForegroundColor White
    Write-Host "  SUCCESS: $($response.summary.success)" -ForegroundColor Green
    Write-Host "  SKIPPED: $($response.summary.skipped)" -ForegroundColor Yellow
    Write-Host "  ERROR:   $($response.summary.error)" -ForegroundColor Red

    if ($response.items.Count -gt 0) {
        Write-Host "`nTop 20 runs:" -ForegroundColor White
        $response.items | Select-Object -First 20 | ForEach-Object {
            $status = if ($_.status -eq "SUCCESS") { "✓" } elseif ($_.status -eq "ERROR") { "✕" } else { "⊘" }
            Write-Host "  $status $($_.agent) | $($_.endpoint) | P:$($_.processed) C:$($_.created) U:$($_.updated) S:$($_.skipped) | $($_.createdAt)"
        }
    } else {
        Write-Host "`nNo runs in the last 24h." -ForegroundColor Yellow
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
}
