<#
.SYNOPSIS
  Git worktree-isolated execution layer for the orchestration runner.

.DESCRIPTION
  Provides per-step git worktree isolation so that parallel agents in a wave can
  modify code without trampling each other. Each step runs in its own branch
  inside its own worktree. Successful step branches are merged into a per-run
  integration branch; failed step branches are quarantined.

  Branching scheme
    uaitb/<runId>/integration     - run-level branch; final mergeable artifact
    uaitb/<runId>/step-<id>       - step-level branch; created from integration
    uaitb/<runId>/quarantine/<id> - failed step (renamed, not deleted)

  Worktree paths
    <WorktreeRoot>/runs/<runId>/step-<id>/

  Lifecycle (driven by Run-Orchestration.ps1):
    Initialize-RunIntegration -RunId X -RepoRoot R -BaseRef main
      -> creates uaitb/X/integration off main; returns context object
    New-RunWorktree -Context C -StepId N
      -> creates uaitb/X/step-N off uaitb/X/integration in its own worktree;
         returns full path that the step's agent should write into
    Merge-RunWorktree -Context C -StepId N -Status 'OK'|'FAILED'
      -> if OK, merges step branch into integration, removes worktree, deletes branch
      -> if FAILED, renames branch to quarantine, removes worktree
    Complete-RunIntegration -Context C [-MergeTo main] [-PushRemote]
      -> optionally fast-forwards a target branch to integration; pushes if asked

.NOTES
  PS 5.1 / 7+ compatible. All git output is captured; non-zero exits throw.
  Designed to fail loud and leave no half-state.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Git {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string[]]$GitArgs,
        [switch]$AllowFail
    )
    $stdout = & git -C $RepoRoot @GitArgs 2>&1
    $exit = $LASTEXITCODE
    if ($exit -ne 0 -and -not $AllowFail) {
        $argStr = ($GitArgs -join ' ')
        throw ("git {0} failed (exit {1}) in {2}: {3}" -f $argStr, $exit, $RepoRoot, ($stdout | Out-String).Trim())
    }
    return @{ Output = ($stdout | Out-String); ExitCode = $exit }
}

function Test-GitRepo {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path $Path)) { return $false }
    $r = Invoke-Git -RepoRoot $Path -GitArgs @('rev-parse', '--git-dir') -AllowFail
    return ($r.ExitCode -eq 0)
}

function Resolve-RunId {
    [CmdletBinding()]
    param([string]$RunId)
    if ($RunId) { return ($RunId -replace '[^\w\-]', '_') }
    return ("run_{0}" -f (Get-Date -Format 'yyyyMMdd_HHmmss_fff'))
}

function Initialize-RunIntegration {
    <#
    .SYNOPSIS
      Creates the per-run integration branch and returns a context handle.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter()][string]$RunId,
        [Parameter()][string]$BaseRef = 'main',
        [Parameter()][string]$WorktreeRoot
    )

    if (-not (Test-GitRepo -Path $RepoRoot)) {
        throw ("Not a git repository: {0}" -f $RepoRoot)
    }

    $RunId = Resolve-RunId -RunId $RunId
    $integrationBranch = "uaitb/$RunId/integration"

    # Verify base ref exists
    $r = Invoke-Git -RepoRoot $RepoRoot -GitArgs @('rev-parse', '--verify', $BaseRef) -AllowFail
    if ($r.ExitCode -ne 0) {
        throw ("Base ref '{0}' does not exist in {1}" -f $BaseRef, $RepoRoot)
    }

    # Create integration branch (no-op if it already exists; we want idempotency for re-runs)
    $existsCheck = Invoke-Git -RepoRoot $RepoRoot -GitArgs @('rev-parse', '--verify', $integrationBranch) -AllowFail
    if ($existsCheck.ExitCode -ne 0) {
        Invoke-Git -RepoRoot $RepoRoot -GitArgs @('branch', $integrationBranch, $BaseRef) | Out-Null
    }

    if (-not $WorktreeRoot) {
        $WorktreeRoot = Join-Path $RepoRoot ('.uaitoolbox/runs/{0}/worktrees' -f $RunId)
    }
    if (-not (Test-Path $WorktreeRoot)) {
        New-Item -ItemType Directory -Path $WorktreeRoot -Force | Out-Null
    }

    # Integration worktree: merges happen here so we never touch the user's working tree
    $integrationDir = Join-Path $WorktreeRoot 'integration'
    if (Test-Path $integrationDir) {
        # Stale from a prior run; prune and recreate cleanly
        Invoke-Git -RepoRoot $RepoRoot -GitArgs @('worktree', 'remove', '--force', $integrationDir) -AllowFail | Out-Null
        Invoke-Git -RepoRoot $RepoRoot -GitArgs @('worktree', 'prune') -AllowFail | Out-Null
        if (Test-Path $integrationDir) { Remove-Item -Recurse -Force -Path $integrationDir }
    }
    Invoke-Git -RepoRoot $RepoRoot -GitArgs @('worktree', 'add', $integrationDir, $integrationBranch) | Out-Null

    return [pscustomobject]@{
        RunId             = $RunId
        RepoRoot          = (Resolve-Path $RepoRoot).Path
        BaseRef           = $BaseRef
        IntegrationBranch = $integrationBranch
        IntegrationDir    = (Resolve-Path $integrationDir).Path
        WorktreeRoot      = (Resolve-Path $WorktreeRoot).Path
        Worktrees         = @{}
        Quarantined       = @()
        Merged            = @()
    }
}

function New-RunWorktree {
    <#
    .SYNOPSIS
      Creates an isolated worktree+branch for a single step.
    .OUTPUTS
      Absolute path to the worktree directory.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][pscustomobject]$Context,
        [Parameter(Mandatory)][int]$StepId
    )

    $stepBranch = "uaitb/$($Context.RunId)/step-$StepId"
    $stepDir = Join-Path $Context.WorktreeRoot ("step-{0}" -f $StepId)

    if ($Context.Worktrees.ContainsKey($StepId)) {
        throw ("Worktree for step {0} already exists at {1}" -f $StepId, $Context.Worktrees[$StepId])
    }

    if (Test-Path $stepDir) {
        # Stale dir from prior run — try to prune and remove
        Invoke-Git -RepoRoot $Context.RepoRoot -GitArgs @('worktree', 'prune') -AllowFail | Out-Null
        if (Test-Path $stepDir) {
            Remove-Item -Recurse -Force -Path $stepDir
        }
    }

    # Delete stale step branch if present (a re-run shouldn't be blocked by old state)
    $branchExists = Invoke-Git -RepoRoot $Context.RepoRoot -GitArgs @('rev-parse', '--verify', $stepBranch) -AllowFail
    if ($branchExists.ExitCode -eq 0) {
        Invoke-Git -RepoRoot $Context.RepoRoot -GitArgs @('branch', '-D', $stepBranch) -AllowFail | Out-Null
    }

    Invoke-Git -RepoRoot $Context.RepoRoot -GitArgs @('worktree', 'add', '-b', $stepBranch, $stepDir, $Context.IntegrationBranch) | Out-Null

    $Context.Worktrees[$StepId] = $stepDir
    return $stepDir
}

function Save-RunWorktreeChanges {
    <#
    .SYNOPSIS
      Stages and commits any uncommitted changes inside a step worktree.
    .DESCRIPTION
      Agents typically write files into the worktree without committing.
      This consolidates them into a single step commit so the merge has something to integrate.
      No-op when the worktree is clean.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][pscustomobject]$Context,
        [Parameter(Mandatory)][int]$StepId,
        [Parameter()][string]$Message
    )

    if (-not $Context.Worktrees.ContainsKey($StepId)) {
        throw ("No worktree registered for step {0}" -f $StepId)
    }

    $stepDir = $Context.Worktrees[$StepId]
    $status = Invoke-Git -RepoRoot $stepDir -GitArgs @('status', '--porcelain')
    if (-not $status.Output.Trim()) {
        return $false
    }

    if (-not $Message) { $Message = ("uaitb: step {0} output" -f $StepId) }

    Invoke-Git -RepoRoot $stepDir -GitArgs @('add', '-A') | Out-Null
    Invoke-Git -RepoRoot $stepDir -GitArgs @('commit', '-m', $Message, '--no-verify') | Out-Null
    return $true
}

function Merge-RunWorktree {
    <#
    .SYNOPSIS
      Merge or quarantine a step branch based on its status, then tear down the worktree.
    .DESCRIPTION
      Status='OK'     -> commit any pending changes, merge step branch into integration,
                         remove worktree, delete step branch.
      Status='FAILED' -> rename step branch to uaitb/<run>/quarantine/<id>, remove worktree.
      Status='SKIP'   -> remove worktree, delete unused branch.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][pscustomobject]$Context,
        [Parameter(Mandatory)][int]$StepId,
        [Parameter(Mandatory)][ValidateSet('OK','FAILED','SKIP')][string]$Status,
        [Parameter()][string]$CommitMessage
    )

    if (-not $Context.Worktrees.ContainsKey($StepId)) {
        Write-Verbose ("No worktree to merge for step {0}" -f $StepId)
        return
    }

    $stepDir = $Context.Worktrees[$StepId]
    $stepBranch = "uaitb/$($Context.RunId)/step-$StepId"

    try {
        if ($Status -eq 'OK') {
            Save-RunWorktreeChanges -Context $Context -StepId $StepId -Message $CommitMessage | Out-Null

            # Merges run inside the integration worktree — the integration branch is checked out there.
            # --no-ff keeps the step boundary visible in history.
            $mergeMsg = ("uaitb: merge step {0} into integration" -f $StepId)
            $mergeResult = Invoke-Git -RepoRoot $Context.IntegrationDir `
                -GitArgs @('-c', 'user.name=uaitb-runner', '-c', 'user.email=uaitb@local',
                           'merge', '--no-ff', '--no-edit', '-m', $mergeMsg, $stepBranch) -AllowFail

            if ($mergeResult.ExitCode -ne 0) {
                # Conflict or other merge failure — abort and quarantine
                Invoke-Git -RepoRoot $Context.IntegrationDir -GitArgs @('merge', '--abort') -AllowFail | Out-Null
                throw ("Merge of step {0} into {1} failed: {2}" -f $StepId, $Context.IntegrationBranch, $mergeResult.Output.Trim())
            }

            $Context.Merged += $StepId
        }
        elseif ($Status -eq 'FAILED') {
            $quarBranch = "uaitb/$($Context.RunId)/quarantine/step-$StepId"
            # Rename step branch -> quarantine (preserves the failed work for forensics)
            $exists = Invoke-Git -RepoRoot $Context.RepoRoot -GitArgs @('rev-parse', '--verify', $stepBranch) -AllowFail
            if ($exists.ExitCode -eq 0) {
                Invoke-Git -RepoRoot $Context.RepoRoot -GitArgs @('branch', '-m', $stepBranch, $quarBranch) -AllowFail | Out-Null
            }
            $Context.Quarantined += @{ StepId = $StepId; Branch = $quarBranch }
        }
        # SKIP falls through to cleanup
    }
    finally {
        # Tear down worktree (always)
        Invoke-Git -RepoRoot $Context.RepoRoot -GitArgs @('worktree', 'remove', '--force', $stepDir) -AllowFail | Out-Null
        Invoke-Git -RepoRoot $Context.RepoRoot -GitArgs @('worktree', 'prune') -AllowFail | Out-Null
        $Context.Worktrees.Remove($StepId) | Out-Null

        if ($Status -eq 'OK' -or $Status -eq 'SKIP') {
            # Branch fully merged or unused — safe to delete
            Invoke-Git -RepoRoot $Context.RepoRoot -GitArgs @('branch', '-D', $stepBranch) -AllowFail | Out-Null
        }
    }
}

function Complete-RunIntegration {
    <#
    .SYNOPSIS
      Finalize a run: optionally merge integration into a target branch and push.
    .DESCRIPTION
      The integration branch is the audit trail for the whole run. After all
      step merges, callers may want to:
        - Leave it as-is (review via PR)
        - Fast-forward main (or any branch) to it
        - Push it to origin
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][pscustomobject]$Context,
        [Parameter()][string]$MergeTo,
        [Parameter()][switch]$PushRemote,
        [Parameter()][string]$Remote = 'origin'
    )

    $summary = [ordered]@{
        runId             = $Context.RunId
        integrationBranch = $Context.IntegrationBranch
        mergedSteps       = $Context.Merged
        quarantined       = $Context.Quarantined
        mergedTo          = $null
        pushed            = $false
    }

    if ($MergeTo) {
        $check = Invoke-Git -RepoRoot $Context.RepoRoot -GitArgs @('rev-parse', '--verify', $MergeTo) -AllowFail
        if ($check.ExitCode -ne 0) {
            throw ("Target branch '{0}' does not exist" -f $MergeTo)
        }

        # Verify it's a true fast-forward: MergeTo must be an ancestor of integration.
        $integSha = (Invoke-Git -RepoRoot $Context.RepoRoot -GitArgs @('rev-parse', $Context.IntegrationBranch)).Output.Trim()
        $targetSha = (Invoke-Git -RepoRoot $Context.RepoRoot -GitArgs @('rev-parse', $MergeTo)).Output.Trim()
        $ancestor = Invoke-Git -RepoRoot $Context.RepoRoot -GitArgs @('merge-base', '--is-ancestor', $targetSha, $integSha) -AllowFail
        if ($ancestor.ExitCode -ne 0) {
            throw ("Cannot fast-forward '{0}' to '{1}': not a fast-forward (target has commits not in integration)" -f $MergeTo, $Context.IntegrationBranch)
        }

        # If target is already at integration's HEAD, no-op
        if ($integSha -eq $targetSha) {
            $summary.mergedTo = $MergeTo
        }
        else {
            # Detect whether MergeTo is currently checked out in any worktree —
            # updating a checked-out branch would desync the working tree.
            $wtList = (Invoke-Git -RepoRoot $Context.RepoRoot -GitArgs @('worktree', 'list', '--porcelain')).Output
            $checkedOutPattern = ("branch refs/heads/{0}" -f [regex]::Escape($MergeTo))
            $matches = @($wtList -split "`r?`n" | Where-Object { $_ -match $checkedOutPattern })
            $isCheckedOut = $matches.Count -gt 0

            if ($isCheckedOut) {
                throw ("Cannot fast-forward '{0}' because it is checked out in another worktree. " +
                       "Push integration branch '{1}' and merge via PR, or check out a different branch first." `
                       -f $MergeTo, $Context.IntegrationBranch)
            }

            # Safe: ref-only update (no working tree disturbed)
            Invoke-Git -RepoRoot $Context.RepoRoot `
                -GitArgs @('update-ref', "refs/heads/$MergeTo", $integSha, $targetSha) | Out-Null
            $summary.mergedTo = $MergeTo
        }

        if ($PushRemote) {
            Invoke-Git -RepoRoot $Context.RepoRoot -GitArgs @('push', $Remote, $MergeTo) | Out-Null
            $summary.pushed = $true
        }
    }
    elseif ($PushRemote) {
        Invoke-Git -RepoRoot $Context.RepoRoot -GitArgs @('push', $Remote, $Context.IntegrationBranch) | Out-Null
        $summary.pushed = $true
    }

    # Tear down the integration worktree (the branch ref persists)
    if ($Context.IntegrationDir -and (Test-Path $Context.IntegrationDir)) {
        Invoke-Git -RepoRoot $Context.RepoRoot -GitArgs @('worktree', 'remove', '--force', $Context.IntegrationDir) -AllowFail | Out-Null
        Invoke-Git -RepoRoot $Context.RepoRoot -GitArgs @('worktree', 'prune') -AllowFail | Out-Null
    }

    return [pscustomobject]$summary
}

function Remove-RunArtifacts {
    <#
    .SYNOPSIS
      Aggressive cleanup for an aborted/abandoned run. Idempotent.
    .DESCRIPTION
      Removes any remaining worktrees, deletes integration + step branches,
      and prunes the worktree filesystem. Quarantine branches are preserved by default.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][pscustomobject]$Context,
        [switch]$IncludeQuarantine
    )

    foreach ($stepId in @($Context.Worktrees.Keys)) {
        $dir = $Context.Worktrees[$stepId]
        Invoke-Git -RepoRoot $Context.RepoRoot -GitArgs @('worktree', 'remove', '--force', $dir) -AllowFail | Out-Null
    }
    $Context.Worktrees.Clear()

    if ($Context.IntegrationDir -and (Test-Path $Context.IntegrationDir)) {
        Invoke-Git -RepoRoot $Context.RepoRoot -GitArgs @('worktree', 'remove', '--force', $Context.IntegrationDir) -AllowFail | Out-Null
    }

    Invoke-Git -RepoRoot $Context.RepoRoot -GitArgs @('worktree', 'prune') -AllowFail | Out-Null

    # Remove all branches under uaitb/<runId>/ (optionally including quarantine)
    $listing = Invoke-Git -RepoRoot $Context.RepoRoot -GitArgs @('for-each-ref', '--format=%(refname:short)', "refs/heads/uaitb/$($Context.RunId)/")
    foreach ($branch in ($listing.Output -split "`r?`n" | Where-Object { $_ })) {
        if ((-not $IncludeQuarantine) -and $branch -like "*quarantine*") { continue }
        Invoke-Git -RepoRoot $Context.RepoRoot -GitArgs @('branch', '-D', $branch) -AllowFail | Out-Null
    }

    if (Test-Path $Context.WorktreeRoot) {
        Remove-Item -Recurse -Force -Path $Context.WorktreeRoot -ErrorAction SilentlyContinue
    }
}

Export-ModuleMember -Function `
    Initialize-RunIntegration, `
    New-RunWorktree, `
    Save-RunWorktreeChanges, `
    Merge-RunWorktree, `
    Complete-RunIntegration, `
    Remove-RunArtifacts, `
    Test-GitRepo
