<#
.SYNOPSIS
    Cleans generated artifacts so the AI-Orchestration workspace stays lean.
.DESCRIPTION
    Removes stale run folders, run archives, dashboard synth data and (optionally)
    node_modules / build outputs. Use -DryRun first if you want to review actions.
.PARAMETER RunRetentionDays
    Only keep orchestration runs newer than this many days (default: 7).
.PARAMETER DryRun
    Show what would be removed without deleting anything.
.PARAMETER PurgeNodeModules
    Delete every node_modules folder inside the repo (for a fresh install).
.PARAMETER PurgeBuildArtifacts
    Delete dist/build/.parcel-cache folders.
.PARAMETER PreserveRunArchives
    Keep .zip exports inside runs even if they are older than the retention window.
.PARAMETER SkipSynthData
    Do not clear MilestoneDashboard/public/data/synth files.
#>

[CmdletBinding()]
param(
    [int]$RunRetentionDays = 7,
    [switch]$DryRun,
    [switch]$PurgeNodeModules,
    [switch]$PurgeBuildArtifacts,
    [switch]$PreserveRunArchives,
    [switch]$SkipSynthData
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$cutoff = (Get-Date).AddDays(-$RunRetentionDays)
$removed = New-Object System.Collections.Generic.List[string]

function Remove-Target {
    param(
        [Parameter(Mandatory)] [string]$Path,
        [Parameter(Mandatory)] [string]$Reason
    )

    if (-not (Test-Path $Path)) { return }

    if ($DryRun) {
        Write-Host "[dry-run] $Reason → $Path" -ForegroundColor Cyan
    }
    else {
        Write-Host "Removing $Reason → $Path" -ForegroundColor Yellow
        Remove-Item -LiteralPath $Path -Force -Recurse
    }

    $removed.Add($Path) | Out-Null
}

Write-Host "🧽 Cleaning workspace at $repoRoot" -ForegroundColor Green

# --- Runs directory ---
$runsDir = Join-Path $repoRoot 'runs'
if (Test-Path $runsDir) {
    Get-ChildItem -Path $runsDir -Directory | Where-Object { $_.LastWriteTime -lt $cutoff } |
        ForEach-Object { Remove-Target -Path $_.FullName -Reason "run older than $RunRetentionDays days" }

    if (-not $PreserveRunArchives) {
        Get-ChildItem -Path $runsDir -Filter '*.zip' | Where-Object { $_.LastWriteTime -lt $cutoff } |
            ForEach-Object { Remove-Target -Path $_.FullName -Reason 'run archive (.zip)' }
    }
}

# --- Dashboard synth data ---
if (-not $SkipSynthData) {
    $synthDir = Join-Path $repoRoot 'MilestoneDashboard\public\data\synth'
    if (Test-Path $synthDir) {
        Get-ChildItem -Path $synthDir -File | Where-Object { $_.LastWriteTime -lt $cutoff } |
            ForEach-Object { Remove-Target -Path $_.FullName -Reason 'stale synthesis text file' }
    }
}

# --- Milestone logs (CSV/XLSX) older than retention ---
$logPaths = @(
    (Join-Path $repoRoot 'Milestone_Log.csv')
    (Join-Path $repoRoot 'Milestone_Log.xlsx')
)
foreach ($logPath in $logPaths) {
    if ((Test-Path $logPath) -and ((Get-Item $logPath).LastWriteTime -lt $cutoff)) {
        Remove-Target -Path $logPath -Reason 'historic milestone log'
    }
}

# --- Optional: node_modules ---
if ($PurgeNodeModules) {
    Get-ChildItem -Path $repoRoot -Directory -Recurse -Force |
        Where-Object { $_.Name -eq 'node_modules' } |
        ForEach-Object { Remove-Target -Path $_.FullName -Reason 'node_modules' }
}

# --- Optional: build artifacts ---
if ($PurgeBuildArtifacts) {
    $artifactNames = @('dist', 'build', '.parcel-cache', '.next', '.svelte-kit')
    Get-ChildItem -Path $repoRoot -Directory -Recurse -Force |
        Where-Object { $artifactNames -contains $_.Name } |
        ForEach-Object { Remove-Target -Path $_.FullName -Reason 'build artifact' }
}

if ($removed.Count -eq 0) {
    if ($DryRun) {
        Write-Host "[dry-run] Nothing would be removed for the selected filters." -ForegroundColor Gray
    }
    else {
        Write-Host "Workspace already clean for the selected filters." -ForegroundColor Gray
    }
}
else {
    $mode = if ($DryRun) { 'Dry run complete. Items flagged:' } else { 'Cleanup complete. Items removed:' }
    Write-Host "`n$mode" -ForegroundColor Green
    $removed | Sort-Object | ForEach-Object { Write-Host " - $_" }
}
