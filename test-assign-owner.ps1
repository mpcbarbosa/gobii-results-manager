# Test script for PATCH /api/admin/leads/[id]/owner
# Usage: .\test-assign-owner.ps1

$baseUrl = "http://localhost:3000"
$token = $env:APP_ADMIN_TOKEN

if (-not $token) {
    Write-Host "ERROR: APP_ADMIN_TOKEN not set" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Test Owner Assignment ===" -ForegroundColor Cyan

# 1. Get users
Write-Host "`nFetching users..." -ForegroundColor Gray
try {
    $users = Invoke-RestMethod -Uri "$baseUrl/api/admin/users" -Headers @{ Authorization = "Bearer $token" }
    Write-Host "Found $($users.items.Count) users:" -ForegroundColor Green
    $users.items | ForEach-Object { Write-Host "  $($_.name) ($($_.email)) - $($_.id)" }
} catch {
    Write-Host "Failed to fetch users: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 2. Get first lead from work queue
Write-Host "`nFetching work queue..." -ForegroundColor Gray
try {
    $queue = Invoke-RestMethod -Uri "$baseUrl/api/admin/leads/work-queue" -Headers @{ Authorization = "Bearer $token" }
    if ($queue.count -eq 0) {
        Write-Host "No leads in queue" -ForegroundColor Yellow
        exit 0
    }
    $lead = $queue.items[0]
    Write-Host "First lead: $($lead.company) ($($lead.id))" -ForegroundColor Green
    Write-Host "Current owner: $(if ($lead.ownerName) { $lead.ownerName } else { 'None' })"
} catch {
    Write-Host "Failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 3. Assign first user as owner
if ($users.items.Count -gt 0) {
    $userId = $users.items[0].id
    Write-Host "`nAssigning $($users.items[0].name) to $($lead.company)..." -ForegroundColor Gray
    try {
        $result = Invoke-RestMethod `
            -Uri "$baseUrl/api/admin/leads/$($lead.id)/owner" `
            -Method Patch `
            -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } `
            -Body (@{ ownerId = $userId } | ConvertTo-Json)
        Write-Host "SUCCESS: Owner set to $($result.lead.owner.name)" -ForegroundColor Green
    } catch {
        Write-Host "Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}
