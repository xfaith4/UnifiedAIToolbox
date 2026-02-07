# PR Publisher (Maintenance)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-StageLog {
    param([string]$Message, [string]$Level = "INFO")
    $logger = Get-Command -Name Write-Log -ErrorAction SilentlyContinue
    if ($logger) {
        Write-Log $Message -Level $Level
    }
    else {
        Write-Host "[$Level] $Message"
    }
}

function Get-PropValue {
    param(
        [AllowNull()]$Object,
        [Parameter(Mandatory = $true)][string]$Name,
        $Default = $null
    )
    if ($null -eq $Object) { return $Default }
    if ($Object -is [System.Collections.IDictionary]) {
        if ($Object.Contains($Name)) { return $Object[$Name] }
        return $Default
    }
    $prop = $Object.PSObject.Properties[$Name]
    if ($prop) { return $prop.Value }
    return $Default
}

function Normalize-BranchSegment {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return "run" }
    $clean = $Value.ToLowerInvariant()
    $clean = [regex]::Replace($clean, "[^a-z0-9]+", "-")
    $clean = $clean.Trim("-")
    if ([string]::IsNullOrWhiteSpace($clean)) { $clean = "run" }
    return $clean
}

function New-BranchSlug {
    param([string]$Goal, [int]$MaxLength = 40)
    $slug = Normalize-BranchSegment -Value $Goal
    if ($slug.Length -gt $MaxLength) {
        $slug = $slug.Substring(0, $MaxLength).Trim("-")
    }
    if ([string]::IsNullOrWhiteSpace($slug)) { $slug = "update" }
    return $slug
}

function Resolve-Template {
    param(
        [string]$Template,
        [hashtable]$Tokens
    )
    if ([string]::IsNullOrWhiteSpace($Template)) { return "" }
    $resolved = $Template
    foreach ($key in $Tokens.Keys) {
        $token = "{{{0}}}" -f $key
        $value = [string]$Tokens[$key]
        $resolved = $resolved -replace [regex]::Escape($token), [string]$value
    }
    return $resolved
}

function Write-PrArtifacts {
    param(
        [Parameter(Mandatory = $true)][string]$OutputDir,
        [Parameter(Mandatory = $true)]$Payload,
        [Parameter(Mandatory = $true)][string]$Markdown
    )
    if (-not (Test-Path -LiteralPath $OutputDir)) {
        New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    }
    $prJsonPath = Join-Path $OutputDir "pr.json"
    $prMdPath = Join-Path $OutputDir "pr.md"
    $Payload | ConvertTo-Json -Depth 20 | Set-Content -Path $prJsonPath -Encoding UTF8
    $Markdown | Set-Content -Path $prMdPath -Encoding UTF8
    return [pscustomobject]@{
        PrJsonPath = $prJsonPath
        PrMdPath = $prMdPath
    }
}

function Write-PrError {
    param(
        [Parameter(Mandatory = $true)][string]$OutputDir,
        [Parameter(Mandatory = $true)][string]$Message,
        [string]$SuggestedFix
    )
    if (-not (Test-Path -LiteralPath $OutputDir)) {
        New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    }
    $path = Join-Path $OutputDir "pr_error.md"
    $lines = @(
        "# PR Publication Error",
        "",
        $Message
    )
    if ($SuggestedFix) {
        $lines += ""
        $lines += "Suggested fix:"
        $lines += $SuggestedFix
    }
    $lines -join "`n" | Set-Content -Path $path -Encoding UTF8
    return $path
}

function Get-RepoContext {
    param([string]$RepoContextPath)
    if (-not $RepoContextPath) { return $null }
    if (-not (Test-Path -LiteralPath $RepoContextPath)) { return $null }
    try {
        return Get-Content -Raw -LiteralPath $RepoContextPath | ConvertFrom-Json -Depth 50
    }
    catch {
        return $null
    }
}

function Get-DefaultBranchFromGit {
    param([Parameter(Mandatory = $true)][string]$RepoRoot)
    $defaultBranch = $null
    try {
        $originHead = & git -C $RepoRoot symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>$null
        if ($originHead -and $originHead -match "origin/(.+)$") {
            $defaultBranch = $Matches[1]
        }
    }
    catch { }
    if (-not $defaultBranch) { $defaultBranch = "main" }
    return $defaultBranch
}

function Invoke-PRPublisher {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]$Contract,
        [Parameter(Mandatory = $true)][string]$OutputDir,
        [string]$RepoContextPath
    )

    if (-not $Contract) { throw "PRPublisher requires a contract." }

    $runId = Get-PropValue -Object $Contract -Name "run_id" -Default ""
    $goal = Get-PropValue -Object $Contract -Name "goal" -Default ""
    $intent = Get-PropValue -Object $Contract -Name "intent" -Default ""
    $riskLevel = Get-PropValue -Object $Contract -Name "risk_level" -Default ""
    $repo = Get-PropValue -Object $Contract -Name "repo" -Default $null
    $repoFullName = Get-PropValue -Object $repo -Name "full_name" -Default ""
    $repoUrl = Get-PropValue -Object $repo -Name "url" -Default ""
    $repoPath = Get-PropValue -Object $repo -Name "local_path" -Default ""

    $repoContext = Get-RepoContext -RepoContextPath $RepoContextPath
    if (-not $repoPath -and $repoContext -and $repoContext.repo -and $repoContext.repo.root_path) {
        $repoPath = $repoContext.repo.root_path
    }

    $prPolicy = Get-PropValue -Object $Contract -Name "pr_policy" -Default $null
    $conflictPolicy = Get-PropValue -Object $Contract -Name "conflict_policy" -Default $null

    if (-not $prPolicy) {
        $payload = [pscustomobject]@{
            schema_version = "1.0"
            run_id = $runId
            status = "failed"
            errors = @([pscustomobject]@{ code = "PR_POLICY_MISSING"; message = "pr_policy is required." })
        }
        $md = "# PR Publication`n`nFailed: pr_policy missing."
        Write-PrArtifacts -OutputDir $OutputDir -Payload $payload -Markdown $md | Out-Null
        Write-PrError -OutputDir $OutputDir -Message "pr_policy missing in contract." -SuggestedFix "Add pr_policy defaults in job_types.json or include pr_policy in the request." | Out-Null
        throw "PRPublisher failed: pr_policy missing."
    }
    if (-not $conflictPolicy) {
        $payload = [pscustomobject]@{
            schema_version = "1.0"
            run_id = $runId
            status = "failed"
            errors = @([pscustomobject]@{ code = "CONFLICT_POLICY_MISSING"; message = "conflict_policy is required." })
        }
        $md = "# PR Publication`n`nFailed: conflict_policy missing."
        Write-PrArtifacts -OutputDir $OutputDir -Payload $payload -Markdown $md | Out-Null
        Write-PrError -OutputDir $OutputDir -Message "conflict_policy missing in contract." -SuggestedFix "Add conflict_policy defaults in job_types.json or include conflict_policy in the request." | Out-Null
        throw "PRPublisher failed: conflict_policy missing."
    }

    $prMode = Get-PropValue -Object $prPolicy -Name "mode" -Default "create_pr"
    if ($prMode -ne "create_pr") {
        $payload = [pscustomobject]@{
            schema_version = "1.0"
            run_id = $runId
            status = "failed"
            errors = @([pscustomobject]@{
                code = "PR_POLICY_DISABLED"
                message = "pr_policy.mode is not create_pr."
            })
        }
        $md = "# PR Publication`n`nFailed: pr_policy.mode is not create_pr."
        Write-PrArtifacts -OutputDir $OutputDir -Payload $payload -Markdown $md | Out-Null
        Write-PrError -OutputDir $OutputDir -Message "pr_policy.mode is not create_pr." -SuggestedFix "Set pr_policy.mode to create_pr in the contract." | Out-Null
        throw "PRPublisher failed: pr_policy.mode is not create_pr."
    }

    if (-not $repoPath -or -not (Test-Path -LiteralPath $repoPath)) {
        $payload = [pscustomobject]@{
            schema_version = "1.0"
            run_id = $runId
            status = "failed"
            errors = @([pscustomobject]@{
                code = "REPO_PATH_MISSING"
                message = "Repository path not found in contract or repo_context.json."
            })
        }
        $md = "# PR Publication`n`nFailed: repository path missing."
        Write-PrArtifacts -OutputDir $OutputDir -Payload $payload -Markdown $md | Out-Null
        Write-PrError -OutputDir $OutputDir -Message "Repository path not found in contract or repo_context.json." -SuggestedFix "Provide repo.local_path or ensure repo_context.json includes repo.root_path." | Out-Null
        throw "PRPublisher failed: repository path missing."
    }

    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        $payload = [pscustomobject]@{
            schema_version = "1.0"
            run_id = $runId
            status = "failed"
            errors = @([pscustomobject]@{
                code = "GIT_MISSING"
                message = "git executable not found."
            })
        }
        $md = "# PR Publication`n`nFailed: git not available."
        Write-PrArtifacts -OutputDir $OutputDir -Payload $payload -Markdown $md | Out-Null
        Write-PrError -OutputDir $OutputDir -Message "git executable not found." -SuggestedFix "Install git and ensure it is on PATH." | Out-Null
        throw "PRPublisher failed: git not available."
    }

    $branchPrefix = Get-PropValue -Object $prPolicy -Name "branch_prefix" -Default "maintenance"
    $slug = New-BranchSlug -Goal $goal
    $runIdSlug = Normalize-BranchSegment -Value $runId
    $branchName = "{0}/{1}/{2}" -f $branchPrefix, $runIdSlug, $slug

    $baseBranch = ""
    if ($Contract.ref -and $Contract.ref.branch) {
        $baseBranch = [string]$Contract.ref.branch
    }
    elseif ($repoContext -and $repoContext.repo -and $repoContext.repo.branch) {
        $baseBranch = [string]$repoContext.repo.branch
    }
    if (-not $baseBranch) {
        $baseBranch = Get-DefaultBranchFromGit -RepoRoot $repoPath
    }

    $targetBranches = @()
    if ($repoContext -and $repoContext.discovery -and $repoContext.discovery.policy_hooks -and $repoContext.discovery.policy_hooks.pr_status) {
        $targets = $repoContext.discovery.policy_hooks.pr_status.target_branches
        if ($targets) { $targetBranches = @($targets) }
    }

    $baseStrategy = Get-PropValue -Object $conflictPolicy -Name "base_branch_strategy" -Default "default_branch"
    if ($baseStrategy -eq "target_branch" -and $targetBranches.Count -gt 0) {
        $baseBranch = [string]$targetBranches[0]
    }

    $openPrCount = $null
    if ($repoContext -and $repoContext.discovery -and $repoContext.discovery.policy_hooks -and $repoContext.discovery.policy_hooks.pr_status) {
        $openPrCount = $repoContext.discovery.policy_hooks.pr_status.open_pr_count
    }

    $maxOpenPrs = Get-PropValue -Object $conflictPolicy -Name "max_open_prs" -Default 0
    $churnItems = @()
    if ($repoContext -and $repoContext.discovery -and $repoContext.discovery.high_risk_areas) {
        $churnItems = @($repoContext.discovery.high_risk_areas | Where-Object { $_.signal -eq "churn" })
    }
    $maxChurnScore = 0
    if ($churnItems.Count -gt 0) {
        $maxChurnScore = [double](($churnItems | Measure-Object -Property score -Maximum).Maximum)
    }
    $highChurn = ($churnItems.Count -ge 5 -or $maxChurnScore -ge 5)
    $tooManyPrs = ($null -ne $openPrCount -and $openPrCount -gt $maxOpenPrs)
    $conflictRisk = if ($tooManyPrs -or $highChurn) { "high" } else { "low" }

    $draftOnHighRisk = [bool](Get-PropValue -Object $prPolicy -Name "draft_on_high_risk" -Default $true)
    $isDraft = ($draftOnHighRisk -and $conflictRisk -eq "high")

    $options = @()
    if ($baseBranch) { $options += $baseBranch }
    if ($targetBranches -and $targetBranches.Count -gt 0) { $options += $targetBranches }
    $baseDecision = [pscustomobject]@{
        strategy = $baseStrategy
        selected = $baseBranch
        options = @($options | Select-Object -Unique)
        reason = $(if ($conflictRisk -eq "high") { "conflict_risk_high" } else { "default" })
    }

    $evidencePath = Join-Path $OutputDir "evidence.json"
    $changesetPath = Join-Path $OutputDir "changeset.summary.json"
    $rollbackPath = Join-Path $OutputDir "rollback.md"

    $evidenceSummary = "No evidence.json found."
    if (Test-Path -LiteralPath $evidencePath) {
        try {
            $evidence = Get-Content -Raw -LiteralPath $evidencePath | ConvertFrom-Json -Depth 20
            if ($evidence.commands_run) {
                $commandLines = @()
                foreach ($cmd in @($evidence.commands_run)) {
                    if ($cmd.command) { $commandLines += "- $($cmd.command)" }
                }
                if ($commandLines.Count -gt 0) {
                    $evidenceSummary = $commandLines -join "`n"
                }
            }
        }
        catch { }
    }

    $summaryLines = @()
    if ($goal) { $summaryLines += "- Goal: $goal" }
    if ($intent) { $summaryLines += "- Intent: $intent" }
    if (Test-Path -LiteralPath $changesetPath) {
        try {
            $changeset = Get-Content -Raw -LiteralPath $changesetPath | ConvertFrom-Json -Depth 10
            $fileCount = if ($changeset.files_changed) { @($changeset.files_changed).Count } else { 0 }
            $locTotal = 0
            if ($changeset.loc_added) { $locTotal += [int]$changeset.loc_added }
            if ($changeset.loc_removed) { $locTotal += [int]$changeset.loc_removed }
            $summaryLines += "- Files changed: $fileCount"
            $summaryLines += "- LOC changed: $locTotal"
        }
        catch { }
    }
    if ($summaryLines.Count -eq 0) { $summaryLines = @("- Summary unavailable.") }

    $riskLines = @()
    if ($riskLevel) { $riskLines += "- Risk level: $riskLevel" }
    $riskLines += "- Conflict risk: $conflictRisk"
    if ($tooManyPrs) { $riskLines += "- Open PR count ($openPrCount) exceeds max_open_prs ($maxOpenPrs)" }
    if ($highChurn) { $riskLines += "- High churn detected in recent commits" }

    $rollbackLines = @()
    if (Test-Path -LiteralPath $rollbackPath) {
        $rollbackLines += "See rollback.md for rollback steps."
    }
    else {
        $rollbackLines += "Rollback plan not provided."
    }

    $prMarkdown = @(
        "## Summary",
        ($summaryLines -join "`n"),
        "",
        "## Evidence",
        $evidenceSummary,
        "",
        "## Risk",
        ($riskLines -join "`n"),
        "",
        "## Rollback",
        ($rollbackLines -join "`n")
    ) -join "`n"

    $titleTemplate = Get-PropValue -Object $prPolicy -Name "title_template" -Default "Maintenance: {{goal}}"
    $bodyTemplate = Get-PropValue -Object $prPolicy -Name "body_template" -Default $prMarkdown

    $tokenMap = @{
        run_id = $runId
        goal = $goal
        intent = $intent
        risk_level = $riskLevel
        branch = $branchName
        summary = ($summaryLines -join "`n")
        evidence = $evidenceSummary
        risk = ($riskLines -join "`n")
        rollback = ($rollbackLines -join "`n")
    }
    $prTitle = Resolve-Template -Template $titleTemplate -Tokens $tokenMap
    if (-not $prTitle) { $prTitle = "Maintenance: $goal" }
    $prBody = Resolve-Template -Template $bodyTemplate -Tokens $tokenMap
    if (-not $prBody) { $prBody = $prMarkdown }

    $prPayload = [pscustomobject]@{
        schema_version = "1.0"
        run_id = $runId
        status = "pending"
        draft = $isDraft
        repository = [pscustomobject]@{
            full_name = $repoFullName
            url = $repoUrl
            local_path = $repoPath
        }
        branch = [pscustomobject]@{
            name = $branchName
            base = $baseBranch
        }
        conflict = [pscustomobject]@{
            level = $conflictRisk
            open_pr_count = $openPrCount
            max_open_prs = $maxOpenPrs
            high_churn = $highChurn
            reasons = @()
        }
        base_branch_decision = $baseDecision
        pr = $null
        errors = @()
    }

    if ($tooManyPrs) { $prPayload.conflict.reasons += "open_pr_count_exceeded" }
    if ($highChurn) { $prPayload.conflict.reasons += "high_churn_detected" }

    # Git operations
    Write-StageLog "Preparing maintenance branch $branchName from $baseBranch"
    $gitStatus = & git -C $repoPath status --porcelain 2>$null
    $changes = @($gitStatus | Where-Object { $_ -and $_.Trim().Length -gt 0 })
    if ($changes.Count -eq 0) {
        $patchPath = Join-Path $OutputDir "changeset.patch"
        if (Test-Path -LiteralPath $patchPath) {
            Write-StageLog "No working tree changes detected; applying changeset.patch"
            & git -C $repoPath apply $patchPath 2>$null | Out-Null
            $gitStatus = & git -C $repoPath status --porcelain 2>$null
            $changes = @($gitStatus | Where-Object { $_ -and $_.Trim().Length -gt 0 })
        }
    }
    if ($changes.Count -eq 0) {
        $prPayload.status = "failed"
        $prPayload.errors += [pscustomobject]@{ code = "NO_CHANGES"; message = "No changes detected to publish." }
        Write-PrArtifacts -OutputDir $OutputDir -Payload $prPayload -Markdown $prMarkdown | Out-Null
        Write-PrError -OutputDir $OutputDir -Message "No changes detected to publish." -SuggestedFix "Ensure changeset.patch exists or the repo working tree contains changes." | Out-Null
        throw "PRPublisher failed: no changes detected."
    }

    $currentBranch = & git -C $repoPath rev-parse --abbrev-ref HEAD 2>$null
    if ($currentBranch -ne $baseBranch) {
        try {
            & git -C $repoPath fetch origin $baseBranch 2>$null | Out-Null
        }
        catch { }
    }

    & git -C $repoPath checkout -B $branchName $baseBranch 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        $prPayload.status = "failed"
        $prPayload.errors += [pscustomobject]@{ code = "GIT_CHECKOUT_FAILED"; message = "Failed to checkout branch $branchName from $baseBranch." }
        Write-PrArtifacts -OutputDir $OutputDir -Payload $prPayload -Markdown $prMarkdown | Out-Null
        Write-PrError -OutputDir $OutputDir -Message "Failed to checkout branch $branchName from $baseBranch." -SuggestedFix "Verify the base branch exists and the repo is clean." | Out-Null
        throw "PRPublisher failed: git checkout failed."
    }

    $userName = & git -C $repoPath config user.name 2>$null
    $userEmail = & git -C $repoPath config user.email 2>$null
    if (-not $userName) { & git -C $repoPath config user.name "UnifiedAIToolbox" | Out-Null }
    if (-not $userEmail) { & git -C $repoPath config user.email "uaitoolbox@local" | Out-Null }

    & git -C $repoPath add -A | Out-Null
    $commitMessage = "Maintenance: {0}" -f $(if ($goal) { $goal } else { "automated update" })
    & git -C $repoPath commit -m $commitMessage 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        $prPayload.status = "failed"
        $prPayload.errors += [pscustomobject]@{ code = "GIT_COMMIT_FAILED"; message = "Failed to commit changes on $branchName." }
        Write-PrArtifacts -OutputDir $OutputDir -Payload $prPayload -Markdown $prMarkdown | Out-Null
        Write-PrError -OutputDir $OutputDir -Message "Failed to commit changes on $branchName." -SuggestedFix "Check git status for conflicts and ensure user.name/user.email are configured." | Out-Null
        throw "PRPublisher failed: git commit failed."
    }

    $remote = & git -C $repoPath remote get-url origin 2>$null
    if (-not $remote) {
        $prPayload.status = "failed"
        $prPayload.errors += [pscustomobject]@{ code = "NO_REMOTE"; message = "No origin remote configured." }
        Write-PrArtifacts -OutputDir $OutputDir -Payload $prPayload -Markdown $prMarkdown | Out-Null
        Write-PrError -OutputDir $OutputDir -Message "No origin remote configured." -SuggestedFix "Add an origin remote to the repo before publishing a PR." | Out-Null
        throw "PRPublisher failed: origin remote missing."
    }

    & git -C $repoPath push -u origin $branchName 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        $prPayload.status = "failed"
        $prPayload.errors += [pscustomobject]@{ code = "GIT_PUSH_FAILED"; message = "Failed to push branch $branchName to origin." }
        Write-PrArtifacts -OutputDir $OutputDir -Payload $prPayload -Markdown $prMarkdown | Out-Null
        Write-PrError -OutputDir $OutputDir -Message "Failed to push branch $branchName to origin." -SuggestedFix "Verify git credentials and network access to origin." | Out-Null
        throw "PRPublisher failed: git push failed."
    }

    if (-not $repoFullName) {
        $prPayload.status = "failed"
        $prPayload.errors += [pscustomobject]@{ code = "REPO_FULL_NAME_MISSING"; message = "repo.full_name is required to create PR." }
        Write-PrArtifacts -OutputDir $OutputDir -Payload $prPayload -Markdown $prMarkdown | Out-Null
        Write-PrError -OutputDir $OutputDir -Message "repo.full_name is required to create PR." -SuggestedFix "Set repo.full_name to owner/repo in the contract request." | Out-Null
        throw "PRPublisher failed: repo.full_name missing."
    }

    $token = $env:GITHUB_TOKEN
    if (-not $token) {
        $prPayload.status = "failed"
        $prPayload.errors += [pscustomobject]@{ code = "GITHUB_TOKEN_MISSING"; message = "GITHUB_TOKEN is required to create PR." }
        Write-PrArtifacts -OutputDir $OutputDir -Payload $prPayload -Markdown $prMarkdown | Out-Null
        Write-PrError -OutputDir $OutputDir -Message "GITHUB_TOKEN is required to create PR." -SuggestedFix "Set GITHUB_TOKEN with repo scope in the environment." | Out-Null
        throw "PRPublisher failed: GITHUB_TOKEN missing."
    }

    $headers = @{
        Authorization = "token $token"
        Accept = "application/vnd.github+json"
        "User-Agent" = "UnifiedAIToolbox"
    }

    $owner = $null
    $repoName = $null
    if ($repoFullName -match "^([^/]+)/(.+)$") {
        $owner = $Matches[1]
        $repoName = $Matches[2]
    }
    if (-not $owner -or -not $repoName) {
        $prPayload.status = "failed"
        $prPayload.errors += [pscustomobject]@{ code = "INVALID_REPO_FULL_NAME"; message = "repo.full_name must be in owner/repo format." }
        Write-PrArtifacts -OutputDir $OutputDir -Payload $prPayload -Markdown $prMarkdown | Out-Null
        Write-PrError -OutputDir $OutputDir -Message "repo.full_name must be in owner/repo format." -SuggestedFix "Use the form owner/repo in the maintenance request." | Out-Null
        throw "PRPublisher failed: invalid repo.full_name."
    }

    $apiBase = "https://api.github.com"
    $createBody = @{
        title = $prTitle
        head = $branchName
        base = $baseBranch
        body = $prBody
        draft = $isDraft
    } | ConvertTo-Json -Depth 10

    $prResponse = $null
    $status = "created"
    try {
        $prResponse = Invoke-RestMethod -Method Post -Uri "$apiBase/repos/$repoFullName/pulls" -Headers $headers -ContentType "application/json" -Body $createBody
    }
    catch {
        $errorText = $_.Exception.Message
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $errorText = $_.ErrorDetails.Message }
        if ($errorText -match "already exists") {
            $status = "existing"
            try {
                $headRef = "$owner:$branchName"
                $existing = Invoke-RestMethod -Method Get -Uri "$apiBase/repos/$repoFullName/pulls?state=open&head=$headRef" -Headers $headers
                if ($existing -and $existing.Count -gt 0) {
                    $prResponse = $existing[0]
                    $patchBody = @{
                        title = $prTitle
                        body = $prBody
                    } | ConvertTo-Json -Depth 10
                    Invoke-RestMethod -Method Patch -Uri "$apiBase/repos/$repoFullName/pulls/$($prResponse.number)" -Headers $headers -ContentType "application/json" -Body $patchBody | Out-Null
                }
            }
            catch { }
        }
        else {
            $prPayload.status = "failed"
            $prPayload.errors += [pscustomobject]@{ code = "PR_CREATE_FAILED"; message = $errorText }
            Write-PrArtifacts -OutputDir $OutputDir -Payload $prPayload -Markdown $prMarkdown | Out-Null
            Write-PrError -OutputDir $OutputDir -Message "Failed to create PR." -SuggestedFix $errorText | Out-Null
            throw "PRPublisher failed: PR creation failed."
        }
    }

    $prPayload.status = $status
    if ($prResponse) {
        $prPayload.pr = [pscustomobject]@{
            number = $prResponse.number
            url = $prResponse.html_url
            state = $prResponse.state
            draft = $prResponse.draft
            title = $prResponse.title
            body = $prResponse.body
            head = $prResponse.head.ref
            base = $prResponse.base.ref
        }
    }

    return (Write-PrArtifacts -OutputDir $OutputDir -Payload $prPayload -Markdown $prMarkdown)
}
