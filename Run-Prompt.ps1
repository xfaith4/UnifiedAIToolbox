<#
.SYNOPSIS
    Interactive prompt runner for UnifiedAIToolbox
.DESCRIPTION
    Provides an interactive interface to discover and run prompts from the prompt library
    with support for both direct execution and codex-multiagent-swarm.
.EXAMPLE
    .\Run-Prompt.ps1
    # Shows an interactive menu to select and run prompts
.EXAMPLE
    .\Run-Prompt.ps1 -PromptId "examples.analytics.divisions.performance.summary" -AutoRun
    # Runs the specified prompt in non-interactive mode
#>

[CmdletBinding(DefaultParameterSetName='Interactive')]
param(
    [Parameter(ParameterSetName='DirectRun', Mandatory=$true)]
    [string]$PromptId,
    
    [Parameter(ParameterSetName='DirectRun')]
    [hashtable]$Parameters = @{},
    
    [Parameter(ParameterSetName='DirectRun')]
    [switch]$AutoRun,
    
    [switch]$UseCodex,
    [string]$Model = 'gpt-4',
    [string]$CodexModel = 'gpt-4',
    [int]$MaxIterations = 3,
    [int]$PassThreshold = 7
)

# Import required modules
$modulePath = Join-Path $PSScriptRoot 'modules\PromptLibrary\PromptLibrary.psd1'
if (-not (Test-Path $modulePath)) {
    Write-Error "PromptLibrary module not found at: $modulePath"
    exit 1
}

try {
    Remove-Module -Name PromptLibrary -Force -ErrorAction SilentlyContinue
    Import-Module $modulePath -Force -ErrorAction Stop
    Write-Host "✅ Loaded PromptLibrary module" -ForegroundColor Green
} catch {
    Write-Error "❌ Failed to import PromptLibrary module: $_"
    Write-Host "Make sure the module is properly built and available at: $modulePath" -ForegroundColor Yellow
    exit 1
}

function Show-PromptMenu {
    param(
        [array]$Prompts,
        [string]$Title = 'Select a prompt'
    )
    
    $index = 1
    $promptMap = @{}
    
    Write-Host "`n$Title" -ForegroundColor Cyan
    Write-Host ("-" * ($Title.Length + 4)) -ForegroundColor Cyan
    
    foreach ($prompt in $Prompts) {
        $promptMap[$index] = $prompt
        Write-Host ("{0,3}. {1} ({2})" -f $index, $prompt.title, $prompt.id) -ForegroundColor Yellow
        if ($prompt.description) {
            Write-Host ("     {0}" -f $prompt.description) -ForegroundColor Gray
        }
        if ($prompt.tags) {
            Write-Host ("     Tags: {0}" -f ($prompt.tags -join ', ')) -ForegroundColor DarkGray
        }
        $index++
    }
    
    Write-Host "`n0. Exit" -ForegroundColor Red
    
    do {
        $selection = Read-Host "`nSelect a prompt (1-$($index-1))"
        if ($selection -eq '0') { exit }
    } until ($selection -match '^\d+$' -and [int]$selection -ge 1 -and [int]$selection -lt $index)
    
    return $promptMap[[int]$selection]
}

function Get-InputParameters {
    param(
        [pscustomobject]$Prompt
    )
    
    $inputs = @{}
    
    # Try to extract parameters from the prompt template
    $template = if ($Prompt.user_template) { $Prompt.user_template } else { $Prompt.template }
    $paramMatches = [regex]::Matches($template, '\{\{\s*([^}\s]+)\s*\}\}')
    
    if ($paramMatches.Count -eq 0) {
        Write-Host "No input parameters detected in the prompt template." -ForegroundColor Yellow
        return @{}
    }
    
    Write-Host "`nPlease provide values for the following parameters:" -ForegroundColor Cyan
    
    $uniqueParams = $paramMatches.Groups[1].Value | Sort-Object -Unique
    foreach ($param in $uniqueParams) {
        # Skip common template variables
        if ($param -in @('date', 'time', 'datetime', 'model')) {
            switch ($param) {
                'date' { $inputs[$param] = Get-Date -Format 'yyyy-MM-dd' }
                'time' { $inputs[$param] = Get-Date -Format 'HH:mm:ss' }
                'datetime' { $inputs[$param] = Get-Date -Format 'o' }
                'model' { $inputs[$param] = $Model }
            }
            continue
        }
        
        $value = Read-Host "  $param"
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            $inputs[$param] = $value
        }
    }
    
    return $inputs
}

# Main execution
function Start-PromptRunner {
    # Get all prompts
    $prompts = Get-Prompt | Sort-Object { $_.id }
    
    if (-not $prompts) {
        Write-Error "No prompts found in the library."
        exit 1
    }
    
    # If PromptId is provided, run that prompt directly
    if ($PromptId) {
        $prompt = $prompts | Where-Object { $_.id -eq $PromptId } | Select-Object -First 1
        if (-not $prompt) {
            Write-Error "Prompt with ID '$PromptId' not found."
            exit 1
        }
    } else {
        # Show interactive menu
        $prompt = Show-PromptMenu -Prompts $prompts
    }
    
    # Get input parameters
    $inputs = @{}
    if (-not $AutoRun) {
        $inputs = Get-InputParameters -Prompt $prompt
    }
    
    # Execute the prompt
    $params = @{
        PromptId = $prompt.id
        Inputs = $inputs
        Model = $Model
        UseCodex = $UseCodex
        CodexModel = $CodexModel
        MaxIterations = $MaxIterations
        PassThreshold = $PassThreshold
    }
    
    Write-Host "`n🚀 Executing prompt: $($prompt.title) ($($prompt.id))" -ForegroundColor Cyan
    if ($inputs.Count -gt 0) {
        Write-Host "With parameters:" -ForegroundColor Cyan
        $inputs.GetEnumerator() | ForEach-Object {
            Write-Host ("  {0,-20} = {1}" -f $_.Key, $_.Value) -ForegroundColor DarkCyan
        }
    }
    Write-Host ""
    
    try {
        $result = Invoke-PromptOrchestration @params
        
        # If we're in interactive mode, wait for user to continue
        if (-not $AutoRun) {
            Write-Host "`nPress any key to exit..." -ForegroundColor Gray
            $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
        }
        
        return $result
    } catch {
        Write-Error "Error executing prompt: $_"
        if (-not $AutoRun) {
            Write-Host "Press any key to exit..." -ForegroundColor Gray
            $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
        }
        exit 1
    }
}

# Start the interactive runner
if ($MyInvocation.InvocationName -ne '.') {
    Start-PromptRunner
}
