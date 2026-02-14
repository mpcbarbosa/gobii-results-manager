# Test script for GET /api/admin/leads/work-queue
# Usage: .\test-work-queue.ps1
#
# Requires: APP_ADMIN_TOKEN environment variable
# Set it with: $env:APP_ADMIN_TOKEN = 'your-token-here'

$baseUrl = "http://localhost:3000"
$token = $env:APP_ADMIN_TOKEN

if (-not $token) {
    Write-Host "ERROR: APP_ADMIN_TOKEN environment variable not set" -ForegroundColor Red
    Write-Host "Set it with: `$env:APP_ADMIN_TOKEN = 'your-token-here'" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n=== Commercial Work Queue ===" -ForegroundColor Cyan
Write-Host "Calling GET /api/admin/leads/work-queue...`n" -ForegroundColor Gray

try {
    $response = Invoke-RestMethod `
        -Uri "$baseUrl/api/admin/leads/work-queue" `
        -Method Get `
        -Headers @{
            "Authorization" = "Bearer $token"
            "Content-Type"  = "application/json"
        }

    if (-not $response.success) {
        Write-Host "API returned success=false" -ForegroundColor Red
        $response | ConvertTo-Json -Depth 5
        exit 1
    }

    Write-Host "Total leads in queue: $($response.count)`n" -ForegroundColor Green

    if ($response.count -eq 0) {
        Write-Host "No leads in the work queue (all may be terminal or no leads exist)." -ForegroundColor Yellow
        exit 0
    }

    # Build table data
    $tableData = @()
    foreach ($item in $response.items) {
        $reasonsStr = if ($item.reasons -and $item.reasons.Count -gt 0) {
            ($item.reasons -join "; ")
        } else {
            "-"
        }

        $lastSignal = if ($item.lastSignalAt) {
            ([DateTime]$item.lastSignalAt).ToString("yyyy-MM-dd HH:mm")
        } else {
            "-"
        }

        $tableData += [PSCustomObject]@{
            Company     = $item.company
            Temperature = $item.temperature
            Signal      = $item.signalLevel
            Score       = if ($null -ne $item.score_final) { [math]::Round($item.score_final, 1) } else { "-" }
            Reasons     = $reasonsStr
            LastSignal  = $lastSignal
            Status      = $item.status
        }
    }

    # Display as formatted table
    $tableData | Format-Table -AutoSize -Wrap

    # Summary by temperature
    Write-Host "`n--- Summary ---" -ForegroundColor Cyan
    $hot  = ($response.items | Where-Object { $_.temperature -eq "HOT" }).Count
    $warm = ($response.items | Where-Object { $_.temperature -eq "WARM" }).Count
    $cold = ($response.items | Where-Object { $_.temperature -eq "COLD" }).Count

    Write-Host "  HOT:  $hot" -ForegroundColor Red
    Write-Host "  WARM: $warm" -ForegroundColor Yellow
    Write-Host "  COLD: $cold" -ForegroundColor Blue
    Write-Host ""

} catch {
    Write-Host "`nERROR!" -ForegroundColor Red
    Write-Host "Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "Message: $($_.Exception.Message)" -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        Write-Host "Details:" -ForegroundColor Yellow
        Write-Host $_.ErrorDetails.Message
    }
}

