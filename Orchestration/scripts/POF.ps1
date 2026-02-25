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
    [string]$AgentConfigPath = "",
    [string]$CanonicalAgentLibraryPath = "$PSScriptRoot\..\agents\agent-library.json",
    [switch]$UseLegacyAgentConfig,
    [switch]$VerboseMode,
    # Paths for Milestone Dashboard integration (optional)
    [string]$LogPath = "$PSScriptRoot\..\MilestoneDashboard\public\data\Milestone_Log.json",
    [string]$TrendPath = "$PSScriptRoot\..\MilestoneDashboard\public\data\Metrics_Trend.json",
    # Optional overrides for external orchestrators
    [string]$RunId = $(Get-Date -Format 'yyyyMMdd-HHmmss'),
    [string]$OutputRoot = ""
)

Import-Module "$PSScriptRoot\MilestoneController.psm1" -Force
Import-Module "$PSScriptRoot\AgentRoster.psm1" -Force


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

$legacyConfigRequested = $UseLegacyAgentConfig -or (
    $PSBoundParameters.ContainsKey("AgentConfigPath") -and -not [string]::IsNullOrWhiteSpace($AgentConfigPath)
)

if ($legacyConfigRequested) {
    if ([string]::IsNullOrWhiteSpace($AgentConfigPath)) {
        $AgentConfigPath = Join-Path $PSScriptRoot "..\prompts\Agents.json"
    }
    if (-not (Test-Path -LiteralPath $AgentConfigPath)) {
        throw "Legacy agent config not found: $AgentConfigPath"
    }

    $rawConfig = Get-Content -Raw -LiteralPath $AgentConfigPath | ConvertFrom-Json -Depth 100
    if ($rawConfig -is [System.Collections.IEnumerable] -and -not ($rawConfig.PSObject.Properties.Name -contains "Agents")) {
        $Agents = @($rawConfig)
    }
    else {
        $Agents = @($rawConfig.Agents)
    }

    Write-Host "✅ Loaded legacy agent config from $AgentConfigPath" -ForegroundColor Yellow
}
else {
    $Agents = @(Get-AgentRoster -Mode thin -CanonicalPath $CanonicalAgentLibraryPath)
    Write-Host "✅ Loaded agent roster from canonical registry: $CanonicalAgentLibraryPath" -ForegroundColor Green
}

if (-not $Agents -or $Agents.Count -eq 0) {
    throw "No agents were loaded for orchestration."
}

$Script:FullAgentRegistry = @{}
if (Test-Path -LiteralPath $CanonicalAgentLibraryPath) {
    foreach ($agentDef in @(Get-AgentRoster -Mode full -CanonicalPath $CanonicalAgentLibraryPath)) {
        if ($agentDef.name) {
            $Script:FullAgentRegistry[[string]$agentDef.name] = $agentDef
        }
    }
}
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

function Get-AgentContractDefinition {
    param([Parameter(Mandatory = $true)][string]$AgentName)

    if (-not $Script:FullAgentRegistry) { return $null }
    if (-not $Script:FullAgentRegistry.ContainsKey($AgentName)) { return $null }

    $agentDef = $Script:FullAgentRegistry[$AgentName]
    if (-not $agentDef) { return $null }
    if (-not $agentDef.io_contract) { return $null }
    if (-not $agentDef.io_contract.output_schema) { return $null }
    return $agentDef
}

function Assert-AgentContractOutput {
    param(
        [Parameter(Mandatory = $true)][string]$AgentName,
        [Parameter(Mandatory = $true)][string]$RawOutput
    )

    $agentDef = Get-AgentContractDefinition -AgentName $AgentName
    if (-not $agentDef) {
        return @{ ok = $true; error = $null; errors = @(); schema = $null }
    }

    $schema = $agentDef.io_contract.output_schema
    try {
        $null = $RawOutput | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        $msg = "Output is not valid JSON: $($_.Exception.Message)"
        return @{ ok = $false; error = $msg; errors = @($msg); schema = $schema }
    }

    try {
        $schemaJson = $schema | ConvertTo-Json -Depth 60
        $null = Test-Json -Json $RawOutput -Schema $schemaJson -ErrorAction Stop
    }
    catch {
        $msg = "Output does not match output_schema: $($_.Exception.Message)"
        return @{ ok = $false; error = $msg; errors = @($msg); schema = $schema }
    }

    return @{ ok = $true; error = $null; errors = @(); schema = $schema }
}

function Write-ContractFailureArtifact {
    param(
        [Parameter(Mandatory = $true)][string]$AgentName,
        [Parameter(Mandatory = $true)][object]$Schema,
        [Parameter(Mandatory = $true)][string[]]$InitialErrors,
        [Parameter(Mandatory = $true)][string]$RawOutput,
        [AllowNull()][string]$RepairedOutput = $null,
        [AllowNull()][string[]]$RepairErrors = @()
    )

    $failureDir = Join-Path $OutDir "artifacts\contract_failures"
    if (-not (Test-Path -LiteralPath $failureDir)) {
        New-Item -ItemType Directory -Path $failureDir -Force | Out-Null
    }

    $safeAgent = [Regex]::Replace($AgentName, "[^\w\-]+", "_")
    $stamp = Get-Date -Format "yyyyMMdd-HHmmssfff"
    $path = Join-Path $failureDir ("{0}.{1}.json" -f $safeAgent, $stamp)

    $payload = [ordered]@{
        schema_version = "1.0"
        run_id = $RunId
        agent = $AgentName
        timestamp_utc = (Get-Date).ToUniversalTime().ToString("o")
        initial_validation_errors = @($InitialErrors)
        repair_validation_errors = @($RepairErrors)
        schema = $Schema
        raw_output = $RawOutput
        repaired_output = $RepairedOutput
    }

    $payload | ConvertTo-Json -Depth 80 | Set-Content -LiteralPath $path -Encoding UTF8
    return $path
}

function Resolve-AgentOutputWithContract {
    param(
        [Parameter(Mandatory = $true)][string]$AgentName,
        [Parameter(Mandatory = $true)][string]$Output,
        [Parameter(Mandatory = $true)][string]$SystemPrompt,
        [Parameter(Mandatory = $true)][string]$UserPrompt
    )

    $check = Assert-AgentContractOutput -AgentName $AgentName -RawOutput $Output
    if ($check.ok) {
        return @{
            Output = $Output
            ContractOk = $true
            ContractError = $null
            RepairAttempted = $false
            RepairSucceeded = $false
            FailureArtifact = $null
        }
    }

    Write-Host "⚠️ Contract validation failed for ${AgentName}: $($check.error)" -ForegroundColor Yellow
    $schemaJson = $check.schema | ConvertTo-Json -Depth 60
    $errorsText = ($check.errors | ForEach-Object { "- $_" }) -join "`n"
    $repairPrompt = @"
Your previous response failed contract validation.
Return ONLY valid JSON (no markdown, no code fences).

JSON Schema:
$schemaJson

Validation errors:
$errorsText

Original task:
$UserPrompt

Invalid output:
$Output
"@

    $repairMessages = @(
        @{ role = "system"; content = $SystemPrompt },
        @{ role = "user"; content = $repairPrompt }
    )
    $repaired = Invoke-OpenAIRequest -Messages $repairMessages -AgentName $AgentName
    if (-not $repaired) {
        $artifact = Write-ContractFailureArtifact `
            -AgentName $AgentName `
            -Schema $check.schema `
            -InitialErrors @($check.errors) `
            -RawOutput $Output
        Write-AgentStatus -Agent $AgentName -Status "error" -ExtraData @{ contract_error = $check.error; contract_failure_artifact = $artifact }
        throw "Contract repair failed for $AgentName. Artifact: $artifact"
    }

    $recheck = Assert-AgentContractOutput -AgentName $AgentName -RawOutput $repaired
    if (-not $recheck.ok) {
        $artifact = Write-ContractFailureArtifact `
            -AgentName $AgentName `
            -Schema $check.schema `
            -InitialErrors @($check.errors) `
            -RawOutput $Output `
            -RepairedOutput $repaired `
            -RepairErrors @($recheck.errors)
        Write-AgentStatus -Agent $AgentName -Status "error" -ExtraData @{ contract_error = $recheck.error; contract_failure_artifact = $artifact }
        throw "Contract validation failed for $AgentName after one repair retry. Artifact: $artifact"
    }

    Write-Host "✅ Contract repair succeeded for $AgentName" -ForegroundColor Green
    return @{
        Output = $repaired
        ContractOk = $true
        ContractError = $null
        RepairAttempted = $true
        RepairSucceeded = $true
        FailureArtifact = $null
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

        # --- Agent Pipeline -------------------------------------------------
        # Phase 1 (parallel): contributor agents
        # Phase 2 (sequential): Synthesizer
        # Phase 3 (sequential): ValidationAuditor
        # Phase 4 (sequential): Commissioner
        # Phase 5 (sequential): Supervisor
        # Phase 6 (sequential): Historian
        $Commissioner = $Agents | Where-Object { $_.name -eq "Commissioner" }
        $Synthesizer = $Agents | Where-Object { $_.name -eq "Synthesizer" }
        $ValidationAuditor = $Agents | Where-Object { $_.name -eq "ValidationAuditor" }
        $Supervisor = $Agents | Where-Object { $_.name -eq "Supervisor" }
        $Historian = $Agents | Where-Object { $_.name -eq "Historian" }
        $Phase1Agents = $Agents | Where-Object { $_.name -notin @("Commissioner", "Synthesizer", "ValidationAuditor", "Supervisor", "Historian") }

        # Track per-iteration outputs by agent name for downstream Supervisor/Historian inputs.
        $AgentOutputs = @{}

        # --- Prepare work items --------------------------------------------
        $WorkItems = foreach ($A in $Phase1Agents) {
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
                    SystemPrompt = $systemPrompt
                    UserPrompt = $Context
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
                    SystemPrompt = $systemPrompt
                    UserPrompt = $Context
                }
            }

        } -ThrottleLimit 4   # Adjust for API concurrency limits

        # --- Collect and merge results (serial, in parent) -----------------
        foreach ($r in $Results) {
            if (-not $r.Ok -or [string]::IsNullOrWhiteSpace($r.Output)) {
                Write-Host "⚠️ No response from $($r.Agent)" -ForegroundColor Red
                continue
            }
            $validated = Resolve-AgentOutputWithContract `
                -AgentName $r.Agent `
                -Output $r.Output `
                -SystemPrompt $r.SystemPrompt `
                -UserPrompt $r.UserPrompt

            $finalOutput = [string]$validated.Output
            Write-Log -Agent $r.Agent -Content $finalOutput
            $Context += "`n`n[$($r.Agent) Output]:`n$finalOutput"
            $AgentOutputs[$r.Agent] = $finalOutput
        }

        # --- Run Synthesizer sequentially ----------------------------------
        if ($Synthesizer) {
            foreach ($S in $Synthesizer) {
                Write-AgentStatus -Agent $S.name -Status "working"

                $systemPrompt = if ([string]::IsNullOrWhiteSpace($Instruction)) {
                    $S.prompt
                } else {
                    "$Instruction`n`n$($S.prompt)"
                }

                $Messages = @(
                    @{ role = "system"; content = $systemPrompt },
                    @{ role = "user"; content = $Context }
                )

                $Output = Invoke-OpenAIRequest -Messages $Messages -AgentName $S.name
                if (-not $Output) {
                    Write-AgentStatus -Agent $S.name -Status "error"
                    continue
                }

                $validated = Resolve-AgentOutputWithContract `
                    -AgentName $S.name `
                    -Output $Output `
                    -SystemPrompt $systemPrompt `
                    -UserPrompt $Context
                $Output = [string]$validated.Output

                Write-AgentStatus -Agent $S.name -Status "complete"
                Write-Log -Agent $S.name -Content $Output
                $Context += "`n`n[$($S.name) Output]:`n$Output"
                $AgentOutputs[$S.name] = $Output
            }
        }

        # --- Run ValidationAuditor sequentially -----------------------------
        if ($ValidationAuditor) {
            foreach ($V in $ValidationAuditor) {
                Write-AgentStatus -Agent $V.name -Status "working"

                $systemPrompt = if ([string]::IsNullOrWhiteSpace($Instruction)) {
                    $V.prompt
                } else {
                    "$Instruction`n`n$($V.prompt)"
                }

                $auditInput = @{
                    run_id = $RunId
                    goal = $Goal
                    agent_outputs = $AgentOutputs
                    audit_focus = "Identify stub-outs, placeholders, TODO/TBD/FIXME markers, and unfinished tasks."
                } | ConvertTo-Json -Depth 20

                $Messages = @(
                    @{ role = "system"; content = $systemPrompt },
                    @{ role = "user"; content = $auditInput }
                )

                $Output = Invoke-OpenAIRequest -Messages $Messages -AgentName $V.name
                if (-not $Output) {
                    Write-AgentStatus -Agent $V.name -Status "error"
                    continue
                }

                $validated = Resolve-AgentOutputWithContract `
                    -AgentName $V.name `
                    -Output $Output `
                    -SystemPrompt $systemPrompt `
                    -UserPrompt $auditInput
                $Output = [string]$validated.Output

                Write-AgentStatus -Agent $V.name -Status "complete"
                Write-Log -Agent $V.name -Content $Output
                $Context += "`n`n[$($V.name) Output]:`n$Output"
                $AgentOutputs[$V.name] = $Output
            }
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
                $AgentOutputs[$C.name] = $Output

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

                $validated = Resolve-AgentOutputWithContract `
                    -AgentName $C.name `
                    -Output $Output `
                    -SystemPrompt $systemPrompt `
                    -UserPrompt $Context
                $Output = [string]$validated.Output

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
                $Score = $null
                $Recommendation = $null
                $commission = $null
                try {
                    $commission = $Output | ConvertFrom-Json -ErrorAction Stop
                    if ($null -ne $commission.value_score) { $Score = [int]$commission.value_score }
                    if ($commission.recommendation) { $Recommendation = [string]$commission.recommendation }
                } catch {
                    # Fallback to legacy formats.
                    if ($Output -match "Value Score[:\s]*(\d+)") {
                        $Score = [int]$matches[1]
                    }
                    if ($Output -match "Recommendation[:\s]*(GO|NO-GO|CONDITIONAL)") {
                        $Recommendation = ($matches[1].ToLower() -replace '-', '')
                    }
                }

                if ($null -ne $Score -or $Recommendation) {
                    $rec = ($Recommendation ?? "").ToLowerInvariant()
                    if ($rec -eq "go" -or ($null -ne $Score -and $Score -ge 7)) {
                        Write-Host "✅ Commissioner approves (value_score=$Score, recommendation=$Recommendation) — Milestone achieved." -ForegroundColor Green
                        $Context += "`n[Milestone_$i]: Approved (value_score=$Score, recommendation=$Recommendation)."
                        $Script:ShouldExit = $true
                        break
                    }
                    if ($rec -eq "nogo") {
                        Write-Host "🛑 Commissioner no-go (value_score=$Score). Ending run." -ForegroundColor Yellow
                        $Context += "`n[Milestone_$i]: No-go (value_score=$Score)."
                        $Script:ShouldExit = $true
                        break
                    }

                    Write-Host "🔁 Commissioner conditional (value_score=$Score) — triggering refinement..." -ForegroundColor Yellow
                    $feedbackLines = New-Object System.Collections.Generic.List[string]
                    if ($null -ne $commission) {
                        if ($commission.rationale) {
                            $feedbackLines.Add("Rationale: $($commission.rationale)")
                        }
                        foreach ($condition in @($commission.conditions)) {
                            if (-not [string]::IsNullOrWhiteSpace([string]$condition)) {
                                $feedbackLines.Add("Condition: $condition")
                            }
                        }
                        foreach ($improvement in @($commission.improvements)) {
                            if (-not [string]::IsNullOrWhiteSpace([string]$improvement)) {
                                $feedbackLines.Add("Improvement: $improvement")
                            }
                        }
                    }

                    $RefineDirective = "Refine the plan to raise commissioner value_score from $Score to >=7 while preserving the original goal and deliverables."
                    if ($feedbackLines.Count -gt 0) {
                        $RefineDirective += "`nCommissioner feedback:`n- " + (($feedbackLines.ToArray()) -join "`n- ")
                    }

                    $nextInstruction = if ([string]::IsNullOrWhiteSpace($Instruction)) {
                        $RefineDirective
                    } else {
                        "$Instruction`n`n$RefineDirective"
                    }

                    $Context += "`n[Refinement Triggered]: $RefineDirective"
                    & $PSCommandPath `
                        -Goal $Goal `
                        -Model $Model `
                        -Instruction $nextInstruction `
                        -MaxIterations $MaxIterations `
                        -AgentConfigPath $AgentConfigPath `
                        -CanonicalAgentLibraryPath $CanonicalAgentLibraryPath `
                        -UseLegacyAgentConfig:$legacyConfigRequested
                    $Script:ShouldExit = $true
                    return
                }
            }
        }

        # --- Run Supervisor sequentially ----------------------------------
        if ($Supervisor) {
            foreach ($Sup in $Supervisor) {
                Write-AgentStatus -Agent $Sup.name -Status "working"

                $systemPrompt = if ([string]::IsNullOrWhiteSpace($Instruction)) {
                    $Sup.prompt
                } else {
                    "$Instruction`n`n$($Sup.prompt)"
                }

                $input = @{
                    run_id = $RunId
                    goal = $Goal
                    agent_outputs = $AgentOutputs
                } | ConvertTo-Json -Depth 20

                $Messages = @(
                    @{ role = "system"; content = $systemPrompt },
                    @{ role = "user"; content = $input }
                )

                $Output = Invoke-OpenAIRequest -Messages $Messages -AgentName $Sup.name
                if (-not $Output) {
                    Write-AgentStatus -Agent $Sup.name -Status "error"
                    continue
                }

                $validated = Resolve-AgentOutputWithContract `
                    -AgentName $Sup.name `
                    -Output $Output `
                    -SystemPrompt $systemPrompt `
                    -UserPrompt $input
                $Output = [string]$validated.Output

                Write-AgentStatus -Agent $Sup.name -Status "complete"
                Write-Log -Agent $Sup.name -Content $Output
                $Context += "`n`n[$($Sup.name) Output]:`n$Output"
                $AgentOutputs[$Sup.name] = $Output
            }
        }

        # --- Run Historian sequentially -----------------------------------
        if ($Historian) {
            foreach ($H in $Historian) {
                Write-AgentStatus -Agent $H.name -Status "working"

                $systemPrompt = if ([string]::IsNullOrWhiteSpace($Instruction)) {
                    $H.prompt
                } else {
                    "$Instruction`n`n$($H.prompt)"
                }

                $input = @{
                    run_id = $RunId
                    goal = $Goal
                    agent_outputs = $AgentOutputs
                } | ConvertTo-Json -Depth 20

                $Messages = @(
                    @{ role = "system"; content = $systemPrompt },
                    @{ role = "user"; content = $input }
                )

                $Output = Invoke-OpenAIRequest -Messages $Messages -AgentName $H.name
                if (-not $Output) {
                    Write-AgentStatus -Agent $H.name -Status "error"
                    continue
                }

                $validated = Resolve-AgentOutputWithContract `
                    -AgentName $H.name `
                    -Output $Output `
                    -SystemPrompt $systemPrompt `
                    -UserPrompt $input
                $Output = [string]$validated.Output

                Write-AgentStatus -Agent $H.name -Status "complete"
                Write-Log -Agent $H.name -Content $Output
                $Context += "`n`n[$($H.name) Output]:`n$Output"
                $AgentOutputs[$H.name] = $Output
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

    # Generate a standardized HTML page for the final synthesis (best-effort)
    try {
        $toolboxRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\\..')).Path
        $converter = Join-Path $toolboxRoot "scripts\\Convert-FinalSynthesisToHtml.ps1"
        if (Test-Path $converter) {
            $htmlPath = Join-Path $OutDir "Final_Synthesis.html"
            & $converter -TextPath $FinalPath -OutputPath $htmlPath -Title "Final Synthesis" -RunId $RunId -Model $Model -Goal $Goal | Out-Null
            Write-Host "🌐 Final synthesis HTML saved to $htmlPath"
        }
    }
    catch {
        Write-Host "⚠️ Failed to generate Final_Synthesis.html: $_" -ForegroundColor Yellow
    }
}
### END FILE: POF.ps1
