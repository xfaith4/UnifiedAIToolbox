<#
.SYNOPSIS
  Initializes the AI-Orchestration environment and runs the latest build.

.DESCRIPTION
  Checks and creates required directories, ensures JSON data files exist,
  validates structure, then launches POF.ps1 for a complete orchestration run.

.NOTES
  Compatible with PowerShell 5.1 and 7+.
  Designed for single-click execution from taskbar or Start menu shortcut.
#>

$CommonModule = Join-Path $PSScriptRoot "..\modules\Orchestration.Common.psm1"
if (-not (Test-Path $CommonModule)) {
    throw "Shared orchestration module not found at $CommonModule"
}
$CommonModule = (Resolve-Path $CommonModule).Path
Import-Module $CommonModule -Force

# region Config
$BaseDir      = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir      = Split-Path $BaseDir
$ScriptsDir   = Join-Path $RootDir "scripts"
$DataDir      = Join-Path $RootDir "MilestoneDashboard\public\data"
$LogPath      = Join-Path $DataDir "Milestone_Log.json"
$TrendPath    = Join-Path $DataDir "Metrics_Trend.json"
$POFPath      = Join-Path $ScriptsDir "POF.ps1"
# endregion

# region Initialization
Write-Host "`n🚀 Initializing AI-Orchestration environment..." -ForegroundColor Green

Ensure-OrchDirectory $ScriptsDir
Ensure-OrchDirectory $DataDir
Ensure-OrchJsonFile $LogPath
Ensure-OrchJsonFile $TrendPath

if (-not (Test-Path $POFPath)) {
    Write-Host "❌ POF.ps1 not found at $POFPath" -ForegroundColor Red
    exit 1
}
# endregion

# region Execution
Write-Host "✅ Environment verified. Launching orchestration..." -ForegroundColor Cyan

try {
    & $POFPath
} catch {
    Write-Warning "⚠️ Orchestration run failed: $($_.Exception.Message)"
}
# endregion

Write-Host "`n🏁 Orchestration session complete." -ForegroundColor Green
