# Test script: verify ownerId consistency between work-queue and lead detail
# Usage: .\test-lead-owner-consistency.ps1

$baseUrl = "http://localhost:3000"
$token = $env:APP_ADMIN_TOKEN

if (-not $token) {
    Write-Host "ERROR: APP_ADMIN_TOKEN not set" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Owner Consistency Test ===" -ForegroundColor Cyan

# 1. Get first user
$users = Invoke-RestMethod -Uri "$baseUrl/api/admin/users" -Headers @{ Authorization = "Bearer $token" }
$nonSystem = $users.items | Where-Object { $_.email -ne "system@gobii.internal" }
if ($nonSystem.Count -eq 0) {
    Write-Host "No non-system users. Create one first with test-create-user.ps1" -ForegroundColor Yellow
    exit 1
}
$user = $nonSystem[0]
Write-Host "Using user: $($user.name) ($($user.id))" -ForegroundColor Gray

# 2. Get first lead from work queue
$queue = Invoke-RestMethod -Uri "$baseUrl/api/admin/leads/work-queue" -Headers @{ Authorization = "Bearer $token" }
if ($queue.count -eq 0) {
    Write-Host "No leads in queue" -ForegroundColor Yellow
    exit 0
}
$lead = $queue.items[0]
Write-Host "Lead: $($lead.company) ($($lead.id))" -ForegroundColor Gray

# 3. Assign owner
Write-Host "`nAssigning owner..." -ForegroundColor Gray
$assignResult = Invoke-RestMethod `
    -Uri "$baseUrl/api/admin/leads/$($lead.id)/owner" `
    -Method Patch `
    -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } `
    -Body (@{ ownerId = $user.id } | ConvertTo-Json)
Write-Host "Assigned: $($assignResult.lead.owner.name)" -ForegroundColor Green

# 4. Check work-queue
Write-Host "`nChecking work-queue..." -ForegroundColor Gray
$queue2 = Invoke-RestMethod -Uri "$baseUrl/api/admin/leads/work-queue" -Headers @{ Authorization = "Bearer $token" }
$wqLead = $queue2.items | Where-Object { $_.id -eq $lead.id }
$wqOwnerId = $wqLead.ownerId
$wqOwnerName = $wqLead.ownerName
Write-Host "  Work Queue: ownerId=$wqOwnerId ownerName=$wqOwnerName"

# 5. Check lead detail
Write-Host "Checking lead detail..." -ForegroundColor Gray
$detail = Invoke-RestMethod -Uri "$baseUrl/api/admin/leads/$($lead.id)" -Headers @{ Authorization = "Bearer $token" }
$detailOwnerId = $detail.item.ownerId
$detailOwnerName = $detail.item.ownerName
$detailOwnerEmail = $detail.item.ownerEmail
Write-Host "  Lead Detail: ownerId=$detailOwnerId ownerName=$detailOwnerName ownerEmail=$detailOwnerEmail"

# 6. Compare
Write-Host "`n--- Consistency Check ---" -ForegroundColor Cyan
if ($wqOwnerId -eq $detailOwnerId -and $wqOwnerId -eq $user.id) {
    Write-Host "PASS: ownerId matches across all endpoints ($wqOwnerId)" -ForegroundColor Green
} else {
    Write-Host "FAIL: ownerId mismatch!" -ForegroundColor Red
    Write-Host "  Expected: $($user.id)"
    Write-Host "  Work Queue: $wqOwnerId"
    Write-Host "  Lead Detail: $detailOwnerId"
}
