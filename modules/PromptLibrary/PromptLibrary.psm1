#Requires -Version 5.1
using namespace System.Data

# ---------------------------
# Module state (repo-aware)
# ---------------------------
$Script:ModuleRoot = Split-Path -Parent $PSCommandPath
$Script:RepoRoot = Split-Path -Parent $Script:ModuleRoot
if ((Split-Path -Leaf $Script:RepoRoot) -ieq 'modules') {
    $Script:RepoRoot = Split-Path -Parent $Script:RepoRoot
}
$Script:DataRoot = Join-Path $Script:RepoRoot 'data'

# ---------------------------
# Helpers
# ---------------------------

function Get-ContentHash {
    <#
    .SYNOPSIS
      Stable SHA256 of normalized text.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Text)

    $norm = ($Text -replace "`r`n", "`n").Trim()
    $sha = New-Object System.Security.Cryptography.SHA256Managed
    [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($norm))).Replace('-', '').ToLower()
}

function Render-Template {
    <#
    .SYNOPSIS
      Replace ${{name}} tokens in a template using a hashtable. Safe for $, \, etc.
    .DESCRIPTION
      Uses Regex.Replace with a MatchEvaluator to avoid replacement expansion issues.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]    $Template,
        [Parameter(Mandatory)][hashtable] $Vars
    )

    $result = $Template
    foreach ($k in $Vars.Keys) {
        # Pattern for ${{ key }} with optional whitespace and case-insensitive match
        $pattern = '\$\{\{\s*' + [regex]::Escape([string]$k) + '\s*\}\}'
        $evaluator = [System.Text.RegularExpressions.MatchEvaluator] {
            param($m)
            # Ensure literal replacement; escape $ to $$ to avoid backrefs
            return ($Vars[$k]).ToString().Replace('$', '$$')
        }
        $result = [regex]::Replace($result, $pattern, $evaluator, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    }
    return $result
}

# ----------------------------------------------------
# Dot-source helper cmdlets into MODULE scope
# ----------------------------------------------------
. "$PSScriptRoot\Private\ConvertFromYaml.ps1"
. "$PSScriptRoot\Private\Get-SecretValue.ps1"
. "$PSScriptRoot\Public\Get-Search-Export.ps1"
. "$PSScriptRoot\Public\Invoke-Model.ps1"

# ----------------------------------------------------
# Unified Agent Loader (JSON + YAML, single objects or arrays, and { Agents: [...] } payloads)
# ----------------------------------------------------
function Read-AgentFiles {
    <#
    .SYNOPSIS
      Load agent definitions from JSON or YAML and normalize fields.
    .OUTPUTS
      Objects with: id,name,role,prompt,capabilities,style,constraints,io_contract,routing_hints,checksum,_Path,_Raw
    #>
    [CmdletBinding()]
    param(
        [string]$Root = (Join-Path $Script:DataRoot 'agents')
    )

    if (-not (Test-Path -LiteralPath $Root)) { return @() }

    $files = Get-ChildItem -LiteralPath $Root -Recurse -File -Include *.json, *.yml, *.yaml -ErrorAction SilentlyContinue
    $out = foreach ($f in $files) {
        $raw = Get-Content -LiteralPath $f.FullName -Raw
        $ext = [IO.Path]::GetExtension($f.Name).ToLowerInvariant()
        try {
            switch ($ext) {
                '.json' {
                    $doc = $raw | ConvertFrom-Json
                    $agents = if ($doc -and $doc.PSObject.Properties.Name -contains 'Agents') { @($doc.Agents) } else { @($doc) }
                    foreach ($a in $agents) {
                        $name = [string]$a.name
                        $role = [string]$a.role
                        $prompt = [string]$a.prompt
                        if (-not $name) { continue }

                        [pscustomobject]@{
                            id            = if ($a.id) { [string]$a.id } else { "ag_" + (($name -replace '[^\w\-]', '-').ToLower()) }
                            name          = $name
                            role          = $role
                            prompt        = $prompt
                            capabilities  = @($a.capabilities)
                            style         = $a.style
                            constraints   = @($a.constraints)
                            io_contract   = $a.io_contract
                            routing_hints = $a.routing_hints
                            checksum      = (Get-ContentHash -Text ($role + "`n---`n" + $prompt))
                            _Path         = $f.FullName
                            _Raw          = $raw
                        }
                    }
                }
                default {
                    # YAML
                    $doc = ConvertFrom-Yaml -Yaml $raw
                    $agents = if ($doc -and $doc.PSObject.Properties.Name -contains 'Agents') { @($doc.Agents) } else { @($doc) }
                    foreach ($a in $agents) {
                        $name = [string]$a.name
                        $role = [string]$a.role
                        $prompt = [string]$a.prompt
                        if (-not $name) { continue }

                        [pscustomobject]@{
                            id            = if ($a.id) { [string]$a.id } else { "ag_" + (($name -replace '[^\w\-]', '-').ToLower()) }
                            name          = $name
                            role          = $role
                            prompt        = $prompt
                            capabilities  = @($a.capabilities)
                            style         = $a.style
                            constraints   = @($a.constraints)
                            io_contract   = $a.io_contract
                            routing_hints = $a.routing_hints
                            checksum      = (Get-ContentHash -Text ($role + "`n---`n" + $prompt))
                            _Path         = $f.FullName
                            _Raw          = $raw
                        }
                    }
                }
            }
        }
        catch {
            Write-Warning ("⚠️  Skipped invalid agent file {0}: {1}" -f $f.FullName, $_)
        }
    }
    , $out
}

function Get-Agent {
    <#
    .SYNOPSIS
      Return normalized agent objects from /data/agents (json/yaml; single or batch).
    #>
    [CmdletBinding()]
    param(
        [string]   $Id,
        [string]   $Name,
        [string[]] $Capability
    )

    $agents = Read-AgentFiles
    if ($Id) { $agents = $agents | Where-Object { $_.id -eq $Id } }
    if ($Name) { $agents = $agents | Where-Object { $_.name -match [regex]::Escape($Name) } }
    if ($Capability) { $agents = $agents | Where-Object { (($_.capabilities) -join ',') -match ($Capability -join '|') } }
    $agents
}

# ----------------------------------------------------
# Orchestration runner (prompt + agent + model → artifact)
# ----------------------------------------------------
function Invoke-Orchestration {
    [CmdletBinding()]
    param(
        [string]$PromptId,
        [pscustomobject]$PromptObject,
        [Parameter(Mandatory)][string]$AgentId,
        [Parameter(Mandatory)][hashtable]$Inputs,
        [Parameter(Mandatory)][string]$Model,
        [string]$ArtifactName = ("art_" + (Get-Date -Format 'yyyyMMdd_HHmmss'))
    )

    $prompt = if ($PromptObject) { $PromptObject } elseif ($PromptId) { Get-Prompt -Id $PromptId | Select-Object -First 1 }
    if (-not $prompt) {
        throw ("Prompt {0} not found." -f ($PromptId ?? '<unspecified>'))
    }

    if ($prompt -isnot [pscustomobject]) {
        $prompt = [pscustomobject]$prompt
    }
    if (-not $prompt.PSObject.Properties.Match('tags')) {
        $prompt | Add-Member -NotePropertyName tags -NotePropertyValue @() -Force
    }

    $template = if ($prompt.PSObject.Properties.Match('user_template')) { $prompt.user_template } else { $null }
    if ([string]::IsNullOrWhiteSpace($template) -and $prompt.blocks) {
        $template = $prompt.blocks.user_template
        if ([string]::IsNullOrWhiteSpace($template)) {
            $template = $prompt.blocks.instructions
        }
    }

    if ([string]::IsNullOrWhiteSpace($template)) {
        throw "The selected prompt does not define a user template."
    }

    $prompt | Add-Member -NotePropertyName user_template -NotePropertyValue $template -Force

    $systemText = if ($prompt.PSObject.Properties.Match('system')) { $prompt.system } else { $null }
    if ([string]::IsNullOrWhiteSpace($systemText) -and $prompt.blocks) {
        $systemText = $prompt.blocks.system
    }

    if ([string]::IsNullOrWhiteSpace($systemText)) {
        $systemText = "You are an orchestration agent."
    }

    $prompt | Add-Member -NotePropertyName system -NotePropertyValue $systemText -Force

    if (-not $prompt.checksum) {
        $prompt | Add-Member -NotePropertyName checksum -NotePropertyValue (Get-ContentHash -Text $template) -Force
    }

    $agent = Get-Agent -Id $AgentId | Select-Object -First 1
    if (-not $agent) {
        throw ("Agent {0} not found." -f $AgentId)
    }

    $renderedUser = Render-Template -Template $template -Vars $Inputs
    $systemMsg = ($agent.role + "`n---`n" + $prompt.system)

    $result = Invoke-Model -Provider 'openai' -Model $Model -System $systemMsg -User $renderedUser
    $promptTokens = [math]::Ceiling(($systemMsg.Length + $renderedUser.Length) / 4)
    $completionTokens = [math]::Ceiling(($result.text ?? '').Length / 4)

    $resp = [ordered]@{
        model = $Model
        text  = $result.text
        usage = @{
            prompt_tokens     = $promptTokens
            completion_tokens = $completionTokens
            total_tokens      = $promptTokens + $completionTokens
        }
        meta  = $result.raw
    }

    $artDir = Join-Path $Script:DataRoot 'artifacts'
    New-Item -ItemType Directory -Force -Path $artDir | Out-Null
    $outPath = Join-Path $artDir ("$($ArtifactName).json")

    $payload = [ordered]@{
        promptId       = $prompt.id
        agentId        = $AgentId
        model          = $Model
        inputs         = $Inputs
        system         = $systemMsg
        user           = $renderedUser
        output         = $resp
        createdUtc     = (Get-Date).ToUniversalTime().ToString("o")
        promptChecksum = $prompt.checksum
        agentChecksum  = $agent.checksum
    } | ConvertTo-Json -Depth 10

    Set-Content -LiteralPath $outPath -Value $payload -Encoding UTF8
    @{ Output = $resp; ArtifactPath = $outPath }
}

function Update-PromptIndex {
    <#
    .SYNOPSIS
      Stub for SQLite indexer; wire System.Data.SQLite later.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Path)
    Write-Verbose ("Index update requested for {0}" -f $Path)
}

function Invoke-PromptYaml {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Yaml
    )

    ConvertFrom-Yaml -Yaml $Yaml
}

# ----------------------------------------------------
# Exports (only from inside the module)
# ----------------------------------------------------
Export-ModuleMember -Function Get-Prompt, Search-Prompt, Export-Prompt, Get-Agent, Invoke-Orchestration, Update-PromptIndex, Invoke-PromptYaml
