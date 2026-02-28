[CmdletBinding()]
param(
    [string]$ApiBase = "http://localhost:8000",
    [string]$Model = "gpt-4o-mini"
)

$ErrorActionPreference = "Stop"

function Invoke-JsonPost {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [Parameter(Mandatory = $false)][object]$Body
    )
    if ($null -ne $Body) {
        return Invoke-RestMethod -Method Post -Uri $Uri -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 10)
    }
    return Invoke-RestMethod -Method Post -Uri $Uri
}

Write-Host "Simulation 1: queued -> running -> cancel" -ForegroundColor Cyan
$run1 = Invoke-JsonPost -Uri "$ApiBase/orchestrate/run" -Body @{
    goal = "simulation queued-running-cancel"
    model = $Model
}
$run1Id = $run1.run_id
Write-Host "Created run: $run1Id"

Start-Sleep -Seconds 2
$cancel1 = Invoke-JsonPost -Uri "$ApiBase/api/runs/$run1Id/cancel"
Write-Host "Cancel response: $($cancel1 | ConvertTo-Json -Compress)"

Write-Host "Simulation 2: running -> forced stuck (pause heartbeat) -> lease expiry recovery" -ForegroundColor Cyan
$run2 = Invoke-JsonPost -Uri "$ApiBase/orchestrate/run" -Body @{
    goal = "simulation stuck recovery"
    model = $Model
}
$run2Id = $run2.run_id
Write-Host "Created run: $run2Id"

Start-Sleep -Seconds 3
$manifestPath = Join-Path (Join-Path (Resolve-Path .).Path "apps/orchestration-bridge/runs") "$run2Id.json"
if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Manifest not found: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($null -eq $manifest.lease) {
    Write-Host "Lease not found yet; waiting 3s and retrying..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
}

if ($null -ne $manifest.lease) {
    $manifest.status = "running"
    $manifest.lease.heartbeat_at = "2000-01-01T00:00:00+00:00"
    $manifest.lease.expires_at = "2000-01-01T00:00:00+00:00"
    ($manifest | ConvertTo-Json -Depth 20) | Set-Content -LiteralPath $manifestPath -Encoding UTF8
    Write-Host "Forced stale heartbeat on run manifest."
} else {
    Write-Host "Lease still unavailable; continuing with stale lease release call." -ForegroundColor Yellow
}

$release = Invoke-JsonPost -Uri "$ApiBase/api/runs/release-stale-leases"
Write-Host "Release stale leases response: $($release | ConvertTo-Json -Compress)"

$status2 = Invoke-RestMethod -Method Get -Uri "$ApiBase/orchestrate/run/$run2Id"
Write-Host "Run 2 status after recovery: $($status2.status)"

Write-Host "Simulation complete." -ForegroundColor Green
