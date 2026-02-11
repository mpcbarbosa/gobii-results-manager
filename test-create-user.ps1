# Test script for POST /api/admin/users
# Usage: .\test-create-user.ps1

$baseUrl = "http://localhost:3000"
$token = $env:APP_ADMIN_TOKEN

if (-not $token) {
    Write-Host "ERROR: APP_ADMIN_TOKEN not set" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Create User ===" -ForegroundColor Cyan

$payload = @{
    name = "Miguel Barbosa"
    email = "miguel@gobii.pt"
    role = "ADMIN"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod `
        -Uri "$baseUrl/api/admin/users" `
        -Method Post `
        -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } `
        -Body $payload

    Write-Host "SUCCESS!" -ForegroundColor Green
    Write-Host "User: $($response.item.name) ($($response.item.email))" -ForegroundColor White
    Write-Host "ID: $($response.item.id)" -ForegroundColor Gray
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -eq 409) {
        Write-Host "User already exists (409 Conflict) — idempotent!" -ForegroundColor Yellow
    } else {
        Write-Host "ERROR ($status): $($_.Exception.Message)" -ForegroundColor Red
    }
    if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
}

# List all users
Write-Host "`n=== All Users ===" -ForegroundColor Cyan
try {
    $users = Invoke-RestMethod -Uri "$baseUrl/api/admin/users" -Headers @{ Authorization = "Bearer $token" }
    $users.items | ForEach-Object {
        Write-Host "  $($_.name) ($($_.email)) - $($_.role) - $($_.id)"
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
}
