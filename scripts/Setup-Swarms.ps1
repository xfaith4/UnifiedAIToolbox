#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Installs and validates the Swarms engine for UnifiedAIToolbox.

.DESCRIPTION
  Creates an isolated virtual environment at `.uaitoolbox/swarms/.venv` and installs
  the vendored Swarms project from `scripts/swarms` (editable) so it can be used as
  a first-class orchestration engine without polluting the main toolbox venv.

  Outputs the resolved python path so callers can set:
    $env:SWARMS_PYTHON_BIN = <printed path>

.PARAMETER ForceReinstall
  Reinstall Swarms and dependencies even if already present.

.PARAMETER Quiet
  Reduce console output.

.EXAMPLE
  pwsh ./scripts/Setup-Swarms.ps1

.EXAMPLE
  $py = pwsh ./scripts/Setup-Swarms.ps1 -Quiet
  $env:SWARMS_PYTHON_BIN = $py
#>

[CmdletBinding()]
param(
    [switch]$ForceReinstall,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$StateDir = Join-Path $RepoRoot '.uaitoolbox\swarms'
$VenvDir = Join-Path $StateDir '.venv'
$PythonExe = Join-Path $VenvDir 'Scripts\python.exe'
$SwarmsSrc = Join-Path $RepoRoot 'scripts\swarms'

function Write-Info([string]$Message) {
    if (-not $Quiet) { Write-Host $Message -ForegroundColor Cyan }
}

function Write-Warn([string]$Message) {
    if (-not $Quiet) { Write-Host $Message -ForegroundColor Yellow }
}

function Assert-Path([string]$Path, [string]$Label) {
    if (-not (Test-Path $Path)) { throw "$Label not found: $Path" }
}

Assert-Path $SwarmsSrc 'Swarms source directory'

New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

if (-not (Test-Path $PythonExe)) {
    Write-Info "Creating Swarms venv at $VenvDir ..."
    $bootstrap = (Get-Command python -ErrorAction Stop).Source
    & $bootstrap -m venv $VenvDir
}

Assert-Path $PythonExe 'Swarms venv python'

Write-Info "Upgrading pip tooling..."
& $PythonExe -m pip install --upgrade pip setuptools wheel | Out-Null

if ($ForceReinstall) {
    Write-Info "Force reinstall enabled; uninstalling swarms if present..."
    try { & $PythonExe -m pip uninstall -y swarms | Out-Null } catch { }
}

Write-Info "Installing Swarms (editable) from $SwarmsSrc ..."
& $PythonExe -m pip install -e $SwarmsSrc | Out-Null

Write-Info "Validating Swarms import..."
$check = @'
import sys
try:
    from swarms.structs.agent import Agent  # noqa: F401
    from swarms.structs.swarm_router import SwarmRouter  # noqa: F401
    print("ok")
except Exception as e:
    print(f"error: {type(e).__name__}: {e}")
    sys.exit(2)
'@

$result = & $PythonExe -c $check
if ($result -notmatch '^ok') {
    throw "Swarms validation failed: $result"
}

if (-not $Quiet) {
    Write-Host ""
    Write-Host "Swarms engine ready." -ForegroundColor Green
    Write-Host "Set SWARMS_PYTHON_BIN to:" -ForegroundColor Gray
    Write-Host "  $PythonExe" -ForegroundColor White
}

# Output the python path (useful for scripting).
$PythonExe
