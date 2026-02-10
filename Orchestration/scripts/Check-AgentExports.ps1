[CmdletBinding()]
param(
    [string]$CanonicalPath = (Join-Path $PSScriptRoot "..\agents\agent-library.json"),
    [string]$AgentsExportPath = (Join-Path $PSScriptRoot "..\prompts\Agents.json"),
    [string]$Agents2ExportPath = (Join-Path $PSScriptRoot "..\prompts\Agents2.json"),
    [switch]$SkipAgents2
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$generator = Join-Path $PSScriptRoot "Generate-AgentExports.ps1"
if (-not (Test-Path -LiteralPath $generator)) {
    throw "Generator not found: $generator"
}

$tmpRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("uait-agent-exports-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmpRoot -Force | Out-Null

try {
    $tmpAgents = Join-Path $tmpRoot "Agents.json"
    $tmpAgents2 = Join-Path $tmpRoot "Agents2.json"

    & $generator `
        -CanonicalPath $CanonicalPath `
        -AgentsExportPath $tmpAgents `
        -Agents2ExportPath $tmpAgents2 `
        -SkipAgents2:$SkipAgents2 | Out-Host

    if (-not (Test-Path -LiteralPath $AgentsExportPath)) {
        throw "Missing export file: $AgentsExportPath"
    }

    $currentHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $AgentsExportPath).Hash
    $expectedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $tmpAgents).Hash
    if ($currentHash -ne $expectedHash) {
        Write-Error @"
Agent export drift detected: $AgentsExportPath
Expected hash: $expectedHash
Current  hash: $currentHash
Run: pwsh ./Orchestration/scripts/Generate-AgentExports.ps1
"@
        exit 1
    }

    if (-not $SkipAgents2) {
        if (-not (Test-Path -LiteralPath $Agents2ExportPath)) {
            throw "Missing export file: $Agents2ExportPath"
        }

        $currentHash2 = (Get-FileHash -Algorithm SHA256 -LiteralPath $Agents2ExportPath).Hash
        $expectedHash2 = (Get-FileHash -Algorithm SHA256 -LiteralPath $tmpAgents2).Hash
        if ($currentHash2 -ne $expectedHash2) {
            Write-Error @"
Agent export drift detected: $Agents2ExportPath
Expected hash: $expectedHash2
Current  hash: $currentHash2
Run: pwsh ./Orchestration/scripts/Generate-AgentExports.ps1
"@
            exit 1
        }
    }

    Write-Host "Agent exports are in sync with canonical registry." -ForegroundColor Green
    exit 0
}
finally {
    Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}
