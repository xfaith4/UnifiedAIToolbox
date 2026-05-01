<#
.SYNOPSIS
  Blocking gate policy layer for the orchestration runner.

.DESCRIPTION
  Plans may declare a 'gates' array. Each gate is evaluated at a defined
  checkpoint (after a step, after a wave, or after a phase). A gate may:
    - PASS  -> run continues
    - FAIL  -> if blocking, run halts (preserving worktrees); if non-blocking,
               failure is recorded but wave proceeds
    - RETRY -> if retries remain, the offending wave is re-run with feedback;
               otherwise treated as FAIL

  Gate types built in:
    Critic            - rubric/score-based, threshold check
    Commissioner      - go/no-go ROI evaluation
    RunCommand        - executes a shell command in a worktree; non-zero exit = FAIL
    ContractValidator - calls supervisor/contract_validator.ps1 with a contract path
    Custom            - calls a PowerShell scriptblock you register with Register-GateHandler

  Plan format:
    {
      "gates": [
        {
          "id": "critic-after-impl",
          "type": "Critic",
          "after": "wave:1",
          "threshold": 4.0,
          "blocking": true,
          "maxRetries": 2
        }
      ]
    }

  Anchor syntax for "after":
    "wave:N"  - after wave N (1-indexed)
    "step:N"  - after step N
    "all"     - after every wave
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:CustomHandlers = @{}

function Register-GateHandler {
    <#
    .SYNOPSIS
      Register a custom gate type with a scriptblock evaluator.
    .DESCRIPTION
      The scriptblock receives a hashtable with: Gate, WaveResults, RunContext, ArtifactRoot.
      It must return a hashtable: @{ Status = 'PASS'|'FAIL'|'RETRY'; Reason = '...'; Details = @{} }.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$TypeName,
        [Parameter(Mandatory)][scriptblock]$Handler
    )
    $script:CustomHandlers[$TypeName] = $Handler
}

function Get-GatesForCheckpoint {
    <#
    .SYNOPSIS
      Returns the gates that should fire at a given checkpoint.
    .PARAMETER Plan
      The full plan object (must have a 'gates' array; missing is treated as empty).
    .PARAMETER Checkpoint
      One of: "wave:N", "step:N", "all".
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][pscustomobject]$Plan,
        [Parameter(Mandatory)][string]$Checkpoint,
        [Parameter()][int]$WaveIndex,
        [Parameter()][int[]]$WaveStepIds
    )

    if (-not ($Plan.PSObject.Properties.Name -contains 'gates') -or -not $Plan.gates) {
        return @()
    }

    $matching = @()
    foreach ($g in $Plan.gates) {
        $after = [string]$g.after
        if (-not $after) { continue }

        $hit = $false
        if ($after -eq 'all' -and $Checkpoint -like 'wave:*') {
            $hit = $true
        }
        elseif ($after -eq $Checkpoint) {
            $hit = $true
        }
        elseif ($after -like 'step:*' -and $Checkpoint -like 'wave:*' -and $WaveStepIds) {
            $stepNum = [int]($after -replace 'step:', '')
            if ($WaveStepIds -contains $stepNum) { $hit = $true }
        }

        if ($hit) { $matching += $g }
    }
    return $matching
}

function Invoke-Gate {
    <#
    .SYNOPSIS
      Evaluate a single gate and return its verdict.
    .OUTPUTS
      Hashtable: @{ Status='PASS'|'FAIL'|'RETRY'; Reason=...; Details=@{}; GateId=...; Type=... }
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][pscustomobject]$Gate,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$WaveResults,
        [Parameter()][object]$RunContext,
        [Parameter()][string]$ArtifactRoot
    )

    $gateId = if ($Gate.PSObject.Properties.Name -contains 'id') { [string]$Gate.id } else { "gate-$(Get-Random)" }
    $type = [string]$Gate.type

    $verdict = $null
    try {
        switch ($type) {
            'Critic'            { $verdict = Test-CriticGate            -Gate $Gate -WaveResults $WaveResults -ArtifactRoot $ArtifactRoot }
            'Commissioner'      { $verdict = Test-CommissionerGate      -Gate $Gate -WaveResults $WaveResults -ArtifactRoot $ArtifactRoot }
            'RunCommand'        { $verdict = Test-RunCommandGate        -Gate $Gate -WaveResults $WaveResults -RunContext $RunContext }
            'ContractValidator' { $verdict = Test-ContractValidatorGate -Gate $Gate -WaveResults $WaveResults -RunContext $RunContext }
            default {
                if ($script:CustomHandlers.ContainsKey($type)) {
                    $handler = $script:CustomHandlers[$type]
                    $verdict = & $handler @{
                        Gate = $Gate; WaveResults = $WaveResults
                        RunContext = $RunContext; ArtifactRoot = $ArtifactRoot
                    }
                } else {
                    $verdict = @{ Status = 'FAIL'; Reason = "Unknown gate type '$type'"; Details = @{} }
                }
            }
        }
    }
    catch {
        $verdict = @{ Status = 'FAIL'; Reason = "Gate handler threw: $($_.Exception.Message)"; Details = @{} }
    }

    if (-not $verdict) {
        $verdict = @{ Status = 'FAIL'; Reason = 'Gate returned no verdict'; Details = @{} }
    }
    if (-not $verdict.ContainsKey('Status')) { $verdict.Status = 'FAIL' }
    if (-not $verdict.ContainsKey('Reason')) { $verdict.Reason = '' }
    if (-not $verdict.ContainsKey('Details')) { $verdict.Details = @{} }

    $verdict.GateId = $gateId
    $verdict.Type = $type
    $verdict.Blocking = if ($Gate.PSObject.Properties.Name -contains 'blocking') { [bool]$Gate.blocking } else { $true }
    $verdict.MaxRetries = if ($Gate.PSObject.Properties.Name -contains 'maxRetries') { [int]$Gate.maxRetries } else { 0 }

    return $verdict
}

function Save-GateResult {
    <#
    .SYNOPSIS
      Persist a gate verdict to the artifact tree for audit.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][hashtable]$Verdict,
        [Parameter(Mandatory)][string]$ArtifactRoot,
        [Parameter(Mandatory)][string]$PlanName,
        [Parameter()][int]$Attempt = 1
    )
    $safePlan = ($PlanName -replace '[^\w\-\.]', '_')
    $gatesDir = Join-Path $ArtifactRoot ("{0}\gates" -f $safePlan)
    if (-not (Test-Path $gatesDir)) { New-Item -ItemType Directory -Path $gatesDir -Force | Out-Null }

    $fileName = ("gate_{0}_attempt{1}_{2}.json" -f $Verdict.GateId, $Attempt, (Get-Date -Format 'HHmmss'))
    $payload = [ordered]@{
        gateId    = $Verdict.GateId
        type      = $Verdict.Type
        status    = $Verdict.Status
        blocking  = $Verdict.Blocking
        attempt   = $Attempt
        reason    = $Verdict.Reason
        details   = $Verdict.Details
        timestamp = (Get-Date).ToString("s")
    }
    $path = Join-Path $gatesDir $fileName
    $payload | ConvertTo-Json -Depth 10 | Set-Content -Path $path -Encoding UTF8
    return $path
}

# ---------------------------------------------------------------------------
# Built-in gate handlers
# ---------------------------------------------------------------------------

function Test-CriticGate {
    <#
    .SYNOPSIS
      Looks for a winner.json or rubric file in wave outputs and checks the
      composite score against the gate threshold.
    #>
    param(
        [Parameter(Mandatory)][pscustomobject]$Gate,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$WaveResults,
        [Parameter()][string]$ArtifactRoot
    )

    $threshold = if ($Gate.PSObject.Properties.Name -contains 'threshold') { [double]$Gate.threshold } else { 4.0 }

    # Look for any winner.json or *Score* artifact in the results
    $scores = @()
    foreach ($r in $WaveResults) {
        if (-not $r.Dir -or -not (Test-Path $r.Dir)) { continue }
        $winnerFiles = Get-ChildItem -Path $r.Dir -Filter "winner.json" -ErrorAction SilentlyContinue
        foreach ($wf in $winnerFiles) {
            try {
                $obj = Get-Content -Raw $wf.FullName | ConvertFrom-Json
                if ($obj.PSObject.Properties.Name -contains 'rubric' -and $obj.rubric.PSObject.Properties.Name -contains 'compositeScore') {
                    $scores += [double]$obj.rubric.compositeScore
                }
            } catch { }
        }
    }

    if ($scores.Count -eq 0) {
        return @{ Status = 'FAIL'; Reason = "Critic: no rubric/winner.json found in wave outputs"; Details = @{ threshold = $threshold } }
    }

    $minScore = ($scores | Measure-Object -Minimum).Minimum
    if ($minScore -ge $threshold) {
        return @{ Status = 'PASS'; Reason = "Critic: min composite score $minScore >= $threshold"; Details = @{ scores = $scores; threshold = $threshold } }
    } else {
        return @{ Status = 'RETRY'; Reason = "Critic: min composite score $minScore < $threshold"; Details = @{ scores = $scores; threshold = $threshold } }
    }
}

function Test-CommissionerGate {
    <#
    .SYNOPSIS
      Looks for a commissioner_decision.json or recommendation field in wave
      outputs. Honors a 'requireRecommendation' field on the gate.
    #>
    param(
        [Parameter(Mandatory)][pscustomobject]$Gate,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$WaveResults,
        [Parameter()][string]$ArtifactRoot
    )

    $required = if ($Gate.PSObject.Properties.Name -contains 'requireRecommendation') {
        [string]$Gate.requireRecommendation
    } else { 'PROCEED' }

    foreach ($r in $WaveResults) {
        if (-not $r.Dir -or -not (Test-Path $r.Dir)) { continue }
        $files = Get-ChildItem -Path $r.Dir -Filter "*commissioner*.json" -ErrorAction SilentlyContinue
        foreach ($f in $files) {
            try {
                $obj = Get-Content -Raw $f.FullName | ConvertFrom-Json
                if ($obj.PSObject.Properties.Name -contains 'recommendation') {
                    if ([string]$obj.recommendation -ieq $required) {
                        return @{ Status = 'PASS'; Reason = "Commissioner: recommendation '$($obj.recommendation)' matches required '$required'"; Details = @{ file = $f.FullName } }
                    } else {
                        return @{ Status = 'FAIL'; Reason = "Commissioner: recommendation '$($obj.recommendation)' != required '$required'"; Details = @{ file = $f.FullName } }
                    }
                }
            } catch { }
        }
    }

    return @{ Status = 'FAIL'; Reason = "Commissioner: no recommendation found"; Details = @{ required = $required } }
}

function Test-RunCommandGate {
    <#
    .SYNOPSIS
      Runs a shell command. The command runs in the integration worktree if
      worktree mode is on, else in the gate's 'workingDir' or current dir.
      Non-zero exit code = FAIL (or RETRY if maxRetries > 0).
    #>
    param(
        [Parameter(Mandatory)][pscustomobject]$Gate,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$WaveResults,
        [Parameter()][object]$RunContext
    )

    $cmd = [string]$Gate.command
    if (-not $cmd) {
        return @{ Status = 'FAIL'; Reason = "RunCommand: 'command' field missing"; Details = @{} }
    }

    $workDir = if ($Gate.PSObject.Properties.Name -contains 'workingDir' -and $Gate.workingDir) {
        [string]$Gate.workingDir
    } elseif ($RunContext -and $RunContext.PSObject.Properties.Name -contains 'IntegrationDir' -and $RunContext.IntegrationDir) {
        $RunContext.IntegrationDir
    } else {
        (Get-Location).Path
    }

    if (-not (Test-Path $workDir)) {
        return @{ Status = 'FAIL'; Reason = "RunCommand: workingDir '$workDir' does not exist"; Details = @{} }
    }

    $oldLocation = Get-Location
    try {
        Set-Location $workDir
        $output = & cmd /c "$cmd 2>&1" | Out-String
        $exit = $LASTEXITCODE
    } finally {
        Set-Location $oldLocation
    }

    if ($exit -eq 0) {
        return @{ Status = 'PASS'; Reason = "RunCommand: '$cmd' exit 0"; Details = @{ output = $output.Trim(); workDir = $workDir } }
    }

    $maxRetries = if ($Gate.PSObject.Properties.Name -contains 'maxRetries') { [int]$Gate.maxRetries } else { 0 }
    $status = if ($maxRetries -gt 0) { 'RETRY' } else { 'FAIL' }
    return @{ Status = $status; Reason = "RunCommand: '$cmd' exit $exit"; Details = @{ output = $output.Trim(); exitCode = $exit; workDir = $workDir } }
}

function Test-ContractValidatorGate {
    <#
    .SYNOPSIS
      Calls supervisor/contract_validator.ps1 with a contract path declared in
      the gate. Pass = the validator script exits 0.
    #>
    param(
        [Parameter(Mandatory)][pscustomobject]$Gate,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$WaveResults,
        [Parameter()][object]$RunContext
    )

    $contractPath = [string]$Gate.contractPath
    if (-not $contractPath -or -not (Test-Path $contractPath)) {
        return @{ Status = 'FAIL'; Reason = "ContractValidator: contractPath '$contractPath' missing"; Details = @{} }
    }

    # Find the validator
    $repoRoot = if ($RunContext -and $RunContext.PSObject.Properties.Name -contains 'RepoRoot') { $RunContext.RepoRoot } else { (Get-Location).Path }
    $validator = Join-Path $repoRoot 'supervisor\contract_validator.ps1'
    if (-not (Test-Path $validator)) {
        # Fall back: look up from the module location
        $modRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
        $validator = Join-Path $modRoot 'supervisor\contract_validator.ps1'
    }
    if (-not (Test-Path $validator)) {
        return @{ Status = 'FAIL'; Reason = "ContractValidator: validator script not found"; Details = @{ searched = $validator } }
    }

    try {
        $output = & pwsh -NoProfile -File $validator -ContractPath $contractPath 2>&1 | Out-String
        $exit = $LASTEXITCODE
        if ($exit -eq 0) {
            return @{ Status = 'PASS'; Reason = "ContractValidator: passed"; Details = @{ contractPath = $contractPath; output = $output.Trim() } }
        }
        return @{ Status = 'FAIL'; Reason = "ContractValidator: exit $exit"; Details = @{ contractPath = $contractPath; output = $output.Trim() } }
    } catch {
        return @{ Status = 'FAIL'; Reason = "ContractValidator: $($_.Exception.Message)"; Details = @{} }
    }
}

Export-ModuleMember -Function `
    Register-GateHandler, `
    Get-GatesForCheckpoint, `
    Invoke-Gate, `
    Save-GateResult, `
    Test-CriticGate, `
    Test-CommissionerGate, `
    Test-RunCommandGate, `
    Test-ContractValidatorGate
