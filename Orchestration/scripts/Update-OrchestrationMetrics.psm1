### BEGIN FILE: scripts\Update-OrchestrationMetrics.psm1
<#
.SYNOPSIS
  Parses the most recent Commissioner.txt, logs metrics, updates dashboard JSON, and launches the dashboard.

.DESCRIPTION
  Reads Commissioner outputs under /runs/<timestamp>/, extracts score, PDI, trend, and momentum.
  Writes updates to Milestone_Log.json and Metrics_Trend.json, and calls Write-CurrentGoal.ps1.
#>

function Update-OrchestrationMetrics {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$BaseDir
    )

    Write-Host "📑 Parsing Commissioner output..." -ForegroundColor Cyan
    $runsPath = Join-Path $BaseDir 'runs'
    if (-not (Test-Path $runsPath)) {
        Write-Warning "Runs folder not found: $runsPath"
        return
    }

    # Get most recent run folder
    $latestRun = Get-ChildItem -Directory $runsPath | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $latestRun) {
        Write-Warning "No run folders found under $runsPath"
        return
    }

    $commPath = Join-Path $latestRun.FullName 'Commissioner.txt'
    if (-not (Test-Path $commPath)) {
        Write-Warning "No Commissioner.txt found in latest run ($($latestRun.Name))"
        return
    }

    $content = Get-Content -Raw $commPath

    # --- Extract values safely ---
    $score = if ($content -match 'Score[:=]\s*([0-9]+(?:\.[0-9]+)?)') { [double]$matches[1] } else { 0 }
    $pdi   = if ($content -match 'PDI\s*([+\-]?[0-9]+(?:\.[0-9]+)?)') { [double]$matches[1] } else { 0 }
    $trend = if ($content -match 'Trend\s*[:=]?\s*([A-Za-z↑↓↔]+)') { $matches[1] } else { '↔' }
    $momentum = if ($content -match 'Momentum\s*[:=]?\s*([A-Za-z]+)') { $matches[1] } else { 'Stable' }

    # --- Normalize numeric fields ---
    $score = [double]($score -as [double] -or 0)
    $pdi   = [double]($pdi   -as [double] -or 0)

    try {
    $scoreStr = if ($score -is [double]) { "{0:N1}" -f $score } else { "N/A" }
    $pdiStr   = if ($pdi   -is [double]) { "{0,+6:N2}" -f $pdi } else { "N/A" }
    Write-Host "📈 Commissioner $scoreStr | PDI $pdiStr | Trend $trend | Momentum: $momentum" -ForegroundColor Green
}
catch {
    Write-Warning ("Unable to format metrics output: {0}" -f $_.Exception.Message)
}

    # --- Build data object ---
    $entry = [ordered]@{
        Timestamp = (Get-Date).ToString('s')
        Score     = $score
        PDI       = $pdi
        Trend     = $trend
        Momentum  = $momentum
        RunPath   = $latestRun.FullName
    }

    # --- Write to JSON logs ---
    $dataDir = Join-Path $BaseDir 'MilestoneDashboard\public\data'
    if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Force -Path $dataDir | Out-Null }

    $logFile = Join-Path $dataDir 'Milestone_Log.json'
    $trendFile = Join-Path $dataDir 'Metrics_Trend.json'

    $logs = @()
    if (Test-Path $logFile) {
        try { $logs = (Get-Content -Raw $logFile | ConvertFrom-Json) } catch { $logs = @() }
    }
    $logs += $entry
    $logs | ConvertTo-Json -Depth 5 | Set-Content $logFile -Encoding UTF8

    # Trend file contains only last 20 entries
    $trendData = $logs | Select-Object -Last 20
    $trendData | ConvertTo-Json -Depth 5 | Set-Content $trendFile -Encoding UTF8

    # --- Write current goal (dashboard sync) ---
    $goalScript = Join-Path $BaseDir 'scripts\Write-CurrentGoal.ps1'
    if (Test-Path $goalScript) {
        & $goalScript -BaseDir $BaseDir -Goal "Optimize orchestration performance via analytics and insights" -Score $score -Trend $trend -Momentum $momentum
    }

    # --- Launch dashboard ---
    $indexPath = Join-Path $BaseDir 'MilestoneDashboard\index.html'
    if (Test-Path $indexPath) {
        Write-Host "🌍 Opening Milestone Dashboard..." -ForegroundColor Cyan
        Start-Process $indexPath
    } else {
        Write-Warning "Dashboard index.html not found at $indexPath"
    }

    Write-Host "✅ Metrics update complete." -ForegroundColor Green
}

Export-ModuleMember -Function Update-OrchestrationMetrics
### END FILE
