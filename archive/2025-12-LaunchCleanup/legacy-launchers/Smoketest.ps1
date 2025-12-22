# From repo root
param(
    [string]$PromptId = 'examples.analytics.divisions.performance.summary',
    [string]$AgentId = 'ag_20251109_researcher'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Remove-Module PromptLibrary -ErrorAction SilentlyContinue
Import-Module (Join-Path $repoRoot 'modules' 'PromptLibrary' 'PromptLibrary.psd1') -Force

Write-Host "Loaded $( (Get-Prompt).Count ) prompts and $( (Get-Agent).Count ) agents."

$inputs = @{
    division            = 'Medicare'
    month               = (Get-Date -Format 'yyyy-MM')
    include_mos_detail  = $true
}

$result = Invoke-Orchestration -PromptId $PromptId -AgentId $AgentId -Inputs $inputs -Model 'gpt-5'
Write-Host "Artifact written to $($result.ArtifactPath)"
$result.Output.text
