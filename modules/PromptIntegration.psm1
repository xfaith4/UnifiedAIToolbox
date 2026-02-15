#Requires -Version 5.1
#Requires -Module PromptLibrary

<#
.SYNOPSIS
    Integration module for UnifiedAIToolbox and Prompt Library
.DESCRIPTION
    Provides cmdlets to interact with the Prompt Library from UnifiedAIToolbox,
    including running prompts, listing available prompts, and managing the web UI.
#>

# Import required modules
Import-Module -Name "$PSScriptRoot\PromptLibrary\PromptLibrary.psd1" -Force

# Web UI management
$script:webProcess = $null
$script:webPort = 8000

function Start-PromptLibrary {
    <#
    .SYNOPSIS
        Starts the Prompt Library web interface.
    .DESCRIPTION
        Launches the Prompt Library web UI and opens it in the default browser.
    .EXAMPLE
        Start-PromptLibrary
        # Starts the web UI on the default port (8000)
    .EXAMPLE
        Start-PromptLibrary -Port 8080
        # Starts the web UI on port 8080
    #>
    [CmdletBinding()]
    param(
        [int]$Port = 8000,
        [switch]$NoBrowser
    )
    
    $script:webPort = $Port
    $script:webProcess = Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-Command",
        "& '$PSScriptRoot\..\Start-WebUI.ps1' -Port $Port"
    ) -PassThru -WindowStyle Normal
    
    $url = "http://localhost:$Port"
    if (-not $NoBrowser) {
        Start-Process $url
    }
    
    Write-Host "Prompt Library started at $url" -ForegroundColor Green
    return $url
}

function Stop-PromptLibrary {
    <#
    .SYNOPSIS
        Stops the Prompt Library web interface.
    #>
    if ($script:webProcess -and -not $script:webProcess.HasExited) {
        $script:webProcess | Stop-Process -Force
        Write-Host "Prompt Library stopped" -ForegroundColor Green
    } else {
        Write-Host "Prompt Library is not running" -ForegroundColor Yellow
    }
}

function Get-PromptList {
    <#
    .SYNOPSIS
        Lists all available prompts from the Prompt Library.
    .EXAMPLE
        Get-PromptList
        # Lists all available prompts
    .EXAMPLE
        Get-PromptList -Tag "analytics"
        # Lists prompts with the 'analytics' tag
    #>
    [CmdletBinding()]
    param(
        [string]$Tag,
        [string]$Search
    )
    
    $params = @{}
    if ($Tag) { $params.Tag = $Tag }
    if ($Search) { $params.TitleLike = $Search }
    
    Get-Prompt @params | Select-Object id, title, @{Name="tags";Expression={$_.tags -join ", "}}, description
}

function Invoke-Prompt {
    <#
    .SYNOPSIS
        Executes a prompt from the Prompt Library.
    .DESCRIPTION
        Runs a specified prompt with the given parameters and returns the result.
    .EXAMPLE
        Invoke-Prompt -Id "examples.analytics.divisions.performance.summary" -Parameters @{
            division = "Medicare"
            month = (Get-Date -Format "yyyy-MM")
        }
        # Runs the specified prompt with the given parameters
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$Id,
        
        [hashtable]$Parameters = @{},
        
        [string]$AgentId,
        [string]$Model = "gpt-4",
        [switch]$UseCodex
    )
    
    # Get the prompt
    $prompt = Get-Prompt -Id $Id
    if (-not $prompt) {
        throw "Prompt with ID '$Id' not found"
    }
    
    # If no agent specified, try to get a default
    if (-not $AgentId) {
        $AgentId = $prompt.metadata.defaultAgent
    }
    
    if (-not $AgentId) {
        throw "No agent specified and no default agent found in prompt metadata"
    }
    
    # Run the prompt
    if ($UseCodex) {
        throw "Swarming execution is disabled for this environment."
    } else {
        # Use standard orchestration
        Invoke-Orchestration -PromptId $Id -AgentId $AgentId -Inputs $Parameters -Model $Model
    }
}

# Export public functions
Export-ModuleMember -Function Start-PromptLibrary, Stop-PromptLibrary, Get-PromptList, Invoke-Prompt
