### BEGIN FILE: POF.ps1
<#
.SYNOPSIS
  Prompt Orchestration Framework (POF) v4.1 Hybrid Parallel
.DESCRIPTION
  Multi-agent GPT orchestrator that executes independent agents in parallel
  and reserves the Commissioner for sequential evaluation.
  Adds deterministic convergence, per-agent persistence, and guaranteed synthesis write.
  Compatible with PowerShell 7+.
#>

param(
    [string]$Goal = "Optimize orchestration performance by implementing advanced analytics and enhancing user experience through actionable insights.",
    [string]$Model = "gpt-5",
    [string]$Instruction = "",
    [int]$MaxIterations = 3,
    [string]$AgentConfigPath = "$PSScriptRoot\..\prompts\Agents.json",
    [switch]$VerboseMode,
    # Paths for Milestone Dashboard integration (optional)
    [string]$LogPath = "$PSScriptRoot\..\MilestoneDashboard\public\data\Milestone_Log.json",
    [string]$TrendPath = "$PSScriptRoot\..\MilestoneDashboard\public\data\Metrics_Trend.json",
    # Optional overrides for external orchestrators
    [string]$RunId = $(Get-Date -Format 'yyyyMMdd-HHmmss'),
    [string]$OutputRoot = ""
)

Import-Module "$PSScriptRoot\MilestoneController.psm1" -Force


# --- CONFIGURATION ----------------------------------------------------------
$Config = @{
    OpenAIEndpoint     = "https://api.openai.com/v1/chat/completions"
    ApiKey             = $env:OPENAI_API_KEY
    BaseExportPath     = $env:OpenAI_Refiner_Dir
    DefaultModel       = "gpt-4o-mini"
    DefaultMaxTokens   = 4096
    DefaultTemperature = 0.6
    RetryCount         = 3
    RetryDelaySeconds  = 5
}
if (-not $Config.ApiKey) { throw "OPENAI_API_KEY not set." }

### BEGIN: Fix AgentConfigPath
# Attempt multiple known locations in case folder structure changed
$PossibleAgentPaths = @(
    (Join-Path $PSScriptRoot "prompts\agents.json"),
    (Join-Path $PSScriptRoot "scripts\prompts\agents.json"),
    (Join-Path (Split-Path $PSScriptRoot -Parent) "prompts\agents.json")
)

$AgentConfigPath = $PossibleAgentPaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $AgentConfigPath) {
    throw "❌ Unable to locate Agents.json in expected paths: $($PossibleAgentPaths -join ', ')"
}
else {
    Write-Host "✅ Loaded agent configuration from $AgentConfigPath" -ForegroundColor Green
}
### END: Fix AgentConfigPath

$Agents = (Get-Content -Raw $AgentConfigPath | ConvertFrom-Json).Agents
$OutDir = if (-not [string]::IsNullOrWhiteSpace($OutputRoot)) {
    Join-Path $OutputRoot $RunId
} else {
    "$PSScriptRoot\..\runs\$RunId"
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# --- LOGGING ---------------------------------------------------------------
function Write-Log {
    param([string]$Agent, [string]$Content)
    $path = Join-Path $OutDir "$Agent.txt"
    Add-Content -Path $path -Value $Content
    if ($VerboseMode) {
        Write-Host "[$Agent] $($Content.Substring(0,[Math]::Min(120,$Content.Length)))..." -ForegroundColor Cyan
    }
}

function Write-AgentStatus {
    param([string]$Agent, [string]$Status, [hashtable]$ExtraData = @{})
    $statusPath = Join-Path $OutDir "agent_status.json"
    $timestamp = Get-Date -Format "o"

    # Build complete hashtable first for better performance
    $statusHash = @{
        agent     = $Agent
        status    = $Status
        timestamp = $timestamp
    }
    
    # Add any extra data fields to the hashtable
    foreach ($key in $ExtraData.Keys) {
        $statusHash[$key] = $ExtraData[$key]
    }
    
    # Convert to PSCustomObject once
    $statusObj = [PSCustomObject]$statusHash

    # Append to status log as JSON lines with error handling
    try {
        $jsonLine = $statusObj | ConvertTo-Json -Compress -ErrorAction Stop
        
        # Validate the JSON is not empty
        if ([string]::IsNullOrWhiteSpace($jsonLine)) {
            throw "Generated JSON line is empty or whitespace"
        }
        
        Add-Content -Path $statusPath -Value $jsonLine -ErrorAction Stop
    }
    catch {
        # If JSON writing fails, log to a separate error file
        $errorLogPath = Join-Path $OutDir "status_write_errors.log"
        $errorMsg = "Failed to write agent status for '$Agent' (status: $Status): $_"
        Add-Content -Path $errorLogPath -Value "$(Get-Date -Format 'o'): $errorMsg"
        Write-Host "⚠️ $errorMsg" -ForegroundColor Yellow
    }
}

# --- SWARMS ENGINE INTEGRATION --------------------------------------------
function Get-SwarmRequestsFromText {
    param([Parameter(Mandatory = $true)][string]$Text)

    $requests = @()
    $matches = [regex]::Matches($Text, '\[SWARM_REQUEST\]\s*(\{.*?\})\s*\[/SWARM_REQUEST\]', 'Singleline')
    foreach ($m in $matches) {
        $jsonText = $m.Groups[1].Value
        try {
            $obj = $jsonText | ConvertFrom-Json -ErrorAction Stop
            $requests += $obj
        } catch {
            # Ignore invalid tool requests; commissioner still provides a score
        }
    }
    return ,$requests
}

function Invoke-SwarmsEngine {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Goal,
        [string[]]$Agents = @(),
        [string]$Model = "",
        [string]$SwarmType = "",
        [int]$MaxLoops = 1,
        [string]$RepoRoot = "",
        [string]$OutputDir = ""
    )

    $toolboxRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\\..')).Path
    $runner = Join-Path $toolboxRoot 'scripts\\swarms\\toolbox_runner.py'
    if (-not (Test-Path $runner)) {
        throw "Swarms runner not found at: $runner"
    }

    $python = $env:SWARMS_PYTHON_BIN
    if ([string]::IsNullOrWhiteSpace($python)) { $python = $env:PYTHON_BIN }
    if ([string]::IsNullOrWhiteSpace($python)) { $python = "python" }

    $args = @("-u", $runner, "--goal", $Goal)
    if ($Agents -and $Agents.Count -gt 0) {
        $args += @("--agents", ($Agents -join ","))
    }
    if (-not [string]::IsNullOrWhiteSpace($Model)) {
        $args += @("--model", $Model)
    }
    if (-not [string]::IsNullOrWhiteSpace($SwarmType)) {
        $args += @("--swarm-type", $SwarmType)
    }
    if ($MaxLoops -gt 0) {
        $args += @("--max-loops", "$MaxLoops")
    }
    if (-not [string]::IsNullOrWhiteSpace($RepoRoot)) {
        $args += @("--repo-root", $RepoRoot)
    } else {
        $args += @("--repo-root", $toolboxRoot)
    }
    if (-not [string]::IsNullOrWhiteSpace($OutputDir)) {
        $args += @("--output-dir", $OutputDir)
    }

    $stdout = & $python @args 2>&1 | Out-String
    $lastJson = ($stdout -split "(`r`n|`n|`r)" | Where-Object { $_.Trim().StartsWith("{") -and $_.Trim().EndsWith("}") } | Select-Object -Last 1)
    if (-not $lastJson) {
        throw "Swarms runner returned no JSON payload. Output: $stdout"
    }
    $result = $lastJson | ConvertFrom-Json -ErrorAction Stop

    if (-not [string]::IsNullOrWhiteSpace($OutputDir)) {
        $swarmsDir = Join-Path $OutputDir "swarms"
        New-Item -ItemType Directory -Force -Path $swarmsDir | Out-Null
        $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $outPath = Join-Path $swarmsDir "swarms-run-$stamp.json"
        $result | ConvertTo-Json -Depth 50 | Out-File -FilePath $outPath -Encoding UTF8
    }

    return $result
}

# --- SINGLE CALL WRAPPER ----------------------------------------------------
function Invoke-OpenAIRequest {
    param([array]$Messages, [string]$AgentName = "API")

    $DynamicTokens = [Math]::Min(8192,
        [Math]::Max($Config.DefaultMaxTokens, ($Messages | ConvertTo-Json -Depth 10).Length / 4))

    $Headers = @{
        "Authorization" = "Bearer $($Config.ApiKey)"
        "Content-Type"  = "application/json"
    }

    $Body = @{
        model       = $Config.DefaultModel
        messages    = $Messages
        max_tokens  = $DynamicTokens
        temperature = $Config.DefaultTemperature
    } | ConvertTo-Json -Depth 10 -Compress

    try {
        $Response = Invoke-RestMethod -Uri $Config.OpenAIEndpoint -Method Post -Headers $Headers -Body $Body -ErrorAction Stop
        
        # Log raw response for debugging
        $rawResponsePath = Join-Path $OutDir "${AgentName}_raw_response.json"
        $Response | ConvertTo-Json -Depth 10 | Out-File -FilePath $rawResponsePath -Encoding UTF8
        
        # Validate response structure
        if (-not $Response.choices -or $Response.choices.Count -eq 0) {
            throw "OpenAI API returned no choices in response"
        }
        
        $Choice = $Response.choices[0].message
        if (-not $Choice -or -not $Choice.content) {
            throw "Empty or invalid OpenAI response (missing message.content)"
        }
        
        Write-Log -Agent $AgentName -Content "✅ OpenAI call succeeded. Tokens used: $($Response.usage.total_tokens)"
        return $Choice.content
    }
    catch {
        $errorMsg = $_.Exception.Message
        $errorDetails = if ($_.ErrorDetails) { $_.ErrorDetails.Message } else { "" }
        
        # Enhanced error logging
        $errorLogPath = Join-Path $OutDir "${AgentName}_api_error.log"
        $errorReport = @"
OpenAI API Error for agent: $AgentName
Timestamp: $(Get-Date -Format "o")
Error: $errorMsg
Error Details: $errorDetails
Stack Trace: $($_.ScriptStackTrace)
"@
        $errorReport | Out-File -FilePath $errorLogPath -Encoding UTF8
        
        Write-Log -Agent $AgentName -Content "❌ OpenAI call failed: $errorMsg"
        return $null
    }
}

# --- MAIN ORCHESTRATION LOOP -----------------------------------------------
try {
    $Context = "Goal: $Goal"
    $Script:SwarmsInvocations = 0

    for ($i = 1; $i -le $MaxIterations; $i++) {
        Write-Host "`nIteration $i/$MaxIterations" -ForegroundColor Yellow

        # --- Split Agents: Commissioner vs Others --------------------------
        $IndependentAgents = $Agents | Where-Object { $_.name -ne "Commissioner" }
        $Commissioner = $Agents | Where-Object { $_.name -eq "Commissioner" }

        # --- Prepare work items --------------------------------------------
        $WorkItems = foreach ($A in $IndependentAgents) {
            [PSCustomObject]@{
                Agent   = $A
                Context = $Context
                Config  = $Config
                OutDir  = $OutDir
                Instruction = $Instruction
            }
        }

        # --- Run independent agents in parallel ----------------------------
        $Results = $WorkItems | ForEach-Object -Parallel {
            $Work = $_
            $Agent = $Work.Agent
            $Context = $Work.Context
            $Config = $Work.Config
            $OutDir = $Work.OutDir
            $Instruction = $Work.Instruction

            # Write status: working
            $statusPath = Join-Path $OutDir "agent_status.json"
            $statusObj = [PSCustomObject]@{
                agent     = $Agent.name
                status    = "working"
                timestamp = (Get-Date -Format "o")
            }
            $statusObj | ConvertTo-Json -Compress | Add-Content -Path $statusPath

            $systemPrompt = if ([string]::IsNullOrWhiteSpace($Instruction)) {
                $Agent.prompt
            } else {
                "$Instruction`n`n$($Agent.prompt)"
            }

            $Messages = @(
                @{ role = "system"; content = $systemPrompt },
                @{ role = "user"; content = $Context }
            )

            $Headers = @{
                "Authorization" = "Bearer $($Config.ApiKey)"
                "Content-Type"  = "application/json"
            }

            $DynamicTokens = [Math]::Min(
                8192,
                [Math]::Max($Config.DefaultMaxTokens, ($Messages | ConvertTo-Json -Depth 10).Length / 4)
            )

            $Body = @{
                model       = $Config.DefaultModel
                messages    = $Messages
                max_tokens  = $DynamicTokens
                temperature = $Config.DefaultTemperature
            } | ConvertTo-Json -Depth 10 -Compress

            try {
                $Response = Invoke-RestMethod -Uri $Config.OpenAIEndpoint -Method Post -Headers $Headers -Body $Body -ErrorAction Stop

                # Log raw response for debugging JSON parsing issues
                $rawResponsePath = Join-Path $OutDir "$($Agent.name)_raw_response.json"
                $Response | ConvertTo-Json -Depth 10 | Out-File -FilePath $rawResponsePath -Encoding UTF8

                # Validate response structure before accessing
                if (-not $Response.choices -or $Response.choices.Count -eq 0) {
                    throw "OpenAI API returned no choices in response"
                }
                if (-not $Response.choices[0].message -or -not $Response.choices[0].message.content) {
                    throw "OpenAI API response missing message content"
                }

                # Write status: complete
                $statusObj = [PSCustomObject]@{
                    agent     = $Agent.name
                    status    = "complete"
                    timestamp = (Get-Date -Format "o")
                }
                $statusObj | ConvertTo-Json -Compress | Add-Content -Path $statusPath

                [PSCustomObject]@{
                    Agent  = $Agent.name
                    Output = $Response.choices[0].message.content
                    Tokens = $Response.usage.total_tokens
                    Ok     = $true
                }
            }
            catch {
                # Enhanced error logging with details
                $errorMsg = $_.Exception.Message
                $errorDetails = if ($_.ErrorDetails) { $_.ErrorDetails.Message } else { "" }
                
                # Write status: error with details (using centralized function for consistency)
                $statusPath = Join-Path $OutDir "agent_status.json"
                $statusObj = [PSCustomObject]@{
                    agent       = $Agent.name
                    status      = "error"
                    timestamp   = (Get-Date -Format "o")
                    error       = $errorMsg
                    error_detail = $errorDetails
                }
                try {
                    $statusObj | ConvertTo-Json -Compress | Add-Content -Path $statusPath
                }
                catch {
                    # Fallback if status writing fails
                    $errorLogPath = Join-Path $OutDir "status_write_errors.log"
                    Add-Content -Path $errorLogPath -Value "$(Get-Date -Format 'o'): Failed to write error status: $_"
                }

                # Log detailed error to separate file
                $errorLogPath = Join-Path $OutDir "$($Agent.name)_error.log"
                $errorReport = @"
Error in agent: $($Agent.name)
Timestamp: $(Get-Date -Format "o")
Error: $errorMsg
Error Details: $errorDetails
Stack Trace: $($_.ScriptStackTrace)
"@
                $errorReport | Out-File -FilePath $errorLogPath -Encoding UTF8

                [PSCustomObject]@{
                    Agent  = $Agent.name
                    Output = $null
                    Tokens = 0
                    Ok     = $false
                    Error  = $errorMsg
                }
            }

        } -ThrottleLimit 4   # Adjust for API concurrency limits

        # --- Collect and merge results (serial, in parent) -----------------
        foreach ($r in $Results) {
            if (-not $r.Ok -or [string]::IsNullOrWhiteSpace($r.Output)) {
                Write-Host "⚠️ No response from $($r.Agent)" -ForegroundColor Red
                continue
            }
            Write-Log -Agent $r.Agent -Content $r.Output
            $Context += "`n`n[$($r.Agent) Output]:`n$($r.Output)"
        }

        # --- Run Commissioner sequentially --------------------------------
        if ($Commissioner) {
            foreach ($C in $Commissioner) {
                Write-AgentStatus -Agent $C.name -Status "working"

                $systemPrompt = if ([string]::IsNullOrWhiteSpace($Instruction)) {
                    $C.prompt
                } else {
                    "$Instruction`n`n$($C.prompt)"
                }

                $Messages = @(
                    @{ role = "system"; content = $systemPrompt },
                    @{ role = "user"; content = $Context }
                )

                $Output = Invoke-OpenAIRequest -Messages $Messages -AgentName $C.name
                if (-not $Output) {
                    Write-AgentStatus -Agent $C.name -Status "error"
                    continue
                }

                Write-AgentStatus -Agent $C.name -Status "complete"
                Write-Log -Agent $C.name -Content $Output
                $Context += "`n`n[$($C.name) Output]:`n$Output"

                # --- Optional: Commissioner-triggered Swarms run ----------------
                $swarmRequests = Get-SwarmRequestsFromText -Text $Output
                if ($swarmRequests.Count -gt 0 -and $Script:SwarmsInvocations -lt 1) {
                    $Script:SwarmsInvocations++
                    $req = $swarmRequests | Select-Object -First 1
                    try {
                        $swarmGoal = if ($req.goal) { [string]$req.goal } else { "" }
                        if (-not $swarmGoal) { throw "SWARM_REQUEST missing 'goal'." }
                        $swarmAgents = @()
                        if ($req.agents) {
                            if ($req.agents -is [System.Collections.IEnumerable] -and -not ($req.agents -is [string])) {
                                $swarmAgents = @($req.agents | ForEach-Object { [string]$_ })
                            } else {
                                $swarmAgents = @([string]$req.agents)
                            }
                        }
                        $swarmModel = if ($req.model) { [string]$req.model } else { $Model }
                        $swarmType = if ($req.swarmType) { [string]$req.swarmType } else { "" }
                        $swarmLoops = 1
                        if ($req.maxLoops) { try { $swarmLoops = [int]$req.maxLoops } catch { $swarmLoops = 1 } }

                        Write-Host "🧩 Commissioner requested Swarms run..." -ForegroundColor Cyan
                        Write-AgentStatus -Agent "SwarmsEngine" -Status "working" -ExtraData @{ requested_by = $C.name }
                        $swarmResult = Invoke-SwarmsEngine `
                            -Goal $swarmGoal `
                            -Agents $swarmAgents `
                            -Model $swarmModel `
                            -SwarmType $swarmType `
                            -MaxLoops $swarmLoops `
                            -OutputDir $OutDir
                        Write-AgentStatus -Agent "SwarmsEngine" -Status "complete"

                        $swarmSummary = $swarmResult | ConvertTo-Json -Depth 30
                        $Context += "`n`n[Swarms Output]:`n$swarmSummary"

                        # Re-run Commissioner once with the new Swarms context
                        Write-Host "🔁 Re-running Commissioner with Swarms output..." -ForegroundColor Yellow
                        Write-AgentStatus -Agent $C.name -Status "working" -ExtraData @{ rerun = $true }
                        $Messages = @(
                            @{ role = "system"; content = $systemPrompt },
                            @{ role = "user"; content = $Context }
                        )
                        $Output2 = Invoke-OpenAIRequest -Messages $Messages -AgentName $C.name
                        if ($Output2) {
                            Write-AgentStatus -Agent $C.name -Status "complete" -ExtraData @{ rerun = $true }
                            Write-Log -Agent $C.name -Content "`n--- Commissioner Re-Run (with Swarms) ---`n$Output2"
                            $Context += "`n`n[$($C.name) Output (Re-Run)]:`n$Output2"
                            $Output = $Output2
                        } else {
                            Write-AgentStatus -Agent $C.name -Status "error" -ExtraData @{ rerun = $true }
                        }
                    } catch {
                        Write-Host "⚠️ Swarms run failed: $_" -ForegroundColor Yellow
                        Write-AgentStatus -Agent "SwarmsEngine" -Status "error" -ExtraData @{ error = "$_" }
                    }
                }

                # --- Process Agent Improvement Suggestions --------------------
                if ($Output -match '\[AGENT_IMPROVEMENT:\s*([^\]]+)\]') {
                    $improvements = [regex]::Matches($Output, '\[AGENT_IMPROVEMENT:\s*([^\]]+)\]\s*([^\[]+)\[/AGENT_IMPROVEMENT\]')
                    if ($improvements.Count -gt 0) {
                        Write-Host "📝 Commissioner suggested agent improvements:" -ForegroundColor Cyan
                        $improvementsPath = Join-Path $OutDir "agent_improvements.json"
                        $improvementsList = @()

                        foreach ($match in $improvements) {
                            $agentName = $match.Groups[1].Value.Trim()
                            $suggestion = $match.Groups[2].Value.Trim()

                            Write-Host "  → $agentName : $($suggestion.Substring(0,[Math]::Min(80,$suggestion.Length)))..." -ForegroundColor Yellow

                            $improvementsList += [PSCustomObject]@{
                                agent      = $agentName
                                suggestion = $suggestion
                                timestamp  = (Get-Date -Format "o")
                            }
                        }

                        $improvementsList | ConvertTo-Json -Depth 3 | Out-File $improvementsPath -Encoding UTF8
                    }
                }

                # --- Milestone Check ---------------------------------------
                if ($Output -match "Value Score[:\s]*(\d+)") {
                    $Score = [int]$matches[1]
                    if ($Score -ge 7) {
                        Write-Host "✅ Commissioner approves (Value Score=$Score) — Milestone achieved." -ForegroundColor Green
                        $Context += "`n[Milestone_$i]: Approved (Score=$Score)."
                        $Script:ShouldExit = $true
                        break
                    }
                    else {
                        Write-Host "🔁 Value Score=$Score — triggering refinement..." -ForegroundColor Yellow
                        $RefineGoal = "Refine the previous design to improve Value Score from $Score to ≥7. Address Commissioner feedback specifically."
                        $Context += "`n[Refinement Triggered]: $RefineGoal"
                        & $PSCommandPath -Goal $RefineGoal -Model $Model -Instruction $Instruction -MaxIterations $MaxIterations -AgentConfigPath $AgentConfigPath
                        $Script:ShouldExit = $true
                        return
                    }
                }
            }
        }

        # --- Convergence Detection ----------------------------------------
        if ($Context -match "FINAL|CONVERGED|COMPLETE|SYNTHESIZED") {
            Write-Host "✅ Convergence detected. Ending early." -ForegroundColor Green
            break
        }

        if ($Script:ShouldExit) {
            Write-Host "🛑 Exiting orchestration early by Commissioner decision." -ForegroundColor Cyan
            break
        }
    }

    Write-Host "`n🧠 Iteration loop complete. Preparing final synthesis..." -ForegroundColor DarkCyan
}
finally {
    $FinalPath = Join-Path $OutDir "Final_Synthesis.txt"
    $Context | Out-File $FinalPath -Encoding UTF8
    Write-Host "`n🎯 Final synthesis saved to $FinalPath"
}
### END FILE: POF.ps1
