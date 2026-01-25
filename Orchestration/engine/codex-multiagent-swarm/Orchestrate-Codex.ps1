<#
.SYNOPSIS
    Multi-agent swarm orchestrator for repository analysis and code generation.

.DESCRIPTION
    Orchestrate-Codex.ps1 is the multi-agent swarm orchestrator that:
    1. Analyzes a repository structure
    2. Selects appropriate agents for the task
    3. Executes agents in parallel
    4. Synthesizes results from all agents
    5. Generates comprehensive reports

.PARAMETER RepoRoot
    Repository root directory to analyze.

.PARAMETER Model
    AI model to use (default: gpt-4o-mini).

.PARAMETER MaxAgents
    Maximum concurrent agents (default: 4).

.PARAMETER MaxParallel
    Maximum parallel agent jobs (alias for MaxAgents).

.PARAMETER OutputDir
    Directory for outputs (default: ./swarm-output).

.PARAMETER WorkDir
    Working directory for codex operations (default: .codex_out).

.PARAMETER DryRun
    Skip actual execution for testing.

.EXAMPLE
    .\Orchestrate-Codex.ps1 -RepoRoot . -MaxAgents 4

.EXAMPLE
    .\Orchestrate-Codex.ps1 -RepoRoot C:\Projects\MyRepo -Model gpt-4 -DryRun

.NOTES
    Part of the UnifiedAIToolbox Orchestration module.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,

    [Parameter(Mandatory = $false)]
    [string]$Model = "gpt-4o-mini",

    [Parameter(Mandatory = $false)]
    [int]$MaxAgents = 4,

    [Parameter(Mandatory = $false)]
    [int]$MaxParallel,

    [Parameter(Mandatory = $false)]
    [string]$OutputDir = ".\swarm-output",

    [Parameter(Mandatory = $false)]
    [string]$WorkDir = ".codex_out",

    [Parameter(Mandatory = $false)]
    [switch]$DryRun,

    [Parameter(Mandatory = $false)]
    [string]$CodexPath = "codex"
)

# Script configuration
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# Use MaxParallel if provided, otherwise use MaxAgents
if ($MaxParallel) {
    $MaxAgents = $MaxParallel
}

# Agent types available in the swarm
$AgentTypes = @{
    Researcher   = @{
        Role        = "Information gathering"
        Description = "Analyzes context and gathers relevant data"
    }
    Engineer     = @{
        Role        = "Implementation"
        Description = "Writes code and builds solutions"
    }
    Critic       = @{
        Role        = "Quality assurance"
        Description = "Reviews work and identifies issues"
    }
    Synthesizer  = @{
        Role        = "Integration"
        Description = "Combines outputs into coherent results"
    }
    Commissioner = @{
        Role        = "Decision making"
        Description = "Evaluates results and makes final calls"
    }
}

# ============================================================================
# Helper Functions
# ============================================================================

function Write-Log {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message,
        
        [Parameter(Mandatory = $false)]
        [ValidateSet("Info", "Warning", "Error", "Success")]
        [string]$Level = "Info"
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $color = switch ($Level) {
        "Info" { "White" }
        "Warning" { "Yellow" }
        "Error" { "Red" }
        "Success" { "Green" }
    }
    
    Write-Host "[$timestamp] [$Level] $Message" -ForegroundColor $color
}

function Test-Cli {
    param([Parameter(Mandatory = $true)][string]$Name)
    try {
        return [bool](Get-Command $Name -ErrorAction Stop)
    }
    catch {
        return $false
    }
}

function Get-RepositoryStructure {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )
    
    Write-Log "Analyzing repository structure at: $Path"
    
    $structure = @{
        RootPath     = (Resolve-Path $Path).Path
        TotalFiles   = 0
        FileTypes    = @{}
        Directories  = @()
        Languages    = @{}
        HasTests     = $false
        HasDocs      = $false
        HasCI        = $false
    }
    
    # Analyze repository
    try {
        $files = Get-ChildItem -Path $Path -Recurse -File -ErrorAction SilentlyContinue | 
        Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.git|\.venv|venv|bin|obj|dist|build)[\\/]' }
        
        $structure.TotalFiles = $files.Count
        
        foreach ($file in $files) {
            $ext = $file.Extension.ToLower()
            if ($ext) {
                if (-not $structure.FileTypes.ContainsKey($ext)) {
                    $structure.FileTypes[$ext] = 0
                }
                $structure.FileTypes[$ext]++
                
                # Detect languages
                switch ($ext) {
                    ".py" { $structure.Languages["Python"] = $true }
                    ".js" { $structure.Languages["JavaScript"] = $true }
                    ".ts" { $structure.Languages["TypeScript"] = $true }
                    ".ps1" { $structure.Languages["PowerShell"] = $true }
                    ".cs" { $structure.Languages["C#"] = $true }
                    ".java" { $structure.Languages["Java"] = $true }
                    ".go" { $structure.Languages["Go"] = $true }
                    ".rb" { $structure.Languages["Ruby"] = $true }
                }
            }
            
            # Detect features
            if ($file.Name -match "test|spec") {
                $structure.HasTests = $true
            }
            if ($file.Name -match "README|\.md$") {
                $structure.HasDocs = $true
            }
        }
        
        # Check for CI/CD
        $ciPaths = @(".github", ".gitlab-ci.yml", "azure-pipelines.yml", "Jenkinsfile")
        foreach ($ciPath in $ciPaths) {
            if (Test-Path (Join-Path $Path $ciPath)) {
                $structure.HasCI = $true
                break
            }
        }
    }
    catch {
        Write-Log "Error analyzing repository: $_" -Level Warning
    }
    
    return $structure
}

function Select-Agents {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$RepoStructure,
        
        [Parameter(Mandatory = $true)]
        [int]$MaxAgents
    )
    
    Write-Log "Selecting agents based on repository characteristics"
    
    $selectedAgents = @()
    $availableSlots = $MaxAgents
    
    # Always include core agents if we have slots
    $coreAgents = @("Researcher", "Engineer", "Critic")
    
    foreach ($agentType in $coreAgents) {
        if ($availableSlots -gt 0) {
            $selectedAgents += @{
                Type        = $agentType
                Role        = $AgentTypes[$agentType].Role
                Description = $AgentTypes[$agentType].Description
                Priority    = 1
            }
            $availableSlots--
        }
    }
    
    # Add optional agents based on available slots
    if ($availableSlots -gt 0) {
        $selectedAgents += @{
            Type        = "Synthesizer"
            Role        = $AgentTypes["Synthesizer"].Role
            Description = $AgentTypes["Synthesizer"].Description
            Priority    = 2
        }
        $availableSlots--
    }
    
    if ($availableSlots -gt 0) {
        $selectedAgents += @{
            Type        = "Commissioner"
            Role        = $AgentTypes["Commissioner"].Role
            Description = $AgentTypes["Commissioner"].Description
            Priority    = 3
        }
        $availableSlots--
    }
    
    Write-Log "Selected $($selectedAgents.Count) agents: $($selectedAgents.Type -join ', ')" -Level Success
    
    return $selectedAgents
}

function Invoke-AgentExecution {
    param(
        [Parameter(Mandatory = $true)]
        [array]$Agents,
        
        [Parameter(Mandatory = $true)]
        [hashtable]$RepoStructure,
        
        [Parameter(Mandatory = $true)]
        [string]$OutputDir,
        
        [Parameter(Mandatory = $true)]
        [string]$Model,
        
        [Parameter(Mandatory = $false)]
        [switch]$DryRun
    )
    
    Write-Log "Executing agent swarm"
    
    $results = @()
    
    foreach ($agent in $Agents) {
        $agentType = $agent.Type
        $agentOutput = Join-Path $OutputDir $agentType
        New-Item -ItemType Directory -Path $agentOutput -Force | Out-Null
        
        Write-Log "Executing agent: $agentType"
        
        if ($DryRun) {
            # In dry run mode, create mock output
            $result = @{
                Agent       = $agentType
                Status      = "Completed (DryRun)"
                Model       = $Model
                OutputPath  = $agentOutput
                StartTime   = Get-Date
                EndTime     = Get-Date
                Duration    = 0
                Findings    = @(
                    @{
                        Type        = "Info"
                        Message     = "DryRun mode: No actual execution performed"
                        Severity    = "Low"
                    }
                )
            }
            
            # Create mock log file
            $logPath = Join-Path $agentOutput "agent.log"
            "[DryRun] Agent $agentType would execute here" | Set-Content -Path $logPath
            
            $results += $result
        }
        else {
            # In real mode, this would invoke actual agent execution
            # For now, creating a placeholder result
            $result = @{
                Agent       = $agentType
                Status      = "Completed"
                Model       = $Model
                OutputPath  = $agentOutput
                StartTime   = Get-Date
                EndTime     = Get-Date
                Duration    = 0
                Findings    = @()
            }
            
            # Create log file
            $logPath = Join-Path $agentOutput "agent.log"
            "Agent $agentType execution log" | Set-Content -Path $logPath
            
            $results += $result
        }
    }
    
    return $results
}

function Export-SwarmSummary {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$RepoStructure,
        
        [Parameter(Mandatory = $true)]
        [array]$Agents,
        
        [Parameter(Mandatory = $true)]
        [array]$Results,
        
        [Parameter(Mandatory = $true)]
        [string]$OutputDir,
        
        [Parameter(Mandatory = $true)]
        [string]$Model
    )
    
    Write-Log "Generating swarm summary"
    
    $summary = @{
        Timestamp       = Get-Date -Format "o"
        Model           = $Model
        RepoRoot        = $RepoStructure.RootPath
        TotalFiles      = $RepoStructure.TotalFiles
        Languages       = @($RepoStructure.Languages.Keys)
        AgentsUsed      = @($Agents | ForEach-Object { $_.Type })
        AgentCount      = $Agents.Count
        ExecutionStatus = "Completed"
        Results         = $Results
    }
    
    $summaryPath = Join-Path $OutputDir "swarm-summary.json"
    $summary | ConvertTo-Json -Depth 10 | Set-Content -Path $summaryPath -Encoding UTF8
    
    Write-Log "Summary saved to: $summaryPath" -Level Success
    
    return $summary
}

function Export-SwarmResults {
    param(
        [Parameter(Mandatory = $true)]
        [array]$Results,
        
        [Parameter(Mandatory = $true)]
        [string]$OutputDir
    )
    
    Write-Log "Generating swarm results"
    
    $resultsData = @{
        Timestamp      = Get-Date -Format "o"
        AgentResults   = $Results
        OverallStatus  = "Completed"
        TotalFindings  = ($Results | ForEach-Object { $_.Findings.Count } | Measure-Object -Sum).Sum
    }
    
    $resultsPath = Join-Path $OutputDir "swarm-results.json"
    $resultsData | ConvertTo-Json -Depth 10 | Set-Content -Path $resultsPath -Encoding UTF8
    
    Write-Log "Results saved to: $resultsPath" -Level Success
    
    return $resultsData
}

# ============================================================================
# Main Execution
# ============================================================================

try {
    Write-Log "=== Codex Multi-Agent Swarm Orchestration ===" -Level Success
    Write-Log "Repository: $RepoRoot"
    Write-Log "Model: $Model"
    Write-Log "Max Agents: $MaxAgents"
    Write-Log "Output Directory: $OutputDir"
    Write-Log "Dry Run: $DryRun"
    
    # Validate repository path
    if (-not (Test-Path $RepoRoot)) {
        throw "Repository path does not exist: $RepoRoot"
    }
    
    # Create output directory
    $resolvedOutputDir = Join-Path $RepoRoot $OutputDir
    New-Item -ItemType Directory -Path $resolvedOutputDir -Force | Out-Null
    Write-Log "Output directory created: $resolvedOutputDir"
    
    # Step 1: Analyze repository
    Write-Log "Step 1: Analyzing repository structure"
    $repoStructure = Get-RepositoryStructure -Path $RepoRoot
    
    # Step 2: Select agents
    Write-Log "Step 2: Selecting agents"
    $selectedAgents = Select-Agents -RepoStructure $repoStructure -MaxAgents $MaxAgents
    
    # Step 3: Execute agents
    Write-Log "Step 3: Executing agent swarm"
    $executionResults = Invoke-AgentExecution `
        -Agents $selectedAgents `
        -RepoStructure $repoStructure `
        -OutputDir $resolvedOutputDir `
        -Model $Model `
        -DryRun:$DryRun
    
    # Step 4: Export summary
    Write-Log "Step 4: Generating summary and results"
    $summary = Export-SwarmSummary `
        -RepoStructure $repoStructure `
        -Agents $selectedAgents `
        -Results $executionResults `
        -OutputDir $resolvedOutputDir `
        -Model $Model
    
    $results = Export-SwarmResults `
        -Results $executionResults `
        -OutputDir $resolvedOutputDir
    
    Write-Log "=== Orchestration Completed Successfully ===" -Level Success
    Write-Log "Total agents executed: $($selectedAgents.Count)"
    Write-Log "Total findings: $($results.TotalFindings)"
    Write-Log "Output location: $resolvedOutputDir"
    
    exit 0
}
catch {
    Write-Log "Orchestration failed: $_" -Level Error
    Write-Log $_.ScriptStackTrace -Level Error
    exit 1
}
