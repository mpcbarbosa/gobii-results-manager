# Test script for work queue with SLA data
# Usage: .\test-my-queue.ps1

$baseUrl = "http://localhost:3000"
$token = $env:APP_ADMIN_TOKEN

if (-not $token) {
    Write-Host "ERROR: APP_ADMIN_TOKEN not set" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Work Queue with SLA ===" -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod `
        -Uri "$baseUrl/api/admin/leads/work-queue?sort=sla" `
        -Headers @{ Authorization = "Bearer $token" }

    Write-Host "Total: $($response.count)" -ForegroundColor Green

    $tableData = @()
    foreach ($item in $response.items) {
        $tableData += [PSCustomObject]@{
            Company  = $item.company
            Temp     = $item.temperature
            SLA      = "$($item.sla.status) ($($item.sla.label))"
            Owner    = if ($item.ownerName) { $item.ownerName } else { "-" }
            Status   = $item.status
            Score    = if ($null -ne $item.score_final) { [math]::Round($item.score_final, 1) } else { "-" }
        }
    }

    $tableData | Format-Table -AutoSize

    # Summary
    $overdue = ($response.items | Where-Object { $_.sla.status -eq "OVERDUE" }).Count
    $warning = ($response.items | Where-Object { $_.sla.status -eq "WARNING" }).Count
    $ok = ($response.items | Where-Object { $_.sla.status -eq "OK" }).Count
    $assigned = ($response.items | Where-Object { $_.ownerName }).Count

    Write-Host "--- SLA Summary ---" -ForegroundColor Cyan
    Write-Host "  OVERDUE: $overdue" -ForegroundColor Red
    Write-Host "  WARNING: $warning" -ForegroundColor Yellow
    Write-Host "  OK:      $ok" -ForegroundColor Green
    Write-Host "  Assigned: $assigned / $($response.count)" -ForegroundColor White

} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

