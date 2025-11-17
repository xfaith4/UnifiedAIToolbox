#Requires -Version 5.1
<#
.SYNOPSIS
    Builds the SQLite prompt index with full-text search support.
.DESCRIPTION
    This script indexes all prompt YAML files and agent definitions into a SQLite database
    with FTS5 (Full-Text Search) support for fast searching.
.EXAMPLE
    .\Build-Index.ps1
    Indexes all prompts and agents into the database.
.EXAMPLE
    .\Build-Index.ps1 -Verbose
    Indexes with verbose output showing each indexed item.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

Write-Host "Building prompt index..." -ForegroundColor Cyan

# Import PromptLibrary module
$modulePath = Join-Path $PSScriptRoot '..\modules\PromptLibrary\PromptLibrary.psd1'
Import-Module $modulePath -Force -ErrorAction Stop

# Get paths
$dataRoot = Join-Path $PSScriptRoot '..\data'
$promptsPath = Join-Path $dataRoot 'prompts'
$agentsPath = Join-Path $dataRoot 'agents'

# Track statistics
$stats = @{
    PromptsIndexed = 0
    PromptsSkipped = 0
    AgentsIndexed = 0
    AgentsSkipped = 0
    Errors = @()
}

# Index prompts
if (Test-Path $promptsPath) {
    Write-Host "Indexing prompts from: $promptsPath" -ForegroundColor Yellow
    
    $promptFiles = Get-ChildItem -Path $promptsPath -Filter '*.prompt.yaml' -Recurse -File
    
    foreach ($file in $promptFiles) {
        try {
            Write-Verbose "Processing: $($file.Name)"
            
            # Read and parse YAML
            $rawContent = Get-Content -LiteralPath $file.FullName -Raw
            $prompt = $rawContent | ConvertFrom-Yaml
            
            if (-not $prompt.id) {
                Write-Warning "Skipping $($file.Name): Missing 'id' field"
                $stats.PromptsSkipped++
                continue
            }
            
            # Extract metadata
            $title = if ($prompt.title) { $prompt.title } else { $prompt.id }
            $version = if ($prompt.version) { $prompt.version.ToString() } else { '1.0.0' }
            $category = if ($prompt.category) { $prompt.category } else { '' }
            $tags = if ($prompt.telemetry.tags) { @($prompt.telemetry.tags) } else { @() }
            $owners = if ($prompt.owners) { @($prompt.owners) } else { @() }
            $riskTier = if ($prompt.risk_tier) { $prompt.risk_tier } else { '' }
            
            # Extract description and instructions from blocks
            $description = ''
            $instructions = ''
            
            if ($prompt.blocks) {
                if ($prompt.blocks.system) {
                    $description = $prompt.blocks.system
                }
                if ($prompt.blocks.instructions) {
                    $instructions = $prompt.blocks.instructions
                } elseif ($prompt.blocks.user_template) {
                    $instructions = $prompt.blocks.user_template
                }
            }
            
            # Calculate checksum
            $checksum = Get-ContentHash -Text $rawContent
            
            # Update index
            Update-PromptIndex `
                -PromptId $prompt.id `
                -Title $title `
                -Version $version `
                -Category $category `
                -Tags $tags `
                -Owners $owners `
                -RiskTier $riskTier `
                -Description $description `
                -Instructions $instructions `
                -Checksum $checksum `
                -FilePath $file.FullName
            
            $stats.PromptsIndexed++
            Write-Verbose "  ✓ Indexed: $($prompt.id)"
            
        } catch {
            $stats.PromptsSkipped++
            $stats.Errors += "Error indexing $($file.Name): $_"
            Write-Warning "Error indexing $($file.Name): $_"
        }
    }
} else {
    Write-Warning "Prompts directory not found: $promptsPath"
}

# Index agents
if (Test-Path $agentsPath) {
    Write-Host "Indexing agents from: $agentsPath" -ForegroundColor Yellow
    
    $agentFiles = Get-ChildItem -Path $agentsPath -Include '*.json', '*.yaml', '*.yml' -Recurse -File
    
    foreach ($file in $agentFiles) {
        try {
            Write-Verbose "Processing: $($file.Name)"
            
            # Read and parse
            $rawContent = Get-Content -LiteralPath $file.FullName -Raw
            $ext = [IO.Path]::GetExtension($file.Name).ToLowerInvariant()
            
            $agent = switch ($ext) {
                { $_ -in '.yaml', '.yml' } { $rawContent | ConvertFrom-Yaml }
                '.json' { $rawContent | ConvertFrom-Json }
                default { $null }
            }
            
            if (-not $agent) {
                Write-Warning "Skipping $($file.Name): Could not parse file"
                $stats.AgentsSkipped++
                continue
            }
            
            # Handle both single agent and agent arrays
            $agents = if ($agent.Agents) { $agent.Agents } elseif ($agent.id -or $agent.name) { @($agent) } else { @() }
            
            foreach ($a in $agents) {
                if (-not ($a.id -or $a.name)) {
                    Write-Verbose "  Skipping agent: Missing id/name"
                    continue
                }
                
                $agentId = if ($a.id) { $a.id } else { "ag_" + ($a.name -replace '[^\w\-]', '-').ToLower() }
                $name = if ($a.name) { $a.name } else { $agentId }
                $role = if ($a.role) { $a.role } else { '' }
                $capabilities = if ($a.capabilities) { @($a.capabilities) } else { @() }
                $checksum = Get-ContentHash -Text ($rawContent)
                
                Update-AgentIndex `
                    -AgentId $agentId `
                    -Name $name `
                    -Role $role `
                    -Capabilities $capabilities `
                    -Checksum $checksum `
                    -FilePath $file.FullName
                
                $stats.AgentsIndexed++
                Write-Verbose "  ✓ Indexed agent: $agentId"
            }
            
        } catch {
            $stats.AgentsSkipped++
            $stats.Errors += "Error indexing $($file.Name): $_"
            Write-Warning "Error indexing $($file.Name): $_"
        }
    }
} else {
    Write-Warning "Agents directory not found: $agentsPath"
}

# Display summary
Write-Host ""
Write-Host "Index Build Summary:" -ForegroundColor Green
Write-Host "  Prompts indexed: $($stats.PromptsIndexed)" -ForegroundColor Cyan
Write-Host "  Prompts skipped: $($stats.PromptsSkipped)" -ForegroundColor Yellow
Write-Host "  Agents indexed: $($stats.AgentsIndexed)" -ForegroundColor Cyan
Write-Host "  Agents skipped: $($stats.AgentsSkipped)" -ForegroundColor Yellow

if ($stats.Errors.Count -gt 0) {
    Write-Host "  Errors: $($stats.Errors.Count)" -ForegroundColor Red
    foreach ($err in $stats.Errors) {
        Write-Host "    - $err" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "✓ Index build complete!" -ForegroundColor Green

# Return stats for CI/CD
return [PSCustomObject]$stats
