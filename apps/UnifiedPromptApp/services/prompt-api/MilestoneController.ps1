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

    ,
    [Parameter(Mandatory = $false)]
    [switch]$EnforceContracts,

    [Parameter(Mandatory = $false)]
    [string]$LearningPatternsPath,

    [Parameter(Mandatory = $false)]
    [int]$LearningTopN = 10,

    [Parameter(Mandatory = $false)]
    [int]$LearningMaxRuns = 200,

    [Parameter(Mandatory = $false)]
    [switch]$DisableLearning
)

# Script configuration
$ErrorActionPreference = "Stop"
$script:StartTime = Get-Date
$script:RunId = $null
$script:AgentLibrary = $null
$script:AgentLibraryPath = $null
$script:LearningPatterns = @()
$script:LearningPatternsPath = $null

function Get-RepoRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot "..\\..\\..\\..")).Path
}

function Initialize-LearningPatterns {
    if ($DisableLearning) {
        return
    }

    if ([string]::IsNullOrWhiteSpace($LearningPatternsPath)) {
        $script:LearningPatternsPath = Join-Path (Join-Path (Get-RepoRoot) ".uaitoolbox") "learning_patterns.json"
    }
    else {
        $script:LearningPatternsPath = $LearningPatternsPath
    }

    $dir = Split-Path -Parent $script:LearningPatternsPath
    if (-not (Test-Path -Path $dir -PathType Container)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    if (-not (Test-Path -Path $script:LearningPatternsPath -PathType Leaf)) {
        $script:LearningPatterns = @()
        return
    }

    try {
        $loaded = Get-Content -Raw -Path $script:LearningPatternsPath | ConvertFrom-Json -ErrorAction Stop
        if ($loaded -is [System.Collections.IEnumerable]) {
            $script:LearningPatterns = @($loaded)
        }
        else {
            $script:LearningPatterns = @()
        }
    }
    catch {
        Write-Log "Failed to parse learning patterns at $script:LearningPatternsPath; continuing with empty learning set: $_" -Level "WARNING"
        $script:LearningPatterns = @()
    }
}

function Save-LearningPatterns {
    if ($DisableLearning) {
        return
    }

    $dir = Split-Path -Parent $script:LearningPatternsPath
    if (-not (Test-Path -Path $dir -PathType Container)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    $tmp = Join-Path $dir ("learning_patterns_{0}.tmp" -f ([Guid]::NewGuid().ToString("N")))
    @($script:LearningPatterns) | ConvertTo-Json -Depth 30 | Set-Content -Path $tmp -Encoding UTF8
    Move-Item -Force -Path $tmp -Destination $script:LearningPatternsPath
}

function Get-LearningContextBlock {
    if ($DisableLearning) {
        return ""
    }

    if (-not $script:LearningPatterns -or $script:LearningPatterns.Count -eq 0) {
        return ""
    }

    $insights = @()
    foreach ($entry in ($script:LearningPatterns | Select-Object -Last 30)) {
        if ($entry -and $entry.insights) {
            foreach ($i in @($entry.insights)) {
                if (-not [string]::IsNullOrWhiteSpace([string]$i)) {
                    $insights += [string]$i
                }
            }
        }
    }

    if (-not $insights -or $insights.Count -eq 0) {
        return ""
    }

    $deduped = @()
    $seen = @{}
    foreach ($i in $insights) {
        $key = $i.Trim()
        if (-not $seen.ContainsKey($key)) {
            $seen[$key] = $true
            $deduped += $key
        }
    }

    $top = @($deduped | Select-Object -First $LearningTopN)
    if ($top.Count -eq 0) {
        return ""
    }

    $lines = @("LEARNING PATTERNS (from recent Supervisor runs):")
    foreach ($t in $top) {
        $lines += "- $t"
    }
    return ($lines -join "`n")
}

function Update-LearningFromSupervisor {
    param(
        [Parameter(Mandatory = $true)][string]$SupervisorRawJson,
        [Parameter(Mandatory = $true)][string]$GoalText,
        [Parameter(Mandatory = $true)][string]$Model,
        [Parameter(Mandatory = $true)][string]$OutputDir
    )

    if ($DisableLearning) {
        return
    }

    $parsed = $null
    try {
        $parsed = $SupervisorRawJson | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        Write-Log "Supervisor output could not be parsed as JSON; skipping learning update: $_" -Level "WARNING"
        return
    }

    $record = [pscustomobject]@{
        timestamp          = (Get-Date).ToUniversalTime().ToString("o")
        run_id             = $script:RunId
        goal               = $GoalText
        model              = $Model
        output_dir         = $OutputDir
        quality_score      = $parsed.quality_score
        agent_scores       = $parsed.agent_scores
        feedback           = $parsed.feedback
        insights           = $parsed.insights
        recommendations    = $parsed.recommendations
        agent_improvements = $parsed.agent_improvements
    }

    $script:LearningPatterns = @($script:LearningPatterns + @($record))
    if ($LearningMaxRuns -gt 0 -and $script:LearningPatterns.Count -gt $LearningMaxRuns) {
        $script:LearningPatterns = @($script:LearningPatterns | Select-Object -Last $LearningMaxRuns)
    }

    Save-LearningPatterns
    Write-Log "Learning patterns updated: $script:LearningPatternsPath"
}

function Get-AgentLibraryPath {
    $repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\\..\\..\\..")
    return Join-Path $repoRoot "Orchestration\\agents\\agent-library.json"
}

function Get-AgentDefinition {
    param([Parameter(Mandatory = $true)][string]$AgentName)

    if (-not $EnforceContracts) {
        return $null
    }

    if (-not $script:AgentLibraryPath) {
        $script:AgentLibraryPath = Get-AgentLibraryPath
    }

    if (-not $script:AgentLibrary) {
        if (Test-Path $script:AgentLibraryPath) {
            try {
                $script:AgentLibrary = Get-Content -Raw -Path $script:AgentLibraryPath | ConvertFrom-Json
            }
            catch {
                Write-Log "Failed to load agent library at $script:AgentLibraryPath: $_" -Level "WARNING"
                $script:AgentLibrary = @()
            }
        }
        else {
            Write-Log "Agent library not found at $script:AgentLibraryPath; contract enforcement disabled." -Level "WARNING"
            $script:AgentLibrary = @()
            $script:EnforceContracts = $false
        }
    }

    return $script:AgentLibrary | Where-Object { $_.name -eq $AgentName } | Select-Object -First 1
}

function Remove-JsonCodeFences {
    param([AllowNull()][string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) { return $Text }

    $trimmed = $Text.Trim()
    if ($trimmed -match '^\s*```(?:json)?') {
        $trimmed = [regex]::Replace($trimmed, '^\s*```(?:json)?\s*', '', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        $trimmed = [regex]::Replace($trimmed, '\s*```\s*$', '')
    }
    return $trimmed
}

function Get-FirstJsonObjectText {
    param([AllowNull()][string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) { return $null }

    $sanitized = Remove-JsonCodeFences -Text $Text
    $start = $sanitized.IndexOf('{')
    if ($start -lt 0) { return $null }

    $segment = $sanitized.Substring($start)
    $depth = 0
    $inString = $false
    $escape = $false

    for ($i = 0; $i -lt $segment.Length; $i++) {
        $ch = $segment[$i]

        if ($escape) {
            $escape = $false
            continue
        }

        if ($ch -eq '\') {
            if ($inString) { $escape = $true }
            continue
        }

        if ($ch -eq '"') {
            $inString = -not $inString
            continue
        }

        if ($inString) { continue }

        if ($ch -eq '{') {
            $depth++
            continue
        }

        if ($ch -eq '}') {
            $depth--
            if ($depth -eq 0) {
                return $segment.Substring(0, $i + 1)
            }
        }
    }

    return $null
}

function Normalize-AgentContractObject {
    param(
        [Parameter(Mandatory = $true)][string]$AgentName,
        [AllowNull()]$Object
    )

    if ($null -eq $Object) { return $Object }
    if ($AgentName -ne "Critic") { return $Object }

    $objProps = @($Object.PSObject.Properties.Name)
    if ($objProps -notcontains "issues") { return $Object }

    foreach ($issue in @($Object.issues)) {
        if ($null -eq $issue) { continue }

        $issueProps = @($issue.PSObject.Properties.Name)
        if ($issueProps -contains "file") {
            $fileValue = $issue.file
            if ($null -eq $fileValue -or [string]::IsNullOrWhiteSpace([string]$fileValue)) {
                $issue.file = "unknown"
            }
        }

        if ($issueProps -contains "line") {
            $lineNumber = 0.0
            $lineValue = $issue.line
            $isNumber = $false
            if ($null -ne $lineValue) {
                $isNumber = [double]::TryParse([string]$lineValue, [ref]$lineNumber)
            }
            if (-not $isNumber -or $lineNumber -lt 1) {
                $issue.PSObject.Properties.Remove("line")
            }
            else {
                $issue.line = [math]::Round($lineNumber, 0)
            }
        }
    }

    return $Object
}

function ConvertTo-NormalizedAgentJson {
    param(
        [Parameter(Mandatory = $true)]$RawOutput,
        [Parameter(Mandatory = $true)][string]$AgentName,
        [int]$Depth = 0
    )

    if ($Depth -gt 4) {
        return @{ ok = $false; error = "Unable to normalize output after multiple parse attempts."; parsed = $null; json = $null }
    }
    if ($null -eq $RawOutput) {
        return @{ ok = $false; error = "Output is null."; parsed = $null; json = $null }
    }

    if ($RawOutput -isnot [string]) {
        $propNames = @($RawOutput.PSObject.Properties.Name)
        if ($propNames -contains "choices" -and $RawOutput.choices -and $RawOutput.choices.Count -gt 0) {
            $choice = $RawOutput.choices[0]
            if ($choice.message -and $choice.message.content) {
                return ConvertTo-NormalizedAgentJson -RawOutput ([string]$choice.message.content) -AgentName $AgentName -Depth ($Depth + 1)
            }
        }

        $normalizedObject = Normalize-AgentContractObject -AgentName $AgentName -Object $RawOutput
        return @{
            ok = $true
            error = $null
            parsed = $normalizedObject
            json = ($normalizedObject | ConvertTo-Json -Depth 80)
        }
    }

    $text = [string]$RawOutput
    if ([string]::IsNullOrWhiteSpace($text)) {
        return @{ ok = $false; error = "Output is empty."; parsed = $null; json = $null }
    }

    $candidate = Remove-JsonCodeFences -Text $text
    $parsed = $null

    try {
        $parsed = $candidate | ConvertFrom-Json -Depth 80 -ErrorAction Stop
    }
    catch {
        $jsonObject = Get-FirstJsonObjectText -Text $candidate
        if (-not $jsonObject) {
            return @{
                ok = $false
                error = ("Output is not valid JSON: {0}" -f $_.Exception.Message)
                parsed = $null
                json = $null
            }
        }

        try {
            $parsed = $jsonObject | ConvertFrom-Json -Depth 80 -ErrorAction Stop
        }
        catch {
            return @{
                ok = $false
                error = ("Output is not valid JSON after extraction: {0}" -f $_.Exception.Message)
                parsed = $null
                json = $null
            }
        }
    }

    if ($parsed -is [string]) {
        return ConvertTo-NormalizedAgentJson -RawOutput $parsed -AgentName $AgentName -Depth ($Depth + 1)
    }

    $parsedProps = @($parsed.PSObject.Properties.Name)
    if ($parsedProps -contains "choices" -and $parsed.choices -and $parsed.choices.Count -gt 0) {
        $choice = $parsed.choices[0]
        if ($choice.message -and $choice.message.content) {
            return ConvertTo-NormalizedAgentJson -RawOutput ([string]$choice.message.content) -AgentName $AgentName -Depth ($Depth + 1)
        }
    }

    $normalized = Normalize-AgentContractObject -AgentName $AgentName -Object $parsed
    return @{
        ok = $true
        error = $null
        parsed = $normalized
        json = ($normalized | ConvertTo-Json -Depth 80)
    }
}

function Assert-AgentOutputContract {
    param(
        [Parameter(Mandatory = $true)][string]$AgentName,
        [Parameter(Mandatory = $true)][string]$RawOutput
    )

    if (-not $EnforceContracts) {
        return @{ ok = $true; parsed = $null; error = $null; errors = @(); schema = $null }
    }

    $agentDef = Get-AgentDefinition -AgentName $AgentName
    if (-not $agentDef) {
        return @{ ok = $true; parsed = $null; error = $null; errors = @(); schema = $null }
    }

    $schema = $null
    try {
        $schema = $agentDef.io_contract.output_schema
    }
    catch {
        $schema = $null
    }

    $normalized = ConvertTo-NormalizedAgentJson -RawOutput $RawOutput -AgentName $AgentName
    if (-not $normalized.ok) {
        $msg = $normalized.error
        return @{ ok = $false; parsed = $null; normalized_json = $null; error = $msg; errors = @($msg); schema = $schema }
    }

    $parsed = $normalized.parsed

    # If the agent output is a clarification_request, treat it as a valid bypass:
    # the agent is signalling that its inputs are insufficient to proceed.
    $propNames = @($parsed.PSObject.Properties.Name)
    if ($propNames.Count -eq 1 -and $propNames[0] -eq "clarification_request") {
        $clarificationText = $parsed.clarification_request
        if (-not [string]::IsNullOrWhiteSpace($clarificationText)) {
            Write-Log "Agent '${AgentName}' requested clarification: $clarificationText" -Level "WARN"
            return @{
                ok                   = $true
                parsed               = $parsed
                normalized_json      = $normalized.json
                error                = $null
                errors               = @()
                schema               = $schema
                clarification_needed = $true
                clarification_text   = $clarificationText
            }
        }
    }

    if ($schema) {
        try {
            $schemaJson = $schema | ConvertTo-Json -Depth 60
            $null = Test-Json -Json $normalized.json -Schema $schemaJson -ErrorAction Stop
        }
        catch {
            $msg = "Output does not match output_schema: $($_.Exception.Message)"
            return @{ ok = $false; parsed = $parsed; normalized_json = $normalized.json; error = $msg; errors = @($msg); schema = $schema }
        }
    }

    $required = @()
    try {
        $required = @($agentDef.io_contract.output_schema.required)
    }
    catch {
        $required = @()
    }

    foreach ($field in $required) {
        if (-not ($parsed.PSObject.Properties.Name -contains $field)) {
            $msg = "Missing required output field: $field"
            return @{ ok = $false; parsed = $parsed; normalized_json = $normalized.json; error = $msg; errors = @($msg); schema = $schema }
        }
    }

    return @{ ok = $true; parsed = $parsed; normalized_json = $normalized.json; error = $null; errors = @(); schema = $schema }
}

function Write-ContractFailureArtifact {
    param(
        [Parameter(Mandatory = $true)][string]$OutputDir,
        [Parameter(Mandatory = $true)][string]$AgentName,
        [Parameter(Mandatory = $true)][string]$MilestoneName,
        [AllowNull()][object]$Schema,
        [AllowNull()][string[]]$InitialErrors = @(),
        [AllowNull()][string]$RawOutput = $null,
        [AllowNull()][string]$RepairedOutput = $null,
        [AllowNull()][string[]]$RepairErrors = @()
    )

    $failureDir = Join-Path $OutputDir "artifacts\contract_failures"
    if (-not (Test-Path -LiteralPath $failureDir)) {
        New-Item -ItemType Directory -Path $failureDir -Force | Out-Null
    }

    $safeAgent = [Regex]::Replace($AgentName, "[^\w\-]+", "_")
    $stamp = Get-Date -Format "yyyyMMdd-HHmmssfff"
    $path = Join-Path $failureDir ("{0}.{1}.json" -f $safeAgent, $stamp)

    $payload = [ordered]@{
        schema_version = "1.0"
        run_id = $script:RunId
        agent = $AgentName
        milestone = $MilestoneName
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

function Invoke-ContractRepairRetry {
    param(
        [Parameter(Mandatory = $true)][string]$AgentName,
        [Parameter(Mandatory = $true)][string]$Model,
        [Parameter(Mandatory = $true)][string]$SystemPrompt,
        [Parameter(Mandatory = $true)][string]$OriginalUserPrompt,
        [Parameter(Mandatory = $true)][string]$InvalidOutput,
        [Parameter(Mandatory = $true)][object]$Schema,
        [AllowNull()][string[]]$ValidationErrors = @()
    )

    $schemaJson = $Schema | ConvertTo-Json -Depth 60
    $errorsText = if ($ValidationErrors -and $ValidationErrors.Count -gt 0) {
        ($ValidationErrors | ForEach-Object { "- $_" }) -join "`n"
    }
    else {
        "- Unknown schema validation error"
    }

    $repairPrompt = @"
Your previous response for agent '$AgentName' failed contract validation.

Return ONLY valid JSON with no markdown and no code fences.
It MUST satisfy this JSON Schema:
$schemaJson

Validation errors to fix:
$errorsText

Original task prompt:
$OriginalUserPrompt

Previous invalid output:
$InvalidOutput
"@

    $repairLlm = Invoke-OrchestrationLlm `
        -Model $Model `
        -SystemPrompt $SystemPrompt `
        -UserPrompt $repairPrompt

    $fixedOutput = $repairLlm.Output
    $recheck = Assert-AgentOutputContract -AgentName $AgentName -RawOutput $fixedOutput

    return @{
        ok = $recheck.ok
        output = $fixedOutput
        raw = $repairLlm.RawResponse
        check = $recheck
    }
}

function New-StubFromSchema {
    param(
        [Parameter(Mandatory = $true)][object]$Schema,
        [int]$Depth = 0
    )

    if ($Depth -gt 6 -or -not $Schema) {
        return $null
    }

    $type = $Schema.type
    switch ($type) {
        "string" { return "" }
        "number" { return 0 }
        "integer" { return 0 }
        "boolean" { return $false }
        "array" { return @() }
        "object" {
            $obj = @{}
            $props = $Schema.properties
            $required = @()
            if ($Schema.required) { $required = @($Schema.required) }

            foreach ($name in $required) {
                if ($props -and $props.PSObject.Properties.Name -contains $name) {
                    $obj[$name] = New-StubFromSchema -Schema $props.$name -Depth ($Depth + 1)
                }
                else {
                    $obj[$name] = $null
                }
            }
            return $obj
        }
        default { return $null }
    }
}

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

    if (-not $script:RunId) {
        $script:RunId = "{0}_{1}" -f (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ"), ([Guid]::NewGuid().ToString("N").Substring(0, 8))
    }
    Write-Log "RunId: $($script:RunId)"
    
    # Create output directory if needed
    if (-not (Test-Path $OutputDir)) {
        New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    }

    Initialize-LearningPatterns
    
    # Initialize log file
    $script:LogFile = Join-Path $OutputDir "orchestration.log"
    Write-Log "Log file: $script:LogFile"
    
    return @{
        Goal = $GoalText
        Model = $Model
        RunId = $script:RunId
        StartTime = $script:StartTime
        Status = "initialized"
        Milestones = @()
    }
}

function Split-GoalIntoMilestones {
    param([string]$Goal)
    
    Write-Log "Analyzing goal and generating milestones..."
    
    # Canonical pipeline (ensures downstream agents have upstream context).
    $pipeline = @(
        @{ Key = "Researcher";   Name = "Research Phase";        Description = "Gather and analyze relevant information" },
        @{ Key = "Engineer";     Name = "Implementation Phase";  Description = "Build the solution based on research findings" },
        @{ Key = "Critic";       Name = "Validation Phase";      Description = "Test and validate the implementation" },
        @{ Key = "Synthesizer";  Name = "Synthesis Phase";       Description = "Merge outputs into a cohesive plan" },
        @{ Key = "Commissioner"; Name = "Decision Phase";        Description = "Evaluate business value and approve next steps" },
        @{ Key = "Supervisor";   Name = "Quality Phase";         Description = "Score the run and extract learnings" },
        @{ Key = "Historian";    Name = "Memory Capsule";        Description = "Capture a durable run summary for reuse" }
    )

    $goalLower = $Goal.ToLower()
    $matchAny = $goalLower -match "research|analyze|investigate|implement|build|create|code|develop|test|validate|verify|review|document|report|summarize|history|brief"

    if (-not $matchAny) {
        $milestones = $pipeline
    }
    else {
        $include = [ordered]@{}

        if ($goalLower -match "research|analyze|investigate") {
            $include["Researcher"] = $true
        }
        if ($goalLower -match "implement|build|create|code|develop") {
            $include["Researcher"] = $true
            $include["Engineer"] = $true
        }
        if ($goalLower -match "test|validate|verify|review") {
            $include["Researcher"] = $true
            $include["Engineer"] = $true
            $include["Critic"] = $true
        }
        if ($goalLower -match "document|report|summarize|history|brief") {
            $include["Researcher"] = $true
            $include["Engineer"] = $true
            $include["Critic"] = $true
            $include["Synthesizer"] = $true
            $include["Historian"] = $true
        }

        if ($include.Keys.Count -gt 0) {
            $include["Synthesizer"] = $true
            $include["Commissioner"] = $true
            $include["Supervisor"] = $true
            $include["Historian"] = $true
        }

        $milestones = @()
        foreach ($step in $pipeline) {
            if ($include.Contains($step.Key) -and $include[$step.Key]) {
                $milestones += $step
            }
        }
    }

    $milestones = @($milestones | ForEach-Object {
        @{
            Name        = $_.Name
            Description = $_.Description
            Agent       = $_.Key
            Status      = "pending"
        }
    })
    
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
        if ($DryRun) {
            return @{
                Output      = "[SIMULATED:$Model] $UserPrompt"
                RawResponse = @{ simulated = $true; model = $Model }
            }
        }
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

    try {
        # Fire the request
        $response = Invoke-RestMethod -Uri "https://api.openai.com/v1/chat/completions" `
                                      -Method Post `
                                      -Headers $headers `
                                      -Body $body `
                                      -ErrorAction Stop

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
    catch {
        $outerException = $_
        $errorMessage = $outerException.Exception.Message
        $errorDetails = ""
        
        # Try to extract more details from the error
        if ($outerException.ErrorDetails) {
            try {
                $errorJson = $outerException.ErrorDetails.Message | ConvertFrom-Json
                if ($errorJson.error) {
                    $errorDetails = ": $($errorJson.error.message)"
                }
            }
            catch {
                # If JSON parsing fails, use the raw error details message
                $errorDetails = ": $($outerException.ErrorDetails.Message)"
            }
        }
        
        Write-Log "OpenAI API call failed: $errorMessage$errorDetails" -Level "ERROR"
        throw "Failed to call OpenAI API: $errorMessage$errorDetails"
    }
}

function Invoke-MilestoneAgent {
    param(
        [Parameter(Mandatory = $true)]
        [string]$GoalText,              # Original goal from the Orchestrator UI

        [Parameter(Mandatory = $true)]
        [pscustomobject]$Milestone,     # One milestone (Name, Description, Agent, Status)

        [Parameter(Mandatory = $false)]
        [hashtable]$Upstream = @{},     # Prior milestone outputs for context

        [Parameter(Mandatory = $true)]
        [string]$Model,

        [Parameter(Mandatory = $true)]
        [string]$OutputDir
    )

    $agentName = if ($Milestone.Agent) { $Milestone.Agent } else { "Commissioner" }
    $agentDef = Get-AgentDefinition -AgentName $agentName
    $systemPrompt = if ($agentDef -and $agentDef.prompt) { [string]$agentDef.prompt } else { "You are a helpful senior engineer assisting with this project." }

    # Build the user-side prompt that the model sees for this phase
    $upstreamSummary = ""
    if ($Upstream -and $Upstream.Count -gt 0) {
        $summaryLines = @()
        foreach ($key in $Upstream.Keys) {
            $item = $Upstream[$key]
            $excerpt = $null
            if ($item -and $item.Output) {
                $excerpt = $item.Output.Substring(0, [Math]::Min(600, $item.Output.Length))
            }
            $summaryLines += @(
                "=== Upstream: $key ==="
                "OutputPath: $($item.OutputPath)"
                "Excerpt:"
                ($excerpt ? $excerpt : "<no output>")
                ""
            )
        }
        $upstreamSummary = ($summaryLines -join "`n")
    }

    $contractBlock = ""
    if ($EnforceContracts -and $agentDef -and $agentDef.io_contract) {
        $schemaJson = $agentDef.io_contract.output_schema | ConvertTo-Json -Depth 30
        $requiredOut = @()
        if ($agentDef.io_contract.output_schema.required) {
            $requiredOut = @($agentDef.io_contract.output_schema.required)
        }
        $contractBlock = @"

OUTPUT CONTRACT:
- Return ONLY valid JSON (no markdown, no code fences).
- Must conform to this JSON Schema:
$schemaJson
- Required fields: $($requiredOut -join ', ')
"@
    }

    $userPrompt = @"
$((Get-LearningContextBlock))

High-level goal:
$GoalText

Upstream context (prior milestone outputs):
$upstreamSummary

You are working on the following milestone in a multi-agent orchestration:

Milestone name: $($Milestone.Name)
Milestone description: $($Milestone.Description)
Agent role: $agentName

Your task:
- Focus only on this milestone.
- Produce concrete, actionable output that advances this milestone.
- If relevant, include bullet lists, code blocks, and explicit next steps.
$contractBlock
"@

    # Call the LLM
    $llmResult = $null
    if ($DryRun -and $EnforceContracts -and $agentDef -and $agentDef.io_contract -and $agentDef.io_contract.output_schema) {
        $stub = New-StubFromSchema -Schema $agentDef.io_contract.output_schema
        $content = $stub | ConvertTo-Json -Depth 20
        $llmResult = @{ RawResponse = @{ simulated = $true } }
    }
    else {
        $llmResult = Invoke-OrchestrationLlm `
            -Model        $Model `
            -SystemPrompt $systemPrompt `
            -UserPrompt   $userPrompt

        $content = $llmResult.Output
    }

    $contractCheck = Assert-AgentOutputContract -AgentName $agentName -RawOutput $content
    $repairAttempted = $false
    $repairSucceeded = $false
    $contractFailureArtifact = $null

    if (-not $contractCheck.ok) {
        Write-Log "Contract violation for agent ${agentName}: $($contractCheck.error)" -Level "WARNING"

        if (-not $DryRun -and $agentDef -and $agentDef.io_contract -and $contractCheck.schema) {
            $repairAttempted = $true
            Write-Log "Attempting one contract repair retry for agent ${agentName}" -Level "WARNING"

            $repairResult = Invoke-ContractRepairRetry `
                -AgentName $agentName `
                -Model $Model `
                -SystemPrompt $systemPrompt `
                -OriginalUserPrompt $userPrompt `
                -InvalidOutput $(if ($contractCheck.normalized_json) { $contractCheck.normalized_json } else { $content }) `
                -Schema $contractCheck.schema `
                -ValidationErrors @($contractCheck.errors)

            if ($repairResult.ok) {
                $repairSucceeded = $true
                $content = $(if ($repairResult.check.normalized_json) { $repairResult.check.normalized_json } else { $repairResult.output })
                $contractCheck = $repairResult.check
                $llmResult = @{
                    Output = $repairResult.output
                    RawResponse = [ordered]@{
                        original = $llmResult.RawResponse
                        repair = $repairResult.raw
                        repair_attempted = $true
                        repair_succeeded = $true
                    }
                }
                Write-Log "Contract repair succeeded for agent ${agentName}" -Level "INFO"
            }
            else {
                $contractFailureArtifact = Write-ContractFailureArtifact `
                    -OutputDir $OutputDir `
                    -AgentName $agentName `
                    -MilestoneName $Milestone.Name `
                    -Schema $contractCheck.schema `
                    -InitialErrors @($contractCheck.errors) `
                    -RawOutput $content `
                    -RepairedOutput $repairResult.output `
                    -RepairErrors @($repairResult.check.errors)

                Write-Log "Contract validation failed after retry for ${agentName}. Artifact: $contractFailureArtifact" -Level "ERROR"
                throw "Contract validation failed for agent ${agentName} after one repair retry. See artifact: $contractFailureArtifact"
            }
        }
        else {
            $contractFailureArtifact = Write-ContractFailureArtifact `
                -OutputDir $OutputDir `
                -AgentName $agentName `
                -MilestoneName $Milestone.Name `
                -Schema $contractCheck.schema `
                -InitialErrors @($contractCheck.errors) `
                -RawOutput $content

            Write-Log "Contract validation failed for ${agentName}. Artifact: $contractFailureArtifact" -Level "ERROR"
            throw "Contract validation failed for agent ${agentName}. See artifact: $contractFailureArtifact"
        }
    }

    if ($contractCheck.normalized_json) {
        $content = $contractCheck.normalized_json
    }

    # Persist the milestone output to disk for inspection
    $safeName = [Regex]::Replace($Milestone.Name, "[^\w\-]+", "_")
    $fileName = if ($EnforceContracts) { "milestone_{0}.json" -f $safeName } else { "milestone_{0}.md" -f $safeName }
    $outputPath = Join-Path -Path $OutputDir -ChildPath $fileName

    $content | Out-File -FilePath $outputPath -Encoding UTF8

    return @{
        Output     = $content
        OutputPath = $outputPath
        Raw        = $llmResult.RawResponse
        SystemPrompt = $systemPrompt
        UserPrompt   = $userPrompt
        ContractOk   = $contractCheck.ok
        ContractError = $contractCheck.error
        ContractFailureArtifact = $contractFailureArtifact
        RepairAttempted = $repairAttempted
        RepairSucceeded = $repairSucceeded
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
    $upstream = @{}

    foreach ($milestone in $Milestones) {
        $milestoneStart = Get-Date
        Write-Log "Executing milestone: $($milestone.Name)"
        Write-Log "  Agent: $($milestone.Agent)"
        Write-Log "  Description: $($milestone.Description)"

        # Call the AI agent for this milestone
        $agentResult = Invoke-MilestoneAgent `
            -GoalText   $GoalText `
            -Milestone  $milestone `
            -Upstream   $upstream `
            -Model      $Model `
            -OutputDir  $OutputDir

        $milestoneEnd = Get-Date

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
            StartedAt   = $milestoneStart.ToString("o")
            CompletedAt = $milestoneEnd.ToString("o")
            DurationSeconds = [math]::Round(($milestoneEnd - $milestoneStart).TotalSeconds, 2)
            Inputs      = [pscustomobject]@{
                Goal = $GoalText
                Model = $Model
                UpstreamAgents = @($upstream.Keys)
            }
            OutputPath  = $agentResult.OutputPath
            Excerpt     = $excerpt
            Output      = $agentResult.Output
            ContractOk  = $agentResult.ContractOk
            ContractError = $agentResult.ContractError
        }

        $upstream[$milestone.Agent] = $agentResult

        if ($milestone.Agent -eq "Supervisor" -and $agentResult.ContractOk) {
            Update-LearningFromSupervisor `
                -SupervisorRawJson $agentResult.Output `
                -GoalText $GoalText `
                -Model $Model `
                -OutputDir $OutputDir
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
        RunId = $Context.RunId
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

    # Also persist full results for audit/replay (milestone I/O can be large).
    $resultsPath = Join-Path $OutputDir ("orchestration_results_{0}.json" -f (Get-Date -Format 'yyyyMMdd_HHmmss'))
    $full = @{
        Goal = $Context.Goal
        Model = $Context.Model
        RunId = $Context.RunId
        StartTime = $Context.StartTime.ToString("o")
        EndTime = $endTime.ToString("o")
        DurationSeconds = [math]::Round($duration.TotalSeconds, 2)
        MilestonesCount = $Context.Milestones.Count
        CompletedMilestones = ($Context.Milestones | Where-Object { $_.Status -eq "completed" }).Count
        Status = "completed"
        LearningPatternsPath = $(if ($DisableLearning) { $null } else { $script:LearningPatternsPath })
        LearningTopN = $LearningTopN
        Milestones = @($Context.Milestones)
    }
    $full | ConvertTo-Json -Depth 20 | Set-Content -Path $resultsPath -Encoding UTF8
    Write-Log "Results saved to: $resultsPath"
    
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

    # If a real API key isn't available, automatically fall back to a simulated run so the pipeline stays auditable.
    if (-not $DryRun -and [string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY)) {
        Write-Log "OPENAI_API_KEY not set; running in simulation mode (-DryRun implied)." -Level "WARNING"
        $DryRun = $true
    }
    
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
    
    # Execute milestones with the AI-backed pipeline (simulated when -DryRun is set).
    $pipelineResults = Execute-MilestonePipeline `
        -Milestones $milestones `
        -GoalText   $goalText `
        -Model      $Model `
        -OutputDir  $OutputDir
    
    $context.Milestones = $pipelineResults
    
    # Complete the orchestration
    $summary = Complete-Orchestration -Context $context

    # Output results (full run context + milestones)
    $outputFile = Join-Path $OutputDir "orchestration_results_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"
    $full = @{
        Goal = $context.Goal
        Model = $context.Model
        StartTime = $context.StartTime.ToString("o")
        EndTime = $summary.EndTime
        DurationSeconds = $summary.DurationSeconds
        MilestonesCount = $summary.MilestonesCount
        CompletedMilestones = $summary.CompletedMilestones
        Status = $summary.Status
        Milestones = @($context.Milestones)
    }
    $full | ConvertTo-Json -Depth 20 | Out-File -FilePath $outputFile -Force -Encoding UTF8

    Write-Log "Orchestration completed successfully. Results saved to: $outputFile"
    
    # Return success exit code
    exit 0
}
catch {
    Write-Log "Orchestration failed: $_" -Level "ERROR"
    Write-Host "Orchestration failed: $_" -ForegroundColor Red
    exit 1
}
