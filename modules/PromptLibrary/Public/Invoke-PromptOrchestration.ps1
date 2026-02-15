#Requires -Version 5.1
<#
.SYNOPSIS
    Executes a prompt using the specified agent and model, with support for codex-multiagent-swarm.
.DESCRIPTION
    This function provides a unified interface to execute prompts from the prompt library
    using the orchestration system, with optional integration with codex-multiagent-swarm.
.PARAMETER PromptId
    The ID of the prompt to execute (e.g., 'examples.analytics.divisions.performance.summary')
.PARAMETER AgentId
    The ID of the agent to use for execution (default: 'ag_20251109_researcher')
.PARAMETER Model
    The model to use for execution (default: 'gpt-4')
.PARAMETER Inputs
    Hashtable of input parameters for the prompt
.PARAMETER UseCodex
    If specified, will use codex-multiagent-swarm for execution
.PARAMETER CodexModel
    The model to use for codex-multiagent-swarm (default: 'gpt-4')
.EXAMPLE
    $inputs = @{
        division = 'Medicare'
        month = (Get-Date -Format 'yyyy-MM')
    }
    Invoke-PromptOrchestration -PromptId 'examples.analytics.divisions.performance.summary' -Inputs $inputs
#>
function Invoke-PromptOrchestration {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$PromptId,
        
        [string]$AgentId = 'ag_20251109_researcher',
        
        [string]$Model = 'gpt-4',
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Inputs,
        
        [switch]$UseCodex,
        
        [string]$CodexModel = 'gpt-4',
        
        [int]$MaxIterations = 3,
        
        [int]$PassThreshold = 7
    )
    
    # Import required modules
    $modulePath = Join-Path $PSScriptRoot '..\..\modules\PromptLibrary\PromptLibrary.psd1'
    if (-not (Get-Module -Name PromptLibrary -ErrorAction SilentlyContinue)) {
        Import-Module $modulePath -Force
    }
    
    # Get the prompt
    $prompt = Get-Prompt -Id $PromptId -ErrorAction Stop
    if (-not $prompt) {
        throw "Prompt with ID '$PromptId' not found in the prompt library."
    }
    
    # Swarming is disabled for this environment.
    if ($UseCodex) {
        throw "Swarming execution is disabled for this environment."
    }
    else {
        # Use standard orchestration
        Write-Host "🚀 Executing prompt: $($prompt.title)" -ForegroundColor Cyan
        $result = Invoke-Orchestration \
            -PromptId $PromptId \
            -AgentId $AgentId \
            -Inputs $Inputs \
            -Model $Model
            
        # Output the result
        if ($result.Output.text) {
            Write-Host "\n📝 Result:" -ForegroundColor Green
            Write-Host $result.Output.text
            
            if ($result.ArtifactPath) {
                Write-Host "\n💾 Artifact saved to: $($result.ArtifactPath)" -ForegroundColor Cyan
            }
        }
        
        return $result
    }
}

export-modulemember -Function Invoke-PromptOrchestration
