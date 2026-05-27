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
    [int]$RefinementDepth = 0,
    [string]$AgentConfigPath = "",
    [string]$CanonicalAgentLibraryPath = "$PSScriptRoot\..\agents\agent-library.json",
    [switch]$UseLegacyAgentConfig,
    [switch]$VerboseMode,
    [string]$JobType = "build_new_app",
    [string]$AppType = "",
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
}
else {
    "$PSScriptRoot\..\runs\$RunId"
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$Script:ToolboxRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

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
        $jsonLine = $statusObj | ConvertTo-Json -Compress -Depth 20 -ErrorAction Stop

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

function Write-PofEvent {
    param(
        [Parameter(Mandatory = $true)][string]$Type,
        [Parameter(Mandatory = $true)][string]$Message,
        [AllowNull()][hashtable]$Data = $null,
        [AllowNull()][string]$Stage = $null
    )

    $eventPath = Join-Path $OutDir "events.ndjson"
    $eventRecord = @{
        ts      = (Get-Date).ToUniversalTime().ToString("o")
        type    = $Type
        message = $Message
    }
    if (-not [string]::IsNullOrWhiteSpace($Stage)) {
        $eventRecord.stage = $Stage
    }
    if ($Data) {
        $eventRecord.data = $Data
    }

    $eventRecord | ConvertTo-Json -Compress -Depth 40 | Add-Content -Path $eventPath
}

function Update-PofRunState {
    param(
        [Parameter(Mandatory = $true)][string]$Status,
        [AllowNull()][string]$CurrentStage = $null,
        [AllowNull()][hashtable]$RequirementsRequest = $null,
        [string[]]$Warnings = @(),
        [string[]]$Errors = @(),
        [switch]$Complete
    )

    $statePath = Join-Path $OutDir "run_state.json"
    $now = (Get-Date).ToUniversalTime().ToString("o")
    $state = @{}

    if (Test-Path -LiteralPath $statePath) {
        try {
            $existing = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json -Depth 40 -AsHashtable
            if ($existing -is [hashtable]) {
                $state = $existing
            }
        }
        catch {
            $state = @{}
        }
    }

    if (-not $state.ContainsKey('run_id')) { $state.run_id = $RunId }
    if (-not $state.ContainsKey('goal')) { $state.goal = $Goal }
    if (-not $state.ContainsKey('job_type')) { $state.job_type = $EffectiveJobType }
    if (-not $state.ContainsKey('app_type')) { $state.app_type = $EffectiveAppType }
    if (-not $state.ContainsKey('started_at')) { $state.started_at = $now }

    $state.status = $Status
    $state.updated_at = $now
    if (-not [string]::IsNullOrWhiteSpace($CurrentStage)) {
        $state.current_stage = $CurrentStage
    }
    if ($RequirementsRequest) {
        $state.requirements_request = $RequirementsRequest
    }
    if ($Warnings.Count -gt 0) {
        $existingWarnings = @()
        if ($state.ContainsKey('warnings') -and $state.warnings) {
            $existingWarnings = @($state.warnings | ForEach-Object { [string]$_ })
        }
        $state.warnings = @($existingWarnings + $Warnings | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
    }
    if ($Errors.Count -gt 0) {
        $existingErrors = @()
        if ($state.ContainsKey('errors') -and $state.errors) {
            $existingErrors = @($state.errors | ForEach-Object { [string]$_ })
        }
        $state.errors = @($existingErrors + $Errors | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
    }
    if ($Complete) {
        $state.ended_at = $now
    }

    $state | ConvertTo-Json -Depth 40 | Set-Content -LiteralPath $statePath -Encoding UTF8
}

function Complete-PofRunStateIfNeeded {
    param(
        [AllowNull()][string]$ErrorMessage = $null
    )

    $statePath = Join-Path $OutDir "run_state.json"
    $currentState = @{}
    if (Test-Path -LiteralPath $statePath) {
        try {
            $loaded = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json -Depth 40 -AsHashtable
            if ($loaded -is [hashtable]) {
                $currentState = $loaded
            }
        }
        catch {
            $currentState = @{}
        }
    }

    $currentStatus = [string]($currentState.status)
    $currentStage = [string]($currentState.current_stage)

    if (-not [string]::IsNullOrWhiteSpace($ErrorMessage)) {
        Update-PofRunState -Status "error" -CurrentStage "failed" -Errors @($ErrorMessage) -Complete
        Write-PofEvent -Type "status" -Message "error" -Stage "failed" -Data @{ error = $ErrorMessage }
        return
    }

    if ($currentStatus -in @("blocked_requirements", "needs_requirements", "cancelled", "canceled", "completed", "success", "succeeded")) {
        if (-not $currentState.ContainsKey('ended_at') -or [string]::IsNullOrWhiteSpace([string]$currentState.ended_at)) {
            Update-PofRunState -Status $currentStatus -CurrentStage $currentStage -Complete
        }
        return
    }

    if ($currentStatus -like "error*") {
        if (-not $currentState.ContainsKey('ended_at') -or [string]::IsNullOrWhiteSpace([string]$currentState.ended_at)) {
            Update-PofRunState -Status $currentStatus -CurrentStage $(if ([string]::IsNullOrWhiteSpace($currentStage)) { "failed" } else { $currentStage }) -Complete
        }
        return
    }

    Update-PofRunState -Status "completed" -CurrentStage "completed" -Complete
    Write-PofEvent -Type "status" -Message "completed" -Stage "completed"
}

function Get-AgentSchemaTemplate {
    param([Parameter(Mandatory = $true)][string]$AgentName)

    # Literal expected-shape templates for agents whose output_schema is
    # heterogeneous and easy to misinterpret. The templates intentionally mirror
    # the validator in apps/UnifiedPromptApp/services/prompt-api/app.py so the
    # checkpoint UI can show users exactly what the contract requires.
    switch ($AgentName) {
        "ConceptualModelContract" {
            return @"
{
  "interpretation": "<string: 2-4 sentences of plain prose describing what to build>",
  "representation": "<one of: canvas | svg | dom-graphics | chart | simulation>",
  "objects": [
    {
      "id": "<string>",
      "description": "<string>",
      "mustBeVisible": true,
      "observableEvidence": {
        "type": "<one of: dom | svg | canvas | state>",
        "probe": "<machine-falsifiable string, e.g. querySelector('#board') exists>"
      }
    }
  ],
  "interactions": [
    {
      "id": "<string>",
      "trigger": "<string>",
      "userAction": "<string>",
      "expectedVisibleEffect": "<string>",
      "verification": {
        "actionProbe": "<machine-falsifiable string>",
        "expectedChangeProbe": "<machine-falsifiable string; must differ from actionProbe>"
      }
    }
  ],
  "dynamics": [
    {
      "id": "<string>",
      "name": "<string>",
      "whatChangesOverTime": "<string>",
      "observableSignal": "<string>",
      "temporalEvidence": {
        "durationMs": <positive integer>,
        "probe": "<machine-falsifiable string>",
        "expectedDelta": "<string>"
      }
    }
  ],
  "data": [
    { "name": "<string>", "source": "<string>", "usedFor": "<string>" }
  ],
  "non_goals": ["<string>"],
  "acceptance_tests": [
    {
      "testName": "<string>",
      "steps": ["<string>"],
      "assertions": ["<machine-falsifiable string; avoid 'looks/appears/seems'>"],
      "failureCondition": "<string>"
    }
  ]
}
"@
        }
        default { return $null }
    }
}

function New-RequirementsRequestPacket {
    param(
        [Parameter(Mandatory = $true)][string]$Question,
        [Parameter(Mandatory = $true)][string]$AgentName
    )

    $cleanQuestion = if ([string]::IsNullOrWhiteSpace($Question)) {
        "Provide the missing product requirements needed to continue implementation."
    }
    else {
        $Question.Trim()
    }

    $schemaHint = Get-AgentSchemaTemplate -AgentName $AgentName

    $blocker = @{
        id       = "req_1"
        question = $cleanQuestion
        why      = "Required to convert intent into machine-verifiable acceptance criteria."
        defaults = @()
    }
    if ($schemaHint) {
        $blocker.schema_hint = $schemaHint
    }

    return @{
        summary                   = "${AgentName} requires additional requirements before implementation can continue."
        blockers                  = @($blocker)
        proposed_acceptance_tests = @()
    }
}

function New-PofRequirementsCheckpointRecord {
    param(
        [Parameter(Mandatory = $true)][string]$AgentName,
        [Parameter(Mandatory = $true)][string]$Question,
        [Parameter(Mandatory = $true)][hashtable]$RequirementsRequest
    )

    $checkpointId = "requirements-{0}" -f ([Guid]::NewGuid().ToString("N"))
    $requestedAt = (Get-Date).ToUniversalTime().ToString("o")

    return @{
        checkpoint_id        = $checkpointId
        run_id               = $RunId
        kind                 = "requirements"
        agent                = $AgentName
        summary              = "${AgentName} requires additional requirements before implementation can continue."
        question             = $Question
        options              = @("Provide explicit requirements answers", "Revise the goal and resume")
        default_option       = "Provide explicit requirements answers"
        requested_at         = $requestedAt
        status               = "awaiting_user"
        requirements_request = $RequirementsRequest
    }
}

function Write-PofRequirementsCheckpointArtifacts {
    param(
        [Parameter(Mandatory = $true)][string]$AgentName,
        [Parameter(Mandatory = $true)][string]$Question,
        [Parameter(Mandatory = $true)][hashtable]$RequirementsRequest,
        [Parameter(Mandatory = $true)][hashtable]$CheckpointRecord
    )

    $requirementsPath = Join-Path $OutDir "requirements_request.json"
    $checkpointPath = Join-Path $OutDir "checkpoint_pending.json"
    $sandboxReportPath = Join-Path $OutDir "sandbox_report.json"

    $RequirementsRequest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $requirementsPath -Encoding UTF8
    $CheckpointRecord | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $checkpointPath -Encoding UTF8

    $details = "${AgentName} requested clarification before a valid conceptual contract could be produced."
    $sandboxReport = @{
        generated_at             = (Get-Date).ToUniversalTime().ToString("o")
        verification_status      = "needs_requirements"
        loop_iteration           = 0
        checks                   = @(
            @{
                check     = "Conceptual model contract requires sufficient requirements."
                evaluator = "conceptual_model_contract"
                result    = "needs_requirements"
                details   = $details
                data      = @{
                    blocking_agent       = $AgentName
                    clarification_text   = $Question
                    requirements_request = $RequirementsRequest
                }
            }
        )
        passed_count             = 0
        failed_count             = 0
        needs_requirements_count = 1
        deferred_count           = 0
        requirements_request     = $RequirementsRequest
    }
    $sandboxReport | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $sandboxReportPath -Encoding UTF8
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

function Remove-JsonCodeFences {
    param([AllowNull()][string]$Text)
    return $Text
}

function Get-FirstJsonObjectText {
    param([AllowNull()][string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) { return $null }

    $start = $Text.IndexOf('{')
    if ($start -lt 0) { return $null }

    $segment = $Text.Substring($start)
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

function Test-ContainsMarkdownFence {
    param([AllowNull()][string]$Text)
    if ([string]::IsNullOrWhiteSpace($Text)) { return $false }
    return $Text.Contains('```')
}

function Test-ContainsMarkdownFenceInObject {
    param($Value)

    if ($null -eq $Value) { return $false }
    if ($Value -is [string]) { return $Value.Contains('```') }
    if ($Value -is [System.Collections.IDictionary]) {
        foreach ($k in $Value.Keys) {
            if (Test-ContainsMarkdownFenceInObject -Value $Value[$k]) { return $true }
        }
        return $false
    }
    if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) {
        foreach ($item in $Value) {
            if (Test-ContainsMarkdownFenceInObject -Value $item) { return $true }
        }
        return $false
    }

    $props = $Value.PSObject.Properties
    if ($props) {
        foreach ($prop in $props) {
            if (Test-ContainsMarkdownFenceInObject -Value $prop.Value) { return $true }
        }
    }
    return $false
}

function Resolve-EffectiveJobType {
    param([string]$GoalText, [string]$RequestedJobType)
    $raw = if ([string]::IsNullOrWhiteSpace($RequestedJobType)) { "build_new_app" } else { $RequestedJobType.Trim().ToLowerInvariant() }
    switch ($raw) {
        "create_new_app" { return "build_new_app" }
        "new_app" { return "build_new_app" }
        "maintenance" { return "maintain_existing_app" }
        default { return $raw }
    }
}

function Get-PositiveGoalContext {
    # Strip non-goals/negation context from goal text before keyword matching so
    # phrases like "do not create a web app" or "do not use React" cannot trigger
    # a false positive on the web detection branch. The stripping is conservative:
    # it only removes the suffix that begins at a recognized negation phrase, so
    # affirmative statements that come before it are preserved.
    param([AllowNull()][string]$GoalText)
    $goal = ($GoalText ?? "").ToLowerInvariant()
    return ($goal -replace '(?s)(non.?goals?|do not|don.t|avoid|exclude|without)\b.*', '')
}

function Resolve-AppTypeFromSpec {
    # Spec inference only — does not look at any caller-supplied value.
    # Returns "wpf", "web", or "unknown" (the correct fallback per CLAUDE.md).
    param([AllowNull()][string]$GoalText)
    $positive = Get-PositiveGoalContext -GoalText $GoalText
    if ($positive -match '\b(wpf|winforms|windows forms|xaml|desktop app|windows desktop|tkinter|pyqt|wxpython)\b') {
        return "wpf"
    }
    # Only strong, unambiguous "this is a web app" signals. Weak terms like
    # 'react', 'html', 'css', 'dom', and bare 'web' are intentionally excluded
    # because they appear in non-web contexts (React Native, HTML parsing,
    # CSS-like styling, XML DOM) and were producing false 'web' classifications
    # on desktop/CLI goals even after negation stripping.
    if ($positive -match '\b(website|webpage|webapp|web\s+app(?:lication)?|browser|next\.?js|vite|svelte\s*kit|frontend|spa|pwa|progressive\s+web\s+app)\b') {
        return "web"
    }
    return "unknown"
}

function Resolve-EffectiveAppType {
    param([string]$GoalText, [string]$RequestedAppType)
    # Concern (a): explicit caller-supplied value always wins (unchanged).
    if (-not [string]::IsNullOrWhiteSpace($RequestedAppType)) {
        return $RequestedAppType.Trim().ToLowerInvariant()
    }
    # Concern (b): infer from spec — see Resolve-AppTypeFromSpec.
    return Resolve-AppTypeFromSpec -GoalText $GoalText
}

# --- COMPOSABLE PROMPT BUILDER ---------------------------------------------
# Each guidance segment is a discrete function applied to a prompt-builder
# hashtable. Callers compose the segments they need; Get-AgentSystemPrompt
# wires them up in the canonical order. The parallel-execution path uses the
# same composed prompt (computed in the parent scope and passed into the
# work item) instead of duplicating segment logic inside the parallel block.

function New-PromptBuilder {
    return @{ segments = [System.Collections.Generic.List[string]]::new() }
}

function Add-PromptSegment {
    param(
        [Parameter(Mandatory = $true)][hashtable]$Builder,
        [AllowNull()][string]$Text
    )
    if (-not [string]::IsNullOrWhiteSpace($Text)) {
        $Builder.segments.Add($Text.Trim()) | Out-Null
    }
    return $Builder
}

function Build-PromptString {
    param([Parameter(Mandatory = $true)][hashtable]$Builder)
    return ($Builder.segments -join "`n`n")
}

function Add-BaseInstructionSegment {
    param([hashtable]$Builder, [AllowNull()][string]$BaseInstruction)
    return (Add-PromptSegment -Builder $Builder -Text $BaseInstruction)
}

function Add-AgentPromptSegment {
    param([hashtable]$Builder, [Parameter(Mandatory = $true)]$Agent)
    return (Add-PromptSegment -Builder $Builder -Text ([string]$Agent.prompt))
}

function Add-RawJsonRequirementSegment {
    # Applies to agents whose output_schema is strictly JSON.
    param([hashtable]$Builder, [Parameter(Mandatory = $true)]$Agent)
    if ($Agent.name -in @("ConceptualModelContract", "Engineer", "Critic")) {
        return (Add-PromptSegment -Builder $Builder -Text "Output contract JSON must be raw JSON only. Do not emit markdown, code fences, or prose.")
    }
    return $Builder
}

function Add-EngineerArtifactRulesSegment {
    # Canonical Engineer artifact rules. Text matches what Engineer has been
    # receiving in the parallel-execution path (richer than the historical
    # sequential text), so consolidating both code paths through this segment
    # does not change Engineer's actual prompt.
    param([hashtable]$Builder, [Parameter(Mandatory = $true)]$Agent)
    if ($Agent.name -ne "Engineer") { return $Builder }
    $text = @"
Artifacts field rules (CRITICAL):
- For build_new_app web goals, return a complete runnable project through artifacts[].
- Populate artifacts[] with one entry per source file to create.
- artifacts[].name: relative file path from the project root, e.g. package.json, index.html, src/main.tsx, src/App.tsx, src/styles.css, README.md.
- artifacts[].content: raw source code, config, or Markdown text only.
  DO NOT wrap content in backtick code fences.
  DO NOT use '--- filename ---' separators inside content.
  The content value must be exactly what should be written into the file.

JSON escape semantics for artifacts[].content (CRITICAL — repeated runs have failed on this):
- artifacts[].content is a JSON string. Every backslash you emit inside it is interpreted as a JSON escape.
- For a newline in the file, write a single backslash followed by n (`\n`). JSON decodes that into one newline byte.
- DO NOT write `\\n` to encode a newline. That decodes to a literal backslash followed by the letter n, which produces a one-line file with `\n` text in it — package.json will be invalid JSON and the install gate will skip.
- For a literal backslash in the file (rare — Windows paths, regex), write `\\`.
- For a literal `\n` characters in the file content (extremely rare), write `\\n`.
- Same rules for tabs (`\t`), carriage returns (`\r`), quotes (`\"`).
- When in doubt, write the smallest escape: `\n` for newline, `\"` for quote, `\\` for backslash. Anything more is wrong.
- artifacts[].type: optional string like 'code/typescript', 'code/tsx', 'config/json', or 'docs/markdown'.
- Honor the tech stack exactly as specified in the goal. If goal says Vite+React, output Vite files (vite.config.ts, src/main.tsx, index.html), NOT Next.js files (next.config.mjs, app/page.tsx).
- Every file listed in changes[] with action 'create' or 'modify' MUST have a matching artifacts[] entry.
"@
    return (Add-PromptSegment -Builder $Builder -Text $text)
}

function Add-CmcGuidanceSegment {
    # ConceptualModelContract-specific guidance based on job and app type.
    param(
        [hashtable]$Builder,
        [Parameter(Mandatory = $true)]$Agent,
        [string]$EffectiveAppType,
        [string]$EffectiveJobType
    )
    if ($Agent.name -ne "ConceptualModelContract") { return $Builder }
    if ($EffectiveJobType -eq "build_new_app") {
        $Builder = Add-PromptSegment -Builder $Builder -Text "For create-new-app goals, treat an Original user request, Required features, mechanics list, expected outputs, and acceptance criteria as sufficient requirements. Do not request clarification by restating those same categories. Extract the supplied details into the runtime contract unless there is a true contradiction."
    }
    if ($EffectiveAppType -eq "wpf") {
        $Builder = Add-PromptSegment -Builder $Builder -Text "App type is WPF desktop. Do not produce DOM/web probes. Use WPF-observable probes (named controls, bound state values, visual tree state, render loop counters)."
    }
    elseif ($EffectiveAppType -eq "web") {
        $Builder = Add-PromptSegment -Builder $Builder -Text "App type is web. DOM/SVG/canvas probes are allowed and should be machine-verifiable."
    }
    return $Builder
}

function Add-CmcSchemaTemplateSegment {
    # Bake the literal expected-shape template into ConceptualModelContract's
    # system prompt so the model sees the contract on its first attempt
    # instead of being told a schema exists, guessing, and getting repaired
    # against an error message. Reuses Get-AgentSchemaTemplate so the
    # checkpoint UI and the agent prompt stay in sync from one source.
    param(
        [hashtable]$Builder,
        [Parameter(Mandatory = $true)]$Agent
    )
    if ($Agent.name -ne "ConceptualModelContract") { return $Builder }
    $template = Get-AgentSchemaTemplate -AgentName $Agent.name
    if ([string]::IsNullOrWhiteSpace($template)) { return $Builder }
    $segment = @"
Required output shape (your JSON MUST match this exactly):

$template

Field rules:
- "interpretation" is a single string of plain prose. It is NOT an object or array.
- "representation" MUST be one of these exact enum values: canvas, svg, dom-graphics, chart, simulation. Pick using this guide:
    * canvas       -> canvas-based rendering (lightweight-charts, Chart.js, candlestick charts, 2D game canvas, WebGL)
    * svg          -> SVG-based visualizations (D3, custom SVG, scalable vector UI)
    * dom-graphics -> mostly HTML/CSS layout with light visual elements (dashboards, list/detail UIs, forms)
    * chart        -> generic charting component when the library is undetermined
    * simulation   -> animated worlds, physics, particle systems, or continuously updating scenes
  "web", "html", "react", "next", and other framework names are NOT valid values for "representation".
- "objects", "interactions", "dynamics", "data", "acceptance_tests" are arrays of structured objects matching the inner shapes shown. Do NOT collapse them into prose strings.
- "non_goals" is an array of strings.
- Do not invent additional top-level fields. Do not wrap the response in another object such as orchestration_plan, agent_assignments, or acceptance_gates -- those belong to other agents.
"@
    return (Add-PromptSegment -Builder $Builder -Text $segment)
}

function Add-MaintenanceOutOfScopeSegment {
    # On build_new_app runs, tell maintenance-only agents to treat their
    # gating concerns as out of scope.
    param(
        [hashtable]$Builder,
        [Parameter(Mandatory = $true)]$Agent,
        [string]$EffectiveJobType
    )
    if ($EffectiveJobType -eq "build_new_app" -and $Agent.name -in @("ReviewGate", "PRPublisher", "RepoContextBuilder")) {
        return (Add-PromptSegment -Builder $Builder -Text "This is a create-new-app run. Maintenance-only gating is out of scope for this run.")
    }
    return $Builder
}

function Get-PofPhasePlan {
    # Declarative phase plan. Each entry describes one dispatch phase as data:
    #   - Name             : human-readable phase label
    #   - Handler          : strategy identifier (used by future plan-driven
    #                        dispatch; current pipeline body still inlines the
    #                        per-phase logic)
    #   - ExecutionMode    : "Sequential" or "Parallel"
    #   - Agents           : array of agent definitions to dispatch in this phase
    #   - MaintenanceOnly  : if $true, phase only fires when job_type is
    #                        maintain_existing_app; otherwise agents are
    #                        marked "skipped" with reason "maintenance_only"
    #   - CanBlock         : whether this phase may halt the run with a
    #                        requirements clarification blocker. Only Contract
    #                        is allowed to block.
    #   - ClarificationGate: when CanBlock is $true, declares the gate's
    #                        Behavior ("Advisory" for build_new_app —
    #                        clarification is logged and the run continues;
    #                        "Halt" otherwise — clarification stops the run).
    #                        Gate behavior is fixed at plan-construction time
    #                        from job_type rather than re-derived inside the
    #                        execution loop.
    param(
        [Parameter(Mandatory = $true)][array]$Agents,
        [Parameter(Mandatory = $true)][string]$EffectiveJobType
    )

    $clarificationBehavior = if ($EffectiveJobType -eq "build_new_app") { "Advisory" } else { "Halt" }

    $reservedContributorExclusions = @(
        "Commissioner", "Synthesizer", "ValidationAuditor", "Supervisor",
        "Historian", "ConceptualModelContract", "RepoContextBuilder",
        "ReviewGate", "PRPublisher"
    )

    $byName = @{}
    foreach ($a in $Agents) { if ($a -and $a.name) { $byName[[string]$a.name] = $a } }
    function _pick { param([hashtable]$Map, [string[]]$Names)
        @($Names | ForEach-Object { if ($Map.ContainsKey($_)) { $Map[$_] } } | Where-Object { $_ })
    }

    return @(
        [PSCustomObject]@{
            Name = "Pre/RepoContext"; Handler = "MaintenanceRepoContext"
            ExecutionMode = "Sequential"
            Agents = (_pick $byName @("RepoContextBuilder"))
            MaintenanceOnly = $true; CanBlock = $false; ClarificationGate = $null
        },
        [PSCustomObject]@{
            Name = "Pre/MaintenanceFallback"; Handler = "MaintenanceFallback"
            ExecutionMode = "Sequential"
            Agents = (_pick $byName @("ReviewGate", "PRPublisher"))
            MaintenanceOnly = $true; CanBlock = $false; ClarificationGate = $null
        },
        [PSCustomObject]@{
            Name = "Contract"; Handler = "Contract"
            ExecutionMode = "Sequential"
            Agents = (_pick $byName @("ConceptualModelContract"))
            MaintenanceOnly = $false; CanBlock = $true
            ClarificationGate = [PSCustomObject]@{ Behavior = $clarificationBehavior }
        },
        [PSCustomObject]@{
            Name = "Contributors"; Handler = "ParallelContributors"
            ExecutionMode = "Parallel"
            Agents = @($Agents | Where-Object { $_ -and $_.name -and $_.name -notin $reservedContributorExclusions })
            MaintenanceOnly = $false; CanBlock = $false; ClarificationGate = $null
        },
        [PSCustomObject]@{
            Name = "Synthesis"; Handler = "StandardSequential"
            ExecutionMode = "Sequential"
            Agents = (_pick $byName @("Synthesizer"))
            MaintenanceOnly = $false; CanBlock = $false; ClarificationGate = $null
        },
        [PSCustomObject]@{
            Name = "Validation"; Handler = "AuditSequential"
            ExecutionMode = "Sequential"
            Agents = (_pick $byName @("ValidationAuditor"))
            MaintenanceOnly = $false; CanBlock = $false; ClarificationGate = $null
        },
        [PSCustomObject]@{
            Name = "Evaluation"; Handler = "Commissioner"
            ExecutionMode = "Sequential"
            Agents = (_pick $byName @("Commissioner"))
            MaintenanceOnly = $false; CanBlock = $false; ClarificationGate = $null
        },
        [PSCustomObject]@{
            Name = "Supervision"; Handler = "AggregateSequential"
            ExecutionMode = "Sequential"
            Agents = (_pick $byName @("Supervisor"))
            MaintenanceOnly = $false; CanBlock = $false; ClarificationGate = $null
        },
        [PSCustomObject]@{
            Name = "History"; Handler = "AggregateSequential"
            ExecutionMode = "Sequential"
            Agents = (_pick $byName @("Historian"))
            MaintenanceOnly = $false; CanBlock = $false; ClarificationGate = $null
        }
    )
}

function Get-AgentSystemPrompt {
    # Canonical assembly of an agent's system prompt. Used by both sequential
    # and parallel execution paths so the prompt is identical regardless of
    # how the agent is dispatched.
    param(
        [Parameter(Mandatory = $true)]$Agent,
        [string]$BaseInstruction,
        [string]$EffectiveAppType,
        [string]$EffectiveJobType
    )
    $b = New-PromptBuilder
    $b = Add-BaseInstructionSegment       -Builder $b -BaseInstruction $BaseInstruction
    $b = Add-AgentPromptSegment           -Builder $b -Agent $Agent
    $b = Add-RawJsonRequirementSegment    -Builder $b -Agent $Agent
    $b = Add-EngineerArtifactRulesSegment -Builder $b -Agent $Agent
    $b = Add-CmcGuidanceSegment           -Builder $b -Agent $Agent -EffectiveAppType $EffectiveAppType -EffectiveJobType $EffectiveJobType
    $b = Add-CmcSchemaTemplateSegment     -Builder $b -Agent $Agent
    $b = Add-MaintenanceOutOfScopeSegment -Builder $b -Agent $Agent -EffectiveJobType $EffectiveJobType
    return Build-PromptString -Builder $b
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
            ok     = $true
            error  = $null
            parsed = $normalizedObject
            json   = ($normalizedObject | ConvertTo-Json -Depth 80)
        }
    }

    $text = [string]$RawOutput
    if ([string]::IsNullOrWhiteSpace($text)) {
        return @{ ok = $false; error = "Output is empty."; parsed = $null; json = $null }
    }

    if (Test-ContainsMarkdownFence -Text $text) {
        return @{
            ok     = $false
            error  = "Output includes markdown/code fences. Emit raw JSON only."
            parsed = $null
            json   = $null
        }
    }

    $candidate = $text.Trim()
    $parsed = $null

    try {
        $parsed = $candidate | ConvertFrom-Json -Depth 80 -ErrorAction Stop
    }
    catch {
        return @{
            ok     = $false
            error  = ("Output is not valid strict JSON: {0}" -f $_.Exception.Message)
            parsed = $null
            json   = $null
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

    if (Test-ContainsMarkdownFenceInObject -Value $parsed) {
        return @{
            ok     = $false
            error  = "Output JSON includes markdown/code fences within string fields."
            parsed = $null
            json   = $null
        }
    }

    $normalized = Normalize-AgentContractObject -AgentName $AgentName -Object $parsed
    return @{
        ok     = $true
        error  = $null
        parsed = $normalized
        json   = ($normalized | ConvertTo-Json -Depth 80)
    }
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
    $normalized = ConvertTo-NormalizedAgentJson -RawOutput $RawOutput -AgentName $AgentName
    if (-not $normalized.ok) {
        $msg = $normalized.error
        return @{ ok = $false; error = $msg; errors = @($msg); schema = $schema; normalized_json = $null }
    }

    $parsed = $normalized.parsed

    # If the agent output is a clarification_request, treat it as a valid bypass:
    # the agent is signalling that its inputs are insufficient to proceed.
    $propNames = @($parsed.PSObject.Properties.Name)
    if ($propNames.Count -eq 1 -and $propNames[0] -eq "clarification_request") {
        $clarificationText = $parsed.clarification_request
        if (-not [string]::IsNullOrWhiteSpace($clarificationText)) {
            Write-Log -Agent $AgentName -Content "Clarification requested: $clarificationText"
            return @{
                ok                   = $true
                error                = $null
                errors               = @()
                schema               = $schema
                normalized_json      = $normalized.json
                clarification_needed = $true
                clarification_text   = $clarificationText
            }
        }
    }

    try {
        $schemaJson = $schema | ConvertTo-Json -Depth 60
        $null = Test-Json -Json $normalized.json -Schema $schemaJson -ErrorAction Stop
    }
    catch {
        $msg = "Output does not match output_schema: $($_.Exception.Message)"
        return @{ ok = $false; error = $msg; errors = @($msg); schema = $schema; normalized_json = $normalized.json }
    }

    return @{ ok = $true; error = $null; errors = @(); schema = $schema; normalized_json = $normalized.json }
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
        schema_version            = "1.0"
        run_id                    = $RunId
        agent                     = $AgentName
        timestamp_utc             = (Get-Date).ToUniversalTime().ToString("o")
        initial_validation_errors = @($InitialErrors)
        repair_validation_errors  = @($RepairErrors)
        schema                    = $Schema
        raw_output                = $RawOutput
        repaired_output           = $RepairedOutput
    }

    $payload | ConvertTo-Json -Depth 80 | Set-Content -LiteralPath $path -Encoding UTF8
    return $path
}

function Get-ContractRepairMaxAttempts {
    # Configurable retry budget for contract repair. Default is 3 (covers the
    # most common pattern: attempt 1 misses shape, attempt 2 misses an enum,
    # attempt 3 nails it once the model has both prior failures + the schema
    # template in context). Capped at 5 to bound worst-case cost.
    $value = 3
    if (-not [string]::IsNullOrWhiteSpace($env:POF_CONTRACT_REPAIR_MAX_ATTEMPTS)) {
        $parsed = 0
        if ([int]::TryParse($env:POF_CONTRACT_REPAIR_MAX_ATTEMPTS, [ref]$parsed) -and $parsed -ge 1) {
            $value = [Math]::Min($parsed, 5)
        }
    }
    return $value
}

function Build-ContractRepairPrompt {
    # Pure prompt builder for a single contract-repair attempt. Each attempt
    # gets progressively richer context: attempt 1 = schema + errors; attempt
    # 2 = + prior-attempt history; attempt 3+ = + few-shot schema template +
    # final-attempt framing. Pure (no I/O) so it is unit-testable in isolation.
    param(
        [Parameter(Mandatory = $true)][int]$AttemptNumber,
        [Parameter(Mandatory = $true)][int]$MaxAttempts,
        [Parameter(Mandatory = $true)][string]$AgentName,
        [Parameter(Mandatory = $true)]$Schema,
        [Parameter(Mandatory = $true)][array]$CurrentErrors,
        [Parameter(Mandatory = $true)][string]$PreviousOutput,
        [Parameter(Mandatory = $true)][string]$UserPrompt,
        [array]$AttemptHistory = @(),
        [AllowNull()][string]$SchemaTemplate = $null
    )

    $schemaJson = $Schema | ConvertTo-Json -Depth 60
    $errorsText = ($CurrentErrors | ForEach-Object { "- $_" }) -join "`n"

    $stageGuidance = switch ($true) {
        ($AttemptNumber -eq 1) {
            "This is repair attempt 1 of ${MaxAttempts}. Fix the validation errors below by returning a corrected JSON document."
            break
        }
        ($AttemptNumber -eq $MaxAttempts) {
@"
This is repair attempt $AttemptNumber of $MaxAttempts (FINAL ATTEMPT). After this the run will halt.

Common failure patterns to avoid:
- A "string" field MUST be a string, not an object or array.
- "enum" fields MUST be one of the exact allowed values listed in the schema (case-sensitive).
- Required fields at every nesting level MUST be present.
- Do not invent new top-level keys. Do not wrap your response in another object.

If the task genuinely cannot be satisfied under this schema, prefer a minimal-but-valid response over another type-mismatched one.
"@
            break
        }
        default {
@"
This is repair attempt $AttemptNumber of $MaxAttempts. Your previous repair attempt also failed.

Pay close attention to:
- Field types: a "string" field must be a string, not an object or array.
- Enum values: must be an exact, case-sensitive match to one of the values listed in the schema.
- Required fields at every nesting level must be present.
- Do not invent new top-level keys.
"@
        }
    }

    $historyText = ""
    if ($AttemptHistory -and $AttemptHistory.Count -gt 0) {
        $historyLines = @()
        foreach ($entry in $AttemptHistory) {
            $errs = if ($entry.errors -and $entry.errors.Count -gt 0) {
                ($entry.errors | Select-Object -First 3 | ForEach-Object { [string]$_ }) -join '; '
            } else { [string]$entry.error }
            $historyLines += "  Attempt $($entry.attempt): $errs"
        }
        $historyText = "`nPrior repair attempts (oldest first):`n" + ($historyLines -join "`n") + "`n"
    }

    $templateSection = ""
    if ($AttemptNumber -ge 2 -and -not [string]::IsNullOrWhiteSpace($SchemaTemplate)) {
        $templateSection = @"

Example shape (placeholder values; replace with content matching the task):
$SchemaTemplate
"@
    }

    return @"
$stageGuidance

JSON Schema:
$schemaJson
$templateSection
Validation errors (current attempt):
$errorsText
$historyText
Original task:
$UserPrompt

Most recent invalid output:
$PreviousOutput

Return ONLY valid JSON (no markdown, no code fences).
"@
}

function Resolve-AgentOutputWithContract {
    param(
        [Parameter(Mandatory = $true)][string]$AgentName,
        [Parameter(Mandatory = $true)][string]$Output,
        [Parameter(Mandatory = $true)][string]$SystemPrompt,
        [Parameter(Mandatory = $true)][string]$UserPrompt
    )

    $check = Assert-AgentContractOutput -AgentName $AgentName -RawOutput $Output
    $checkClarificationNeeded = $check.ContainsKey('clarification_needed') -and [bool]$check['clarification_needed']
    $checkClarificationText = if ($check.ContainsKey('clarification_text')) { [string]$check['clarification_text'] } else { $null }
    if ($check.ok) {
        return @{
            Output              = $(if ($check.normalized_json) { $check.normalized_json } else { $Output })
            ContractOk          = $true
            ContractError       = $null
            RepairAttempted     = $false
            RepairSucceeded     = $false
            FailureArtifact     = $null
            ClarificationNeeded = $checkClarificationNeeded
            ClarificationText   = $checkClarificationText
        }
    }

    $maxAttempts = Get-ContractRepairMaxAttempts
    Write-Host "⚠️ Contract validation failed for ${AgentName}: $($check.error). Entering repair loop (max $maxAttempts attempts)." -ForegroundColor Yellow

    $schemaTemplate = Get-AgentSchemaTemplate -AgentName $AgentName

    # Carry state across attempts so each retry is materially smarter than the last.
    $initialErrors   = @($check.errors)
    $currentErrors   = @($check.errors)
    $previousOutput  = if ($check.normalized_json) { [string]$check.normalized_json } else { $Output }
    $attemptHistory  = @()
    $recheck         = $null
    $repaired        = $null

    for ($attemptNum = 1; $attemptNum -le $maxAttempts; $attemptNum++) {
        $repairPrompt = Build-ContractRepairPrompt `
            -AttemptNumber $attemptNum `
            -MaxAttempts $maxAttempts `
            -AgentName $AgentName `
            -Schema $check.schema `
            -CurrentErrors $currentErrors `
            -PreviousOutput $previousOutput `
            -UserPrompt $UserPrompt `
            -AttemptHistory $attemptHistory `
            -SchemaTemplate $schemaTemplate

        $repairMessages = @(
            @{ role = "system"; content = $SystemPrompt },
            @{ role = "user"; content = $repairPrompt }
        )
        $repaired = Invoke-OpenAIRequest -Messages $repairMessages -AgentName $AgentName

        if (-not $repaired) {
            $errMsg = "Repair model returned no output."
            $attemptHistory += @{ attempt = $attemptNum; error = $errMsg; errors = @($errMsg) }
            $currentErrors = @($errMsg)
            try {
                Write-PofEvent `
                    -Type "contract:repair_attempt_failed" `
                    -Message "$AgentName repair attempt $attemptNum/$maxAttempts produced no output." `
                    -Stage "agent_activity" `
                    -Data @{ agent = $AgentName; attempt = $attemptNum; max_attempts = $maxAttempts; reason = $errMsg }
            } catch { }
            continue
        }

        $recheck = Assert-AgentContractOutput -AgentName $AgentName -RawOutput $repaired
        if ($recheck.ok) {
            $recheckClarificationNeeded = $recheck.ContainsKey('clarification_needed') -and [bool]$recheck['clarification_needed']
            $recheckClarificationText   = if ($recheck.ContainsKey('clarification_text')) { [string]$recheck['clarification_text'] } else { $null }

            Write-Host "✅ Contract repair succeeded for $AgentName on attempt $attemptNum/$maxAttempts" -ForegroundColor Green

            $rawPreview = if ($Output) {
                $previewSource = [string]$Output
                if ($previewSource.Length -gt 400) { $previewSource.Substring(0, 400) + "..." } else { $previewSource }
            } else { $null }
            $initialErrorsSlice = @($initialErrors | Select-Object -First 10 | ForEach-Object { [string]$_ })
            try {
                Write-PofEvent `
                    -Type "contract:repair" `
                    -Message "$AgentName output failed contract validation and was auto-repaired on attempt $attemptNum/$maxAttempts." `
                    -Stage "agent_activity" `
                    -Data @{
                        agent              = $AgentName
                        repair_attempted   = $true
                        repair_succeeded   = $true
                        attempts_used      = $attemptNum
                        max_attempts       = $maxAttempts
                        initial_error      = [string]$check.error
                        initial_errors     = $initialErrorsSlice
                        raw_output_preview = $rawPreview
                    }
            } catch {
                Write-Host "⚠️ Failed to emit contract:repair event for ${AgentName}: $_" -ForegroundColor Yellow
            }

            Write-AgentStatus -Agent $AgentName -Status "working" -ExtraData @{
                contract_repair_attempted = $true
                contract_repair_succeeded = $true
                contract_repair_attempts  = $attemptNum
                contract_initial_error    = [string]$check.error
            }

            return @{
                Output              = $(if ($recheck.normalized_json) { $recheck.normalized_json } else { $repaired })
                ContractOk          = $true
                ContractError       = $null
                RepairAttempted     = $true
                RepairSucceeded     = $true
                AttemptsUsed        = $attemptNum
                FailureArtifact     = $null
                ClarificationNeeded = $recheckClarificationNeeded
                ClarificationText   = $recheckClarificationText
            }
        }

        # This attempt failed; record history and prepare for the next attempt.
        $errSlice = @($recheck.errors | Select-Object -First 5 | ForEach-Object { [string]$_ })
        $attemptHistory += @{ attempt = $attemptNum; errors = $errSlice }
        $currentErrors  = @($recheck.errors)
        $previousOutput = if ($recheck.normalized_json) { [string]$recheck.normalized_json } else { $repaired }

        try {
            Write-PofEvent `
                -Type "contract:repair_attempt_failed" `
                -Message "$AgentName repair attempt $attemptNum/$maxAttempts failed validation." `
                -Stage "agent_activity" `
                -Data @{
                    agent          = $AgentName
                    attempt        = $attemptNum
                    max_attempts   = $maxAttempts
                    attempt_errors = $errSlice
                }
        } catch { }
    }

    # All attempts exhausted. Write the failure artifact with full history and throw.
    $finalErrors = @($currentErrors | ForEach-Object { [string]$_ })
    $artifact = Write-ContractFailureArtifact `
        -AgentName $AgentName `
        -Schema $check.schema `
        -InitialErrors $initialErrors `
        -RawOutput $Output `
        -RepairedOutput $previousOutput `
        -RepairErrors $finalErrors
    Write-AgentStatus -Agent $AgentName -Status "error" -ExtraData @{
        contract_error            = ($finalErrors -join "; ")
        contract_failure_artifact = $artifact
        contract_repair_attempts  = $maxAttempts
        contract_repair_succeeded = $false
    }
    throw "Contract validation failed for $AgentName after $maxAttempts repair attempts. Artifact: $artifact"
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
        }
        catch {
            # Ignore invalid tool requests; commissioner still provides a score
        }
    }
    return , $requests
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
    }
    else {
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

function New-MaintenanceFallbackOutput {
    param(
        [Parameter(Mandatory = $true)][string]$AgentName,
        [Parameter(Mandatory = $true)][string]$Reason
    )

    switch ($AgentName) {
        "RepoContextBuilder" {
            return @{
                schema_version = "1.0"
                status         = "insufficient_input"
                missing_inputs = @(
                    "repo_path OR repo snapshot",
                    "orchestration log tail",
                    "failing command output"
                )
                errors         = @($Reason)
                repo           = @{}
                discovery      = @{
                    warnings     = @($Reason)
                    policy_hooks = @{}
                }
                baseline       = @{
                    attempted = $false
                    warnings  = @($Reason)
                }
            } | ConvertTo-Json -Depth 20
        }
        "ReviewGate" {
            return @{
                status   = "error"
                errors   = @($Reason)
                warnings = @(
                    "Run maintenance mode with -JobType maintain_existing_app and -ContractPath/-RequestPath."
                )
            } | ConvertTo-Json -Depth 20
        }
        "PRPublisher" {
            return @{
                schema_version = "1.0"
                run_id         = $RunId
                status         = "failed"
                draft          = $true
                errors         = @($Reason)
            } | ConvertTo-Json -Depth 20
        }
        default {
            return @{
                status = "error"
                errors = @($Reason)
            } | ConvertTo-Json -Depth 20
        }
    }
}

function Invoke-DeterministicRepoContextBuilder {
    $builderPath = Join-Path $Script:ToolboxRoot "supervisor\repo_context_builder.ps1"
    if (-not (Test-Path -LiteralPath $builderPath)) {
        throw "repo_context_builder.ps1 not found at $builderPath"
    }

    . $builderPath
    $result = Invoke-RepoContextBuilder -RepoRoot $Script:ToolboxRoot -OutputDir $OutDir
    if (-not $result -or -not $result.RepoContextPath -or -not (Test-Path -LiteralPath $result.RepoContextPath)) {
        throw "RepoContextBuilder did not produce repo_context.json"
    }
    return Get-Content -Raw -LiteralPath $result.RepoContextPath
}

function Get-ObservedGoalEvidence {
    param(
        [string]$GoalText,
        [int]$PreviewMax = 300
    )
    $len = if ($null -eq $GoalText) { 0 } else { $GoalText.Length }
    $preview = if ($len -le $PreviewMax) { $GoalText } else { $GoalText.Substring(0, $PreviewMax) }
    return @{
        observedGoalLength  = $len
        observedGoalPreview = $preview
    }
}

# --- MAIN ORCHESTRATION LOOP -----------------------------------------------
# Test-mode guard: when POF_LOAD_ONLY is set, callers can dot-source POF.ps1 to
# load its function definitions without firing the orchestration loop. This is
# used by Pester characterization tests so pure functions can be exercised
# without an OpenAI API key or live network calls.
if (-not $env:POF_LOAD_ONLY) {
$script:PofTerminalError = $null
try {
    $EffectiveJobType = Resolve-EffectiveJobType -GoalText $Goal -RequestedJobType $JobType
    $EffectiveAppType = Resolve-EffectiveAppType -GoalText $Goal -RequestedAppType $AppType
    $IsMaintenanceRun = $EffectiveJobType -eq "maintain_existing_app"
    Update-PofRunState -Status "running" -CurrentStage "agent_activity"
    Write-PofEvent -Type "status" -Message "running" -Stage "agent_activity"

    Write-Host "JobType: $EffectiveJobType | AppType: $EffectiveAppType" -ForegroundColor DarkCyan

    $Context = "Goal: $Goal"
    $Context += "`nJobType: $EffectiveJobType"
    $Context += "`nAppType: $EffectiveAppType"
    $Script:SwarmsInvocations = 0

    for ($i = 1; $i -le $MaxIterations; $i++) {
        Write-Host "`nIteration $i/$MaxIterations" -ForegroundColor Yellow

        # --- Agent Pipeline -------------------------------------------------
        # Agent partitioning and gate behavior come from a declarative plan
        # (Get-PofPhasePlan) so phase definitions live as data, not as a
        # cascade of Where-Object filters inline here.
        $Plan = Get-PofPhasePlan -Agents $Agents -EffectiveJobType $EffectiveJobType
        $PlanByName = @{}
        foreach ($p in $Plan) { $PlanByName[$p.Name] = $p }

        $repoContextAgents          = @($PlanByName['Pre/RepoContext'].Agents)
        $maintenanceFallbackAgents  = @($PlanByName['Pre/MaintenanceFallback'].Agents)
        $ContractAgents             = @($PlanByName['Contract'].Agents)
        $ContractClarificationGate  = $PlanByName['Contract'].ClarificationGate
        $Phase1Agents               = @($PlanByName['Contributors'].Agents)
        $Synthesizer                = @($PlanByName['Synthesis'].Agents)
        $ValidationAuditor          = @($PlanByName['Validation'].Agents)
        $Commissioner               = @($PlanByName['Evaluation'].Agents)
        $Supervisor                 = @($PlanByName['Supervision'].Agents)
        $Historian                  = @($PlanByName['History'].Agents)

        # Track per-iteration outputs by agent name for downstream Supervisor/Historian inputs.
        $AgentOutputs = @{}
        $requirementsBlocker = $null

        foreach ($rcb in $repoContextAgents) {
            if (-not $IsMaintenanceRun) {
                Write-AgentStatus -Agent $rcb.name -Status "complete" -ExtraData @{ source = "skipped"; reason = "maintenance_only"; job_type = $EffectiveJobType }
                continue
            }
            Write-AgentStatus -Agent $rcb.name -Status "working"
            $systemPrompt = Get-AgentSystemPrompt -Agent $rcb -BaseInstruction $Instruction -EffectiveAppType $EffectiveAppType -EffectiveJobType $EffectiveJobType
            $userPrompt = $Context

            try {
                $repoContextOutput = Invoke-DeterministicRepoContextBuilder
                $validated = Resolve-AgentOutputWithContract `
                    -AgentName $rcb.name `
                    -Output $repoContextOutput `
                    -SystemPrompt $systemPrompt `
                    -UserPrompt $userPrompt

                $finalOutput = [string]$validated.Output
                Write-Log -Agent $rcb.name -Content $finalOutput
                Write-AgentStatus -Agent $rcb.name -Status "complete" -ExtraData @{ source = "deterministic" }
                $Context += "`n`n[$($rcb.name) Output]:`n$finalOutput"
                $AgentOutputs[$rcb.name] = $finalOutput
            }
            catch {
                $reason = "Repo context unavailable: $($_.Exception.Message)"
                $fallbackOutput = New-MaintenanceFallbackOutput -AgentName $rcb.name -Reason $reason
                $validated = Resolve-AgentOutputWithContract `
                    -AgentName $rcb.name `
                    -Output $fallbackOutput `
                    -SystemPrompt $systemPrompt `
                    -UserPrompt $userPrompt
                $finalOutput = [string]$validated.Output
                Write-Log -Agent $rcb.name -Content $finalOutput
                Write-AgentStatus -Agent $rcb.name -Status "complete" -ExtraData @{ source = "fallback"; warning = $reason }
                $Context += "`n`n[$($rcb.name) Output]:`n$finalOutput"
                $AgentOutputs[$rcb.name] = $finalOutput
            }
        }

        foreach ($maintenanceAgent in $maintenanceFallbackAgents) {
            if (-not $IsMaintenanceRun) {
                Write-AgentStatus -Agent $maintenanceAgent.name -Status "complete" -ExtraData @{ source = "skipped"; reason = "maintenance_only"; job_type = $EffectiveJobType }
                continue
            }
            Write-AgentStatus -Agent $maintenanceAgent.name -Status "working"
            $systemPrompt = Get-AgentSystemPrompt -Agent $maintenanceAgent -BaseInstruction $Instruction -EffectiveAppType $EffectiveAppType -EffectiveJobType $EffectiveJobType
            $userPrompt = $Context
            $reason = "insufficient_input: maintenance contract context is required."
            $fallbackOutput = New-MaintenanceFallbackOutput -AgentName $maintenanceAgent.name -Reason $reason
            $validated = Resolve-AgentOutputWithContract `
                -AgentName $maintenanceAgent.name `
                -Output $fallbackOutput `
                -SystemPrompt $systemPrompt `
                -UserPrompt $userPrompt
            $finalOutput = [string]$validated.Output
            Write-Log -Agent $maintenanceAgent.name -Content $finalOutput
            Write-AgentStatus -Agent $maintenanceAgent.name -Status "complete" -ExtraData @{ source = "fallback"; warning = $reason }
            $Context += "`n`n[$($maintenanceAgent.name) Output]:`n$finalOutput"
            $AgentOutputs[$maintenanceAgent.name] = $finalOutput
        }

        foreach ($ContractAgent in $ContractAgents) {
            Write-AgentStatus -Agent $ContractAgent.name -Status "working"

            $systemPrompt = Get-AgentSystemPrompt -Agent $ContractAgent -BaseInstruction $Instruction -EffectiveAppType $EffectiveAppType -EffectiveJobType $EffectiveJobType
            $Messages = @(
                @{ role = "system"; content = $systemPrompt },
                @{ role = "user"; content = $Context }
            )

            $Output = Invoke-OpenAIRequest -Messages $Messages -AgentName $ContractAgent.name
            if (-not $Output) {
                Write-AgentStatus -Agent $ContractAgent.name -Status "error"
                throw "ConceptualModelContract returned no output. Cannot continue without a validated contract."
            }

            $validated = Resolve-AgentOutputWithContract `
                -AgentName $ContractAgent.name `
                -Output $Output `
                -SystemPrompt $systemPrompt `
                -UserPrompt $Context

            $finalOutput = [string]$validated.Output
            Write-Log -Agent $ContractAgent.name -Content $finalOutput
            $AgentOutputs[$ContractAgent.name] = $finalOutput

            ### BEGIN: Advisory ConceptualModelContract Clarifications For App Builds
            # Gate behavior was fixed at plan-construction time from job_type
            # (see Get-PofPhasePlan). Read it here instead of re-deriving the
            # conditional inline; this is the first-class-gate boundary.
            $TreatClarificationAsAdvisory = (
                $ContractAgent.name -eq "ConceptualModelContract" -and
                $ContractClarificationGate -and
                $ContractClarificationGate.Behavior -eq "Advisory"
            )

            if ($validated.ClarificationNeeded -and $TreatClarificationAsAdvisory) {
                Write-Warning "ConceptualModelContract requested clarification, but this is build_new_app. Treating requirements request as advisory and continuing."

                $advisoryRequirementsRequest = New-RequirementsRequestPacket `
                    -Question $validated.ClarificationText `
                    -AgentName $ContractAgent.name

                Write-AgentStatus -Agent $ContractAgent.name -Status "complete" -ExtraData @{
                    clarification_advisory = $true
                    clarification_text     = $validated.ClarificationText
                    requirements_request   = $advisoryRequirementsRequest
                }

                $Context += "`n`n[$($ContractAgent.name) Advisory Clarification Ignored]:`n$($advisoryRequirementsRequest | ConvertTo-Json -Depth 20)"
                continue
            }

            ### END: Advisory ConceptualModelContract Clarifications For App Builds
            if ($validated.ClarificationNeeded) {
                $requirementsRequest = New-RequirementsRequestPacket -Question $validated.ClarificationText -AgentName $ContractAgent.name
                $checkpointRecord = New-PofRequirementsCheckpointRecord `
                    -AgentName $ContractAgent.name `
                    -Question $validated.ClarificationText `
                    -RequirementsRequest $requirementsRequest

                $goalEvidence = Get-ObservedGoalEvidence -GoalText $Goal
                Write-AgentStatus -Agent $ContractAgent.name -Status "blocked_requirements" -ExtraData @{
                    reason               = "clarification_request"
                    clarification_text   = $validated.ClarificationText
                    checkpoint           = $true
                    checkpoint_id        = $checkpointRecord.checkpoint_id
                    question             = $validated.ClarificationText
                    options              = $checkpointRecord.options
                    default              = $checkpointRecord.default_option
                    requirements_request = $requirementsRequest
                    observedGoalLength   = $goalEvidence.observedGoalLength
                    observedGoalPreview  = $goalEvidence.observedGoalPreview
                }
                Write-PofRequirementsCheckpointArtifacts `
                    -AgentName $ContractAgent.name `
                    -Question $validated.ClarificationText `
                    -RequirementsRequest $requirementsRequest `
                    -CheckpointRecord $checkpointRecord
                Update-PofRunState `
                    -Status "blocked_requirements" `
                    -CurrentStage "checkpoint" `
                    -RequirementsRequest $requirementsRequest `
                    -Warnings @("$($ContractAgent.name) requested clarification before implementation could continue.") `
                    -Complete
                Write-PofEvent `
                    -Type "checkpoint:pending" `
                    -Message "$($ContractAgent.name) requested clarification before implementation could continue." `
                    -Stage "checkpoint" `
                    -Data @{
                    agent                = $ContractAgent.name
                    checkpoint_id        = $checkpointRecord.checkpoint_id
                    clarification_text   = $validated.ClarificationText
                    requirements_request = $requirementsRequest
                }

                $requirementsBlocker = @{
                    AgentName           = $ContractAgent.name
                    ClarificationText   = $validated.ClarificationText
                    RequirementsRequest = $requirementsRequest
                    CheckpointRecord    = $checkpointRecord
                }
                break
            }

            Write-AgentStatus -Agent $ContractAgent.name -Status "complete"
            $Context += "`n`n[$($ContractAgent.name) Output]:`n$finalOutput"
        }

        if ($requirementsBlocker) {
            Write-Host "⚠️ Requirements clarification needed from $($requirementsBlocker.AgentName). Pausing orchestration before downstream agents start." -ForegroundColor Yellow
            $Context += "`n`n[Requirements Request]:`n$($requirementsBlocker.RequirementsRequest | ConvertTo-Json -Depth 20)"
            break
        }

        # --- Prepare work items --------------------------------------------
        # SystemPrompt is composed in the parent scope via the same builder
        # the sequential path uses, then passed into the parallel runspace.
        # This eliminates the duplicate inline prompt-assembly logic that
        # used to live inside the ForEach-Object -Parallel block, where it
        # could drift away from Get-AgentSystemPrompt unnoticed.
        $WorkItems = foreach ($A in $Phase1Agents) {
            [PSCustomObject]@{
                Agent            = $A
                Context          = $Context
                Config           = $Config
                OutDir           = $OutDir
                Instruction      = $Instruction
                EffectiveAppType = $EffectiveAppType
                EffectiveJobType = $EffectiveJobType
                SystemPrompt     = (Get-AgentSystemPrompt -Agent $A -BaseInstruction $Instruction -EffectiveAppType $EffectiveAppType -EffectiveJobType $EffectiveJobType)
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
            $EffectiveAppType = $Work.EffectiveAppType
            $EffectiveJobType = $Work.EffectiveJobType

            # Write status: working
            $statusPath = Join-Path $OutDir "agent_status.json"
            $statusObj = [PSCustomObject]@{
                agent     = $Agent.name
                status    = "working"
                timestamp = (Get-Date -Format "o")
            }
            $statusObj | ConvertTo-Json -Compress | Add-Content -Path $statusPath

            # SystemPrompt was assembled in the parent scope via the
            # canonical composable builder (Get-AgentSystemPrompt) and shipped
            # into this runspace through the work item. Do NOT re-derive it
            # here — that historical inline copy is what drifted from the
            # sequential path.
            $systemPrompt = $Work.SystemPrompt

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
                    Agent        = $Agent.name
                    Output       = $Response.choices[0].message.content
                    Tokens       = $Response.usage.total_tokens
                    Ok           = $true
                    SystemPrompt = $systemPrompt
                    UserPrompt   = $Context
                }
            }
            catch {
                # Enhanced error logging with details
                $errorMsg = $_.Exception.Message
                $errorDetails = if ($_.ErrorDetails) { $_.ErrorDetails.Message } else { "" }

                # Write status: error with details (using centralized function for consistency)
                $statusPath = Join-Path $OutDir "agent_status.json"
                $statusObj = [PSCustomObject]@{
                    agent        = $Agent.name
                    status       = "error"
                    timestamp    = (Get-Date -Format "o")
                    error        = $errorMsg
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
                    Agent        = $Agent.name
                    Output       = $null
                    Tokens       = 0
                    Ok           = $false
                    Error        = $errorMsg
                    SystemPrompt = $systemPrompt
                    UserPrompt   = $Context
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

            ### BEGIN: Advisory ConceptualModelContract Clarifications In Parallel Collection
            # Read clarification behavior from the plan-declared gate (see
            # Get-PofPhasePlan). NOTE: ConceptualModelContract is partitioned
            # out of the parallel block at the start of the iteration, so this
            # branch is effectively defensive code that should never fire on
            # current rosters; the conditional remains for symmetry with the
            # sequential contract handler.
            if ($r.Agent -eq "ConceptualModelContract" -and $validated.ClarificationNeeded -and $ContractClarificationGate -and $ContractClarificationGate.Behavior -eq "Advisory") {
                Write-Warning "ConceptualModelContract clarification detected during result collection, but gate is Advisory. Treating as advisory."

                $requirementsRequest = New-RequirementsRequestPacket -Question $validated.ClarificationText -AgentName $r.Agent

                Write-AgentStatus -Agent $r.Agent -Status "complete" -ExtraData @{
                    clarification_advisory = $true
                    clarification_text     = $validated.ClarificationText
                    requirements_request   = $requirementsRequest
                }

                $Context += "`n`n[$($r.Agent) Advisory Clarification Ignored]:`n$($requirementsRequest | ConvertTo-Json -Depth 20)"
                continue
            }
            ### END: Advisory ConceptualModelContract Clarifications In Parallel Collection

            if ($r.Agent -eq "ConceptualModelContract" -and $validated.ClarificationNeeded) {
                $requirementsRequest = New-RequirementsRequestPacket -Question $validated.ClarificationText -AgentName $r.Agent
                $goalEvidence = Get-ObservedGoalEvidence -GoalText $Goal
                Write-AgentStatus -Agent $r.Agent -Status "blocked_requirements" -ExtraData @{
                    reason               = "clarification_request"
                    clarification_text   = $validated.ClarificationText
                    requirements_request = $requirementsRequest
                    observedGoalLength   = $goalEvidence.observedGoalLength
                    observedGoalPreview  = $goalEvidence.observedGoalPreview
                }
                Write-PofRequirementsRequestArtifacts `
                    -AgentName $r.Agent `
                    -Question $validated.ClarificationText `
                    -RequirementsRequest $requirementsRequest
                Update-PofRunState `
                    -Status "blocked_requirements" `
                    -CurrentStage "requirements" `
                    -RequirementsRequest $requirementsRequest `
                    -Warnings @("$($r.Agent) requested clarification before implementation could continue.") `
                    -Complete
                Write-PofEvent `
                    -Type "requirements:blocked" `
                    -Message "$($r.Agent) requested clarification before implementation could continue." `
                    -Stage "requirements" `
                    -Data @{
                    agent                = $r.Agent
                    clarification_text   = $validated.ClarificationText
                    requirements_request = $requirementsRequest
                }

                $requirementsBlocker = @{
                    AgentName           = $r.Agent
                    ClarificationText   = $validated.ClarificationText
                    RequirementsRequest = $requirementsRequest
                }
            }
        }

        if ($requirementsBlocker) {
            Write-Host "⚠️ Requirements clarification needed from $($requirementsBlocker.AgentName). Pausing orchestration." -ForegroundColor Yellow
            $Context += "`n`n[Requirements Request]:`n$($requirementsBlocker.RequirementsRequest | ConvertTo-Json -Depth 20)"
            break
        }

        # --- Run Synthesizer sequentially ----------------------------------
        if ($Synthesizer) {
            foreach ($S in $Synthesizer) {
                Write-AgentStatus -Agent $S.name -Status "working"

                $systemPrompt = Get-AgentSystemPrompt -Agent $S -BaseInstruction $Instruction -EffectiveAppType $EffectiveAppType -EffectiveJobType $EffectiveJobType

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

                $systemPrompt = Get-AgentSystemPrompt -Agent $V -BaseInstruction $Instruction -EffectiveAppType $EffectiveAppType -EffectiveJobType $EffectiveJobType

                $auditInput = @{
                    run_id        = $RunId
                    goal          = $Goal
                    agent_outputs = $AgentOutputs
                    audit_focus   = "Identify stub-outs, placeholders, TODO/TBD/FIXME markers, and unfinished tasks."
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

                $systemPrompt = Get-AgentSystemPrompt -Agent $C -BaseInstruction $Instruction -EffectiveAppType $EffectiveAppType -EffectiveJobType $EffectiveJobType

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
                            }
                            else {
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
                        }
                        else {
                            Write-AgentStatus -Agent $C.name -Status "error" -ExtraData @{ rerun = $true }
                        }
                    }
                    catch {
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
                }
                catch {
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

                    $maxRefinementDepth = [Math]::Max(0, $MaxIterations - 1)
                    if ($RefinementDepth -ge $maxRefinementDepth) {
                        Write-Host "⚠️ Commissioner conditional persists after reaching the refinement limit ($RefinementDepth/$maxRefinementDepth). Continuing without further self-invocation." -ForegroundColor Yellow
                        $Context += "`n[Refinement Limit Reached]: Commissioner remained conditional at value_score=$Score after $RefinementDepth refinement pass(es)."
                    }
                    else {
                        Write-Host "🔁 Commissioner conditional (value_score=$Score) — triggering refinement pass $($RefinementDepth + 1)/$maxRefinementDepth..." -ForegroundColor Yellow
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
                        }
                        else {
                            "$Instruction`n`n$RefineDirective"
                        }

                        $Context += "`n[Refinement Triggered]: $RefineDirective"
                        & $PSCommandPath `
                            -Goal $Goal `
                            -Model $Model `
                            -Instruction $nextInstruction `
                            -MaxIterations $MaxIterations `
                            -RefinementDepth ($RefinementDepth + 1) `
                            -AgentConfigPath $AgentConfigPath `
                            -CanonicalAgentLibraryPath $CanonicalAgentLibraryPath `
                            -UseLegacyAgentConfig:$legacyConfigRequested `
                            -VerboseMode:$VerboseMode `
                            -JobType $EffectiveJobType `
                            -AppType $EffectiveAppType `
                            -LogPath $LogPath `
                            -TrendPath $TrendPath `
                            -RunId $RunId `
                            -OutputRoot $OutputRoot
                        $Script:ShouldExit = $true
                        return
                    }
                }
            }
        }

        # --- Run Supervisor sequentially ----------------------------------
        if ($Supervisor) {
            foreach ($Sup in $Supervisor) {
                Write-AgentStatus -Agent $Sup.name -Status "working"

                $systemPrompt = Get-AgentSystemPrompt -Agent $Sup -BaseInstruction $Instruction -EffectiveAppType $EffectiveAppType -EffectiveJobType $EffectiveJobType

                $input = @{
                    run_id        = $RunId
                    goal          = $Goal
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

                $systemPrompt = Get-AgentSystemPrompt -Agent $H -BaseInstruction $Instruction -EffectiveAppType $EffectiveAppType -EffectiveJobType $EffectiveJobType

                $input = @{
                    run_id        = $RunId
                    goal          = $Goal
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
catch {
    $script:PofTerminalError = $_.Exception.Message
    throw
}
finally {
    Complete-PofRunStateIfNeeded -ErrorMessage $script:PofTerminalError
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
} # end if (-not $env:POF_LOAD_ONLY)
### END FILE: POF.ps1
