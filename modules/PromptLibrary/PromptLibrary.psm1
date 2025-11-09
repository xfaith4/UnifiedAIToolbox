
#Requires -Version 5.1
using namespace System.Data
# NOTE: If System.Data.SQLite is needed, ensure the assembly is available; we keep the index optional for now.

# region: Module State
$Script:ModuleRoot = Split-Path -Parent $PSCommandPath
$Script:RepoRoot   = Split-Path -Parent $Script:ModuleRoot
$Script:DataRoot   = Join-Path $Script:RepoRoot 'data'

# region: Helpers
function Get-ContentHash {
    <#
    .SYNOPSIS
      Stable SHA256 of normalized text.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Text)
    $norm = ($Text -replace "`r`n","`n").Trim()
    $sha  = New-Object System.Security.Cryptography.SHA256Managed
    return [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($norm))).Replace('-','').ToLower()
}

# region: Public (placeholders wired by ScriptsToProcess)
#   Get-Prompt, Search-Prompt, Export-Prompt

function Get-Agent {
    <#
    .SYNOPSIS
      Load agent instruction YAML files from data/agents.
    #>
    [CmdletBinding()]
    param([string]$Id, [string]$Name, [string[]]$Capability)

    $root = Join-Path $Script:DataRoot 'agents'
    $items = Get-ChildItem -LiteralPath $root -Recurse -Filter *.yaml -ErrorAction SilentlyContinue
    $agents = foreach ($f in $items) {
        try {
            $raw = Get-Content -Raw -LiteralPath $f.FullName
            $obj = ConvertFrom-Yaml -Yaml $raw
            $obj | Add-Member -NotePropertyName _Path -NotePropertyValue $f.FullName -Force
            $obj | Add-Member -NotePropertyName _Raw  -NotePropertyValue $raw -Force
            $obj
        } catch {
            Write-Warning ("⚠️  Skipped invalid YAML $($f.FullName): {0}" -f $_)
        }
    }
    if ($Id)        { $agents = $agents | Where-Object { $_.id -eq $Id } }
    if ($Name)      { $agents = $agents | Where-Object { $_.name -match [regex]::Escape($Name) } }
    if ($Capability){ $agents = $agents | Where-Object { (($_.capabilities) -join ',') -match ($Capability -join '|') } }
    return $agents
}

function Invoke-Orchestration {
    <#
    .SYNOPSIS
      Thin runner: Prompt + Agent + Model → Artifact
    .DESCRIPTION
      This is a placeholder; wire real model adapters later.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$PromptId,
        [Parameter(Mandatory)][string]$AgentId,
        [Parameter(Mandatory)][hashtable]$Inputs,
        [Parameter(Mandatory)][string]$Model,
        [string]$ArtifactName = ("art_" + (Get-Date -Format 'yyyyMMdd_HHmmss'))
    )

    # Load prompt
    $prompt = Get-Prompt -Id $PromptId | Select-Object -First 1
    if (-not $prompt) { throw "Prompt $($PromptId) not found." }

    # Load agent
    $agent  = Get-Agent -Id $AgentId | Select-Object -First 1
    if (-not $agent) { throw "Agent $($AgentId) not found." }

    # Render user template with ${{name}} variables
    $renderedUser = $prompt.user_template
    foreach ($k in $Inputs.Keys) {
        $renderedUser = $renderedUser -replace "\${{\s*$([regex]::Escape($k))\s*}}", [string]$Inputs[$k]
    }

    # Compose system: agent role + prompt system
    $systemMsg = ($agent.role + "`n---`n" + $prompt.system)

    # Placeholder model call
    $resp = [ordered]@{
        model  = $Model
        text   = "MODEL_CALL_PLACEHOLDER"
        usage  = @{ prompt_tokens = 0; completion_tokens = 0; total_tokens = 0 }
    }

    # Persist artifact
    $artDir = Join-Path $Script:DataRoot 'artifacts'
    New-Item -ItemType Directory -Force -Path $artDir | Out-Null
    $outPath = Join-Path $artDir ("$($ArtifactName).json")

    $payload = [ordered]@{
        promptId        = $PromptId
        agentId         = $AgentId
        model           = $Model
        inputs          = $Inputs
        system          = $systemMsg
        user            = $renderedUser
        output          = $resp
        createdUtc      = (Get-Date).ToUniversalTime().ToString("o")
        promptChecksum  = $prompt.checksum
        agentChecksum   = $agent.checksum
    } | ConvertTo-Json -Depth 10

    Set-Content -LiteralPath $outPath -Value $payload -Encoding UTF8

    return @{ Output = $resp; ArtifactPath = $outPath }
}

function Update-PromptIndex {
    <#
    .SYNOPSIS
      Stub for SQLite indexer; safe no-op until you add System.Data.SQLite.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Path)
    Write-Verbose ("Index update requested for {0}" -f $Path)
}

Export-ModuleMember -Function Get-Agent, Invoke-Orchestration, Update-PromptIndex
