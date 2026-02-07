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
    [switch]$DryRun,

    [Parameter(Mandatory = $false)]
    [string]$LogLevel = "Info",

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

    ,
    [Parameter(Mandatory = $false)]
    [string]$JobType

    ,
    [Parameter(Mandatory = $false)]
    [string]$ContractPath

    ,
    [Parameter(Mandatory = $false)]
    [string]$RequestPath

    ,
    [Parameter(Mandatory = $false)]
    [switch]$ValidateOnly
)

# Script configuration
$ErrorActionPreference = "Stop"
$script:StartTime = Get-Date
$script:RunId = $null
$script:LogFile = $null
$script:AgentLibrary = $null
$script:AgentLibraryPath = (Join-Path $PSScriptRoot "..\\agents\\agent-library.json")
$script:LearningPatterns = @()
$script:LearningPatternsPath = $null
$script:JobType = $null
$script:Contract = $null
$script:ContractHash = $null
$script:ContractPath = $null
$script:RequestPath = $null
$script:Request = $null
$script:RequestSchemaPath = $null
$script:ResolvedContractPath = $null
$script:JobTypesPath = $null
$script:Routing = $null
$script:RepoContextSchemaPath = $null
$script:StatusPath = $null
$script:EventsPath = $null
$script:EventsLogPath = $null
$script:RunStatus = $null
$script:StageOrder = @()
$script:KnownArtifacts = @{}

function Get-RepoRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path
}

function Resolve-OutputDirectory {
    param(
        [Parameter(Mandatory = $true)][string]$BaseDir,
        [Parameter(Mandatory = $true)][string]$JobType
    )

    $root = if ([string]::IsNullOrWhiteSpace($BaseDir)) { "." } else { $BaseDir }
    if (-not (Test-Path -Path $root -PathType Container)) {
        $null = New-Item -ItemType Directory -Path $root -Force
    }

    $markers = @("request.json", "status.json", "run_manifest.json")
    foreach ($marker in $markers) {
        $markerPath = Join-Path $root $marker
        if (Test-Path -LiteralPath $markerPath -PathType Leaf) {
            return $root
        }
    }

    $leaf = Split-Path -Path $root -Leaf
    $resolved = if ($leaf -ne $JobType) { Join-Path $root $JobType } else { $root }
    if (-not (Test-Path -Path $resolved -PathType Container)) {
        $null = New-Item -ItemType Directory -Path $resolved -Force
    }

    return $resolved
}

function New-MilestonesFromStages {
    param([Parameter(Mandatory = $true)][array]$Stages)

    return @($Stages | ForEach-Object {
        @{
            Id          = $_.id
            Name        = $(if ($_.name) { $_.name } else { $_.id })
            Description = $_.description
            Agent       = $(if ($_.agent) { $_.agent } else { $_.id })
            Status      = "pending"
        }
    })
}

function Write-RunManifest {
    param(
        [Parameter(Mandatory = $true)][string]$OutputDir,
        [Parameter(Mandatory = $true)][string]$GoalText,
        [Parameter(Mandatory = $true)]$Routing,
        [Parameter(Mandatory = $true)][string]$ContractPath,
        [Parameter(Mandatory = $true)][string]$ContractHash,
        [Parameter(Mandatory = $true)][bool]$ValidateOnly,
        [string]$RequestPath,
        [string]$RequestSchemaPath
    )

    $manifest = [pscustomobject]@{
        schema_version = "1.0"
        run_id         = $script:RunId
        created_utc    = (Get-Date).ToUniversalTime().ToString("o")
        job_type       = $script:JobType
        contract_universe = $(if ($script:Contract) { $script:Contract.contract_universe } else { $null })
        contract_version  = $(if ($script:Contract) { $script:Contract.contract_version } else { $null })
        pipeline_id       = $(if ($script:Contract) { $script:Contract.pipeline_id } else { $null })
        goal           = $GoalText
        output_dir     = $OutputDir
        contract_hash  = $ContractHash
        request        = $(if ($RequestPath) {
            [pscustomobject]@{
                path = $RequestPath
                schema = $RequestSchemaPath
            }
        } else { $null })
        contract       = [pscustomobject]@{
            path        = $ContractPath
            schema      = $Routing.SchemaPath
            hash_sha256 = $ContractHash
            universe    = $(if ($script:Contract) { $script:Contract.contract_universe } else { $null })
            version     = $(if ($script:Contract) { $script:Contract.contract_version } else { $null })
            pipeline_id = $(if ($script:Contract) { $script:Contract.pipeline_id } else { $null })
        }
        routing = [pscustomobject]@{
            pipeline_template = $Routing.PipelineTemplatePath
            pipeline_id       = $Routing.PipelineId
            stages            = $Routing.StageIds
            agent_roster       = $Routing.DefaultAgentRoster
            gate_policy        = $Routing.GatePolicy
            artifact_policy    = $Routing.ArtifactPolicy
            command_policy     = $Routing.CommandPolicy
            supervisor_policy  = $Routing.SupervisorPolicy
            stage_policy       = $Routing.StagePolicy
        }
        resolved_policies = [pscustomobject]@{
            gate_policy = $Routing.GatePolicy
            artifact_policy = $Routing.ArtifactPolicy
            command_policy = $Routing.CommandPolicy
            supervisor_policy = $Routing.SupervisorPolicy
        }
        validate_only  = $ValidateOnly
    }

    $manifestPath = Join-Path $OutputDir "run_manifest.json"
    $manifest | ConvertTo-Json -Depth 20 | Set-Content -Path $manifestPath -Encoding UTF8
    return $manifestPath
}

function Get-ShortHash {
    param([Parameter(Mandatory = $true)][string]$Text)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hashBytes = $sha.ComputeHash($bytes)
    }
    finally {
        $sha.Dispose()
    }
    return ([BitConverter]::ToString($hashBytes) -replace "-", "").ToLowerInvariant()
}

function Get-MimeType {
    param([Parameter(Mandatory = $true)][string]$Path)
    $ext = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
    switch ($ext) {
        ".json" { return "application/json" }
        ".md" { return "text/markdown" }
        ".txt" { return "text/plain" }
        ".log" { return "text/plain" }
        ".diff" { return "text/x-diff" }
        ".patch" { return "text/x-diff" }
        ".html" { return "text/html" }
        ".htm" { return "text/html" }
        ".yaml" { return "text/yaml" }
        ".yml" { return "text/yaml" }
        ".csv" { return "text/csv" }
        ".png" { return "image/png" }
        ".jpg" { return "image/jpeg" }
        ".jpeg" { return "image/jpeg" }
        ".gif" { return "image/gif" }
        ".svg" { return "image/svg+xml" }
        default { return "application/octet-stream" }
    }
}

function Get-RelativePath {
    param(
        [Parameter(Mandatory = $true)][string]$BaseDir,
        [Parameter(Mandatory = $true)][string]$Path
    )
    $base = (Resolve-Path -Path $BaseDir).Path
    $full = (Resolve-Path -Path $Path).Path
    if ($full.StartsWith($base, [System.StringComparison]::OrdinalIgnoreCase)) {
        $rel = $full.Substring($base.Length)
        $rel = $rel.TrimStart('\', '/')
        return ($rel -replace "\\", "/")
    }
    return ($full -replace "\\", "/")
}

function Write-ArtifactIndex {
    param([Parameter(Mandatory = $true)][string]$OutputDir)

    if (-not (Test-Path -LiteralPath $OutputDir)) { return $null }

    $records = @()
    $files = Get-ChildItem -Path $OutputDir -Recurse -File -ErrorAction SilentlyContinue
    foreach ($file in $files) {
        if ($file.Name -eq "artifacts_index.json") { continue }
        $rel = Get-RelativePath -BaseDir $OutputDir -Path $file.FullName
        $hash = Get-ShortHash -Text $rel
        $record = [pscustomobject]@{
            artifactId = "art-" + $hash.Substring(0, 12)
            fileName = $file.Name
            filePath = $file.FullName
            relativePath = $rel
            mimeType = (Get-MimeType -Path $file.FullName)
            size = $file.Length
            createdAt = $file.LastWriteTimeUtc.ToString("o")
            run_id = $script:RunId
            job_type = $script:JobType
            contract_universe = $(if ($script:Contract) { $script:Contract.contract_universe } else { $null })
            contract_version = $(if ($script:Contract) { $script:Contract.contract_version } else { $null })
            pipeline_id = $(if ($script:Contract) { $script:Contract.pipeline_id } else { $null })
            timestamp = (Get-Date).ToUniversalTime().ToString("o")
        }
        $records += $record
    }

    $indexPath = Join-Path $OutputDir "artifacts_index.json"
    $records | ConvertTo-Json -Depth 10 | Set-Content -Path $indexPath -Encoding UTF8
    return $indexPath
}

function Get-RequiredArtifactSpecs {
    param([AllowNull()]$ArtifactPolicy)

    $specs = @()
    if (-not $ArtifactPolicy) { return $specs }

    $reqArtifacts = $null
    if ($ArtifactPolicy.required_artifacts) { $reqArtifacts = $ArtifactPolicy.required_artifacts }
    if ($reqArtifacts) {
        foreach ($entry in @($reqArtifacts)) {
            if ($entry -is [string]) {
                $specs += [pscustomobject]@{ name = $entry; path = $entry }
            }
            else {
                $name = $entry.name
                $path = if ($entry.path) { $entry.path } else { $entry.name }
                if ($name) {
                    $specs += [pscustomobject]@{ name = $name; path = $path }
                }
            }
        }
    }
    elseif ($ArtifactPolicy.required) {
        foreach ($name in @($ArtifactPolicy.required)) {
            if ($name) { $specs += [pscustomobject]@{ name = $name; path = $name } }
        }
    }

    return @($specs | Select-Object -Unique -Property name, path)
}

function Get-OptionalArtifactSpecs {
    param([AllowNull()]$ArtifactPolicy)

    $specs = @()
    if (-not $ArtifactPolicy) { return $specs }

    $optArtifacts = $null
    if ($ArtifactPolicy.optional_artifacts) { $optArtifacts = $ArtifactPolicy.optional_artifacts }
    if ($optArtifacts) {
        foreach ($entry in @($optArtifacts)) {
            if ($entry -is [string]) {
                $specs += [pscustomobject]@{ name = $entry; path = $entry }
            }
            else {
                $name = $entry.name
                $path = if ($entry.path) { $entry.path } else { $entry.name }
                if ($name) {
                    $specs += [pscustomobject]@{ name = $name; path = $path }
                }
            }
        }
    }

    return @($specs | Select-Object -Unique -Property name, path)
}

function Assert-RequiredArtifacts {
    param(
        [Parameter(Mandatory = $true)][string]$OutputDir,
        [Parameter(Mandatory = $true)]$ArtifactPolicy
    )
    $requiredSpecs = Get-RequiredArtifactSpecs -ArtifactPolicy $ArtifactPolicy
    if ($requiredSpecs.Count -eq 0) { return }

    $missing = @()
    foreach ($spec in $requiredSpecs) {
        $candidate = $spec.path
        if (-not $candidate) { continue }
        $full = if ([System.IO.Path]::IsPathRooted($candidate)) { $candidate } else { Join-Path $OutputDir $candidate }
        if (-not (Test-Path -LiteralPath $full)) {
            $missing += $spec.name
        }
    }

    if ($missing.Count -gt 0) {
        throw ("Missing required artifacts: " + ($missing | Sort-Object -Unique) -join ", ")
    }
}

function Write-RunErrorArtifact {
    param(
        [Parameter(Mandatory = $true)][string]$OutputDir,
        [Parameter(Mandatory = $true)][string]$Message
    )
    if (-not (Test-Path -LiteralPath $OutputDir)) {
        New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    }
    $path = Join-Path $OutputDir "run_error.md"
    $content = @(
        "# Run Error",
        "",
        $Message
    ) -join "`n"
    $content | Set-Content -Path $path -Encoding UTF8
    return $path
}

function Write-RunArtifactsBundle {
    param(
        [Parameter(Mandatory = $true)][string]$OutputDir,
        [AllowNull()]$ArtifactPolicy
    )

    $artifactRoot = Join-Path $OutputDir "artifacts"
    if (-not (Test-Path -LiteralPath $artifactRoot)) {
        New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null
    }

    $specs = @()
    $specs += Get-RequiredArtifactSpecs -ArtifactPolicy $ArtifactPolicy
    $specs += Get-OptionalArtifactSpecs -ArtifactPolicy $ArtifactPolicy
    foreach ($name in @("run_error.md", "pr_error.md")) {
        $path = Join-Path $OutputDir $name
        if (Test-Path -LiteralPath $path) {
            $specs += [pscustomobject]@{ name = $name; path = $name }
        }
    }
    $specs = @($specs | Select-Object -Unique -Property name, path)

    foreach ($spec in $specs) {
        $candidate = if ($spec.path) { $spec.path } else { $spec.name }
        if (-not $candidate) { continue }
        $source = if ([System.IO.Path]::IsPathRooted($candidate)) { $candidate } else { Join-Path $OutputDir $candidate }
        if (-not (Test-Path -LiteralPath $source)) { continue }

        $targetRel = $candidate
        $targetFull = [System.IO.Path]::GetFullPath((Join-Path $artifactRoot $targetRel))
        $artifactRootFull = [System.IO.Path]::GetFullPath($artifactRoot)
        if (-not $targetFull.StartsWith($artifactRootFull, [System.StringComparison]::OrdinalIgnoreCase)) { continue }

        $targetDir = Split-Path -Parent $targetFull
        if (-not (Test-Path -LiteralPath $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }
        Copy-Item -LiteralPath $source -Destination $targetFull -Force
    }

    return $artifactRoot
}

function Normalize-CommandString {
    param([Parameter(Mandatory = $true)][string]$Command)
    return (($Command.Trim()) -replace "\s+", " ")
}

function Assert-CommandPolicyCompliance {
    param(
        [Parameter(Mandatory = $true)]$Contract,
        [Parameter(Mandatory = $true)][string]$OutputDir
    )

    if (-not $Contract -or -not $Contract.command_policy) { return }
    $policy = $Contract.command_policy
    if (-not $policy.only_from_repo_context) { return }

    $repoContextPath = $null
    if ($Contract.repo_context_ref -and $Contract.repo_context_ref.path) {
        $repoContextPath = $Contract.repo_context_ref.path
    }
    if (-not $repoContextPath) { $repoContextPath = "repo_context.json" }

    $repoContextFull = if ([System.IO.Path]::IsPathRooted($repoContextPath)) { $repoContextPath } else { Join-Path $OutputDir $repoContextPath }
    if (-not (Test-Path -LiteralPath $repoContextFull)) {
        $waiver = $policy.waiver
        if ($waiver -and $waiver.reason) {
            Write-Log "Command policy waiver used: $($waiver.reason)" -Level "WARN"
            return
        }
        throw "Command policy requires repo_context.json, but it was not found."
    }

    $evidencePath = Join-Path $OutputDir "evidence.json"
    if (-not (Test-Path -LiteralPath $evidencePath)) { return }

    $repoContext = Get-Content -Raw -LiteralPath $repoContextFull | ConvertFrom-Json -Depth 50
    $allowed = @()
    if ($repoContext.discovery -and $repoContext.discovery.commands) { $allowed = @($repoContext.discovery.commands) }

    $evidence = Get-Content -Raw -LiteralPath $evidencePath | ConvertFrom-Json -Depth 50
    $commandsRun = @()
    if ($evidence.commands_run) { $commandsRun = @($evidence.commands_run) }

    $allowedMap = @{}
    foreach ($cmd in $allowed) {
        $text = Normalize-CommandString -Command ([string]$cmd.command)
        if ($text) { $allowedMap[$text] = $true }
    }

    $violations = @()
    foreach ($cmd in $commandsRun) {
        $text = Normalize-CommandString -Command ([string]$cmd.command)
        if (-not $text) { continue }
        if (-not $allowedMap.ContainsKey($text)) {
            $violations += $text
        }
    }

    if ($violations.Count -gt 0) {
        throw ("Command policy violation (not in repo_context): " + ($violations | Sort-Object -Unique) -join ", ")
    }
}

function Build-SupervisorContext {
    param(
        [Parameter(Mandatory = $true)]$Routing,
        [Parameter(Mandatory = $true)][string]$OutputDir
    )

    $requiredSpecs = Get-RequiredArtifactSpecs -ArtifactPolicy $Routing.ArtifactPolicy
    $missing = @()
    foreach ($spec in $requiredSpecs) {
        $candidate = if ($spec.path) { $spec.path } else { $spec.name }
        if (-not $candidate) { continue }
        $full = if ([System.IO.Path]::IsPathRooted($candidate)) { $candidate } else { Join-Path $OutputDir $candidate }
        if (-not (Test-Path -LiteralPath $full)) { $missing += $spec.name }
    }

    $context = [pscustomobject]@{
        job_type = $script:JobType
        contract_universe = $(if ($script:Contract) { $script:Contract.contract_universe } else { $null })
        contract_version = $(if ($script:Contract) { $script:Contract.contract_version } else { $null })
        pipeline_id = $Routing.PipelineId
        pipeline_template = $Routing.PipelineTemplatePath
        gate_policy = $Routing.GatePolicy
        artifact_policy = $Routing.ArtifactPolicy
        required_artifacts = $requiredSpecs
        missing_artifacts = @($missing | Sort-Object -Unique)
        command_policy = $Routing.CommandPolicy
        supervisor_policy = $Routing.SupervisorPolicy
    }

    return ($context | ConvertTo-Json -Depth 20)
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
        Write-Log "Failed to parse learning patterns at $script:LearningPatternsPath; continuing with empty learning set: $_" -Level "WARN"
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
        Write-Log "Supervisor output could not be parsed as JSON; skipping learning update: $_" -Level "WARN"
        return
    }

    $record = [pscustomobject]@{
        timestamp        = (Get-Date).ToUniversalTime().ToString("o")
        run_id           = $script:RunId
        goal             = $GoalText
        model            = $Model
        output_dir       = $OutputDir
        quality_score    = $parsed.quality_score
        agent_scores     = $parsed.agent_scores
        feedback         = $parsed.feedback
        insights         = $parsed.insights
        recommendations  = $parsed.recommendations
        agent_improvements = $parsed.agent_improvements
    }

    $script:LearningPatterns = @($script:LearningPatterns + @($record))
    if ($LearningMaxRuns -gt 0 -and $script:LearningPatterns.Count -gt $LearningMaxRuns) {
        $script:LearningPatterns = @($script:LearningPatterns | Select-Object -Last $LearningMaxRuns)
    }

    Save-LearningPatterns
    Write-Log "Learning patterns updated: $script:LearningPatternsPath"
}

function Get-AgentDefinition {
    param([Parameter(Mandatory = $true)][string]$AgentName)

    if (-not $EnforceContracts) {
        return $null
    }

    if (-not $script:AgentLibrary) {
        if (Test-Path $script:AgentLibraryPath) {
            try {
                $script:AgentLibrary = Get-Content -Raw -Path $script:AgentLibraryPath | ConvertFrom-Json
            }
            catch {
                Write-Log "Failed to load agent library at $script:AgentLibraryPath: $_" -Level "WARN"
                $script:AgentLibrary = @()
            }
        }
        else {
            Write-Log "Agent library not found at $script:AgentLibraryPath; contract enforcement disabled." -Level "WARN"
            $script:AgentLibrary = @()
            $script:EnforceContracts = $false
        }
    }

    return $script:AgentLibrary | Where-Object { $_.name -eq $AgentName } | Select-Object -First 1
}

function Assert-AgentOutputContract {
    param(
        [Parameter(Mandatory = $true)][string]$AgentName,
        [Parameter(Mandatory = $true)][string]$RawOutput
    )

    if (-not $EnforceContracts) {
        return @{ ok = $true; parsed = $null; error = $null }
    }

    $agentDef = Get-AgentDefinition -AgentName $AgentName
    if (-not $agentDef) {
        return @{ ok = $true; parsed = $null; error = $null }
    }

    $parsed = $null
    try {
        $parsed = $RawOutput | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        return @{ ok = $false; parsed = $null; error = "Output is not valid JSON: $($_.Exception.Message)" }
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
            return @{ ok = $false; parsed = $parsed; error = "Missing required output field: $field" }
        }
    }

    return @{ ok = $true; parsed = $parsed; error = $null }
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
        "array" {
            return @()
        }
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
        default {
            return $null
        }
    }
}

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $jobTag = if ($script:JobType) { $script:JobType } else { "unknown" }
    $logLine = "[$timestamp] [$Level] [$jobTag] $Message"
    Write-Host $logLine
    if ($script:LogFile) {
        Add-Content -Path $script:LogFile -Value $logLine
    }
    if ($script:EventsPath) {
        try {
            Append-RunEvent -Type $Level.ToLowerInvariant() -Stage $null -Message $Message
        }
        catch { }
    }
}

function Save-RunStatus {
    if (-not $script:RunStatus -or -not $script:StatusPath) { return }
    $script:RunStatus.updated_at = (Get-Date).ToUniversalTime().ToString("o")
    $json = $script:RunStatus | ConvertTo-Json -Depth 20
    $tmp = "$($script:StatusPath).tmp"
    $json | Set-Content -Path $tmp -Encoding UTF8
    Move-Item -Path $tmp -Destination $script:StatusPath -Force
}

function Append-RunEvent {
    param(
        [string]$Type = "info",
        [AllowNull()][string]$Stage,
        [string]$Message,
        $Data = $null
    )
    if (-not $script:EventsPath) { return }
    $record = [ordered]@{
        ts = (Get-Date).ToUniversalTime().ToString("o")
        type = $Type
        stage = $Stage
        message = $Message
        data = $Data
    }
    $line = ($record | ConvertTo-Json -Depth 10 -Compress)
    Add-Content -Path $script:EventsPath -Value $line
    if ($script:EventsLogPath) {
        $stamp = (Get-Date).ToUniversalTime().ToString("o")
        $tag = if ($Stage) { $Stage } else { "run" }
        Add-Content -Path $script:EventsLogPath -Value ("[{0}] [{1}] [{2}] {3}" -f $stamp, $Type.ToUpperInvariant(), $tag, $Message)
    }
}

function Initialize-RunStatus {
    param(
        [Parameter(Mandatory = $true)][string]$OutputDir,
        [Parameter(Mandatory = $true)][array]$Stages
    )
    $script:StatusPath = Join-Path $OutputDir "run_state.json"
    $script:EventsPath = Join-Path $OutputDir "events.ndjson"
    $script:EventsLogPath = Join-Path $OutputDir "events.log"

    $now = (Get-Date).ToUniversalTime().ToString("o")
    $stageRecords = @()
    $stageOrder = @()
    foreach ($stage in $Stages) {
        $id = $null
        $name = $null
        if ($stage.PSObject.Properties.Name -contains "id") { $id = $stage.id }
        if ($stage.PSObject.Properties.Name -contains "name") { $name = $stage.name }
        if (-not $id -and $stage.PSObject.Properties.Name -contains "Id") { $id = $stage.Id }
        if (-not $name -and $stage.PSObject.Properties.Name -contains "Name") { $name = $stage.Name }
        if (-not $id -and $stage.PSObject.Properties.Name -contains "Agent") { $id = $stage.Agent }
        if (-not $name) { $name = $id }
        if (-not $id) { continue }
        $stageOrder += $id
        $stageRecords += [pscustomobject]@{
            id = $id
            name = $name
            status = "pending"
            started_at = $null
            finished_at = $null
        }
    }
    $script:StageOrder = @($stageOrder)

    $pipelineId = $null
    if ($script:Contract -and $script:Contract.pipeline_id) {
        $pipelineId = $script:Contract.pipeline_id
    }
    elseif ($script:Routing -and $script:Routing.PipelineId) {
        $pipelineId = $script:Routing.PipelineId
    }

    $repoUrl = $null
    if ($script:Contract -and $script:Contract.repo -and $script:Contract.repo.url) {
        $repoUrl = $script:Contract.repo.url
    }

    $script:RunStatus = [ordered]@{
        run_id = $script:RunId
        job_type = $script:JobType
        status = "running"
        current_stage = $(if ($stageRecords.Count -gt 0) { $stageRecords[0].id } else { $null })
        stage_index = 0
        stage_count = $stageRecords.Count
        progress = $(if ($stageRecords.Count -gt 0) { 5 } else { 0 })
        started_at = $now
        updated_at = $now
        ended_at = $null
        risk = [pscustomobject]@{ level = "low"; reasons = @() }
        artifacts = @()
        links = [pscustomobject]@{ pr_url = $null; repo_url = $repoUrl }
        errors = @()
        warnings = @()
        stages = @($stageRecords)
    }

    Save-RunStatus
    Append-RunEvent -Type "info" -Stage $script:RunStatus.current_stage -Message "Run started"
}

function Get-StageRecord {
    param([string]$StageId)
    if (-not $script:RunStatus -or -not $script:RunStatus.stages) { return $null }
    return @($script:RunStatus.stages | Where-Object { $_.id -eq $StageId } | Select-Object -First 1)[0]
}

function Get-StageIndex {
    param([string]$StageId)
    if (-not $script:StageOrder -or $script:StageOrder.Count -eq 0) { return $null }
    return [array]::IndexOf($script:StageOrder, $StageId)
}

function Set-StageStatus {
    param(
        [Parameter(Mandatory = $true)][string]$StageId,
        [Parameter(Mandatory = $true)][string]$Status
    )
    if (-not $script:RunStatus) { return }
    $stage = Get-StageRecord -StageId $StageId
    if (-not $stage) {
        $stage = [pscustomobject]@{
            id = $StageId
            name = $StageId
            status = "pending"
            started_at = $null
            finished_at = $null
        }
        $script:RunStatus.stages += $stage
    }

    $now = (Get-Date).ToUniversalTime().ToString("o")
    if ($Status -eq "running" -and -not $stage.started_at) { $stage.started_at = $now }
    if ($Status -in @("succeeded","failed","skipped")) { $stage.finished_at = $now }
    $stage.status = $Status

    $stageIndex = Get-StageIndex -StageId $StageId
    $stageCount = $script:RunStatus.stage_count
    if (-not $stageCount -and $script:StageOrder) { $stageCount = $script:StageOrder.Count }
    if ($Status -eq "running") {
        $script:RunStatus.current_stage = $StageId
        if ($null -ne $stageIndex) { $script:RunStatus.stage_index = [int]$stageIndex }
        if ($stageCount) { $script:RunStatus.stage_count = [int]$stageCount }
        if ($stageCount -and $null -ne $stageIndex) {
            $script:RunStatus.progress = [math]::Round(($stageIndex / [double]$stageCount) * 100)
        }
    }
    elseif ($Status -in @("succeeded","failed","skipped")) {
        if ($null -ne $stageIndex) { $script:RunStatus.stage_index = [int]$stageIndex }
        if ($stageCount) { $script:RunStatus.stage_count = [int]$stageCount }
        if ($stageCount -and $null -ne $stageIndex) {
            $script:RunStatus.progress = [math]::Round((($stageIndex + 1) / [double]$stageCount) * 100)
        }
    }

    if ($Status -in @("succeeded","failed")) {
        Update-RunStateArtifacts -OutputDir $OutputDir
    }

    Save-RunStatus
    $eventType = if ($Status -eq "running") { "stage_start" } elseif ($Status -in @("succeeded","failed","skipped")) { "stage_end" } else { "info" }
    Append-RunEvent -Type $eventType -Stage $StageId -Message ("Stage {0}: {1}" -f $StageId, $Status)
}

function Update-RunStateArtifacts {
    param(
        [Parameter(Mandatory = $true)][string]$OutputDir
    )
    if (-not $script:RunStatus) { return }

    $artifactMap = @{}
    $specs = @()
    if ($script:Routing -and $script:Routing.ArtifactPolicy) {
        $specs += Get-RequiredArtifactSpecs -ArtifactPolicy $script:Routing.ArtifactPolicy
        $specs += Get-OptionalArtifactSpecs -ArtifactPolicy $script:Routing.ArtifactPolicy
    }

    foreach ($spec in @($specs)) {
        $candidate = if ($spec.path) { $spec.path } else { $spec.name }
        if (-not $candidate) { continue }
        $full = if ([System.IO.Path]::IsPathRooted($candidate)) { $candidate } else { Join-Path $OutputDir $candidate }
        $exists = Test-Path -LiteralPath $full -PathType Leaf
        $rel = if ($exists) { Get-RelativePath -BaseDir $OutputDir -Path $full } else { ($candidate -replace "\\", "/") }
        $bytes = $null
        $mtime = $null
        if ($exists) {
            $item = Get-Item -LiteralPath $full -ErrorAction SilentlyContinue
            if ($item) {
                $bytes = $item.Length
                $mtime = $item.LastWriteTimeUtc.ToString("o")
            }
        }
        if (-not $artifactMap.ContainsKey($rel)) {
            $artifactMap[$rel] = [pscustomobject]@{
                path = $rel
                exists = [bool]$exists
                bytes = $bytes
                mtime = $mtime
            }
        }
    }

    foreach ($name in @("run_error.md", "pr_error.md")) {
        $path = Join-Path $OutputDir $name
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            $rel = Get-RelativePath -BaseDir $OutputDir -Path $path
            if (-not $artifactMap.ContainsKey($rel)) {
                $item = Get-Item -LiteralPath $path -ErrorAction SilentlyContinue
                $artifactMap[$rel] = [pscustomobject]@{
                    path = $rel
                    exists = $true
                    bytes = $(if ($item) { $item.Length } else { $null })
                    mtime = $(if ($item) { $item.LastWriteTimeUtc.ToString("o") } else { $null })
                }
            }
        }
    }

    $artifactRoot = Join-Path $OutputDir "artifacts"
    if (Test-Path -LiteralPath $artifactRoot -PathType Container) {
        $files = Get-ChildItem -LiteralPath $artifactRoot -Recurse -File -ErrorAction SilentlyContinue
        foreach ($file in $files) {
            $rel = Get-RelativePath -BaseDir $OutputDir -Path $file.FullName
            $basename = [System.IO.Path]::GetFileName($rel)
            if ($artifactMap.ContainsKey($rel) -or $artifactMap.ContainsKey($basename)) { continue }
            $artifactMap[$rel] = [pscustomobject]@{
                path = $rel
                exists = $true
                bytes = $file.Length
                mtime = $file.LastWriteTimeUtc.ToString("o")
            }
        }
    }

    $previous = @{}
    if ($script:RunStatus.artifacts) {
        foreach ($entry in @($script:RunStatus.artifacts)) {
            if ($entry -and $entry.path -and $entry.exists -ne $false) {
                $previous[$entry.path] = $true
            }
        }
    }

    $artifactList = @($artifactMap.Values | Sort-Object -Property path)
    foreach ($entry in $artifactList) {
        if ($entry.exists -and -not $previous.ContainsKey($entry.path)) {
            Append-RunEvent -Type "artifact_written" -Stage $script:RunStatus.current_stage -Message ("Artifact written: {0}" -f $entry.path) -Data ([pscustomobject]@{ bytes = $entry.bytes; mtime = $entry.mtime })
        }
    }
    $script:RunStatus.artifacts = $artifactList

    $prJson = $null
    foreach ($candidate in @(
        (Join-Path $OutputDir "pr.json"),
        (Join-Path $OutputDir "artifacts\\pr.json")
    )) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            try {
                $prJson = Get-Content -Raw -LiteralPath $candidate | ConvertFrom-Json -Depth 20
                break
            }
            catch { }
        }
    }

    if ($prJson) {
        $prUrl = $null
        if ($prJson.pr -and $prJson.pr.url) { $prUrl = $prJson.pr.url }
        elseif ($prJson.pr_url) { $prUrl = $prJson.pr_url }
        if ($prUrl) {
            if (-not $script:RunStatus.links) { $script:RunStatus.links = [pscustomobject]@{} }
            $script:RunStatus.links.pr_url = $prUrl
        }

        $riskLevel = $null
        if ($prJson.risk -and $prJson.risk.level) { $riskLevel = $prJson.risk.level }
        elseif ($prJson.conflict -and $prJson.conflict.level) { $riskLevel = $prJson.conflict.level }
        if ($riskLevel) {
            if (-not $script:RunStatus.risk) { $script:RunStatus.risk = [pscustomobject]@{} }
            $script:RunStatus.risk.level = $riskLevel
        }

        $riskReasons = $null
        if ($prJson.risk -and $prJson.risk.reasons) { $riskReasons = @($prJson.risk.reasons) }
        elseif ($prJson.conflict -and $prJson.conflict.reasons) { $riskReasons = @($prJson.conflict.reasons) }
        if ($riskReasons) {
            if (-not $script:RunStatus.risk) { $script:RunStatus.risk = [pscustomobject]@{} }
            $script:RunStatus.risk.reasons = @($riskReasons)
        }

        if ($prJson.status -eq "failed" -and $prJson.errors) {
            if (-not $script:RunStatus.errors) { $script:RunStatus.errors = @() }
            foreach ($err in @($prJson.errors)) {
                $msg = if ($err.message) { $err.message } else { [string]$err }
                if ($msg -and -not ($script:RunStatus.errors -contains $msg)) {
                    $script:RunStatus.errors += $msg
                }
            }
        }
    }

    if (-not $script:RunStatus.links -or -not $script:RunStatus.links.repo_url) {
        $repoContextPath = Join-Path $OutputDir "repo_context.json"
        if (Test-Path -LiteralPath $repoContextPath -PathType Leaf) {
            try {
                $repoContext = Get-Content -Raw -LiteralPath $repoContextPath | ConvertFrom-Json -Depth 20
                if ($repoContext.repo -and $repoContext.repo.url) {
                    if (-not $script:RunStatus.links) { $script:RunStatus.links = [pscustomobject]@{} }
                    $script:RunStatus.links.repo_url = $repoContext.repo.url
                }
            }
            catch { }
        }
    }
}

function Set-RunState {
    param(
        [Parameter(Mandatory = $true)][string]$State,
        [string]$ErrorMessage
    )
    if (-not $script:RunStatus) {
        if ($OutputDir) {
            $fallbackPath = Join-Path $OutputDir "run_state.json"
            if (Test-Path -LiteralPath $fallbackPath) {
                $state = $null
                try {
                    $state = Get-Content -Raw -LiteralPath $fallbackPath | ConvertFrom-Json -Depth 20
                }
                catch {
                    $state = $null
                }
                if (-not $state) {
                    $state = [pscustomobject]@{}
                }

                $now = (Get-Date).ToUniversalTime().ToString("o")
                if (-not $state.run_id -and $script:RunId) { $state | Add-Member -NotePropertyName run_id -NotePropertyValue $script:RunId -Force }
                if (-not $state.job_type -and $script:JobType) { $state | Add-Member -NotePropertyName job_type -NotePropertyValue $script:JobType -Force }

                $state.status = $State
                $state.updated_at = $now
                if ($State -in @("succeeded","failed")) { $state.ended_at = $now }
                if ($ErrorMessage) {
                    $errors = @()
                    if ($state.errors) { $errors = @($state.errors) }
                    $errors += $ErrorMessage
                    $state.errors = $errors
                }

                $state | ConvertTo-Json -Depth 20 | Set-Content -Path $fallbackPath -Encoding UTF8
            }
        }
        return
    }
    $script:RunStatus.status = $State
    if ($State -in @("succeeded","failed")) {
        $script:RunStatus.ended_at = (Get-Date).ToUniversalTime().ToString("o")
    }
    if ($ErrorMessage) {
        if (-not $script:RunStatus.errors) { $script:RunStatus.errors = @() }
        $script:RunStatus.errors += $ErrorMessage
    }
    Save-RunStatus
    Append-RunEvent -Type $(if ($State -eq "failed") { "error" } else { "info" }) -Stage $script:RunStatus.current_stage -Message ("Run {0}" -f $State)
}

function Initialize-Orchestration {
    param([string]$GoalText)
    
    Write-Log "Initializing AI Orchestration"
    Write-Log "Goal: $GoalText"
    Write-Log "Model: $Model"
    if ($script:JobType) {
        Write-Log "JobType: $script:JobType"
    }

    if (-not $script:RunId) {
        if ($script:Contract -and $script:Contract.run_id -and $script:Contract.run_id -ne "AUTO") {
            $script:RunId = $script:Contract.run_id
        }
        else {
            $script:RunId = "{0}_{1}" -f (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ"), ([Guid]::NewGuid().ToString("N").Substring(0, 8))
        }
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
        Goal       = $GoalText
        Model      = $Model
        RunId      = $script:RunId
        StartTime  = $script:StartTime
        Status     = "initialized"
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
        # Default to full pipeline if we cannot infer intent.
        $milestones = $pipeline
    }
    else {
        # Preserve keyword intent, but include prerequisite stages and always run Commissioner/Supervisor.
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

        # If any pipeline stage was inferred, ensure Synthesizer exists before Commissioner/Supervisor.
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

    # Normalize structure expected by downstream execution.
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
        model       = $Model
        messages    = @(
            @{ role = "system"; content = $SystemPrompt },
            @{ role = "user"; content = $UserPrompt }
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

        # Log raw response for debugging JSON parsing issues
        $rawResponsePath = Join-Path $OutputDir "raw_llm_response_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"
        try {
            $response | ConvertTo-Json -Depth 10 | Out-File -FilePath $rawResponsePath -Encoding UTF8
            Write-Log "Saved raw LLM response to: $rawResponsePath"
        }
        catch {
            Write-Log "Warning: Could not save raw response: $_" -Level "WARN"
        }

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
        
        # Log detailed error information
        $errorLogPath = Join-Path $OutputDir "llm_error_$(Get-Date -Format 'yyyyMMdd_HHmmss').log"
        $errorReport = @"
OpenAI API Error
Timestamp: $(Get-Date -Format "o")
Model: $Model
Error: $errorMessage
Error Details: $errorDetails
Stack Trace: $($outerException.ScriptStackTrace)
"@
        try {
            $errorReport | Out-File -FilePath $errorLogPath -Encoding UTF8
            Write-Log "Error details saved to: $errorLogPath" -Level "ERROR"
        }
        catch {
            Write-Log "Warning: Could not save error log: $_" -Level "WARN"
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
    $skipWrite = $false

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

    $supervisorContext = ""
    if ($agentName -eq "Supervisor" -and $script:Routing) {
        $supervisorContext = @"

SUPERVISOR CONTEXT (job type policies + compliance snapshot):
$(Build-SupervisorContext -Routing $script:Routing -OutputDir $OutputDir)
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
$supervisorContext
"@

    # Call the LLM (or run deterministic agents)
    $llmResult = $null
    $content = $null
    if ($agentName -eq "RepoContextBuilder") {
        $repoRoot = Get-RepoRoot
        $builderPath = Join-Path $repoRoot "supervisor\\repo_context_builder.ps1"
        if (-not (Test-Path -LiteralPath $builderPath)) {
            throw "Repo context builder not found at $builderPath"
        }
        . $builderPath

        $schemaPath = $script:RepoContextSchemaPath
        if (-not $schemaPath) {
            $schemaPath = Join-Path $repoRoot "contracts\\repo_context_schema.v1.json"
        }

        $repoPathOverride = $null
        if ($script:Contract -and $script:Contract.repo -and $script:Contract.repo.local_path) {
            $repoPathOverride = $script:Contract.repo.local_path
        }

        $repoContextResult = Invoke-RepoContextBuilder `
            -RepoRoot $repoPathOverride `
            -ContractPath $script:ContractPath `
            -OutputDir $OutputDir `
            -SchemaPath $schemaPath

        $content = Get-Content -Raw -LiteralPath $repoContextResult.RepoContextPath
        $llmResult = @{ RawResponse = @{ repo_context = $true; discovery = $repoContextResult.DiscoveryPath; baseline = $repoContextResult.BaselinePath } }
        $outputPath = $repoContextResult.RepoContextPath
        $skipWrite = $true
    }
    elseif ($agentName -eq "ReviewGate") {
        $gateFn = Get-Command -Name Invoke-ReviewGate -ErrorAction SilentlyContinue
        if (-not $gateFn) {
            throw "Review gate functions not loaded. Ensure maintenance_gates.ps1 is available."
        }
        $review = Invoke-ReviewGate -Contract $script:Contract -OutputDir $OutputDir -RepoContextPath (Join-Path $OutputDir "repo_context.json") -PatchPath (Join-Path $OutputDir "PATCH.diff")
        $reviewPath = Join-Path $OutputDir "review_gate.json"
        $content = Get-Content -Raw -LiteralPath $reviewPath
        $llmResult = @{ RawResponse = @{ review_gate = $true } }
        $outputPath = $reviewPath
        $skipWrite = $true
    }
    elseif ($agentName -eq "PRPublisher") {
        $repoRoot = Get-RepoRoot
        $publisherPath = Join-Path $repoRoot "supervisor\\pr_publisher.ps1"
        if (-not (Test-Path -LiteralPath $publisherPath)) {
            throw "PR publisher not found at $publisherPath"
        }
        . $publisherPath

        $result = Invoke-PRPublisher -Contract $script:Contract -OutputDir $OutputDir -RepoContextPath (Join-Path $OutputDir "repo_context.json")
        $content = Get-Content -Raw -LiteralPath $result.PrJsonPath
        $llmResult = @{ RawResponse = @{ pr_publisher = $true } }
        $outputPath = $result.PrJsonPath
        $skipWrite = $true
    }
    elseif ($DryRun -and $EnforceContracts -and $agentDef -and $agentDef.io_contract -and $agentDef.io_contract.output_schema) {
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
    if (-not $contractCheck.ok) {
        Write-Log "Contract violation for agent ${agentName}: $($contractCheck.error)" -Level "WARN"
    }

    # Persist the milestone output to disk for inspection
    $safeName = [Regex]::Replace($Milestone.Name, "[^\w\-]+", "_")
    $fileName = if ($EnforceContracts) { "milestone_{0}.json" -f $safeName } else { "milestone_{0}.md" -f $safeName }
    if (-not $skipWrite) {
        $outputPath = Join-Path -Path $OutputDir -ChildPath $fileName
        $content | Out-File -FilePath $outputPath -Encoding UTF8
    }

    return @{
        Output     = $content
        OutputPath = $outputPath
        Raw        = $llmResult.RawResponse
        SystemPrompt = $systemPrompt
        UserPrompt   = $userPrompt
        ContractOk   = $contractCheck.ok
        ContractError = $contractCheck.error
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
        $stageId = $null
        if ($milestone.PSObject.Properties.Name -contains "Id" -and $milestone.Id) { $stageId = $milestone.Id }
        if (-not $stageId -and $milestone.Agent) { $stageId = $milestone.Agent }
        if ($stageId) { Set-StageStatus -StageId $stageId -Status "running" }

        Write-Log "Executing milestone: $($milestone.Name)"
        Write-Log "  Agent: $($milestone.Agent)"
        Write-Log "  Description: $($milestone.Description)"

        try {
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

            # Make current output available to downstream milestones.
            $upstream[$milestone.Agent] = $agentResult

            if ($script:JobType -eq "maintain_existing_app" -and $milestone.Agent -eq "RepoContextBuilder") {
                $gateFn = Get-Command -Name Test-BaselineGate -ErrorAction SilentlyContinue
                if ($gateFn) {
                    $repoContextPath = Join-Path $OutputDir "repo_context.json"
                    $baselineGate = Test-BaselineGate -RepoContextPath $repoContextPath -Contract $script:Contract
                    if (-not $baselineGate.Ok) {
                        $msg = "Baseline gate failed: " + ($baselineGate.Errors -join "; ")
                        throw $msg
                    }
                }
            }

            if ($milestone.Agent -eq "Supervisor" -and $agentResult.ContractOk) {
                Update-LearningFromSupervisor `
                    -SupervisorRawJson $agentResult.Output `
                    -GoalText $GoalText `
                    -Model $Model `
                    -OutputDir $OutputDir
            }

            if ($stageId) { Set-StageStatus -StageId $stageId -Status "succeeded" }
            Write-Log "  Milestone completed: $($milestone.Name)"
        }
        catch {
            if ($stageId) { Set-StageStatus -StageId $stageId -Status "failed" }
            Append-RunEvent -Type "error" -Stage $stageId -Message ("Milestone failed: {0}" -f $_)
            throw
        }
    }

    return , $results               # Return as array, even for a single milestone
}

function Invoke-Milestone {
    param(
        [hashtable]$Milestone,
        [hashtable]$Context
    )
    
    if (-not $Milestone.PSObject.Properties.Match("Status")) {
        $Milestone | Add-Member -NotePropertyName Status -NotePropertyValue "pending" -Force
    }

    Write-Log "Executing milestone: $($Milestone.Name)"
    Write-Log "  Agent: $($Milestone.Agent)"
    Write-Log "  Description: $($Milestone.Description)"
    
    if ($DryRun) {
        Write-Log "  [DRY RUN] Skipping actual execution"
        $Milestone.Status = "skipped"
        $Milestone.Output = "[Dry run - no output generated]"
        return $Milestone
    }
    
    # Simulate milestone execution
    Start-Sleep -Milliseconds 500
    
    $Milestone.Status = "completed"
    $Milestone.Output = "Milestone '$($Milestone.Name)' completed successfully by $($Milestone.Agent) agent."
    $Milestone.CompletedAt = Get-Date -Format "o"
    
    Write-Log "  Milestone completed: $($Milestone.Name)"
    return $Milestone
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
        Goal                = $Context.Goal
        Model               = $Context.Model
        RunId               = $Context.RunId
        JobType             = $script:JobType
        StartTime           = $Context.StartTime.ToString("o")
        EndTime             = $endTime.ToString("o")
        DurationSeconds     = [math]::Round($duration.TotalSeconds, 2)
        MilestonesCount     = $Context.Milestones.Count
        CompletedMilestones = ($Context.Milestones | Where-Object { $_.Status -eq "completed" }).Count
        Status              = "completed"
    }

    # Save summary
    $summaryPath = Join-Path $OutputDir "orchestration-summary.json"
    $summary | ConvertTo-Json -Depth 10 | Set-Content -Path $summaryPath
    Write-Log "Summary saved to: $summaryPath"

    # Save full results (including per-milestone inputs/outputs) for audit/replay.
    $resultsPath = Join-Path $OutputDir ("orchestration_results_{0}.json" -f (Get-Date -Format 'yyyyMMdd_HHmmss'))
    $full = @{
        Goal = $Context.Goal
        Model = $Context.Model
        RunId = $Context.RunId
        JobType = $script:JobType
        StartTime = $Context.StartTime.ToString("o")
        EndTime = $endTime.ToString("o")
        DurationSeconds = [math]::Round($duration.TotalSeconds, 2)
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
$script:IsDotSourced = ($MyInvocation.InvocationName -eq '.')
if (-not $script:IsDotSourced) {
try {
    $repoRoot = Get-RepoRoot
    $validatorPath = Join-Path $repoRoot "supervisor\\contract_validator.ps1"
    $routerPath = Join-Path $repoRoot "supervisor\\job_router.ps1"

    if (-not (Test-Path -LiteralPath $validatorPath)) {
        throw "Contract validator not found at $validatorPath"
    }
    if (-not (Test-Path -LiteralPath $routerPath)) {
        throw "Job router not found at $routerPath"
    }

    . $validatorPath
    . $routerPath
    $maintenanceGatesPath = Join-Path $repoRoot "supervisor\\maintenance_gates.ps1"
    if (Test-Path -LiteralPath $maintenanceGatesPath) {
        . $maintenanceGatesPath
    }

    $script:JobTypesPath = Join-Path $repoRoot "job_types.json"
    $script:RepoContextSchemaPath = Join-Path $repoRoot "contracts\\repo_context_schema.v1.json"

    if (-not $RequestPath -and $env:UAIT_REQUEST_PATH) {
        $RequestPath = $env:UAIT_REQUEST_PATH
    }
    if (-not $RequestPath -and $OutputDir) {
        $candidateRequest = Join-Path $OutputDir "request.json"
        if (Test-Path -LiteralPath $candidateRequest) {
            $RequestPath = $candidateRequest
        }
    }

    if ($ContractPath -and $RequestPath) {
        throw "Provide only one of -ContractPath or -RequestPath."
    }
    if (-not $ContractPath -and -not $RequestPath) {
        throw "ContractPath or RequestPath is required. Provide a job contract or request JSON."
    }

    $requestPreview = $null
    if ($RequestPath) {
        if (-not (Test-Path -LiteralPath $RequestPath)) {
            throw "Request file not found: $RequestPath"
        }
        $requestPreview = Get-Content -Raw -LiteralPath $RequestPath | ConvertFrom-Json -Depth 50
    }

    $contractPreview = $null
    if ($ContractPath) {
        if (-not (Test-Path -LiteralPath $ContractPath)) {
            throw "Contract file not found: $ContractPath"
        }
        $contractPreview = Get-Content -Raw -LiteralPath $ContractPath | ConvertFrom-Json -Depth 50
    }

    $resolvedJobType = $JobType
    $jobTypeSource = $null
    if (-not $resolvedJobType) {
        if ($env:UAIT_JOB_TYPE) {
            $resolvedJobType = $env:UAIT_JOB_TYPE
            $jobTypeSource = "env"
        }
        elseif ($requestPreview -and $requestPreview.job_type) {
            $resolvedJobType = $requestPreview.job_type
            $jobTypeSource = "request"
        }
        elseif ($contractPreview -and $contractPreview.job_type) {
            $resolvedJobType = $contractPreview.job_type
            $jobTypeSource = "contract"
        }
    }
    if (-not $resolvedJobType) {
        throw "JobType is required. Pass -JobType or set UAIT_JOB_TYPE."
    }
    $script:JobType = $resolvedJobType

    if ($jobTypeSource -eq "env") {
        Write-Log "JobType not provided; using UAIT_JOB_TYPE='$resolvedJobType'." -Level "WARN"
    }
    elseif ($jobTypeSource -eq "request") {
        Write-Log "JobType not provided; using request job_type '$resolvedJobType'." -Level "WARN"
    }
    elseif ($jobTypeSource -eq "contract") {
        Write-Log "JobType not provided; using contract job_type '$resolvedJobType'." -Level "WARN"
    }

    $OutputDir = Resolve-OutputDirectory -BaseDir $OutputDir -JobType $script:JobType

    $jobConfig = Get-JobTypeConfig -JobType $script:JobType -RegistryPath $script:JobTypesPath
    if ($RequestPath) {
        $compilerPath = Join-Path $repoRoot "supervisor\\contract_compiler.ps1"
        if (-not (Test-Path -LiteralPath $compilerPath)) {
            throw "Contract compiler not found at $compilerPath"
        }
        . $compilerPath
        $compileResult = Invoke-ContractCompiler -RequestPath $RequestPath -JobTypesPath $script:JobTypesPath -RepoRoot $repoRoot -OutputDir $OutputDir
        $script:RequestPath = $RequestPath
        $script:Request = $compileResult.Request
        $script:RequestSchemaPath = $compileResult.RequestSchemaPath
        $script:ContractPath = $compileResult.ContractPath
        $script:ResolvedContractPath = $compileResult.ContractPath
        $script:Contract = $compileResult.Contract
        $script:ContractHash = $compileResult.ContractHash
    }
    else {
        $schemaPath = Resolve-RepoPath -Path $(if ($jobConfig.contract_schema) { $jobConfig.contract_schema } else { $jobConfig.schema }) -RepoRoot $repoRoot
        $script:ContractPath = $ContractPath
        $contractResult = Assert-Contract -ContractPath $ContractPath -SchemaPath $schemaPath -ExpectedJobType $script:JobType
        $script:Contract = $contractResult.Contract
        $script:ContractHash = $contractResult.ContractHash
    }

    $script:Routing = Resolve-JobRouting -JobType $script:JobType -JobTypesPath $script:JobTypesPath -RepoRoot $repoRoot -Contract $script:Contract

    # Determine goal text: prioritize -Goal parameter, then -GoalFile, then contract.goal, then default
    if (-not [string]::IsNullOrEmpty($Goal)) {
        $goalText = $Goal
        Write-Log "Using goal text from -Goal parameter"
    }
    elseif (-not [string]::IsNullOrEmpty($GoalFile)) {
        if (Test-Path $GoalFile) {
            $goalText = Get-Content -Path $GoalFile -Raw -ErrorAction Stop
            Write-Log "Using goal text from file: $GoalFile"
        }
        else {
            throw "Goal file not found: $GoalFile"
        }
    }
    elseif ($script:Contract -and $script:Contract.goal) {
        $goalText = $script:Contract.goal
        Write-Log "Using goal text from contract.goal"
    }
    else {
        $goalText = "Execute default orchestration workflow"
        Write-Log "No goal, goal file, or contract goal provided; using default goal" -Level "WARN"
    }

    if ($script:Contract -and $script:Contract.goal -and ($goalText -ne $script:Contract.goal)) {
        Write-Log "Goal text does not match contract.goal; using resolved goal text." -Level "WARN"
    }

    # Initialize orchestration
    $context = Initialize-Orchestration -GoalText $goalText

    $runHeaderPipeline = $null
    if ($script:Contract -and $script:Contract.pipeline_id) {
        $runHeaderPipeline = $script:Contract.pipeline_id
    }
    elseif ($script:Routing -and $script:Routing.PipelineId) {
        $runHeaderPipeline = $script:Routing.PipelineId
    }
    Write-Log ("Run header: run_id={0}; job_type={1}; contract_universe={2}; contract_version={3}; pipeline_id={4}" -f `
        $script:RunId, `
        $script:JobType, `
        $(if ($script:Contract) { $script:Contract.contract_universe } else { "unknown" }), `
        $(if ($script:Contract) { $script:Contract.contract_version } else { "unknown" }), `
        $(if ($runHeaderPipeline) { $runHeaderPipeline } else { "unknown" }) `
    )
    
    # If a real API key isn't available, automatically fall back to a simulated run so the pipeline stays auditable.
    if (-not $DryRun -and [string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY)) {
        Write-Log "OPENAI_API_KEY not set; running in simulation mode (-DryRun implied)." -Level "WARN"
        $DryRun = $true
    }

    Write-Log "Contract: $script:ContractPath"
    if ($script:RequestPath) {
        Write-Log "Request: $script:RequestPath"
    }
    Write-Log "Contract hash: $script:ContractHash"
    Write-Log "Pipeline template: $($script:Routing.PipelineTemplatePath)"

    $manifestPath = Write-RunManifest `
        -OutputDir $OutputDir `
        -GoalText $goalText `
        -Routing $script:Routing `
        -ContractPath $script:ContractPath `
        -ContractHash $script:ContractHash `
        -ValidateOnly:$ValidateOnly `
        -RequestPath $script:RequestPath `
        -RequestSchemaPath $script:RequestSchemaPath
    Write-Log "Run manifest saved to: $manifestPath"

    if ($script:Routing -and $script:Routing.Stages) {
        Initialize-RunStatus -OutputDir $OutputDir -Stages $script:Routing.Stages
    }

    if ($ValidateOnly) {
        Write-Log "Validation only mode enabled; exiting before execution."
        Set-RunState -State "succeeded"
        exit 0
    }

    # Generate milestones from the routed pipeline
    $milestones = New-MilestonesFromStages -Stages $script:Routing.Stages

    if ($null -eq $milestones -or $milestones.Count -eq 0) {
        Write-Log "No milestones were generated from pipeline. Creating a default milestone." -Level "WARN"
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
    
    # Complete orchestration
    $summary = Complete-Orchestration -Context $context

    # Enforce policy compliance after run
    Assert-CommandPolicyCompliance -Contract $script:Contract -OutputDir $OutputDir
    Assert-RequiredArtifacts -OutputDir $OutputDir -ArtifactPolicy $script:Routing.ArtifactPolicy

    $artifactBundle = Write-RunArtifactsBundle -OutputDir $OutputDir -ArtifactPolicy $script:Routing.ArtifactPolicy
    if ($artifactBundle) {
        Write-Log "Artifacts bundle saved to: $artifactBundle"
    }

    $artifactIndexPath = Write-ArtifactIndex -OutputDir $OutputDir
    if ($artifactIndexPath) {
        Write-Log "Artifact index saved to: $artifactIndexPath"
    }
    Update-RunStateArtifacts -OutputDir $OutputDir
    Save-RunStatus

    Set-RunState -State "succeeded"
    
    Write-Host ""
    Write-Host "Orchestration completed successfully!" -ForegroundColor Green
    Write-Host "Summary: $($summary | ConvertTo-Json -Compress)"
    
    exit 0
}
catch {
    $errorMessage = ("{0}" -f $_)
    Write-Log "Orchestration failed: $errorMessage" -Level "ERROR"
    Write-Host "Orchestration failed: $errorMessage" -ForegroundColor Red
    try {
        if ($OutputDir -and (Test-Path -LiteralPath $OutputDir)) {
            Write-RunErrorArtifact -OutputDir $OutputDir -Message ("Orchestration failed: {0}" -f $errorMessage) | Out-Null
            Write-RunArtifactsBundle -OutputDir $OutputDir -ArtifactPolicy $(if ($script:Routing) { $script:Routing.ArtifactPolicy } else { $null }) | Out-Null
            $artifactIndexPath = Write-ArtifactIndex -OutputDir $OutputDir
            if ($artifactIndexPath) {
                Write-Log "Artifact index saved to: $artifactIndexPath"
            }
            Update-RunStateArtifacts -OutputDir $OutputDir
            Save-RunStatus
        }
    }
    catch {
        # swallow artifact index errors on failure
    }
    try {
        Set-RunState -State "failed" -ErrorMessage $errorMessage
    }
    catch { }
    exit 1
}
}
