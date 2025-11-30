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
    param([string]$Agent, [string]$Status)
    $statusPath = Join-Path $OutDir "agent_status.json"
    $timestamp = Get-Date -Format "o"

    $statusObj = [PSCustomObject]@{
        agent     = $Agent
        status    = $Status
        timestamp = $timestamp
    }

    # Append to status log as JSON lines
    $statusObj | ConvertTo-Json -Compress | Add-Content -Path $statusPath
}

# --- SINGLE CALL WRAPPER ----------------------------------------------------
function Invoke-OpenAIRequest {
    param([array]$Messages)

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
        $Choice = $Response.choices[0].message
        if (-not $Choice -or -not $Choice.content) { throw "Empty or invalid OpenAI response." }
        Write-Log -Agent "API" -Content "✅ OpenAI call succeeded. Tokens used: $($Response.usage.total_tokens)"
        return $Choice.content
    }
    catch {
        Write-Log -Agent "API" -Content "❌ OpenAI call failed: $_"
        return $null
    }
}

# --- MAIN ORCHESTRATION LOOP -----------------------------------------------
try {
    $Context = "Goal: $Goal"

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
                # Write status: error
                $statusObj = [PSCustomObject]@{
                    agent     = $Agent.name
                    status    = "error"
                    timestamp = (Get-Date -Format "o")
                }
                $statusObj | ConvertTo-Json -Compress | Add-Content -Path $statusPath

                [PSCustomObject]@{
                    Agent  = $Agent.name
                    Output = $null
                    Tokens = 0
                    Ok     = $false
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

                $Output = Invoke-OpenAIRequest -Messages $Messages
                if (-not $Output) {
                    Write-AgentStatus -Agent $C.name -Status "error"
                    continue
                }

                Write-AgentStatus -Agent $C.name -Status "complete"
                Write-Log -Agent $C.name -Content $Output
                $Context += "`n`n[$($C.name) Output]:`n$Output"

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
