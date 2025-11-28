<#
.SYNOPSIS
  Orchestrates goal refinement, milestone evaluation, and Codex swarm synthesis.
.DESCRIPTION
  1. Optionally resolves goal context imports.
  2. Runs MilestoneController (which invokes POF + dashboard updates).
  3. Invokes the Codex multi-agent swarm for repository fixes.
  Consolidates previous entry points into a single end-to-end command.
#>

[CmdletBinding()]
param(
    [string]$RepoRoot = (Get-Location).Path,
    [string]$GoalFile = "$PSScriptRoot\..\Goals\CurrentGoal.txt",
    [string]$Model = "gpt-5",
    [string]$ModelInstruction = "",
    [int]$MaxIterations = 3,
    [int]$PassThreshold = 7,
    [switch]$SkipContextResolution,
    [switch]$SkipCodex,
    [string]$CodexModel = 'gpt-5-codex',
    [string]$CodexInstruction = "",
    [switch]$UseWslForCodex,
    [int]$MaxParallel = 3,
    [string]$WorkDir = '.codex_out'
)

$ErrorActionPreference = 'Stop'

$CommonModule = Join-Path $PSScriptRoot "..\modules\Orchestration.Common.psm1"
if (-not (Test-Path $CommonModule)) {
    throw "Shared orchestration module not found at $CommonModule"
}
$CommonModule = (Resolve-Path $CommonModule).Path
Import-Module $CommonModule -Force

$RepoRoot = (Resolve-Path $RepoRoot).Path
$BaseDir  = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ScriptsDir = Join-Path $BaseDir "scripts"
$DataDir    = Join-Path $BaseDir "MilestoneDashboard\public\data"
$LogPath    = Join-Path $DataDir "Milestone_Log.json"
$TrendPath  = Join-Path $DataDir "Metrics_Trend.json"

Ensure-OrchDirectory $ScriptsDir
Ensure-OrchDirectory (Join-Path $BaseDir "Goals")
Ensure-OrchDirectory $DataDir
Ensure-OrchJsonFile $LogPath
Ensure-OrchJsonFile $TrendPath

if (-not (Test-Path $GoalFile)) {
    throw "Goal file not found: $GoalFile"
}

$contextResolver = Join-Path $ScriptsDir "ContextResolver.ps1"
$resolvedGoal = Join-Path $BaseDir "Goals\_ResolvedGoal.txt"

if (-not $SkipContextResolution -and (Test-Path $contextResolver)) {
    Write-Host "`n🌐 Resolving orchestration context..." -ForegroundColor Cyan
    & $contextResolver -GoalFile $GoalFile -OutputFile $resolvedGoal
    if (Test-Path $resolvedGoal) {
        $GoalFile = $resolvedGoal
    }
}

$milestoneController = Join-Path $ScriptsDir "MilestoneController.ps1"
if (-not (Test-Path $milestoneController)) {
    throw "Milestone controller script not found at $milestoneController"
}

Write-Host "`n🚀 Running milestone orchestration (POF + dashboard)..." -ForegroundColor Green
& $milestoneController -GoalFile $GoalFile -Model $Model -MaxIterations $MaxIterations -PassThreshold $PassThreshold -ModelInstruction $ModelInstruction

if ($SkipCodex) {
    Write-Host "`n⏭️ Codex swarm skipped by request." -ForegroundColor Yellow
    return
}

$codexScript = Join-Path $BaseDir "codex-multiagent-swarm\Orchestrate-Codex.ps1"
if (-not (Test-Path $codexScript)) {
    throw "Codex orchestrator script not found at $codexScript"
}

$codexAvailable = Test-OrchCli 'codex'
if ($UseWslForCodex) {
    if (-not (Test-OrchCli 'wsl')) {
        Write-Warning "WSL was not detected. Install WSL or disable the WSL Codex option."
        return
    }

    if (-not $codexAvailable) {
        try {
            $null = wsl.exe -e which codex 2>$null
            $codexAvailable = $true
        }
        catch {
            $codexAvailable = $false
        }
    }
}

if (-not $codexAvailable) {
    Write-Warning "Codex CLI not detected on the current path. Configure the CLI or enable the WSL option and ensure codex is installed inside WSL."
    return
}

if (-not [System.IO.Path]::IsPathRooted($WorkDir)) {
    $WorkDir = Join-Path $RepoRoot $WorkDir
}

Write-Host "`n🤖 Launching Codex swarm for repository fixes..." -ForegroundColor Cyan
& $codexScript -RepoRoot $RepoRoot -Model $CodexModel -MaxParallel $MaxParallel -WorkDir $WorkDir -Instruction $CodexInstruction -UseWsl:$UseWslForCodex

Write-Host "`n✅ Unified orchestration complete." -ForegroundColor Green
