# Test: Agent Feed endpoint
# Usage: .\test-agent-feed.ps1 [-baseUrl "http://localhost:3000"]

param([string]$baseUrl = "https://gobii-results-manager.onrender.com")

$token = $env:APP_ADMIN_TOKEN
if (-not $token) { Write-Host "ERROR: APP_ADMIN_TOKEN not set" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "=== Agent Feed Test ===" -ForegroundColor Cyan
Write-Host "Base: $baseUrl" -ForegroundColor Gray

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/admin/agents/runs?window=24h&take=20" -Headers @{ Authorization = "Bearer $token" }

    Write-Host ""
    Write-Host "Summary (24h):" -ForegroundColor White
    Write-Host "  SUCCESS: $($response.summary.success)" -ForegroundColor Green
    Write-Host "  SKIPPED: $($response.summary.skipped)" -ForegroundColor Yellow
    Write-Host "  ERROR:   $($response.summary.error)" -ForegroundColor Red
    Write-Host "  Total:   $($response.count)" -ForegroundColor White

    if ($response.items -and $response.items.Count -gt 0) {
        Write-Host ""
        Write-Host "Top 20 runs:" -ForegroundColor White
        $tableData = @()
        foreach ($item in ($response.items | Select-Object -First 20)) {
            $statusLabel = switch ($item.status) {
                "SUCCESS" { "OK" }
                "ERROR" { "ERR" }
                "SKIPPED" { "SKIP" }
                default { $item.status }
            }
            $tableData += [PSCustomObject]@{
                Date      = if ($item.createdAt) { ([DateTime]$item.createdAt).ToString("dd/MM HH:mm") } else { "-" }
                Agent     = $item.agent
                Endpoint  = $item.endpoint
                Status    = $statusLabel
                Processed = $item.processed
                Created   = $item.created
                Updated   = $item.updated
                Skipped   = $item.skipped
            }
        }
        $tableData | Format-Table -AutoSize
    } else {
        Write-Host ""
        Write-Host "No runs in the last 24h." -ForegroundColor Yellow
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
}

