<#
.SYNOPSIS
  Deterministic agentic runner for DAG plans with parallel waves.

.DESCRIPTION
  - Loads a plan JSON (Supervisor-format).
  - Validates step integrity (IDs, deps, inputs produced by prior steps).
  - Optionally recomputes waves from dependencies.
  - Executes steps wave-by-wave; writes artifacts/envelopes per step.
  - Tool bindings are stubbed but hardened; swap with real handlers as needed.

  Worktree mode (-UseWorktrees):
    Each step runs in an isolated git worktree on its own branch.
    Successful step branches merge into a per-run integration branch;
    failed step branches are quarantined for forensics. Use -MergeIntegrationTo
    to fast-forward a target branch to the run's integration branch on success.

.EXAMPLE
  # Standard mode (no git):
  .\Run-Orchestration.ps1 -PlanPath plan.example.json

.EXAMPLE
  # Worktree mode against an external repo:
  .\Run-Orchestration.ps1 -PlanPath plan.worktree-example.json `
      -UseWorktrees -RepoRoot C:\path\to\target\repo `
      -BaseRef main -RunId my-run-001 -MergeIntegrationTo main

.NOTES
  PS 5.1 / 7+ compatible. Strings use $() when followed by a colon to avoid scope-qualifier parser traps.
  Worktree mode requires git 2.5+.
#>

[CmdletBinding()]
param(
    [Parameter(Position=0, Mandatory=$true)]
    [string]$PlanPath,

    [Parameter(Position=1)]
    [string]$ConfigPath = ".\runner.config.json",

    # When set, recompute waves from dependencies instead of trusting plan
    [switch]$RecomputeWaves,

    # When set, run each step in an isolated git worktree on its own branch.
    # Successful step branches merge into a per-run integration branch;
    # failed step branches are quarantined for forensics.
    [switch]$UseWorktrees,

    # Target repository for worktree operations. Defaults to git root containing this script.
    [string]$RepoRoot,

    # Run identifier for branch/worktree naming. Auto-generated if omitted.
    [string]$RunId,

    # Base branch the run integration branch is forked from.
    [string]$BaseRef = 'main',

    # On successful run, fast-forward this branch to the integration branch.
    # Empty = leave integration branch as-is for later PR review.
    [string]$MergeIntegrationTo,

    # Push the merged target branch (or integration branch if no merge target) to remote.
    [switch]$PushOnComplete,

    # On any wave failure, run aggressive cleanup (drop quarantine branches too).
    [switch]$PurgeOnFailure
)

### ======================================================================
### Helpers
### ======================================================================

function Read-JsonFile {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -Path $Path)) { throw "File not found: $($Path)" }
    Get-Content -Raw -Path $Path | ConvertFrom-Json -Depth 100
}

function Write-JsonFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][object]$Object,
        [Parameter(Mandatory)][string]$Path
    )
    if ($null -eq $Object) {
        throw ("Write-JsonFile: -Object is null for path {0}. Upstream must not pass `$null." -f $Path)
    }
    $dir = Split-Path -Parent -Path $Path
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    $json = $Object | ConvertTo-Json -Depth 100
    Set-Content -Path $Path -Value $json -Encoding UTF8
}

# Kahn’s algorithm → compute topological "waves" (parallel layers).
function Get-PlanWaves {
    [CmdletBinding()]
    param([Parameter(Mandatory)][array]$Steps)

    $deps     = @{}
    $inDegree = @{}

    foreach ($s in $Steps) {
        $id = [int]$s.id
        $deps[$id] = [System.Collections.Generic.HashSet[int]]::new()
        foreach ($d in ($s.dependencies | ForEach-Object { [int]$_ })) {
            if ($d -ne 0) { [void]$deps[$id].Add($d) }
        }
        $inDegree[$id] = $deps[$id].Count
    }

    $waves = @()
    $ready = [System.Collections.Generic.List[int]]::new()
    foreach ($k in $inDegree.Keys) { if ($inDegree[$k] -eq 0) { $ready.Add($k) } }

    while ($ready.Count -gt 0) {
        $currentWave = @()
        $currentWave += $ready.ToArray()
        $waves += ,$currentWave
        $ready.Clear()

        foreach ($u in $currentWave) {
            foreach ($v in $Steps | Where-Object { $_.dependencies -contains $u }) {
                $vid = [int]$v.id
                $inDegree[$vid]--
                if ($inDegree[$vid] -eq 0) { $ready.Add($vid) }
            }
        }
    }

    if (($inDegree.Values | Where-Object { $_ -gt 0 }).Count -gt 0) {
        throw "Cycle detected or unsatisfied dependencies."
    }

    return ,$waves
}

# Return key/value pairs from Hashtable or PSCustomObject
function Get-ObjectPairs {
    [CmdletBinding()]
    param([Parameter(Mandatory)][object]$InputObject)

    if ($null -eq $InputObject) { return @() }

    if ($InputObject -is [hashtable]) {
        return @($InputObject.GetEnumerator())
    }

    return @(
        $InputObject.PSObject.Properties |
        Where-Object { $_.MemberType -eq 'NoteProperty' } |
        ForEach-Object { @{ Key = $_.Name; Value = $_.Value } }
    )
}

# Recursively normalize JSON-shaped objects into Hashtable/arrays/scalars
# NOTE: Returns hashtables for objects, proper PowerShell arrays for collections, and scalars as-is
# This ensures compatibility with functions expecting [hashtable] parameters like Assert-ToolArgs
function Convert-ToHashtable {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [AllowNull()]
        [object]$Input
    )

    if ($null -eq $Input) { return $null }
    if ($Input -is [hashtable]) { return $Input }

    # Convert collections to PowerShell arrays (not ArrayList) to avoid type mismatch errors
    # when the result is passed to functions expecting hashtables
    if ($Input -is [System.Collections.IEnumerable] -and -not ($Input -is [string])) {
        $list = @()
        foreach ($item in $Input) {
            $list += Convert-ToHashtable -Input $item
        }
        return ,$list
    }

    # Convert PSCustomObject to hashtable for consistent parameter passing
    if ($Input -is [pscustomobject]) {
        $ht = @{}
        foreach ($prop in $Input.PSObject.Properties) {
            if ($prop.MemberType -eq 'NoteProperty') {
                $ht[$prop.Name] = Convert-ToHashtable -Input $prop.Value
            }
        }
        return $ht
    }

    return $Input
}

# Assert tool args include required keys (fail loud & early)
# NOTE: This function requires $Args to be a [hashtable] type.
# Callers must normalize their input using Convert-ToHashtable before passing to this function.
function Assert-ToolArgs {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$ToolName,
        [Parameter(Mandatory)][hashtable]$Args,
        [Parameter(Mandatory)][string[]]$RequiredKeys
    )
    foreach ($k in $RequiredKeys) {
        if (-not $Args.ContainsKey($k) -or $null -eq $Args[$k] -or "$($Args[$k])" -eq "") {
            throw ("Tool '{0}' requires argument '{1}'." -f $ToolName, $k)
        }
    }
}

# Validate structure (unique IDs, step 1 -> [0], inputs produced by prior steps)
function Test-PlanIntegrity {
    <#
    .SYNOPSIS
      Validates a Supervisor plan for structural integrity.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory)][pscustomobject]$Plan)

    if (-not $Plan.steps) { throw "Plan has no 'steps' array." }

    # Unique IDs
    $ids = @{}
    foreach ($s in $Plan.steps) {
        if ($null -eq $s.id) { throw "Step is missing 'id'." }
        if ($ids.ContainsKey($s.id)) { throw ("Duplicate step id {0}." -f $s.id) }
        $ids[$s.id] = $true
    }

    # Normalize per-step arrays and check Step 1 dep [0]
    foreach ($s in $Plan.steps) {
        if ($null -eq $s.produces)     { $s | Add-Member -NotePropertyName produces     -NotePropertyValue @() }
        if ($null -eq $s.dependencies) { $s | Add-Member -NotePropertyName dependencies -NotePropertyValue @() }
        if (-not ($s.produces -is [System.Collections.IEnumerable]))     { throw ("Step {0} 'produces' must be an array." -f $s.id) }
        if (-not ($s.dependencies -is [System.Collections.IEnumerable])) { throw ("Step {0} 'dependencies' must be an array." -f $s.id) }

        if ([int]$s.id -eq 1) {
            $deps = @($s.dependencies | ForEach-Object { [int]$_ })
            if (-not ($deps -contains 0)) { throw "Step 1 must have dependency [0]." }
        }
    }

    # Inputs must come from prior steps (by ID order)
    foreach ($s in $Plan.steps) {
        $producedByPredecessors = [System.Collections.Generic.HashSet[string]]::new()
        foreach ($p in $Plan.steps) {
            if ([int]$p.id -lt [int]$s.id) {
                foreach ($name in @($p.produces)) {
                    if ($null -ne $name) { [void]$producedByPredecessors.Add([string]$name) }
                }
            }
        }

        if (-not $s.inputs) { continue }

        foreach ($kv in (Get-ObjectPairs -InputObject $s.inputs)) {
            $v = $kv.Value
            $vals = @()
            if ($null -ne $v -and ($v -is [System.Collections.IEnumerable]) -and -not ($v -is [string])) {
                $vals = @($v | ForEach-Object { [string]$_ })
            } elseif ($null -ne $v) {
                $vals = @([string]$v)
            }

            foreach ($artifactName in $vals) {
                if (-not $producedByPredecessors.Contains([string]$artifactName)) {
                    throw ("Step {0} input '{1}' is not produced by any prior step." -f $s.id, $artifactName)
                }
            }
        }
    }

    return $true
}

# Build artifact path like: ./artifacts/<planName>/step<id>/
function Get-StepArtifactPath {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Root,
        [Parameter(Mandatory)][string]$PlanName,
        [Parameter(Mandatory)][int]$StepId
    )
    $safePlan = ($PlanName -replace '[^\w\-\.]', '_')
    Join-Path -Path $Root -ChildPath ("{0}\step{1}" -f $safePlan, $StepId)
}

# Write a standard agent envelope (tolerant to empty arrays)
function Write-AgentEnvelope {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][int]$StepId,
        [Parameter(Mandatory)][string]$Agent,
        [Parameter(Mandatory)][string]$Status,
        [object[]]$Artifacts = @(),
        [string[]]$InputsUsed,
        [string]$Prose,
        [string[]]$NextHints,
        [Parameter(Mandatory)][string]$EnvelopePath
    )

    if (-not $Artifacts) { $Artifacts = @() }
    if (-not $InputsUsed) { $InputsUsed = @() }
    if (-not $NextHints)  { $NextHints  = @() }

    $envelope = [ordered]@{
        stepId     = $StepId
        agent      = $Agent
        status     = $Status
        inputsUsed = $InputsUsed
        artifacts  = $Artifacts
        prose      = $Prose
        nextHints  = $NextHints
        timestamp  = (Get-Date).ToString("s")
    }
    Write-JsonFile -Object $envelope -Path $EnvelopePath
}

### ======================================================================
### Tool Bindings (stubs you can replace later)
### ======================================================================

function Invoke-Tool {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Name,

        # Accept -Args/-Arguments; may be PSCustomObject, Hashtable, or null
        # NOTE: This parameter accepts flexible input types from JSON deserialization.
        # It will be normalized to a hashtable by Convert-ToHashtable before use.
        # Expected shape after normalization: @{ key1 = value1; key2 = value2; ... }
        [Alias('Arguments')]
        [object]$Args,

        [Parameter(Mandatory)][string]$OutDir
    )

    # Normalize to Hashtable/arrays/scalars to ensure type consistency
    # This prevents "Cannot convert ArrayList to Hashtable" errors
    $Args = Convert-ToHashtable -Input $Args

    switch -Regex ($Name) {
        '^github:getRepoTree$' {
            Assert-ToolArgs -ToolName $Name -Args ($Args ?? @{}) -RequiredKeys @('repoUrl')
            $payload = @{
                repoUrl = $Args.repoUrl
                tree    = @("/README.md","/src/index.js","/src/app.ts","/package.json")
            }
            $out = Join-Path $OutDir 'repoTree.json'
            Write-JsonFile -Object $payload -Path $out
            return @(@{ name="repoTree"; type="json"; uri=$out })
        }

        '^github:getFilesContent$' {
            Assert-ToolArgs -ToolName $Name -Args ($Args ?? @{}) -RequiredKeys @('repoUrl')
            $files = @{}
            foreach ($p in @($Args.paths)) { $files[$p] = ("// content for {0}" -f $p) }
            $dir = Join-Path $OutDir 'filesContent'
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            foreach ($k in $files.Keys) {
                $safe = ($k -replace '[\\/]', '_')
                Set-Content -Path (Join-Path $dir $safe) -Value $files[$k] -Encoding UTF8
            }
            return @(@{ name="filesContent"; type="dir"; uri=$dir })
        }

        '^selector:selectFiles$' {
            # Args are optional here; default limit if absent/bad
            $Args  = ($Args ?? @{})
            $limit = 5
            if ($Args.ContainsKey('limit')) {
                try { $limit = [int]$Args.limit } catch { $limit = 5 }
            }
            if ($limit -lt 1) { $limit = 5 }

            $top = @("/src/app.ts","/src/index.js","/package.json","/README.md","/src/utils.ts")
            $selected = $top | Select-Object -First $limit
            if ($null -eq $selected) { $selected = @() }

            $out = Join-Path $OutDir 'top5Files.json'
            Write-JsonFile -Object $selected -Path $out
            return @(@{ name="top5Files"; type="json"; uri=$out })
        }

        '^swarms:run$' {
            Assert-ToolArgs -ToolName $Name -Args ($Args ?? @{}) -RequiredKeys @('goal')

            $toolboxRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\\..')).Path
            $runner = Join-Path $toolboxRoot 'scripts\\swarms\\toolbox_runner.py'
            if (-not (Test-Path $runner)) {
                throw "Swarms runner not found: $runner"
            }

            $python = $env:SWARMS_PYTHON_BIN
            if (-not $python) { $python = $env:PYTHON_BIN }
            if (-not $python) { $python = 'python' }

            $repoRoot = if ($Args.ContainsKey('repoRoot') -and $Args.repoRoot) { [string]$Args.repoRoot } else { $toolboxRoot }
            $agents = if ($Args.ContainsKey('agents') -and $Args.agents) { $Args.agents } else { $null }
            $model = if ($Args.ContainsKey('model') -and $Args.model) { [string]$Args.model } else { '' }
            $swarmType = if ($Args.ContainsKey('swarmType') -and $Args.swarmType) { [string]$Args.swarmType } else { '' }
            $maxLoops = 1
            if ($Args.ContainsKey('maxLoops') -and $Args.maxLoops) { try { $maxLoops = [int]$Args.maxLoops } catch { $maxLoops = 1 } }

            $argv = @('-u', $runner, '--goal', [string]$Args.goal, '--repo-root', $repoRoot, '--output-dir', $OutDir, '--max-loops', "$maxLoops")
            if ($agents) {
                if ($agents -is [System.Collections.IEnumerable] -and -not ($agents -is [string])) {
                    $argv += @('--agents', (($agents | ForEach-Object { [string]$_ }) -join ','))
                } else {
                    $argv += @('--agents', [string]$agents)
                }
            }
            if ($model) { $argv += @('--model', $model) }
            if ($swarmType) { $argv += @('--swarm-type', $swarmType) }

            $stdout = & $python @argv 2>&1 | Out-String
            $line = ($stdout -split "(`r`n|`n|`r)" | Where-Object { $_.Trim().StartsWith('{') -and $_.Trim().EndsWith('}') } | Select-Object -Last 1)
            if (-not $line) { throw "Swarms tool returned no JSON payload. Output: $stdout" }
            $obj = $line | ConvertFrom-Json -Depth 50

            $out = Join-Path $OutDir 'swarmResult.json'
            Write-JsonFile -Object $obj -Path $out
            return @(@{ name="swarmResult"; type="json"; uri=$out })
        }
 
        default {
            throw ("Unknown tool '{0}'. Bind it here." -f $Name)
        }
    }
}

### ======================================================================
### Agent Handlers
### ======================================================================

function Invoke-Agent {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][pscustomobject]$Step,
        [Parameter(Mandatory)][pscustomobject]$Plan,
        [Parameter(Mandatory)][string]$ArtifactRoot,
        [Parameter(Mandatory)][string]$PlanName,
        # Optional per-step worktree dir. When provided, agents that modify code
        # should write into this directory (a real git worktree on a step branch).
        [Parameter()][string]$WorktreeDir
    )

    $stepDir = Get-StepArtifactPath -Root $ArtifactRoot -PlanName $PlanName -StepId ([int]$Step.id)
    if (-not (Test-Path $stepDir)) { New-Item -ItemType Directory -Path $stepDir | Out-Null }

    # Flatten inputs for envelope
    $inputsUsed = @()
    if ($Step.inputs) {
        $inputsUsed = @(
            Get-ObjectPairs -InputObject $Step.inputs |
            ForEach-Object {
                $v = $_.Value
                if ($null -ne $v -and ($v -is [System.Collections.IEnumerable]) -and -not ($v -is [string])) { $v }
                elseif ($null -ne $v) { ,$v }
            } | ForEach-Object { [string]$_ }
        )
    }

    $artifacts = @()
    $status = "OK"
    $prose = $null
    $next = @("Proceed to next step")

    try {
        switch ($Step.agent) {

            'GitHub Tool User' {
                if ($Step.tool) {
                    $toolArgs = if ($Step.tool.args) { $Step.tool.args } else { @{} } # never $null
                    $artifacts = Invoke-Tool -Name $Step.tool.name -Args $toolArgs -OutDir $stepDir
                    $prose = "Tool executed: $($Step.tool.name)"
                } else {
                    throw "GitHub Tool User requires a tool binding."
                }
            }

            'Code Generator' {
                if ($Step.tool) {
                    $toolArgs = if ($Step.tool.args) { $Step.tool.args } else { @{} }
                    $artifacts = Invoke-Tool -Name $Step.tool.name -Args $toolArgs -OutDir $stepDir
                    $prose = "Code Generator executed tool: $($Step.tool.name)"
                } else {
                    # Stub implementation: produces a placeholder patch when no tool is bound.
                    # This is intentional for testing/demonstration. Production workflows should
                    # bind a real code generation tool via the 'tool' property.
                    Write-Warning "Code Generator step $($Step.id) has no tool binding. Producing placeholder patch."
                    $patch = @{ 
                        status = "placeholder"
                        message = "No code generation tool bound to this step. Configure a tool in the plan JSON."
                        changes = @()
                    }
                    $out = Join-Path $stepDir 'patch.json'
                    Write-JsonFile -Object $patch -Path $out
                    $artifacts += @{ name="patch"; type="json"; uri=$out }
                    $prose = "Code Generator produced placeholder (no tool bound)."
                }
            }

            'Implementer' {
                # Stub: emit review + patch + test report; swap with real build/test logic
                $review = @"
## Review Notes
- Approach rationale…
- Findings…
- Risks & mitigations…
"@
                $reviewPath = Join-Path $stepDir ("review_step{0}.md" -f $Step.id)
                Set-Content -Path $reviewPath -Value $review -Encoding UTF8
                $artifacts += @{ name = ("review{0}.md" -f ($(if ($Step.id -eq 4) {'A'} else {'B'}))); type="markdown"; uri=$reviewPath }

                $patch = @{ changes = @("fix: stub change for step $($Step.id)") }
                $patchPath = Join-Path $stepDir ("patch{0}.json" -f ($(if ($Step.id -eq 4) {'A'} else {'B'})))
                Write-JsonFile -Object $patch -Path $patchPath
                $artifacts += @{ name = Split-Path -Leaf $patchPath -ErrorAction SilentlyContinue; type="json"; uri=$patchPath }

                $tests = @{ passed = 12; failed = 0; coverage = 0.78 }
                $testPath = Join-Path $stepDir ("testReport{0}.json" -f ($(if ($Step.id -eq 4) {'A'} else {'B'})))
                Write-JsonFile -Object $tests -Path $testPath
                $artifacts += @{ name = Split-Path -Leaf $testPath; type="json"; uri=$testPath }
            }

            'Reviewer' {
                # Simple rubric-based chooser for two candidates (A/B)
                function Get-ScoreFromReport([string]$label) {
                    $sid = if ($label -eq 'A') { 4 } else { 5 }
                    $dir = Get-StepArtifactPath -Root $ArtifactRoot -PlanName $PlanName -StepId $sid
                    $tr  = Get-ChildItem -Path $dir -Filter "testReport*.json" -ErrorAction SilentlyContinue | Select-Object -First 1
                    if ($null -eq $tr) { return 2.5 }
                    $obj = Get-Content -Raw -Path $tr.FullName | ConvertFrom-Json
                    if ($obj.failed -eq 0) { return 4.5 } else { return 3.2 }
                }

                $scoreA = Get-ScoreFromReport -label 'A'
                $scoreB = Get-ScoreFromReport -label 'B'
                $winner = if ($scoreA -ge $scoreB) { 'ImplementerA' } else { 'ImplementerB' }

                $reviewObj = [ordered]@{
                    decision = "APPROVE"
                    reason   = "Winner selected by rubric heuristic."
                    rubric   = @{
                        criteria = @(
                            @{ name="Correctness";      weight=0.4; score = if ($winner -eq 'ImplementerA') { $scoreA } else { $scoreB } },
                            @{ name="Completeness";     weight=0.3; score = 4.0 },
                            @{ name="Performance/Cost"; weight=0.2; score = 3.8 },
                            @{ name="Maintainability";  weight=0.1; score = 3.9 }
                        )
                        compositeScore = [math]::Round((($scoreA + $scoreB)/2),2)
                    }
                    comparison = @{
                        candidates = @(
                            @{ label="ImplementerA"; summary="A candidate artifacts present" },
                            @{ label="ImplementerB"; summary="B candidate artifacts present" }
                        )
                        winner = $winner
                    }
                    actions = @(
                        @{ type="PROMOTE_ARTIFACTS"; from=$winner; artifacts=@("buildOutput","testReport") }
                    )
                }

                $winnerPath = Join-Path $stepDir 'winner.json'
                Write-JsonFile -Object $reviewObj -Path $winnerPath
                $artifacts += @{ name="winner.json"; type="json"; uri=$winnerPath }
                $prose = "Reviewer selected $($winner)."
            }

            'Report Writer' {
                $out = @"
# Final Report
- Goal: $($Plan.goal)
- Summary: Winner promoted and actions recorded.
"@
                $outPath = Join-Path $stepDir 'finalReport.md'
                Set-Content -Path $outPath -Value $out -Encoding UTF8
                $artifacts += @{ name="finalReport.md"; type="markdown"; uri=$outPath }
            }

            default {
                throw "No handler bound for agent '$($Step.agent)'."
            }
        }
    }
    catch {
        $status = "FAILED"
        $prose  = "⚠️  Step $($Step.id) failed: $($_.Exception.Message)"
        $next   = @("Notify Supervisor", "Inspect logs at $($stepDir)")
    }
    finally {
        if (-not $artifacts) { $artifacts = @() }  # ensure non-null
        $envPath = Join-Path $stepDir 'envelope.json'
        Write-AgentEnvelope -StepId ([int]$Step.id) -Agent $Step.agent -Status $status -Artifacts $artifacts -InputsUsed $inputsUsed -Prose $prose -NextHints $next -EnvelopePath $envPath
    }

    return @{
        Status      = $status
        Artifacts   = $artifacts
        Dir         = $stepDir
        StepId      = [int]$Step.id
        WorktreeDir = $WorktreeDir
    }
}

### ======================================================================
### Main
### ======================================================================

# Load plan & config
$Plan   = Read-JsonFile -Path $PlanPath
$Config = Read-JsonFile -Path $ConfigPath

# Prepare artifact root
$artifactRoot = Resolve-Path -Path $Config.artifactRoot -ErrorAction SilentlyContinue
if (-not $artifactRoot) {
    New-Item -ItemType Directory -Path $Config.artifactRoot | Out-Null
    $artifactRoot = Resolve-Path -Path $Config.artifactRoot
}

# Integrity checks
Test-PlanIntegrity -Plan $Plan | Out-Null

# Optionally recompute waves
if ($RecomputeWaves) {
    $Plan.waves = Get-PlanWaves -Steps $Plan.steps
}

# Human-readable plan name for foldering
$planNameRaw = ($Plan.goal -replace '[^\w\-\.]', '_')
$planName = $planNameRaw.Substring(0, [Math]::Min(40, $planNameRaw.Length))

# ----------------------------------------------------------------------
# Worktree mode: opt-in via -UseWorktrees, or via config.worktree.enabled
# ----------------------------------------------------------------------
$worktreeEnabled = $UseWorktrees.IsPresent
if (-not $worktreeEnabled -and $Config.PSObject.Properties.Name -contains 'worktree' -and $Config.worktree.enabled) {
    $worktreeEnabled = [bool]$Config.worktree.enabled
}

$wtContext = $null
if ($worktreeEnabled) {
    Import-Module (Join-Path $PSScriptRoot 'WorktreeExecutor.psm1') -Force

    if (-not $RepoRoot) {
        # Default: the repo containing this script
        $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
    }
    if (-not (Test-GitRepo -Path $RepoRoot)) {
        throw ("Worktree mode requested but RepoRoot is not a git repo: {0}" -f $RepoRoot)
    }
    if (-not $RunId) { $RunId = $planName }

    Write-Host ("Worktree mode: ON (repo={0}, base={1}, runId={2})" -f $RepoRoot, $BaseRef, $RunId) -ForegroundColor Magenta
    $wtContext = Initialize-RunIntegration -RepoRoot $RepoRoot -RunId $RunId -BaseRef $BaseRef
    Write-Host ("Integration branch: {0}" -f $wtContext.IntegrationBranch) -ForegroundColor DarkMagenta
}

Write-Host ("Executing plan: {0}" -f $Plan.goal) -ForegroundColor Cyan
Write-Host ("Waves: {0}" -f ([string]::Join(' | ', ($Plan.waves | ForEach-Object { '[' + ($_ -join ',') + ']' })))) -ForegroundColor DarkCyan

$runFailed = $false

try {
    # Execute wave-by-wave (sequential per wave; parallelization is optional)
    foreach ($wave in $Plan.waves) {
        Write-Host ("--- Wave: {0}" -f (($wave -join ', '))) -ForegroundColor Yellow

        # Pre-create worktrees for every step in the wave (so parallel steps don't race the integration branch)
        $waveWorktrees = @{}
        if ($wtContext) {
            foreach ($id in $wave) {
                $waveWorktrees[$id] = New-RunWorktree -Context $wtContext -StepId ([int]$id)
            }
        }

        $results = foreach ($id in $wave) {
            $step = $Plan.steps | Where-Object { $_.id -eq $id }
            $wtDir = if ($waveWorktrees.ContainsKey($id)) { $waveWorktrees[$id] } else { $null }
            Invoke-Agent -Step $step -Plan $Plan -ArtifactRoot $artifactRoot -PlanName $planName -WorktreeDir $wtDir
        }

        # Post-wave: merge OK steps, quarantine FAILED steps
        if ($wtContext) {
            foreach ($r in $results) {
                $status = if ($r.Status -eq 'OK') { 'OK' } else { 'FAILED' }
                $stepRecord = $Plan.steps | Where-Object { [int]$_.id -eq [int]$r.StepId } | Select-Object -First 1
                $agentLabel = if ($stepRecord) { $stepRecord.agent } else { 'unknown' }
                Merge-RunWorktree -Context $wtContext -StepId ([int]$r.StepId) -Status $status `
                    -CommitMessage ("uaitb: step {0} ({1})" -f $r.StepId, $agentLabel)
            }
        }

        if ($results | Where-Object { $_.Status -eq 'FAILED' }) {
            Write-Warning ("Wave failed. See artifacts at: {0}" -f ($results | Select-Object -First 1).Dir)
            $runFailed = $true
            break
        }
    }

    # Finalize integration branch
    if ($wtContext -and -not $runFailed) {
        $finalize = Complete-RunIntegration -Context $wtContext -MergeTo $MergeIntegrationTo -PushRemote:$PushOnComplete
        Write-Host ("Run integration: merged={0} quarantined={1} mergedTo={2} pushed={3}" -f `
            $finalize.mergedSteps.Count, $finalize.quarantined.Count, $finalize.mergedTo, $finalize.pushed) -ForegroundColor Green
    }
    elseif ($wtContext -and $runFailed) {
        Write-Warning ("Run failed. Integration branch '{0}' preserved for inspection. Quarantined: {1}" -f `
            $wtContext.IntegrationBranch, ($wtContext.Quarantined | ForEach-Object { $_.Branch } | Sort-Object) -join ', ')
        if ($PurgeOnFailure) {
            Remove-RunArtifacts -Context $wtContext -IncludeQuarantine
            Write-Warning "Purged all run artifacts (including quarantined branches)."
        }
    }
}
catch {
    Write-Error ("Run aborted: {0}" -f $_.Exception.Message)
    if ($wtContext -and $PurgeOnFailure) {
        Remove-RunArtifacts -Context $wtContext -IncludeQuarantine
    }
    throw
}

if ($runFailed) {
    Write-Host "Done (with failures)." -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "Done." -ForegroundColor Green
}
