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
$Script:DatabasePath = Join-Path $Script:DataRoot 'prompts.db'

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

function ConvertTo-TemplateText {
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
            param($match)
            $null = $match.Value
            # Ensure literal replacement; escape $ to $$ to avoid backrefs
            return ($Vars[$k]).ToString().Replace('$', '$$')
        }
        $result = [regex]::Replace($result, $pattern, $evaluator, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    }
    return $result
}

# -------------------------# ---------------------------
# Dot-source helper cmdlets into MODULE scope
# ---------------------------
. "$PSScriptRoot\Private\ConvertFromYaml.ps1"
. "$PSScriptRoot\Private\Get-SecretValue.ps1"
. "$PSScriptRoot\Private\Database.psm1"
. "$PSScriptRoot\Public\Get-Search-Export.ps1"
. "$PSScriptRoot\Public\Invoke-Model.ps1"

# Initialize database on module import
Initialize-Database -DatabasePath $Script:DatabasePath

# ----------------------------------------------------
# Unified Agent Loader (JSON + YAML, single objects or arrays, and { Agents: [...] } payloads)
# ----------------------------------------------------
function Get-AgentFile {
    <#
    .SYNOPSIS
      Load agent definitions from JSON or YAML and normalize fields.
    .OUTPUTS
      Objects with: id,name,role,prompt,capabilities,style,constraints,io_contract,routing_hints,checksum,_Path,_Raw
    #>
    [CmdletBinding()]
    param(
        [string]$Root = (Join-Path $Script:DataRoot 'agents'),
        [switch]$UpdateIndex
    )

    if (-not (Test-Path -LiteralPath $Root)) { return @() }

    $files = Get-ChildItem -LiteralPath $Root -Recurse -File -Include *.json, *.yml, *.yaml -ErrorAction SilentlyContinue
    $agentList = [System.Collections.Generic.List[PSObject]]::new()
    
    foreach ($f in $files) {
        $raw = Get-Content -LiteralPath $f.FullName -Raw -ErrorAction SilentlyContinue
        if (-not $raw) { continue }
        
        $ext = [IO.Path]::GetExtension($f.Name).ToLowerInvariant()
        try {
            $doc = switch ($ext) {
                { $_ -in '.yaml', '.yml' } { 
                    $raw | ConvertFromYaml 
                }
                '.json' { 
                    $raw | ConvertFrom-Json 
                }
                default { 
                    Write-Verbose "Skipping unsupported file: $($f.FullName)"
                    continue 
                }
            }
            
            if ($null -eq $doc) { continue }
            
            # Handle different document structures
            # Process the document based on its structure
            $agentsToProcess = if ($doc.PSObject.Properties.Name -contains 'Agents') {
                @($doc.Agents)
            } elseif ($doc.PSObject.Properties.Name -match '^(id|name|role|prompt|capabilities)') {
                @($doc)
            } else {
                @()
            }
            
            foreach ($a in $agentsToProcess) {
                if ($null -eq $a) { continue }
                
                $name = if ($a.name) { [string]$a.name } elseif ($a.id) { [string]$a.id } else { '' }
                if ([string]::IsNullOrWhiteSpace($name)) { continue }
                
                $role = if ($a.role) { [string]$a.role } else { '' }
                $prompt = if ($a.prompt) { [string]$a.prompt } else { '' }
                $capabilities = if ($a.capabilities) { @($a.capabilities) } else { @() }
                $style = if ($a.style) { $a.style } else { $null }
                $constraints = if ($a.constraints) { @($a.constraints) } else { @() }
                $io_contract = if ($a.io_contract) { $a.io_contract } else { $null }
                $routing_hints = if ($a.routing_hints) { $a.routing_hints } else { $null }

                $agentObj = [PSCustomObject]@{
                    id            = if ($a.id) { [string]$a.id } else { "ag_" + (($name -replace '[^\w\-]', '-').ToLower()) }
                    name          = $name
                    role          = $role
                    prompt        = $prompt
                    capabilities  = $capabilities
                    style         = $style
                    constraints   = $constraints
                    io_contract   = $io_contract
                    routing_hints = $routing_hints
                    checksum      = (Get-ContentHash -Text ($role + "`n---`n" + $prompt))
                    _Path         = $f.FullName
                    _Raw          = $raw
                }
                
                # Add to agent list
                $agentList.Add($agentObj) | Out-Null
                
                # Update index if requested
                if ($UpdateIndex) {
                    try {
                        $checksum = Get-ContentHash -Text ($agentObj | ConvertTo-Json -Depth 10 -Compress)
                        Update-AgentIndex -AgentId $agentObj.id -Name $agentObj.name -Capabilities $agentObj.capabilities -Checksum $checksum
                    } catch {
                        Write-Warning "Failed to index agent '$($agentObj.name)': $_"
                    }
                }
            }
        } catch {
            Write-Warning "Error processing file $($f.FullName): $_"
            continue
        }
    }
    return $agentList
}
Set-Alias -Name Read-AgentFiles -Value Get-AgentFile

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

    $agents = Get-AgentFile
    if ($Id) { $agents = $agents | Where-Object { $_.id -eq $Id } }
    if ($Name) { $agents = $agents | Where-Object { $_.name -match [regex]::Escape($Name) } }
    if ($Capability) { $agents = $agents | Where-Object { (($_.capabilities) -join ',') -match ($Capability -join '|') } }
    $agents
}

function Get-AgentFile {
    <#
    .SYNOPSIS
      Load agent definitions from JSON or YAML files in the data/agents directory and normalize fields.
    .DESCRIPTION
      Searches for JSON and YAML files in the data/agents directory, loads the agent definitions,
      and normalizes the agent objects to ensure consistent structure.
    .OUTPUTS
      [PSObject[]] Array of agent objects with normalized fields
    .EXAMPLE
      $agents = Get-AgentFile
    #>
    [CmdletBinding()]
    [OutputType([PSObject[]])]
    param()
    
    $agentList = @()
    $agentsPath = Join-Path -Path $PSScriptRoot -ChildPath '..\..\data\agents' -Resolve -ErrorAction SilentlyContinue
    
    if (-not $agentsPath) {
        Write-Error "Agents directory not found at: $agentsPath"
        return $agentList
    }
    
    # Process JSON files
    Get-ChildItem -Path $agentsPath -Filter '*.json' -File | ForEach-Object {
        try {
            $content = Get-Content -Path $_.FullName -Raw -ErrorAction Stop
            $jsonAgents = $content | ConvertFrom-Json -ErrorAction Stop
            
            # Handle both single agent and array of agents
            if ($jsonAgents -is [array]) {
                $agentList += $jsonAgents
            } else {
                $agentList += $jsonAgents
            }
        } catch {
            Write-Warning "Error processing JSON file $($_.FullName): $_"
        }
    }
    
    # Process YAML files if the module is available
    if (Get-Module -ListAvailable -Name 'powershell-yaml') {
        try {
            Import-Module 'powershell-yaml' -ErrorAction Stop
            
            Get-ChildItem -Path $agentsPath -Filter '*.yaml' -File | ForEach-Object {
                try {
                    $yamlContent = Get-Content -Path $_.FullName -Raw -ErrorAction Stop
                    $yamlAgents = $yamlContent | ConvertFrom-Yaml -ErrorAction Stop
                    
                    # Handle both single agent and array of agents
                    if ($yamlAgents -is [array]) {
                        $agentList += $yamlAgents
                    } else {
                        $agentList += $yamlAgents
                    }
                } catch {
                    Write-Warning "Error processing YAML file $($_.FullName): $_"
                }
            }
        } catch {
            Write-Warning "powershell-yaml module not available. Skipping YAML agent files: $_"
        }
    } else {
        Write-Warning "powershell-yaml module not found. Install it with: Install-Module -Name powershell-yaml -Scope CurrentUser -Force"
    }
    
    # Normalize agent objects
    $normalizedAgents = foreach ($agent in $agentList) {
        # Ensure required properties exist with default values
        $agent | Add-Member -MemberType NoteProperty -Name 'id' -Value $agent.id -Force -ErrorAction SilentlyContinue
        $agent | Add-Member -MemberType NoteProperty -Name 'name' -Value $agent.name -Force -ErrorAction SilentlyContinue
        $agent | Add-Member -MemberType NoteProperty -Name 'description' -Value $agent.description -Force -ErrorAction SilentlyContinue
        $agent | Add-Member -MemberType NoteProperty -Name 'capabilities' -Value @($agent.capabilities | Where-Object { $_ }) -Force -ErrorAction SilentlyContinue
        
        # Set default values if properties are missing
        if (-not $agent.id) { $agent.id = [System.IO.Path]::GetFileNameWithoutExtension($_.Name) }
        if (-not $agent.name) { $agent.name = $agent.id }
        if (-not $agent.capabilities) { $agent.capabilities = @() }
        
        $agent
    }
    
    return $normalizedAgents
}

# ----------------------------------------------------
# Orchestration runner (prompt + agent + model -> artifact)
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

    $renderedUser = ConvertTo-TemplateText -Template $template -Vars $Inputs
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



function Invoke-PromptYaml {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Yaml
    )

    ConvertFrom-Yaml -Yaml $Yaml
}

function Get-PromptFile {
    [CmdletBinding()]
    param(
        [Parameter(Position=0)]
        [string]$Id,
        
        [string]$CatalogRoot = (Join-Path $Script:DataRoot 'prompts'),
        
        [switch]$UpdateIndex
    )
    
    if (-not (Test-Path -LiteralPath $CatalogRoot)) { return $null }
    
    $promptFile = Get-ChildItem -Path $CatalogRoot -Filter "$Id.yaml" -File -Recurse | 
                 Select-Object -First 1
    
    if (-not $promptFile) { return $null }
    
    try {
        $rawContent = Get-Content -LiteralPath $promptFile.FullName -Raw
        $prompt = $rawContent | ConvertFromYaml
        $prompt | Add-Member -NotePropertyName '_Path' -NotePropertyValue $promptFile.FullName -Force
        $prompt | Add-Member -NotePropertyName '_Raw' -NotePropertyValue $rawContent -Force
        
        # Add to database index if requested
        if ($UpdateIndex) {
            $tags = @()
            if ($prompt.tags) {
                $tags = @($prompt.tags | ForEach-Object { $_ })
            }
            
            $checksum = Get-ContentHash -Text $rawContent
            Update-PromptIndex -PromptId $prompt.id `
                              -Title $prompt.title `
                              -Version $prompt.version `
                              -Tags $tags `
                              -Checksum $checksum
        }
        
        return $prompt
    } catch {
        Write-Error "Failed to load prompt '$Id' from $($promptFile.FullName): $_"
        return $null
    }
}

function Update-PromptIndexAll {
    [CmdletBinding()]
    param()
    
    Write-Host "Updating prompt and agent index..." -ForegroundColor Cyan
    
    # Index all prompts
    $promptFiles = Get-ChildItem -Path (Join-Path $Script:DataRoot 'prompts') -Filter "*.yaml" -Recurse -File
    foreach ($file in $promptFiles) {
        try {
            $prompt = Get-PromptFile -Id $file.BaseName -UpdateIndex
            Write-Host "  Indexed prompt: $($prompt.id)" -ForegroundColor Green
        } catch {
            Write-Warning "Failed to index prompt $($file.FullName): $_"
        }
    }
    
    # Index all agents
    $agentFiles = Get-ChildItem -Path (Join-Path $Script:DataRoot 'agents') -Include '*.yaml', '*.json' -Recurse -File
    foreach ($file in $agentFiles) {
        try {
            $agents = Get-AgentFile -UpdateIndex
            Write-Host "  Indexed $($agents.Count) agents from $($file.Name)" -ForegroundColor Green
        } catch {
            Write-Warning "Failed to index agents from $($file.FullName): $_"
        }
    }
    
    Write-Host "Index update complete." -ForegroundColor Green
}

# Register cleanup handler to close database connection when module is removed
$MyInvocation.MyCommand.ScriptBlock.Module.OnRemove = {
    try {
        Close-Database
    } catch {
        Write-Warning "Error closing database connection: $_"
    }
}

# ----------------------------------------------------
# Exports (only from inside the module)
# ----------------------------------------------------
Export-ModuleMember -Function Get-PromptFile, Get-PromptList, Get-AgentFile, Invoke-Orchestration, Update-PromptIndexAll, Update-PromptIndex, Invoke-PromptYaml
# region Utility helpers
function Test-OrchCli {
    <#
    .SYNOPSIS
    Checks whether the supplied command exists on the current PATH.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Command)

    try {
        return $null -ne (Get-Command -Name $Command -ErrorAction Stop)
    }
    catch {
        return $false
    }
}

Export-ModuleMember -Function Test-OrchCli
# endregion
