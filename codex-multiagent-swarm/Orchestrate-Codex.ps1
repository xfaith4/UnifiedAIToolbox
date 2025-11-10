<#
.SYNOPSIS
    Minimal Codex swarm bootstrapper. Creates a manifest in the requested work directory
    so the desktop UI can display progress without needing the real Codex CLI.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [Parameter(Mandatory)][string]$Model,
    [int]$MaxParallel = 3,
    [string]$WorkDir = '.codex_out',
    [string]$Instruction,
    [switch]$UseWsl
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path -LiteralPath $RepoRoot).ProviderPath
$outputRoot = if ([IO.Path]::IsPathRooted($WorkDir)) {
    $WorkDir
} else {
    Join-Path $repoRoot $WorkDir
}

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

$manifest = [ordered]@{
    timestampUtc = (Get-Date).ToUniversalTime().ToString('O')
    repoRoot     = $repoRoot
    model        = $Model
    instruction  = $Instruction
    maxParallel  = $MaxParallel
    useWsl       = [bool]$UseWsl
    jobs         = @()
}

$files = Get-ChildItem -LiteralPath $repoRoot -Recurse -File -Include *.cs,*.ps1 -ErrorAction SilentlyContinue | Select-Object -First $MaxParallel
foreach ($file in $files) {
    $manifest.jobs += [ordered]@{
        path   = $file.FullName.Substring($repoRoot.Length).TrimStart('\','/')
        status = 'completed'
        notes  = "Reviewed by simulated Codex swarm."
    }
}

$manifestPath = Join-Path $outputRoot ("codex_swarm_{0}.json" -f (Get-Date -Format 'yyyyMMdd_HHmmss'))
$manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

"Codex swarm manifest written to $manifestPath"
