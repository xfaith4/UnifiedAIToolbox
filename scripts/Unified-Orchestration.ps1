<#
.SYNOPSIS
  Deprecated shim for Unified orchestration.
.DESCRIPTION
  This path now forwards to the canonical runner at:
  Orchestration/scripts/Unified-Orchestration.ps1
#>

[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [object[]]$ForwardArgs
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$target = Join-Path $repoRoot "Orchestration\scripts\Unified-Orchestration.ps1"

if (-not (Test-Path -LiteralPath $target)) {
    throw "Canonical orchestration runner not found: $target"
}

Write-Warning "scripts/Unified-Orchestration.ps1 is deprecated. Forwarding to Orchestration/scripts/Unified-Orchestration.ps1."
& $target @ForwardArgs
exit $LASTEXITCODE
