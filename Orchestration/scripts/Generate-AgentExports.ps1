[CmdletBinding()]
param(
    [string]$CanonicalPath = (Join-Path $PSScriptRoot "..\agents\agent-library.json"),
    [string]$AgentsExportPath = (Join-Path $PSScriptRoot "..\prompts\Agents.json"),
    [string]$Agents2ExportPath = (Join-Path $PSScriptRoot "..\prompts\Agents2.json"),
    [switch]$SkipAgents2
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Import-Module (Join-Path $PSScriptRoot "AgentRoster.psm1") -Force

function Write-JsonFile {
    param(
        [Parameter(Mandatory = $true)][object]$Object,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $dir = Split-Path -Parent -Path $Path
    if ($dir -and -not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    $json = $Object | ConvertTo-Json -Depth 50
    Set-Content -LiteralPath $Path -Value $json -Encoding UTF8
}

$thinRoster = @(Get-AgentRoster -Mode thin -CanonicalPath $CanonicalPath)

$exportPayload = [ordered]@{
    GeneratedNotice = "GENERATED FROM agent-library.json; DO NOT EDIT"
    GeneratedFrom   = "Orchestration/agents/agent-library.json"
    GeneratedBy     = "Orchestration/scripts/Generate-AgentExports.ps1"
    Agents          = $thinRoster
}

Write-JsonFile -Object $exportPayload -Path $AgentsExportPath
Write-Host "Wrote export: $AgentsExportPath ($($thinRoster.Count) agents)"

if (-not $SkipAgents2) {
    $legacyPayload = [ordered]@{
        GeneratedNotice = "LEGACY EXPORT - GENERATED FROM agent-library.json; DO NOT EDIT"
        GeneratedFrom   = "Orchestration/agents/agent-library.json"
        GeneratedBy     = "Orchestration/scripts/Generate-AgentExports.ps1"
        LegacyExport    = $true
        Agents          = $thinRoster
    }
    Write-JsonFile -Object $legacyPayload -Path $Agents2ExportPath
    Write-Host "Wrote legacy export: $Agents2ExportPath ($($thinRoster.Count) agents)"
}
