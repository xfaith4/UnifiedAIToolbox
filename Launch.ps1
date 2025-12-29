<#
.SYNOPSIS
    Legacy entry point for launching the Unified AI Toolbox (Windows).
.DESCRIPTION
    This script exists for backwards compatibility with documentation that references Launch.ps1.
    It delegates to Start-Toolbox.ps1.
.EXAMPLE
    .\Launch.ps1
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot
$toolbox = Join-Path $repoRoot 'Start-Toolbox.ps1'

if (-not (Test-Path $toolbox)) {
    throw "Start-Toolbox.ps1 not found at: $toolbox"
}

& $toolbox -Mode FullStack

