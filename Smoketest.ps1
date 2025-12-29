<#
.SYNOPSIS
    Legacy smoke test entry point (Windows).
.DESCRIPTION
    Delegates to tests/E2E-Smoketest.ps1.
.EXAMPLE
    .\Smoketest.ps1
.EXAMPLE
    .\Smoketest.ps1 -SkipAITests
#>

[CmdletBinding()]
param(
    [switch]$SkipAITests,
    [switch]$Verbose
)

$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot
$target = Join-Path $repoRoot 'tests' 'E2E-Smoketest.ps1'

if (-not (Test-Path $target)) {
    throw "E2E smoketest not found at: $target"
}

& $target -SkipAITests:$SkipAITests -Verbose:$Verbose

