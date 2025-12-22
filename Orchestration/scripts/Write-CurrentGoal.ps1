### BEGIN FILE: scripts\Write-CurrentGoal.ps1
<#
.SYNOPSIS
  Writes current orchestration goal and score to JSON for dashboard header display.
#>

param(
    [Parameter(Mandatory)]
    [string]$BaseDir,
    [Parameter(Mandatory)]
    [string]$Goal,
    [Parameter()]
    [double]$Score = 0,
    [Parameter()]
    [string]$Trend = "↔",
    [Parameter()]
    [string]$Momentum = "Stable"
)

try {
    $dataDir = Join-Path $BaseDir 'MilestoneDashboard\public\data'
    if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Force -Path $dataDir | Out-Null }

    $GoalPath = Join-Path $dataDir 'CurrentGoal.json'

    $goalData = [ordered]@{
        Timestamp = (Get-Date).ToString('s')
        Goal      = $Goal
        Score     = [double]$Score
        Trend     = $Trend
        Momentum  = $Momentum
    }

    $goalData | ConvertTo-Json -Depth 3 | Set-Content $GoalPath -Encoding UTF8

    Write-Host "🪶 Updated dashboard goal JSON: $Goal" -ForegroundColor Green
}
catch {
    # FIX: avoid colon parsing and preserve readability
    Write-Warning ("Failed to write {0}: {1}" -f $GoalPath, $_.Exception.Message)
}
### END FILE
