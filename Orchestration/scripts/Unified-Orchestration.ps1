<#
.SYNOPSIS
  Canonical orchestration entrypoint for Unified AI Toolbox.
.DESCRIPTION
  Runs the primary POF orchestration pipeline and can optionally invoke
  Codex swarm execution. This script is intentionally API-friendly and accepts
  `-Goal`, `-Instruction`, and `-OutputDir` parameters used by prompt-api.
#>

[CmdletBinding()]
param(
    [string]$RepoRoot = (Get-Location).Path,
    [string]$Goal = "",
    [string]$GoalFile = "$PSScriptRoot\..\Goals\CurrentGoal.txt",
    [string]$Model = "gpt-5",
    [string]$Instruction = "",
    [string]$ModelInstruction = "",
    [int]$MaxIterations = 3,
    [int]$PassThreshold = 7,
    [switch]$SkipContextResolution,
    [switch]$RunCodex,
    [switch]$SkipCodex,
    [string]$CodexModel = "gpt-5-codex",
    [string]$CodexInstruction = "",
    [switch]$UseWslForCodex,
    [int]$MaxParallel = 3,
    [string]$WorkDir = ".codex_out",
    [string]$OutputDir = "",
    [switch]$VerboseMode,
    [string]$JobType = "",
    [string]$AppType = "",
    [string]$RequestPath = "",
    [string]$ContractPath = "",
    [switch]$ValidateOnly,
    [switch]$DryRun,
    [string]$LogLevel = "Info"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-OrchLastExitCode {
    $lastExit = Get-Variable -Name LASTEXITCODE -Scope Global -ErrorAction SilentlyContinue
    if ($null -eq $lastExit -or $null -eq $lastExit.Value) {
        return 0
    }
    return [int]$lastExit.Value
}

$CommonModule = Join-Path $PSScriptRoot "..\modules\Orchestration.Common.psm1"
if (-not (Test-Path -LiteralPath $CommonModule)) {
    throw "Shared orchestration module not found at $CommonModule"
}
Import-Module (Resolve-Path -LiteralPath $CommonModule).Path -Force

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$BaseDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ScriptsDir = Join-Path $BaseDir "scripts"

Ensure-OrchDirectory $ScriptsDir
Ensure-OrchDirectory (Join-Path $BaseDir "Goals")

$contextResolver = Join-Path $ScriptsDir "ContextResolver.ps1"
$resolvedGoal = Join-Path $BaseDir "Goals\_ResolvedGoal.txt"
$pofScript = Join-Path $ScriptsDir "POF.ps1"
$milestoneScript = Join-Path $ScriptsDir "MilestoneController.ps1"
$codexScript = Join-Path $BaseDir "engine\codex-multiagent-swarm\Orchestrate-Codex.ps1"

if (-not (Test-Path -LiteralPath $pofScript)) {
    throw "POF orchestration script not found at $pofScript"
}
if (-not (Test-Path -LiteralPath $milestoneScript)) {
    throw "Milestone controller script not found at $milestoneScript"
}
if ((-not $SkipCodex) -and $RunCodex -and (-not (Test-Path -LiteralPath $codexScript))) {
    throw "Codex orchestrator script not found at $codexScript"
}

# Resolve goal text from explicit -Goal first, then goal file.
$goalText = ""
if (-not [string]::IsNullOrWhiteSpace($Goal)) {
    $goalText = $Goal.Trim()
}
else {
    if (-not (Test-Path -LiteralPath $GoalFile)) {
        throw "Goal file not found: $GoalFile"
    }

    if (-not $SkipContextResolution -and (Test-Path -LiteralPath $contextResolver)) {
        Write-Host "`nResolving orchestration context..." -ForegroundColor Cyan
        & $contextResolver -GoalFile $GoalFile -OutputFile $resolvedGoal
        if (Test-Path -LiteralPath $resolvedGoal) {
            $GoalFile = $resolvedGoal
        }
    }

    $goalText = (Get-Content -LiteralPath $GoalFile -Raw).Trim()
}

if ([string]::IsNullOrWhiteSpace($goalText)) {
    $goalText = "Execute default orchestration workflow"
}

# Normalize output routing so POF writes directly into OutputDir when supplied.
$targetRunId = Get-Date -Format "yyyyMMdd-HHmmss"
$targetOutputRoot = Join-Path $BaseDir "runs"
if (-not [string]::IsNullOrWhiteSpace($OutputDir)) {
    $rawOutputDir = if ([System.IO.Path]::IsPathRooted($OutputDir)) {
        $OutputDir
    } else {
        Join-Path $RepoRoot $OutputDir
    }
    $resolvedOutputDir = [System.IO.Path]::GetFullPath($rawOutputDir)
    Ensure-OrchDirectory $resolvedOutputDir
    $targetRunId = Split-Path -Leaf $resolvedOutputDir
    $targetOutputRoot = Split-Path -Parent $resolvedOutputDir
    if ([string]::IsNullOrWhiteSpace($targetOutputRoot)) {
        $targetOutputRoot = (Get-Location).Path
    }
}
else {
    Ensure-OrchDirectory $targetOutputRoot
}
$resolvedRunOutput = Join-Path $targetOutputRoot $targetRunId
Ensure-OrchDirectory $resolvedRunOutput

$effectiveInstruction = $Instruction
if ([string]::IsNullOrWhiteSpace($effectiveInstruction) -and -not [string]::IsNullOrWhiteSpace($ModelInstruction)) {
    $effectiveInstruction = $ModelInstruction
}

$normalizedJobType = if ([string]::IsNullOrWhiteSpace($JobType)) { "" } else { $JobType.Trim().ToLowerInvariant() }
$isMaintenanceJob = $normalizedJobType -eq "maintain_existing_app"
$requestMode = $isMaintenanceJob -or (-not [string]::IsNullOrWhiteSpace($RequestPath)) -or (-not [string]::IsNullOrWhiteSpace($ContractPath))

if ($requestMode) {
    $milestoneParams = @{
        Goal = $goalText
        Model = $Model
        OutputDir = $resolvedRunOutput
        LogLevel = $LogLevel
    }
    if (-not [string]::IsNullOrWhiteSpace($JobType)) {
        $milestoneParams["JobType"] = $JobType
    }
    if (-not [string]::IsNullOrWhiteSpace($RequestPath)) {
        $milestoneParams["RequestPath"] = $RequestPath
    }
    if (-not [string]::IsNullOrWhiteSpace($ContractPath)) {
        $milestoneParams["ContractPath"] = $ContractPath
    }
    if ($ValidateOnly) {
        $milestoneParams["ValidateOnly"] = $true
    }
    if ($DryRun) {
        $milestoneParams["DryRun"] = $true
    }

    Write-Host "`nRunning maintenance orchestration..." -ForegroundColor Green
    & $milestoneScript @milestoneParams
    $maintenanceExitCode = Get-OrchLastExitCode
    if ($maintenanceExitCode -ne 0) {
        throw "Maintenance orchestration failed with exit code $maintenanceExitCode"
    }
    Write-Host "`nUnified orchestration complete (maintenance mode)." -ForegroundColor Green
    return
}

Write-Host "`nRunning POF orchestration..." -ForegroundColor Green
$pofParams = @{
    Goal = $goalText
    Model = $Model
    MaxIterations = $MaxIterations
    RunId = $targetRunId
    OutputRoot = $targetOutputRoot
    JobType = if ([string]::IsNullOrWhiteSpace($JobType)) { "build_new_app" } else { $JobType }
    AppType = $AppType
}
if (-not [string]::IsNullOrWhiteSpace($effectiveInstruction)) {
    $pofParams["Instruction"] = $effectiveInstruction
}
if ($VerboseMode) {
    $pofParams["VerboseMode"] = $true
}

& $pofScript @pofParams
$pofExitCode = Get-OrchLastExitCode
if ($pofExitCode -ne 0) {
    throw "POF orchestration failed with exit code $pofExitCode"
}

$shouldRunCodex = $RunCodex -and (-not $SkipCodex)
if (-not $shouldRunCodex) {
    Write-Host "`nUnified orchestration complete (POF only)." -ForegroundColor Green
    return
}

$codexAvailable = Test-OrchCli "codex"
if ($UseWslForCodex) {
    if (-not (Test-OrchCli "wsl")) {
        throw "WSL was not detected. Install WSL or disable -UseWslForCodex."
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
    throw "Codex CLI not detected. Configure codex on PATH or install it in WSL."
}

$resolvedWorkDir = if ([System.IO.Path]::IsPathRooted($WorkDir)) {
    $WorkDir
} else {
    Join-Path $resolvedRunOutput $WorkDir
}
Ensure-OrchDirectory $resolvedWorkDir

$codexGoal = $goalText
if (-not [string]::IsNullOrWhiteSpace($CodexInstruction)) {
    $codexGoal = "$goalText`n`nAdditional Codex instruction:`n$CodexInstruction"
}
$codexOutputDir = Join-Path $resolvedRunOutput "swarm-output"
Ensure-OrchDirectory $codexOutputDir

Write-Host "`nLaunching Codex swarm..." -ForegroundColor Cyan
& $codexScript `
    -RepoRoot $RepoRoot `
    -Goal $codexGoal `
    -Model $CodexModel `
    -MaxParallel $MaxParallel `
    -OutputDir $codexOutputDir `
    -WorkDir $resolvedWorkDir `
    -UseWsl:$UseWslForCodex

$codexExitCode = Get-OrchLastExitCode
if ($codexExitCode -ne 0) {
    throw "Codex swarm execution failed with exit code $codexExitCode"
}

Write-Host "`nUnified orchestration complete." -ForegroundColor Green
