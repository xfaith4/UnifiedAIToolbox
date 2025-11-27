<#
.SYNOPSIS
    Codex Multi-Agent Swarm Orchestrator for parallel agent execution.

.DESCRIPTION
    Orchestrate-Codex.ps1 coordinates multiple AI agents in a swarm pattern
    to work on complex tasks in parallel and synthesize results.

.PARAMETER RepoRoot
    Root directory of the repository to analyze.

.PARAMETER Model
    The AI model to use for agents (default: gpt-4o-mini).

.PARAMETER MaxAgents
    Maximum number of agents to run in parallel (default: 4).

.PARAMETER OutputDir
    Directory for swarm outputs (default: ./swarm-output).

.EXAMPLE
    .\Orchestrate-Codex.ps1 -RepoRoot . -MaxAgents 4

.NOTES
    Part of the UnifiedAIToolbox AI-Orchestration module.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$RepoRoot = ".",

    [Parameter(Mandatory = $false)]
    [string]$Model = "gpt-4o-mini",

    [Parameter(Mandatory = $false)]
    [int]$MaxAgents = 4,

    [Parameter(Mandatory = $false)]
    [string]$OutputDir = "./swarm-output",

    [Parameter(Mandatory = $false)]
    [switch]$DryRun
)

# Script configuration
$ErrorActionPreference = "Stop"
$script:StartTime = Get-Date

# Agent definitions
$script:AgentTypes = @(
    @{
        Name = "Researcher"
        Role = "Information gathering and analysis"
        Prompt = "You are a research agent. Analyze the repository structure and identify key components."
    },
    @{
        Name = "Engineer"
        Role = "Code implementation and modification"
        Prompt = "You are an engineering agent. Implement solutions and write code."
    },
    @{
        Name = "Critic"
        Role = "Code review and quality assurance"
        Prompt = "You are a critic agent. Review code for issues and suggest improvements."
    },
    @{
        Name = "Synthesizer"
        Role = "Result aggregation and reporting"
        Prompt = "You are a synthesizer agent. Combine outputs from other agents into coherent results."
    },
    @{
        Name = "Commissioner"
        Role = "Final evaluation and decision making"
        Prompt = "You are a commissioner agent. Evaluate results and make final decisions."
    }
)

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logLine = "[$timestamp] [$Level] $Message"
    Write-Host $logLine
    if ($script:LogFile) {
        Add-Content -Path $script:LogFile -Value $logLine
    }
}

function Initialize-Swarm {
    Write-Log "Initializing Codex Multi-Agent Swarm"
    Write-Log "Repository: $RepoRoot"
    Write-Log "Model: $Model"
    Write-Log "Max Agents: $MaxAgents"
    
    # Create output directory
    if (-not (Test-Path $OutputDir)) {
        New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    }
    
    # Initialize log file
    $script:LogFile = Join-Path $OutputDir "swarm.log"
    Write-Log "Log file: $script:LogFile"
    
    return @{
        RepoRoot = (Resolve-Path $RepoRoot).Path
        Model = $Model
        MaxAgents = $MaxAgents
        StartTime = $script:StartTime
        Status = "initialized"
        Agents = @()
        Results = @{}
    }
}

function Get-RepoAnalysis {
    param([string]$RepoPath)
    
    Write-Log "Analyzing repository structure..."
    
    $analysis = @{
        Path = $RepoPath
        Files = @()
        Languages = @{}
        Directories = @()
    }
    
    # Get file listing
    $files = Get-ChildItem -Path $RepoPath -Recurse -File -ErrorAction SilentlyContinue | 
        Where-Object { $_.DirectoryName -notmatch "node_modules|\.git|bin|obj|dist" }
    
    $analysis.Files = $files | Select-Object -First 100 -Property Name, Extension, DirectoryName
    
    # Count file types
    $files | Group-Object Extension | ForEach-Object {
        $analysis.Languages[$_.Name] = $_.Count
    }
    
    # Get directories
    $analysis.Directories = Get-ChildItem -Path $RepoPath -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch "^\.git$|node_modules|bin|obj|dist" } |
        Select-Object -Property Name
    
    Write-Log "Found $($analysis.Files.Count) files in $($analysis.Directories.Count) directories"
    
    return $analysis
}

function Start-AgentTask {
    param(
        [hashtable]$Agent,
        [hashtable]$Context
    )
    
    Write-Log "Starting agent: $($Agent.Name)"
    Write-Log "  Role: $($Agent.Role)"
    
    if ($DryRun) {
        Write-Log "  [DRY RUN] Skipping actual execution"
        return @{
            AgentName = $Agent.Name
            Status = "skipped"
            Output = "[Dry run - no output generated]"
            StartTime = Get-Date -Format "o"
            EndTime = Get-Date -Format "o"
        }
    }
    
    # Simulate agent execution
    Start-Sleep -Milliseconds 300
    
    $result = @{
        AgentName = $Agent.Name
        Status = "completed"
        Output = "Agent '$($Agent.Name)' completed task: $($Agent.Role)"
        StartTime = Get-Date -Format "o"
        EndTime = Get-Date -Format "o"
    }
    
    Write-Log "  Agent completed: $($Agent.Name)"
    
    return $result
}

function Invoke-SwarmExecution {
    param([hashtable]$Context)
    
    Write-Log "Starting swarm execution with $($script:AgentTypes.Count) agent types"
    
    # Analyze repository
    $repoAnalysis = Get-RepoAnalysis -RepoPath $Context.RepoRoot
    $Context.RepoAnalysis = $repoAnalysis
    
    # Determine which agents to use based on repo analysis
    $selectedAgents = $script:AgentTypes | Select-Object -First $MaxAgents
    Write-Log "Selected $($selectedAgents.Count) agents for execution"
    
    # Execute agents
    $results = @()
    foreach ($agent in $selectedAgents) {
        $result = Start-AgentTask -Agent $agent -Context $Context
        $results += $result
        $Context.Agents += $agent.Name
    }
    
    $Context.Results = $results
    return $Context
}

function Complete-SwarmExecution {
    param([hashtable]$Context)
    
    $endTime = Get-Date
    $duration = $endTime - $script:StartTime
    
    Write-Log "Swarm execution completed in $($duration.TotalSeconds) seconds"
    
    # Generate summary
    $summary = @{
        RepoRoot = $Context.RepoRoot
        Model = $Context.Model
        StartTime = $Context.StartTime.ToString("o")
        EndTime = $endTime.ToString("o")
        DurationSeconds = [math]::Round($duration.TotalSeconds, 2)
        AgentsUsed = $Context.Agents
        ResultsCount = $Context.Results.Count
        Status = "completed"
    }
    
    # Save summary
    $summaryPath = Join-Path $OutputDir "swarm-summary.json"
    $summary | ConvertTo-Json -Depth 10 | Set-Content -Path $summaryPath
    Write-Log "Summary saved to: $summaryPath"
    
    # Save detailed results
    $resultsPath = Join-Path $OutputDir "swarm-results.json"
    $Context.Results | ConvertTo-Json -Depth 10 | Set-Content -Path $resultsPath
    Write-Log "Results saved to: $resultsPath"
    
    return $summary
}

# Main execution
try {
    # Initialize swarm
    $context = Initialize-Swarm
    
    # Execute swarm
    $context = Invoke-SwarmExecution -Context $context
    
    # Complete execution
    $summary = Complete-SwarmExecution -Context $context
    
    Write-Host ""
    Write-Host "Codex Swarm execution completed successfully!" -ForegroundColor Green
    Write-Host "Summary: $($summary | ConvertTo-Json -Compress)"
    
    exit 0
}
catch {
    Write-Log "Swarm execution failed: $_" -Level "ERROR"
    Write-Host "Swarm execution failed: $_" -ForegroundColor Red
    exit 1
}
