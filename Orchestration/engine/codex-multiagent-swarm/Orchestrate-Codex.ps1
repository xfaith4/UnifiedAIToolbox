<#
.SYNOPSIS
    Multi-agent swarm orchestrator for repository analysis and code generation.

.DESCRIPTION
    Orchestrate-Codex.ps1 is the multi-agent swarm orchestrator that:
    1. Analyzes a repository structure
    2. Selects appropriate agents for the task
    3. Executes a Swarms multi-agent run (Python) as the engine
    4. Writes outputs + status logs compatible with the Prompt API bridge

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
    Working directory for Swarms execution and any transient artifacts (default: .codex_out).
    This helps keep directories like agent_workspace out of the target repository.

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
    [string]$Goal = "Analyze the repository and produce a practical implementation plan.",

    [Parameter(Mandatory = $false)]
    [string]$Model = "gpt-4o-mini",

    [Parameter(Mandatory = $false)]
    [int]$MaxAgents = 4,

    [Parameter(Mandatory = $false)]
    [int]$MaxParallel,

    [Parameter(Mandatory = $false)]
    [string]$OutputDir = "./swarm-output",

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
    Supervisor = @{
        Role        = "Quality gate"
        Description = "Scores run output and extracts reusable learnings"
    }
    Historian = @{
        Role        = "Memory capsule"
        Description = "Captures durable run knowledge for reuse"
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

function Write-AgentStatusLine {
    param(
        [Parameter(Mandatory = $true)][string]$OutputDir,
        [Parameter(Mandatory = $true)][string]$Agent,
        [Parameter(Mandatory = $true)][string]$Status,
        [hashtable]$Extra = @{}
    )

    $statusPath = Join-Path $OutputDir "agent_status.json"
    $row = @{
        agent     = $Agent
        status    = $Status
        timestamp = (Get-Date -Format "o")
    }
    foreach ($k in $Extra.Keys) { $row[$k] = $Extra[$k] }
    ($row | ConvertTo-Json -Compress) | Add-Content -LiteralPath $statusPath
}

function Resolve-SwarmsPython {
    param([string]$ToolboxRoot)

    $py = $env:SWARMS_PYTHON_BIN
    if (-not [string]::IsNullOrWhiteSpace($py) -and (Test-Path -LiteralPath $py)) { return $py }

    $candidate = Join-Path $ToolboxRoot ".uaitoolbox\\swarms\\.venv\\Scripts\\python.exe"
    if (Test-Path -LiteralPath $candidate) { return $candidate }

    # Try to bootstrap the Swarms venv if available
    $setup = Join-Path $ToolboxRoot "scripts\\Setup-Swarms.ps1"
    if (Test-Path -LiteralPath $setup) {
        try {
            $resolved = & $setup -Quiet
            if ($resolved -and (Test-Path -LiteralPath $resolved)) { return $resolved }
        } catch { }
    }

    # Fallback: rely on PATH python
    return "python"
}

function Invoke-SwarmsRun {
    param(
        [Parameter(Mandatory = $true)][string]$ToolboxRoot,
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$Goal,
        [Parameter(Mandatory = $true)][string]$Model,
        [Parameter(Mandatory = $true)][string]$OutputDir,
        [string[]]$Agents
    )

    $runner = Join-Path $ToolboxRoot "scripts\\swarms\\toolbox_runner.py"
    if (-not (Test-Path -LiteralPath $runner)) {
        throw "Swarms runner not found: $runner"
    }

    $python = Resolve-SwarmsPython -ToolboxRoot $ToolboxRoot

    $task = "RepoRoot: $RepoRoot`nTask: $Goal"
    $args = @("-u", $runner, "--goal", $task, "--model", $Model, "--repo-root", $RepoRoot, "--output-dir", $OutputDir)
    if ($Agents -and $Agents.Count -gt 0) {
        $args += @("--agents", ($Agents -join ","))
    }
    if ($env:SWARM_TYPE) {
        $args += @("--swarm-type", "$($env:SWARM_TYPE)")
    }

    $stdout = & $python @args 2>&1 | Out-String
    $lastJson = ($stdout -split "(`r`n|`n|`r)" | Where-Object { $_.Trim().StartsWith("{") -and $_.Trim().EndsWith("}") } | Select-Object -Last 1)
    if (-not $lastJson) {
        throw "Swarms runner produced no JSON payload. Output: $stdout"
    }
    return ($lastJson | ConvertFrom-Json -ErrorAction Stop)
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
        RootPath     = (Resolve-Path -LiteralPath $Path).Path
        TotalFiles   = 0
        FileTypes    = @{}
        Directories  = @()
        Languages    = @{}
        HasTests     = $false
        HasDocs      = $false
        HasCI        = $false
    }
    
    # Analyze repository
    # Directories to exclude from analysis
    $excludeDirs = @('node_modules', '\.git', '\.venv', 'venv', 'bin', 'obj', 'dist', 'build')
    $excludePattern = '[\\/](' + ($excludeDirs -join '|') + ')[\\/]'
    
    try {
        $files = Get-ChildItem -LiteralPath $Path -Recurse -File -ErrorAction SilentlyContinue | 
        Where-Object { $_.FullName -notmatch $excludePattern }
        
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
            if (Test-Path -LiteralPath (Join-Path $Path $ciPath)) {
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

    # Keep the roster compact and bounded by MaxAgents (total agents).
    # Ensure we always have a synthesis step when there is at least 1 slot.
    $ordered = @("Researcher", "Engineer", "Critic", "Synthesizer", "Commissioner", "Supervisor", "Historian")

    # If MaxAgents is very small, prioritize Researcher + Synthesizer.
    if ($MaxAgents -le 1) {
        $ordered = @("Synthesizer")
    } elseif ($MaxAgents -eq 2) {
        $ordered = @("Researcher", "Synthesizer")
    } elseif ($MaxAgents -eq 3) {
        $ordered = @("Researcher", "Engineer", "Synthesizer")
    }

    $priority = 1
    foreach ($agentType in $ordered) {
        if ($selectedAgents.Count -ge $MaxAgents) { break }
        if (-not $AgentTypes.ContainsKey($agentType)) { continue }
        $selectedAgents += @{
            Type        = $agentType
            Role        = $AgentTypes[$agentType].Role
            Description = $AgentTypes[$agentType].Description
            Priority    = $priority
        }
        $priority++
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
        [System.IO.Directory]::CreateDirectory($agentOutput) | Out-Null
        
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
            "[DryRun] Agent $agentType would execute here" | Set-Content -LiteralPath $logPath
            
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
            "Agent $agentType execution log" | Set-Content -LiteralPath $logPath
            
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
    $summary | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $summaryPath -Encoding UTF8
    
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
    $resultsData | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $resultsPath -Encoding UTF8
    
    Write-Log "Results saved to: $resultsPath" -Level Success
    
    return $resultsData
}

# ============================================================================
# Main Execution
# ============================================================================

try {
    Write-Log "=== Codex Multi-Agent Swarm Orchestration ===" -Level Success
    Write-Log "Repository: $RepoRoot"
    Write-Log "Goal: $Goal"
    Write-Log "Model: $Model"
    Write-Log "Max Agents: $MaxAgents"
    Write-Log "Output Directory: $OutputDir"
    Write-Log "Dry Run: $DryRun"
    Write-Log "Work Directory: $WorkDir"
    
    # Validate repository path
    if (-not (Test-Path -LiteralPath $RepoRoot)) {
        throw "Repository path does not exist: $RepoRoot"
    }
    
    # Create output directory
    # If OutputDir is absolute, use it directly; otherwise join with RepoRoot
    if ([System.IO.Path]::IsPathRooted($OutputDir)) {
        $resolvedOutputDir = $OutputDir
    }
    else {
        $resolvedOutputDir = Join-Path $RepoRoot $OutputDir
    }
    [System.IO.Directory]::CreateDirectory($resolvedOutputDir) | Out-Null
    Write-Log "Output directory created: $resolvedOutputDir"

    # Create work directory
    # If WorkDir is absolute, use it directly; otherwise join with RepoRoot
    if ([System.IO.Path]::IsPathRooted($WorkDir)) {
        $resolvedWorkDir = $WorkDir
    }
    else {
        $resolvedWorkDir = Join-Path $RepoRoot $WorkDir
    }
    [System.IO.Directory]::CreateDirectory($resolvedWorkDir) | Out-Null
    Write-Log "Work directory created: $resolvedWorkDir"
    
    # Step 1: Analyze repository
    Write-Log "Step 1: Analyzing repository structure"
    $repoStructure = Get-RepositoryStructure -Path $RepoRoot
    
    # Step 2: Select agents
    Write-Log "Step 2: Selecting agents"
    $selectedAgents = Select-Agents -RepoStructure $repoStructure -MaxAgents $MaxAgents

    # Step 3: Execute Swarms engine (Python)
    Write-Log "Step 3: Executing Swarms engine" -Level Info
    Write-AgentStatusLine -OutputDir $resolvedOutputDir -Agent "SwarmsEngine" -Status "working" -Extra @{ model = $Model }

    Push-Location -LiteralPath $resolvedWorkDir
    try {
        if ($DryRun) {
            $swarmPayload = [pscustomobject]@{
                ok = $true
                status = "completed"
                swarmType = "dryrun"
                result = @{ message = "DryRun: Swarms engine not executed." }
            }
        } else {
            $agentNames = @($selectedAgents | ForEach-Object { $_.Type })
            $swarmPayload = Invoke-SwarmsRun -ToolboxRoot (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\\..\\..')).Path `
                -RepoRoot $RepoRoot `
                -Goal $Goal `
                -Model $Model `
                -OutputDir $resolvedOutputDir `
                -Agents $agentNames
        }
    }
    finally {
        Pop-Location
    }

    Write-AgentStatusLine -OutputDir $resolvedOutputDir -Agent "SwarmsEngine" -Status "complete"

    # Step 4: Export summary + synthesis compatible with bridge consumers
    Write-Log "Step 4: Writing outputs" -Level Info
    $swarmResultPath = Join-Path $resolvedOutputDir "swarm-result.json"
    $swarmPayload | ConvertTo-Json -Depth 50 | Set-Content -LiteralPath $swarmResultPath -Encoding UTF8

    $finalPath = Join-Path $resolvedOutputDir "Final_Synthesis.txt"
    $finalText = $swarmPayload.result
    if ($finalText -isnot [string]) {
        $finalText = ($swarmPayload.result | ConvertTo-Json -Depth 50)
    }
    $finalText | Out-File -LiteralPath $finalPath -Encoding UTF8

    # Generate a standardized HTML page for the final synthesis (best-effort)
    try {
        $toolboxRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\\..\\..')).Path
        $converter = Join-Path $toolboxRoot "scripts\\Convert-FinalSynthesisToHtml.ps1"
        if (Test-Path -LiteralPath $converter) {
            $htmlPath = Join-Path $resolvedOutputDir "Final_Synthesis.html"
            $runId = [System.IO.Path]::GetFileName($resolvedOutputDir)
            & $converter -TextPath $finalPath -OutputPath $htmlPath -Title "Final Synthesis" -RunId $runId -Model $Model -RepoRoot $RepoRoot -Goal $Goal | Out-Null
            Write-Log "Wrote HTML synthesis: $htmlPath" -Level Info
        }
        else {
            Write-Log "Synthesis HTML converter not found: $converter" -Level Warning
        }
    }
    catch {
        Write-Log "Failed to generate HTML synthesis: $_" -Level Warning
    }

    $summary = @{
        Timestamp = (Get-Date -Format "o")
        Model = $Model
        RepoRoot = $RepoRoot
        Goal = $Goal
        AgentsUsed = @($selectedAgents | ForEach-Object { $_.Type })
        Engine = "swarms"
        Swarm = $swarmPayload.swarmType
        Status = $swarmPayload.status
    }
    ($summary | ConvertTo-Json -Depth 10) | Set-Content -LiteralPath (Join-Path $resolvedOutputDir "orchestration-summary.json") -Encoding UTF8

    Write-Log "=== Orchestration Completed Successfully ===" -Level Success
    Write-Log "Total agents executed: $($selectedAgents.Count)"
    Write-Log "Output location: $resolvedOutputDir"
    
    exit 0
}
catch {
    Write-Log "Orchestration failed: $_" -Level Error
    Write-Log $_.ScriptStackTrace -Level Error
    exit 1
}
