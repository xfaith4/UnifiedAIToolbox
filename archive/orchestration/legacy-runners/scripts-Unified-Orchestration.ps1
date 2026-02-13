<#
.SYNOPSIS
    Entry point for the WPF desktop – validates inputs, renders a prompt artifact,
    and (optionally) triggers the Codex swarm helper script.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [Parameter(Mandatory)][string]$GoalFile,
    [Parameter(Mandatory)][string]$Model,
    [string]$ModelInstruction,
    [string]$PromptId,
    [string]$CustomPrompt,
    [string]$AgentId,
    [bool]$AutoSelectAgent = $true,
    [int]$MaxIterations = 3,
    [int]$PassThreshold = 7,
    [switch]$SkipContextResolution,
    [switch]$SkipCodex,
    [string]$CodexModel = 'gpt-5-codex',
    [string]$CodexInstruction,
    [switch]$UseWslForCodex,
    [int]$MaxParallel = 3,
    [string]$WorkDir = '.codex_out'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path -LiteralPath $RepoRoot).ProviderPath
$goalPath = (Resolve-Path -LiteralPath $GoalFile).ProviderPath
$artifactsRoot = Join-Path $repoRoot 'data' 'artifacts'
New-Item -ItemType Directory -Force -Path $artifactsRoot | Out-Null

$moduleRoot = Join-Path $PSScriptRoot '..' 'modules'
Import-Module (Join-Path $moduleRoot 'PromptLibrary' 'PromptLibrary.psd1') -Force
Import-Module (Join-Path $moduleRoot 'Orchestration.Common.psm1') -Force

function Resolve-Prompt {
    param(
        [array]$Library,
        [string]$PromptId,
        [string]$CustomPrompt,
        [string]$ModelInstruction
    )

    if ($CustomPrompt) {
        return [pscustomobject]@{
            id            = "custom.prompt.{0}" -f (Get-Date -Format 'yyyyMMddHHmmss')
            title         = 'Custom Prompt'
            system        = if ($ModelInstruction) { $ModelInstruction } else { 'You are an orchestration agent.' }
            user_template = $CustomPrompt
            tags          = @()
        }
    }

    if ($PromptId) {
        $match = $Library | Where-Object { $_.id -eq $PromptId } | Select-Object -First 1
        if ($match) { return $match }
        Write-Warning "Prompt '$PromptId' was not found. Defaulting to the first prompt."
    }

    return $Library | Sort-Object id | Select-Object -First 1
}

function Compute-AgentScore {
    param(
        [pscustomobject]$Agent,
        [pscustomobject]$Prompt
    )

    $tags = @($Prompt.tags)
    if (-not $tags) { return 0 }

    $caps = @($Agent.capabilities)
    $score = 0
    foreach ($tag in $tags) {
        if ([string]::IsNullOrWhiteSpace($tag)) { continue }
        if ($caps -contains $tag) { $score += 2 }
        elseif ($Agent.role -match [regex]::Escape($tag)) { $score += 1 }
    }
    return $score
}

function Resolve-Agent {
    param(
        [array]$Agents,
        [string]$AgentId,
        [bool]$AutoSelect,
        [pscustomobject]$Prompt
    )

    if ($AgentId) {
        $agent = $Agents | Where-Object { $_.id -eq $AgentId } | Select-Object -First 1
        if (-not $agent) {
            $agent = $Agents | Where-Object { $_.name -eq $AgentId } | Select-Object -First 1
        }

        if ($agent) {
            return $agent
        }

        Write-Warning "Agent '$AgentId' was not found. Falling back to auto-selection."
    }

    if ($AutoSelect -and $Prompt) {
        $scored = $Agents | ForEach-Object {
            [pscustomobject]@{
                Agent = $_
                Score = Compute-AgentScore -Agent $_ -Prompt $Prompt
            }
        } | Sort-Object Score -Descending

        $candidate = $scored | Select-Object -First 1
        if ($candidate.Agent -and $candidate.Score -gt 0) {
            return $candidate.Agent
        }
    }

    return $Agents | Select-Object -First 1
}

Write-Host "✅ Repository root: $repoRoot"
Write-Host "✅ Goal file:      $goalPath"

$goalInfo = Get-OrchGoalSummary -Path $goalPath
if ($SkipContextResolution) {
    Write-Host "⚠️  Context resolution skipped by user."
}
else {
    Write-Host "ℹ️  Goal preview:`n$($goalInfo.Preview)"
}

$prompts = @(Get-Prompt)
if (-not $prompts) {
    throw "No prompts were found under data/prompts. Add at least one *.prompt.yaml file."
}

$agents = @(Get-Agent)
if (-not $agents) {
    throw "No agents were found under data/agents."
}
$prompt = Resolve-Prompt -Library $prompts -PromptId $PromptId -CustomPrompt $CustomPrompt -ModelInstruction $ModelInstruction
$agent = Resolve-Agent -Agents $agents -AgentId $AgentId -AutoSelect:$AutoSelectAgent -Prompt $prompt

if (-not $prompt) { throw "Unable to resolve a prompt for this run." }
if (-not $agent) { throw "Unable to resolve an agent for this run." }

Write-Host "ℹ️  Using prompt '$($prompt.id)' and agent '$($agent.id)'."

$inputs = [ordered]@{
    goal_summary = $goalInfo.Preview
    instructions = $ModelInstruction
    repo_root    = $repoRoot
    prompt_id    = $prompt.id
} | Where-Object { $_.Value }

$artifactName = "unified_" + (Get-Date -Format 'yyyyMMdd_HHmmss')
$result = Invoke-Orchestration -PromptId $prompt.id `
    -PromptObject $prompt `
    -AgentId $agent.id `
    -Inputs $inputs `
    -Model $Model `
    -ArtifactName $artifactName

Write-Host "✅ Prompt artifact created at $($result.ArtifactPath)"

$report = [ordered]@{
    timestampUtc       = (Get-Date).ToUniversalTime().ToString('O')
    repoRoot           = $repoRoot
    goal               = $goalInfo
    promptId           = $prompt.id
    customPrompt       = $CustomPrompt
    agentId            = $agent.id
    model              = $Model
    modelInstruction   = $ModelInstruction
    autoSelectAgent    = $AutoSelectAgent
    maxIterations      = $MaxIterations
    passThreshold      = $PassThreshold
    promptArtifactPath = $result.ArtifactPath
    codex              = @{
        skipped       = [bool]$SkipCodex
        model         = $CodexModel
        instruction   = $CodexInstruction
        useWsl        = [bool]$UseWslForCodex
        maxParallel   = $MaxParallel
        workDir       = $WorkDir
    }
}

if (-not $SkipCodex) {
    $codexScript = Join-Path $repoRoot 'Orchestration' 'engine' 'codex-multiagent-swarm' 'Orchestrate-Codex.ps1'
    if (-not (Test-Path -LiteralPath $codexScript)) {
        throw "Codex swarm script not found: $codexScript"
    }

    Write-Host "🚀 Starting Codex swarm ($CodexModel)..."
    & $codexScript `
        -RepoRoot $repoRoot `
        -Model $CodexModel `
        -MaxParallel $MaxParallel `
        -WorkDir $WorkDir `
        -Instruction $CodexInstruction `
        -UseWsl:$UseWslForCodex `
        | Write-Host

    $report.codex["ran"] = $true
}
else {
    Write-Host "ℹ️  Codex swarm skipped."
    $report.codex["ran"] = $false
}

$reportPath = Join-Path $artifactsRoot "$($artifactName)_summary.json"
$report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $reportPath -Encoding UTF8

Write-Host "✅ Unified orchestration complete."
Write-Host "📄 Summary: $reportPath"
$report
