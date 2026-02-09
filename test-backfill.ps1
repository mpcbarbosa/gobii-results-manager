# Test script for POST /api/admin/leads/backfill-signals
# Usage: .\test-backfill.ps1
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

# --- DRY RUN ---
Write-Host "`n=== Backfill Signals (DRY RUN) ===" -ForegroundColor Cyan
Write-Host "Calling POST /api/admin/leads/backfill-signals...`n" -ForegroundColor Gray

$dryPayload = @{
    take = 50
    dryRun = $true
    lookbackDays = 30
    onlyIfNoSystemInDays = 30
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod `
        -Uri "$baseUrl/api/admin/leads/backfill-signals" `
        -Method Post `
        -Headers @{
            "Authorization" = "Bearer $token"
            "Content-Type"  = "application/json"
        } `
        -Body $dryPayload

    if (-not $response.success) {
        Write-Host "API returned success=false" -ForegroundColor Red
        $response | ConvertTo-Json -Depth 5
        exit 1
    }

    Write-Host "Scanned: $($response.scanned)" -ForegroundColor White
    Write-Host "Eligible: $($response.eligible)" -ForegroundColor Green
    Write-Host "Skipped: $($response.skipped)" -ForegroundColor Yellow
    Write-Host "Created: $($response.created) (dry run = $($response.dryRun))" -ForegroundColor Cyan
    Write-Host ""

    if ($response.items -and $response.items.Count -gt 0) {
        $tableData = @()
        foreach ($item in $response.items) {
            $tableData += [PSCustomObject]@{
                Company    = $item.company
                Domain     = if ($item.domain) { $item.domain } else { "-" }
                Category   = $item.inferredCategory
                Confidence = $item.inferredConfidence
                Created    = $item.created
                Reason     = $item.reason
            }
        }
        $tableData | Format-Table -AutoSize -Wrap
    } else {
        Write-Host "No items returned." -ForegroundColor Yellow
    }

} catch {
    Write-Host "`nERROR!" -ForegroundColor Red
    Write-Host "Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "Message: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Details:" -ForegroundColor Yellow
        Write-Host $_.ErrorDetails.Message
    }
}

# --- ACTUAL RUN (uncomment to execute) ---
# Write-Host "`n=== Backfill Signals (ACTUAL RUN - take 20) ===" -ForegroundColor Red
# $realPayload = @{
#     take = 20
#     dryRun = $false
#     lookbackDays = 30
#     onlyIfNoSystemInDays = 30
# } | ConvertTo-Json
#
# try {
#     $response = Invoke-RestMethod `
#         -Uri "$baseUrl/api/admin/leads/backfill-signals" `
#         -Method Post `
#         -Headers @{
#             "Authorization" = "Bearer $token"
#             "Content-Type"  = "application/json"
#         } `
#         -Body $realPayload
#
#     Write-Host "Created: $($response.created)" -ForegroundColor Green
#     Write-Host "Skipped: $($response.skipped)" -ForegroundColor Yellow
#     $response.items | ForEach-Object {
#         Write-Host "  $($_.company) -> $($_.inferredCategory) ($($_.inferredConfidence)) [$($_.reason)]"
#     }
# } catch {
#     Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
# }
