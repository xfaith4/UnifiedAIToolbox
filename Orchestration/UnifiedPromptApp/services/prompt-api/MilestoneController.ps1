<#
.SYNOPSIS
    AI Milestone Controller for goal-driven orchestration.

.DESCRIPTION
    MilestoneController.ps1 is the main orchestrator script for the AI-Orchestration module.
    It breaks down high-level goals into milestones and coordinates agent execution.

.PARAMETER Goal
    Direct goal text to achieve. Takes precedence over GoalFile if both are provided.

.PARAMETER GoalFile
    Path to a text file containing the goal to achieve.

.PARAMETER Model
    The AI model to use for orchestration (default: gpt-4o-mini).

.PARAMETER OutputDir
    Directory for orchestration outputs (default: current directory).

.PARAMETER Verbose
    Enable verbose output for debugging.

.EXAMPLE
    .\MilestoneController.ps1 -Goal "Build a monitoring dashboard" -Model gpt-4o-mini

.EXAMPLE
    .\MilestoneController.ps1 -GoalFile .\goal.txt -Model gpt-4o-mini

.NOTES
    Part of the UnifiedAIToolbox AI-Orchestration module.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$Goal,

    [Parameter(Mandatory = $false)]
    [string]$GoalFile,

    [Parameter(Mandatory = $false)]
    [string]$Model = "gpt-4o-mini",

    [Parameter(Mandatory = $false)]
    [string]$OutputDir = ".",

    [Parameter(Mandatory = $false)]
    [switch]$DryRun
)

# Script configuration
$ErrorActionPreference = "Stop"
$script:StartTime = Get-Date

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logLine = "[$timestamp] [$Level] $Message"
    Write-Host $logLine
    if ($script:LogFile) {
        Add-Content -Path $script:LogFile -Value $logLine
    }
}

function Initialize-Orchestration {
    param([string]$GoalText)
    
    Write-Log "Initializing AI Orchestration"
    Write-Log "Goal: $GoalText"
    Write-Log "Model: $Model"
    
    # Create output directory if needed
    if (-not (Test-Path $OutputDir)) {
        New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    }
    
    # Initialize log file
    $script:LogFile = Join-Path $OutputDir "orchestration.log"
    Write-Log "Log file: $script:LogFile"
    
    return @{
        Goal = $GoalText
        Model = $Model
        StartTime = $script:StartTime
        Status = "initialized"
        Milestones = @()
    }
}

function Split-GoalIntoMilestones {
    param([string]$Goal)
    
    Write-Log "Analyzing goal and generating milestones..."
    
    # Simple keyword-based milestone generation
    $milestones = @()
    
    $goalLower = $Goal.ToLower()
    
    if ($goalLower -match "research|analyze|investigate") {
        $milestones += @{
            Name = "Research Phase"
            Description = "Gather and analyze relevant information"
            Agent = "Researcher"
            Status = "pending"
        }
    }
    
    if ($goalLower -match "implement|build|create|code|develop") {
        $milestones += @{
            Name = "Implementation Phase"
            Description = "Build the solution based on research findings"
            Agent = "Engineer"
            Status = "pending"
        }
    }
    
    if ($goalLower -match "test|validate|verify|review") {
        $milestones += @{
            Name = "Validation Phase"
            Description = "Test and validate the implementation"
            Agent = "Critic"
            Status = "pending"
        }
    }
    
    if ($goalLower -match "document|report|summarize") {
        $milestones += @{
            Name = "Documentation Phase"
            Description = "Create documentation and reports"
            Agent = "Synthesizer"
            Status = "pending"
        }
    }
    
    # Default milestone if no specific patterns matched
    if ($milestones.Count -eq 0) {
        $milestones += @{
            Name = "Execution Phase"
            Description = "Execute the goal"
            Agent = "Commissioner"
            Status = "pending"
        }
    }
    
    Write-Log "Generated $($milestones.Count) milestone(s)"
    return $milestones
}

function Invoke-OrchestrationLlm {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Model,

        [Parameter(Mandatory = $true)]
        [string]$SystemPrompt,

        [Parameter(Mandatory = $true)]
        [string]$UserPrompt
    )

    $apiKey = $env:OPENAI_API_KEY
    if (-not $apiKey) {
        throw "OPENAI_API_KEY environment variable is not set. Cannot call OpenAI."
    }

    # Build the chat payload
    $body = @{
        model    = $Model
        messages = @(
            @{ role = "system"; content = $SystemPrompt },
            @{ role = "user";   content = $UserPrompt }
        )
        temperature = 0.2
    } | ConvertTo-Json -Depth 6

    $headers = @{
        "Authorization" = "Bearer $apiKey"
        "Content-Type"  = "application/json"
    }

    # Fire the request
    $response = Invoke-RestMethod -Uri "https://api.openai.com/v1/chat/completions" `
                                  -Method Post `
                                  -Headers $headers `
                                  -Body $body

    # Validate response structure
    if (-not $response.choices -or $response.choices.Count -eq 0) {
        throw "OpenAI API returned no choices in response"
    }
    
    if (-not $response.choices[0].message -or -not $response.choices[0].message.content) {
        throw "OpenAI API response missing message content"
    }

    $assistantContent = $response.choices[0].message.content

    return @{
        Output      = $assistantContent
        RawResponse = $response
    }
}

function Invoke-MilestoneAgent {
    param(
        [Parameter(Mandatory = $true)]
        [string]$GoalText,              # Original goal from the Orchestrator UI

        [Parameter(Mandatory = $true)]
        [pscustomobject]$Milestone,     # One milestone (Name, Description, Agent, Status)

        [Parameter(Mandatory = $true)]
        [string]$Model,

        [Parameter(Mandatory = $true)]
        [string]$OutputDir
    )

    # Map agent names to "roles" / system prompts
    $agentSystemPrompts = @{
        "Researcher" = @"
You are an expert technical researcher.
Clarify requirements, identify constraints, and surface relevant considerations.
Focus on router health monitoring and PowerShell-specific concerns.
"@

        "Engineer" = @"
You are a senior PowerShell and networking engineer.
Design and implement robust, production-ready PowerShell code.
Prefer clear functions, input validation, and inline comments.
"@

        "Critic" = @"
You are a rigorous test and review engineer.
Identify risks, edge cases, and missing coverage.
Propose concrete test scenarios and improvements.
"@

        "Synthesizer" = @"
You are a technical writer and synthesizer.
Produce clear documentation, examples, and step-by-step guidance.
Assume the reader is a capable engineer but new to this module.
"@

        "Commissioner" = @"
You are a project owner / commissioner.
Summarize progress, outcomes, and next steps.
Highlight trade-offs, open questions, and follow-up work.
"@
    }

    $agentName = if ($Milestone.Agent) { $Milestone.Agent } else { "Commissioner" }

    $systemPrompt = $agentSystemPrompts[$agentName]
    if (-not $systemPrompt) {
        # Fallback if we ever get an unknown agent type
        $systemPrompt = @"
You are a helpful senior engineer assisting with this project.
"@
    }

    # Build the user-side prompt that the model sees for this phase
    $userPrompt = @"
High-level goal:
$GoalText

You are working on the following milestone in a multi-agent orchestration:

Milestone name: $($Milestone.Name)
Milestone description: $($Milestone.Description)
Agent role: $agentName

Your task:
- Focus only on this milestone.
- Produce concrete, actionable output that advances this milestone.
- If relevant, include bullet lists, code blocks, and explicit next steps.

Respond in Markdown.
"@

    # Call the LLM
    $llmResult = Invoke-OrchestrationLlm `
        -Model        $Model `
        -SystemPrompt $systemPrompt `
        -UserPrompt   $userPrompt

    $content = $llmResult.Output

    # Persist the milestone output to disk for inspection
    $safeName = [Regex]::Replace($Milestone.Name, "[^\w\-]+", "_")
    $fileName = "milestone_{0}.md" -f $safeName
    $outputPath = Join-Path -Path $OutputDir -ChildPath $fileName

    $content | Out-File -FilePath $outputPath -Encoding UTF8

    return @{
        Output     = $content
        OutputPath = $outputPath
        Raw        = $llmResult.RawResponse
    }
}

function Execute-MilestonePipeline {
    param(
        [Parameter(Mandatory = $true)]
        [array]$Milestones,          # Milestone objects from Split-GoalIntoMilestones

        [Parameter(Mandatory = $true)]
        [string]$GoalText,          # The full goal text

        [Parameter(Mandatory = $true)]
        [string]$Model,             # e.g. gpt-4o-mini

        [Parameter(Mandatory = $true)]
        [string]$OutputDir          # Where to write per-milestone outputs
    )

    $results = @()                 # Collect structured results for JSON summary

    foreach ($milestone in $Milestones) {
        Write-Log "Executing milestone: $($milestone.Name)"
        Write-Log "  Agent: $($milestone.Agent)"
        Write-Log "  Description: $($milestone.Description)"

        # Call the AI agent for this milestone
        $agentResult = Invoke-MilestoneAgent `
            -GoalText   $GoalText `
            -Milestone  $milestone `
            -Model      $Model `
            -OutputDir  $OutputDir

        # Record the result in a simple object for the final orchestration_results JSON
        $excerpt = ""
        if ($agentResult.Output) {
            $excerpt = $agentResult.Output.Substring(0, [Math]::Min(280, $agentResult.Output.Length))
        }
        
        $results += [pscustomobject]@{
            Name        = $milestone.Name
            Agent       = $milestone.Agent
            Description = $milestone.Description
            Status      = "completed"
            OutputPath  = $agentResult.OutputPath
            Excerpt     = $excerpt
        }

        Write-Log "  Milestone completed: $($milestone.Name)"
    }

    return ,$results               # Return as array, even for a single milestone
}

function Invoke-Milestone {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$false)]
        [hashtable]$Milestone,
        
        [Parameter(Mandatory=$false)]
        [hashtable]$Context = @{}
    )
    
    try {
        # Handle null or empty milestone
        if ($null -eq $Milestone -or $Milestone.Count -eq 0) {
            Write-Log "Warning: Received empty milestone, creating default milestone" -Level "WARNING"
            $Milestone = @{
                Name = "Default Milestone"
                Description = "Automatically created milestone"
                Agent = "DefaultAgent"
            }
        }
        
        # Ensure required properties exist with default values
        $milestoneObj = [PSCustomObject]@{
            Name = $Milestone.Name ?? 'Unnamed Milestone'
            Description = $Milestone.Description ?? 'No description provided'
            Agent = $Milestone.Agent ?? 'DefaultAgent'
            Status = if ($Milestone.ContainsKey('Status')) { $Milestone.Status } else { 'pending' }
        }

        Write-Log "Executing milestone: $($milestoneObj.Name)"
        Write-Log "  Agent: $($milestoneObj.Agent)"
        Write-Log "  Description: $($milestoneObj.Description)"
        
        if ($DryRun) {
            Write-Log "  [DRY RUN] Skipping actual execution"
            $milestoneObj | Add-Member -NotePropertyName Output -NotePropertyValue "[Dry run - no output generated]" -Force
            $milestoneObj.Status = "skipped"
            return $milestoneObj
        }
        
        # Simulate milestone execution
        Start-Sleep -Milliseconds 500
        
        $milestoneObj.Status = "completed"
        $milestoneObj | Add-Member -NotePropertyName Output -NotePropertyValue "Milestone '$($milestoneObj.Name)' completed successfully by $($milestoneObj.Agent) agent." -Force
        $milestoneObj | Add-Member -NotePropertyName CompletedAt -NotePropertyValue (Get-Date -Format "o") -Force
        
        Write-Log "  Milestone completed: $($milestoneObj.Name)"
        return $milestoneObj
    }
    catch {
        $errorMsg = "Error in Invoke-Milestone: $_"
        Write-Log $errorMsg -Level "ERROR"
        
        # Return a proper error object with fallbacks for all properties
        $errorObj = [PSCustomObject]@{
            Name = if ($null -ne $Milestone -and $null -ne $Milestone.Name) { $Milestone.Name } else { "Unknown Milestone" }
            Description = if ($null -ne $Milestone -and $null -ne $Milestone.Description) { $Milestone.Description } else { "No description available" }
            Agent = if ($null -ne $Milestone -and $null -ne $Milestone.Agent) { $Milestone.Agent } else { "UnknownAgent" }
            Status = "failed"
            Error = $errorMsg
            Timestamp = Get-Date -Format "o"
        }
        
        return $errorObj
    }
}

function Complete-Orchestration {
    param([hashtable]$Context)
    
    foreach ($Milestone in $Context.Milestones) {
        if (-not $Milestone.PSObject.Properties.Match("Status")) {
            $Milestone | Add-Member -NotePropertyName Status -NotePropertyValue "unknown" -Force
        }
    }

    $endTime = Get-Date
    $duration = $endTime - $script:StartTime
    
    Write-Log "Orchestration completed in $($duration.TotalSeconds) seconds"
    
    # Generate summary
    $summary = @{
        Goal = $Context.Goal
        Model = $Context.Model
        StartTime = $Context.StartTime.ToString("o")
        EndTime = $endTime.ToString("o")
        DurationSeconds = [math]::Round($duration.TotalSeconds, 2)
        MilestonesCount = $Context.Milestones.Count
        CompletedMilestones = ($Context.Milestones | Where-Object { $_.Status -eq "completed" }).Count
        Status = "completed"
    }
    
    # Save summary
    $summaryPath = Join-Path $OutputDir "orchestration-summary.json"
    $summary | ConvertTo-Json -Depth 10 | Set-Content -Path $summaryPath
    Write-Log "Summary saved to: $summaryPath"
    
    return $summary
}

# Main execution
try {
    # Determine goal text: prioritize -Goal parameter, then -GoalFile, then default
    if (-not [string]::IsNullOrEmpty($Goal)) {
        $goalText = $Goal
        Write-Log "Using goal text from -Goal parameter"
    } elseif (-not [string]::IsNullOrEmpty($GoalFile)) {
        if (Test-Path $GoalFile) {
            $goalText = Get-Content -Path $GoalFile -Raw -ErrorAction Stop
            Write-Log "Using goal text from file: $GoalFile"
        } else {
            throw "Goal file not found: $GoalFile"
        }
    } else {
        $goalText = "Execute default orchestration workflow"
        Write-Log "No goal or goal file provided, using default goal" -Level "WARNING"
    }
    
    # Initialize orchestration
    $context = Initialize-Orchestration -GoalText $goalText
    
    # Generate milestones
    $milestones = Split-GoalIntoMilestones -Goal $goalText
    
    # Make sure we have at least one milestone
    if ($null -eq $milestones -or $milestones.Count -eq 0) {
        Write-Log "No milestones were generated. Creating a default milestone." -Level "WARNING"
        $milestones = @(
            @{
                Name = "Default Milestone"
                Description = "Automatically created milestone"
                Agent = "DefaultAgent"
                Status = "pending"
            }
        )
    }
    
    # Execute milestones with AI-backed pipeline (if DryRun, fallback to old behavior)
    if ($DryRun) {
        # Use old behavior for DryRun mode
        $context.Milestones = @()
        foreach ($milestone in $milestones) {
            if ($null -ne $milestone) {
                $result = Invoke-Milestone -Milestone $milestone -Context $context
                $context.Milestones += $result
            }
        }
    } else {
        # Use new AI-backed pipeline
        $pipelineResults = Execute-MilestonePipeline `
            -Milestones $milestones `
            -GoalText   $goalText `
            -Model      $Model `
            -OutputDir  $OutputDir
        
        $context.Milestones = $pipelineResults
    }
    
    # Complete the orchestration
    $context = Complete-Orchestration -Context $context
    
    # Output results
    $outputFile = Join-Path $OutputDir "orchestration_results_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"
    $context | ConvertTo-Json -Depth 10 | Out-File -FilePath $outputFile -Force
    
    Write-Log "Orchestration completed successfully. Results saved to: $outputFile"
    
    # Return success exit code
    exit 0
}
catch {
    Write-Log "Orchestration failed: $_" -Level "ERROR"
    Write-Host "Orchestration failed: $_" -ForegroundColor Red
    exit 1
}
