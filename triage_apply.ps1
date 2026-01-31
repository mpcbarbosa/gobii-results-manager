param(
  [Parameter(Mandatory=$true)][string]$CsvPath,
  [int]$DelayMs = 120,
  [switch]$DryRun
)

if (-not (Test-Path $CsvPath)) { throw "CSV não encontrado: $CsvPath" }

$allowedStatuses = @(
  "NEW","REVIEWING","QUALIFIED","DISQUALIFIED","CONTACTED",
  "ENGAGED","NURTURING","READY_HANDOFF","HANDED_OFF","ARCHIVED"
)

$rows = Import-Csv -Path $CsvPath -Delimiter ';'

$ok = 0; $fail = 0; $skipped = 0
$results = @()

foreach ($r in $rows) {
  $id = ($r.id).Trim()
  if ([string]::IsNullOrWhiteSpace($id)) { $skipped++; $results += [pscustomobject]@{ id=""; result="SKIP"; reason="missing id" }; continue }

  $body = @{}

  if (-not [string]::IsNullOrWhiteSpace($r.status)) {
    $st = ($r.status).Trim()
    if ($allowedStatuses -notcontains $st) { $fail++; $results += [pscustomobject]@{ id=$id; result="FAIL"; reason="invalid status: $st" }; continue }
    $body.status = $st
  }

  if ($null -ne $r.notes -and ($r.notes.Trim()).Length -gt 0) { $body.notes = $r.notes }
  if ($null -ne $r.owner -and ($r.owner.Trim()).Length -gt 0) { $body.owner = ($r.owner).Trim() }

  if (-not [string]::IsNullOrWhiteSpace($r.nextActionAt)) {
    $dt = ($r.nextActionAt).Trim()
    try { [DateTime]::Parse($dt) | Out-Null; $body.nextActionAt = $dt }
    catch { $fail++; $results += [pscustomobject]@{ id=$id; result="FAIL"; reason="invalid nextActionAt: $dt" }; continue }
  }

  if ($body.Keys.Count -eq 0) { $skipped++; $results += [pscustomobject]@{ id=$id; result="SKIP"; reason="no fields to update" }; continue }

  $json = ($body | ConvertTo-Json -Depth 6)

  if ($DryRun) { $ok++; $results += [pscustomobject]@{ id=$id; result="DRYRUN"; reason=($json -replace "`n"," ") }; continue }

  try {
    $resp = Invoke-RestMethod `
      -Uri "$baseUrl/api/admin/leads/$id" `
      -Method Patch `
      -Headers $adminHeaders `
      -ContentType "application/json; charset=utf-8" `
      -Body $json

    $ok++
    $results += [pscustomobject]@{
      id=$id; result="OK"; status=$resp.lead.status; owner=$resp.lead.owner;
      nextActionAt=$resp.lead.nextActionAt; updatedAt=$resp.lead.updatedAt
    }
  } catch {
    $fail++
    $msg = ""
    try { $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream()); $msg = $reader.ReadToEnd() }
    catch { $msg = $_.Exception.Message }
    $results += [pscustomobject]@{ id=$id; result="FAIL"; reason=$msg }
  }

  Start-Sleep -Milliseconds $DelayMs
}

$results | Format-Table -AutoSize
"`nResumo: OK=$ok | FAIL=$fail | SKIP=$skipped`n"
