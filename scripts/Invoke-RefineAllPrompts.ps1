### BEGIN FILE: scripts\Invoke-RefineAllPrompts.ps1
<#
.SYNOPSIS
  Wrapper for Invoke-UATPromptBatchRefinement (module source of truth).

.DESCRIPTION
  Batch-refine a folder of prompt YAML files using the PromptLibrary module.
  This script delegates to Invoke-UATPromptBatchRefinement so behavior remains
  centralized in the module (no duplicated logic).

USAGE
  # From repo root:
  .\scripts\Invoke-RefineAllPrompts.ps1 -PromptRoot .\data\prompts -Iterations 3 -SaveArtifacts
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $false)]
    [string]$PromptRoot,

    [Parameter(Mandatory = $false)]
    [string]$PromptLibraryModulePath = (Join-Path $PSScriptRoot '..' 'modules' 'PromptLibrary' 'PromptLibrary.psd1'),

    [Parameter(Mandatory = $false)]
    [ValidateRange(1, 10)]
    [int]$Iterations,

    [Parameter(Mandatory = $false)]
    [switch]$SaveArtifacts,

    [Parameter(Mandatory = $false)]
    [ValidateSet('Copy', 'InPlace')]
    [string]$Mode,

    [Parameter(Mandatory = $false)]
    [string]$OutRoot,

    [Parameter(Mandatory = $false)]
    [string[]]$IncludePatterns,

    [Parameter(Mandatory = $false)]
    [string]$ExcludeRegex,

    [Parameter(Mandatory = $false)]
    [switch]$FailFast
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Get-Command -Name Invoke-UATPromptBatchRefinement -ErrorAction SilentlyContinue)) {
    if (Test-Path -LiteralPath $PromptLibraryModulePath) {
        Import-Module $PromptLibraryModulePath -Force -ErrorAction Stop
    } else {
        throw "PromptLibrary module not found at $($PromptLibraryModulePath). Update -PromptLibraryModulePath."
    }
}

$invokeParams = @{}
foreach ($name in @(
        'PromptRoot',
        'Iterations',
        'SaveArtifacts',
        'Mode',
        'OutRoot',
        'IncludePatterns',
        'ExcludeRegex',
        'FailFast'
    )) {
    if ($PSBoundParameters.ContainsKey($name)) {
        $invokeParams[$name] = $PSBoundParameters[$name]
    }
}

Invoke-UATPromptBatchRefinement @invokeParams
### END FILE: scripts\Invoke-RefineAllPrompts.ps1
