# Maintenance Gates for Phase 3
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-PropValue {
    param(
        [Parameter(Mandatory = $true)]
        [AllowNull()]
        $Object,
        [Parameter(Mandatory = $true)][string]$Name,
        $Default = $null
    )
    if ($null -eq $Object) { return $Default }
    $prop = $Object.PSObject.Properties[$Name]
    if ($prop) { return $prop.Value }
    return $Default
}

function Get-ArrayValue {
    param(
        [Parameter(Mandatory = $true)]
        [AllowNull()]
        $Object,
        [Parameter(Mandatory = $true)][string]$Name
    )
    $value = Get-PropValue -Object $Object -Name $Name -Default @()
    if ($null -eq $value) { return ,@() }
    if ($value -is [System.Collections.IEnumerable] -and -not ($value -is [string])) {
        $arr = @($value)
        if ($arr.Count -eq 0) { return ,@() }
        return $arr
    }
    return ,$value
}

function Normalize-RelPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    $norm = $Path -replace "\\", "/"
    $norm = $norm.TrimStart("./")
    return $norm.ToLowerInvariant()
}

function Test-PathStartsWithAny {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [string[]]$Prefixes
    )
    $norm = Normalize-RelPath -Path $Path
    foreach ($prefix in @($Prefixes)) {
        if (-not $prefix) { continue }
        $p = Normalize-RelPath -Path $prefix
        if ($norm.StartsWith($p)) { return $true }
    }
    return $false
}

function Test-PathMatchesAnyPattern {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [string[]]$Patterns
    )
    $norm = Normalize-RelPath -Path $Path
    foreach ($pattern in @($Patterns)) {
        if (-not $pattern) { continue }
        $patternNorm = $pattern.ToLowerInvariant()
        if ($patternNorm -notmatch "[\\\/]" -and $patternNorm -notmatch "[\*\?]") {
            $leaf = [System.IO.Path]::GetFileName($norm)
            if ($leaf -eq $patternNorm) { return $true }
        }
        if ($norm -like $patternNorm) { return $true }
    }
    return $false
}

function Get-IntentDefaults {
    param([string]$Intent)
    switch ($Intent) {
        "bugfix" { return @{ max_loc = 200; max_files = 5; risk = "low"; dependency_updates = "disallow" } }
        "docs" { return @{ max_loc = 300; max_files = 8; risk = "low"; dependency_updates = "disallow" } }
        "feature" { return @{ max_loc = 800; max_files = 20; risk = "medium"; dependency_updates = "disallow" } }
        "refactor" { return @{ max_loc = 500; max_files = 15; risk = "medium"; dependency_updates = "disallow" } }
        "stabilize" { return @{ max_loc = 400; max_files = 10; risk = "high"; dependency_updates = "disallow" } }
        "dependency_update" { return @{ max_loc = 200; max_files = 5; risk = "high"; dependency_updates = "allow" } }
        default { return @{ max_loc = 300; max_files = 10; risk = "medium"; dependency_updates = "disallow" } }
    }
}

function Resolve-RiskLevel {
    param(
        [string]$Intent,
        [string]$RiskLevel
    )
    if ($RiskLevel) { return $RiskLevel }
    $defaults = Get-IntentDefaults -Intent $Intent
    return $defaults.risk
}

function Get-DefaultForbiddenPaths {
    return @(
        ".git",
        ".uaitoolbox",
        ".codex_out",
        ".venv",
        "node_modules",
        "artifacts",
        "logs"
    )
}

function Get-DefaultForbiddenPatterns {
    return @(
        "*.pem",
        "*.key",
        "*.pfx",
        "*.p12",
        "id_rsa*",
        ".env",
        ".env.*"
    )
}

function Get-DependencyManifestPatterns {
    return @(
        "package.json",
        "package-lock.json",
        "pnpm-lock.yaml",
        "yarn.lock",
        "requirements.txt",
        "pyproject.toml",
        "pipfile",
        "pipfile.lock",
        "poetry.lock",
        "*.csproj",
        "*.sln",
        "go.mod",
        "cargo.toml",
        "cargo.lock",
        "gemfile",
        "gemfile.lock",
        "composer.json",
        "composer.lock",
        "pom.xml",
        "build.gradle",
        "build.gradle.kts"
    )
}

function Get-LockfilePatterns {
    return @(
        "*.lock",
        "package-lock.json",
        "pnpm-lock.yaml",
        "yarn.lock",
        "poetry.lock",
        "cargo.lock",
        "composer.lock",
        "pipfile.lock",
        "gemfile.lock"
    )
}

function Get-CiWorkflowPatterns {
    return @(
        ".github/workflows/",
        "azure-pipelines.yml",
        "azure-pipelines.yaml",
        ".gitlab-ci.yml",
        "jenkinsfile"
    )
}

function Get-InfraPatterns {
    return @(
        "dockerfile",
        "dockerfile.*",
        "docker-compose.yml",
        "docker-compose.yaml",
        "*.tf",
        "kustomization.yaml",
        "helm/",
        "infra/",
        "k8s/"
    )
}

function Get-DiffInfo {
    param([string]$PatchPath)
    $files = @()
    $adds = 0
    $dels = 0
    $binaryFiles = @()
    $lockfiles = @()
    $generatedFiles = @()
    $licenseFiles = @()
    $ciFiles = @()
    $dependencyFiles = @()
    $infraFiles = @()

    if (-not $PatchPath -or -not (Test-Path -LiteralPath $PatchPath)) {
        return [pscustomobject]@{
            files = @()
            adds = 0
            dels = 0
            binary_files = @()
            lockfiles = @()
            generated_files = @()
            license_files = @()
            ci_files = @()
            dependency_files = @()
            infra_files = @()
        }
    }

    $lines = Get-Content -LiteralPath $PatchPath -ErrorAction SilentlyContinue
    $currentFile = $null
    foreach ($line in $lines) {
        if ($line -match "^diff --git a/(.+) b/(.+)$") {
            $currentFile = $Matches[2]
            $files += $currentFile
            continue
        }
        if ($line -match "^\\+\\+\\+ b/(.+)$") {
            $currentFile = $Matches[1]
            if ($currentFile -ne "/dev/null") { $files += $currentFile }
            continue
        }
        if ($line -match "^Binary files (.+) and (.+) differ") {
            if ($currentFile) { $binaryFiles += $currentFile }
            continue
        }
        if ($line -match "^GIT binary patch") {
            if ($currentFile) { $binaryFiles += $currentFile }
            continue
        }
        if ($line.StartsWith("+") -and -not $line.StartsWith("+++")) { $adds++ }
        if ($line.StartsWith("-") -and -not $line.StartsWith("---")) { $dels++ }
    }

    $files = @($files | Where-Object { $_ -and $_ -ne "/dev/null" } | Select-Object -Unique)

    foreach ($file in $files) {
        $norm = Normalize-RelPath -Path $file
        if (Test-PathMatchesAnyPattern -Path $norm -Patterns (Get-DependencyManifestPatterns)) {
            $dependencyFiles += $file
        }
        if (Test-PathMatchesAnyPattern -Path $norm -Patterns (Get-LockfilePatterns)) {
            $lockfiles += $file
        }
        if ($norm -match "(^|/)(dist|build|bin|obj)/" -or $norm -match "\\.min\\.js$" -or $norm -match "\\.map$") {
            $generatedFiles += $file
        }
        if ($norm -match "(^|/)(license|notice|copying)$") {
            $licenseFiles += $file
        }
        if (Test-PathStartsWithAny -Path $norm -Prefixes (Get-CiWorkflowPatterns)) {
            $ciFiles += $file
        }
        if (Test-PathMatchesAnyPattern -Path $norm -Patterns (Get-InfraPatterns)) {
            $infraFiles += $file
        }
    }

    return [pscustomobject]@{
        files = $files
        adds = $adds
        dels = $dels
        binary_files = @($binaryFiles | Select-Object -Unique)
        lockfiles = @($lockfiles | Select-Object -Unique)
        generated_files = @($generatedFiles | Select-Object -Unique)
        license_files = @($licenseFiles | Select-Object -Unique)
        ci_files = @($ciFiles | Select-Object -Unique)
        dependency_files = @($dependencyFiles | Select-Object -Unique)
        infra_files = @($infraFiles | Select-Object -Unique)
    }
}

function Test-BaselineGate {
    param(
        [Parameter(Mandatory = $true)][string]$RepoContextPath,
        [Parameter(Mandatory = $true)]$Contract
    )
    $errors = @()
    $warnings = @()
    if (-not (Test-Path -LiteralPath $RepoContextPath)) {
        $errors += "Repo context not found: $RepoContextPath"
        return [pscustomobject]@{ Ok = $false; Errors = $errors; Warnings = $warnings; BaselineFailed = $true }
    }

    $context = Get-Content -Raw -LiteralPath $RepoContextPath | ConvertFrom-Json -Depth 50
    $baseline = Get-PropValue -Object $context -Name "baseline" -Default $null
    $baselineMode = Get-PropValue -Object (Get-PropValue -Object $Contract -Name "baseline" -Default $null) -Name "mode" -Default "required_pass"
    $exceptionReason = Get-PropValue -Object (Get-PropValue -Object $Contract -Name "baseline" -Default $null) -Name "exception_reason" -Default ""
    $target = Get-PropValue -Object (Get-PropValue -Object $Contract -Name "baseline" -Default $null) -Name "target" -Default ""

    $attempted = $false
    $failed = $false
    if ($baseline) {
        $attempted = [bool](Get-PropValue -Object $baseline -Name "attempted" -Default $false)
        $results = Get-ArrayValue -Object $baseline -Name "results"
        foreach ($r in $results) {
            if ($null -ne $r.exit_code -and [int]$r.exit_code -ne 0) { $failed = $true }
        }
    }

    if ($baselineMode -eq "required_pass") {
        if (-not $attempted) { $errors += "Baseline required but not attempted." }
        if ($failed) { $errors += "Baseline required_pass but baseline results failed." }
    }
    elseif ($baselineMode -eq "allow_fail_then_stabilize") {
        if (-not $attempted) { $warnings += "Baseline not attempted; stabilization required before feature work." }
        if ($failed) { $warnings += "Baseline failed; stabilization required before feature work." }
        if (-not $target) { $errors += "baseline.target is required when allow_fail_then_stabilize." }
    }
    elseif ($baselineMode -eq "skip_with_reason") {
        if (-not $exceptionReason) { $errors += "baseline.exception_reason is required when skip_with_reason." }
    }

    return [pscustomobject]@{
        Ok = ($errors.Count -eq 0)
        Errors = $errors
        Warnings = $warnings
        BaselineFailed = $failed
    }
}

function Test-CommandProvenance {
    param(
        [Parameter(Mandatory = $true)][string]$RepoContextPath,
        [Parameter(Mandatory = $true)]$Contract,
        [array]$Commands
    )
    $errors = @()
    $warnings = @()

    $policy = Get-PropValue -Object $Contract -Name "command_policy" -Default $null
    if (-not $policy) {
        return [pscustomobject]@{ Ok = $true; Errors = @(); Warnings = @() }
    }

    $onlyFromContext = [bool](Get-PropValue -Object $policy -Name "only_from_repo_context" -Default $true)
    $thresholds = Get-PropValue -Object $policy -Name "thresholds" -Default $null
    $minConfidence = [double](Get-PropValue -Object $thresholds -Name "min_confidence_auto_run" -Default 0.7)
    $allowConvention = [bool](Get-PropValue -Object $thresholds -Name "allow_convention" -Default $false)

    $manualCommands = Get-ArrayValue -Object $policy -Name "manual_commands"
    $manualIndex = @{}
    foreach ($entry in $manualCommands) {
        $cmd = Get-PropValue -Object $entry -Name "command" -Default ""
        $approver = Get-PropValue -Object $entry -Name "approved_by" -Default ""
        if ($cmd -and $approver) { $manualIndex[$cmd] = $approver }
    }

    if (-not $onlyFromContext) {
        return [pscustomobject]@{ Ok = $true; Errors = @(); Warnings = @() }
    }

    if (-not (Test-Path -LiteralPath $RepoContextPath)) {
        if ($manualIndex.Count -eq 0) {
            $errors += "repo_context.json missing and no manual_commands provided."
        }
        return [pscustomobject]@{ Ok = ($errors.Count -eq 0); Errors = $errors; Warnings = $warnings }
    }

    . (Join-Path $PSScriptRoot "command_policy.ps1")
    $context = Get-Content -Raw -LiteralPath $RepoContextPath | ConvertFrom-Json -Depth 50
    $allowed = Select-ApprovedCommands -Commands $context.discovery.commands -ConfidenceThreshold $minConfidence -AllowConvention $allowConvention

    foreach ($cmd in $Commands) {
        $cmdText = Get-PropValue -Object $cmd -Name "command" -Default ""
        if (-not $cmdText) { continue }
        $matched = $false
        foreach ($allowedCmd in $allowed) {
            if ((Normalize-Command -Command $allowedCmd.command) -eq (Normalize-Command -Command $cmdText)) {
                $matched = $true
                break
            }
        }
        if (-not $matched) {
            if ($manualIndex.ContainsKey($cmdText)) {
                $warnings += "Command '$cmdText' allowed via manual approval by $($manualIndex[$cmdText])."
            }
            else {
                $errors += "Command '$cmdText' is not approved in repo_context or manual_commands."
            }
        }
    }

    return [pscustomobject]@{ Ok = ($errors.Count -eq 0); Errors = $errors; Warnings = $warnings }
}

function Test-DiffGate {
    param(
        [Parameter(Mandatory = $true)][string]$PatchPath,
        [Parameter(Mandatory = $true)]$Contract
    )
    $errors = @()
    $warnings = @()

    $diff = Get-DiffInfo -PatchPath $PatchPath
    $filesChanged = @($diff.files)
    $locChanged = [int]($diff.adds + $diff.dels)

    $intent = Get-PropValue -Object $Contract -Name "intent" -Default ""
    $intentDefaults = Get-IntentDefaults -Intent $intent

    $constraints = Get-PropValue -Object $Contract -Name "constraints" -Default $null
    $hard = Get-PropValue -Object $constraints -Name "hard" -Default $null
    $soft = Get-PropValue -Object $constraints -Name "soft" -Default $null

    $hardForbiddenPaths = @(
        (Get-ArrayValue -Object $hard -Name "forbidden_paths") +
        (Get-ArrayValue -Object (Get-PropValue -Object $Contract -Name "change_surface" -Default $null) -Name "forbidden_paths")
    ) | Where-Object { $_ }
    if (-not $hardForbiddenPaths -or $hardForbiddenPaths.Count -eq 0) {
        $hardForbiddenPaths = Get-DefaultForbiddenPaths
    }
    $hardForbiddenPatterns = @(
        (Get-ArrayValue -Object $hard -Name "forbidden_file_patterns") +
        (Get-ArrayValue -Object (Get-PropValue -Object $Contract -Name "change_surface" -Default $null) -Name "forbidden_file_patterns")
    ) | Where-Object { $_ }
    if (-not $hardForbiddenPatterns -or $hardForbiddenPatterns.Count -eq 0) {
        $hardForbiddenPatterns = Get-DefaultForbiddenPatterns
    }

    $allowedPaths = Get-ArrayValue -Object (Get-PropValue -Object $Contract -Name "change_surface" -Default $null) -Name "allowed_paths"

    $dependencyUpdates = Get-PropValue -Object $hard -Name "dependency_updates" -Default $intentDefaults.dependency_updates
    $noStackChange = [bool](Get-PropValue -Object $hard -Name "no_stack_change" -Default $true)

    $maxLocHard = Get-PropValue -Object $hard -Name "max_loc_changed" -Default $null
    $maxFilesHard = Get-PropValue -Object $hard -Name "max_files_touched" -Default $null

    $maxLocSoft = [int](Get-PropValue -Object $soft -Name "max_loc_changed" -Default $intentDefaults.max_loc)
    $maxFilesSoft = [int](Get-PropValue -Object $soft -Name "max_files_touched" -Default $intentDefaults.max_files)
    $requireAck = [bool](Get-PropValue -Object $soft -Name "require_acknowledgment" -Default $true)
    $acknowledged = [bool](Get-PropValue -Object $soft -Name "acknowledged" -Default $false)

    $diffGate = Get-PropValue -Object $Contract -Name "diff_gate" -Default $null
    $requiredChecks = Get-PropValue -Object $diffGate -Name "required_checks" -Default $null
    $requireBinary = [bool](Get-PropValue -Object $requiredChecks -Name "binary_files_changed" -Default $false)
    $requireLockfiles = [bool](Get-PropValue -Object $requiredChecks -Name "lockfiles_changed" -Default $false)
    $requireGenerated = [bool](Get-PropValue -Object $requiredChecks -Name "generated_files_changed" -Default $false)
    $requireLicense = [bool](Get-PropValue -Object $requiredChecks -Name "license_notice_changed" -Default $false)

    foreach ($file in $filesChanged) {
        if (Test-PathStartsWithAny -Path $file -Prefixes $hardForbiddenPaths) {
            $errors += "Forbidden path changed: $file"
        }
        if (Test-PathMatchesAnyPattern -Path $file -Patterns $hardForbiddenPatterns) {
            $errors += "Forbidden file pattern changed: $file"
        }
        if ($allowedPaths.Count -gt 0 -and -not (Test-PathStartsWithAny -Path $file -Prefixes $allowedPaths)) {
            $errors += "Change outside allowed_paths: $file"
        }
    }

    if ($dependencyUpdates -eq "disallow" -and $diff.dependency_files.Count -gt 0) {
        $errors += "Dependency manifests changed but dependency_updates is disallow."
    }
    if ($intent -eq "dependency_update" -and $dependencyUpdates -eq "disallow") {
        $errors += "intent dependency_update requires dependency_updates allowance."
    }

    $stackFiles = @($diff.dependency_files + $diff.infra_files)
    if ($noStackChange -and ($stackFiles.Count -gt 0)) {
        $errors += "Stack change detected while no_stack_change is true."
    }

    if ($null -ne $maxLocHard -and $locChanged -gt [int]$maxLocHard) {
        $errors += "Hard limit exceeded: LOC changed $locChanged > $maxLocHard"
    }
    if ($null -ne $maxFilesHard -and $filesChanged.Count -gt [int]$maxFilesHard) {
        $errors += "Hard limit exceeded: files changed $($filesChanged.Count) > $maxFilesHard"
    }

    if ($locChanged -gt $maxLocSoft) {
        $warnings += "Soft limit exceeded: LOC changed $locChanged > $maxLocSoft"
    }
    if ($filesChanged.Count -gt $maxFilesSoft) {
        $warnings += "Soft limit exceeded: files changed $($filesChanged.Count) > $maxFilesSoft"
    }

    if ($requireAck -and $warnings.Count -gt 0 -and -not $acknowledged) {
        $errors += "Soft limit exceeded and not acknowledged by supervisor."
    }

    if ($diff.binary_files.Count -gt 0) {
        if ($requireBinary) { $errors += "Binary files changed: $($diff.binary_files -join ', ')" }
        else { $warnings += "Binary files changed: $($diff.binary_files -join ', ')" }
    }
    if ($diff.lockfiles.Count -gt 0) {
        if ($requireLockfiles) { $errors += "Lockfiles changed: $($diff.lockfiles -join ', ')" }
        else { $warnings += "Lockfiles changed: $($diff.lockfiles -join ', ')" }
    }
    if ($diff.generated_files.Count -gt 0) {
        if ($requireGenerated) { $errors += "Generated files changed: $($diff.generated_files -join ', ')" }
        else { $warnings += "Generated files changed: $($diff.generated_files -join ', ')" }
    }
    if ($diff.license_files.Count -gt 0) {
        if ($requireLicense) { $errors += "License/notice files changed: $($diff.license_files -join ', ')" }
        else { $warnings += "License/notice files changed: $($diff.license_files -join ', ')" }
    }

    $touchPolicy = Get-PropValue -Object (Get-PropValue -Object $Contract -Name "change_surface" -Default $null) -Name "touch_policy" -Default $null
    $ciPolicy = Get-PropValue -Object $touchPolicy -Name "ci_workflows" -Default "deny"
    $depPolicy = Get-PropValue -Object $touchPolicy -Name "dependency_manifests" -Default "deny"
    $infraPolicy = Get-PropValue -Object $touchPolicy -Name "infra" -Default "deny"

    if ($diff.ci_files.Count -gt 0) {
        if ($ciPolicy -eq "deny") { $errors += "CI workflow changes denied." }
        elseif ($ciPolicy -eq "allow_with_approval" -and -not $acknowledged) { $errors += "CI workflow changes require approval." }
    }
    if ($diff.dependency_files.Count -gt 0) {
        if ($depPolicy -eq "deny") { $errors += "Dependency manifest changes denied." }
        elseif ($depPolicy -eq "allow_with_approval" -and -not $acknowledged) { $errors += "Dependency manifest changes require approval." }
    }
    if ($diff.infra_files.Count -gt 0) {
        if ($infraPolicy -eq "deny") { $errors += "Infra changes denied." }
        elseif ($infraPolicy -eq "allow_with_approval" -and -not $acknowledged) { $errors += "Infra changes require approval." }
    }

    return [pscustomobject]@{
        Ok = ($errors.Count -eq 0)
        Errors = $errors
        Warnings = $warnings
        FilesChanged = $filesChanged
        LocChanged = $locChanged
    }
}

function New-EvidenceArtifacts {
    param(
        [Parameter(Mandatory = $true)][string]$RepoContextPath,
        [Parameter(Mandatory = $true)][string]$OutputDir
    )
    $evidencePath = Join-Path $OutputDir "evidence.json"
    $evidenceMdPath = Join-Path $OutputDir "evidence.md"
    $commands = @()
    $results = @()
    $environment = $null

    if (Test-Path -LiteralPath $RepoContextPath) {
        $context = Get-Content -Raw -LiteralPath $RepoContextPath | ConvertFrom-Json -Depth 50
        if ($context.baseline) {
            $commands = @($context.baseline.commands_run)
            $results = @($context.baseline.results)
            $environment = $context.baseline.environment
        }
    }

    $failureSnippets = @()
    foreach ($res in $results) {
        if ($null -ne $res.exit_code -and [int]$res.exit_code -ne 0) {
            $snippet = ""
            if ($res.stderr_summary) { $snippet = [string]$res.stderr_summary }
            elseif ($res.stdout_summary) { $snippet = [string]$res.stdout_summary }
            if ($snippet.Length -gt 400) { $snippet = $snippet.Substring(0, 400) }
            $failureSnippets += [pscustomobject]@{
                command = $res.command
                snippet = $snippet
            }
        }
    }

    $evidence = [pscustomobject]@{
        generated_at_utc = (Get-Date).ToUniversalTime().ToString("o")
        commands_run = @($commands)
        results = @($results)
        environment = $environment
        failure_snippets = @($failureSnippets)
    }
    $evidence | ConvertTo-Json -Depth 50 | Set-Content -Path $evidencePath -Encoding UTF8

    $mdLines = @("# Evidence", "")
    if ($commands.Count -eq 0) {
        $mdLines += "- No commands executed."
    }
    else {
        $mdLines += "## Commands"
        foreach ($cmd in $commands) {
            $mdLines += "- $($cmd.command) (confidence $($cmd.confidence), source $($cmd.source))"
        }
    }
    if ($results.Count -gt 0) {
        $mdLines += ""
        $mdLines += "## Results"
        foreach ($res in $results) {
            $mdLines += "- $($res.command): exit $($res.exit_code), $($res.duration_seconds)s"
        }
    }
    $mdLines | Set-Content -Path $evidenceMdPath -Encoding UTF8

    return [pscustomobject]@{
        EvidencePath = $evidencePath
        EvidenceMdPath = $evidenceMdPath
        Commands = $commands
    }
}

function New-ChangesetArtifacts {
    param(
        [Parameter(Mandatory = $true)][string]$PatchPath,
        [Parameter(Mandatory = $true)][string]$OutputDir
    )
    $summaryPath = Join-Path $OutputDir "changeset.summary.json"
    $patchOut = Join-Path $OutputDir "changeset.patch"

    if (Test-Path -LiteralPath $PatchPath) {
        Copy-Item -LiteralPath $PatchPath -Destination $patchOut -Force
    }
    else {
        "No patch produced." | Set-Content -Path $patchOut -Encoding UTF8
    }

    $diff = Get-DiffInfo -PatchPath $PatchPath
    $summary = [pscustomobject]@{
        files_changed = @($diff.files)
        loc_added = $diff.adds
        loc_removed = $diff.dels
        binary_files_changed = @($diff.binary_files)
        lockfiles_changed = @($diff.lockfiles)
        generated_files_changed = @($diff.generated_files)
        license_files_changed = @($diff.license_files)
    }
    $summary | ConvertTo-Json -Depth 50 | Set-Content -Path $summaryPath -Encoding UTF8

    return [pscustomobject]@{
        SummaryPath = $summaryPath
        PatchPath = $patchOut
        Diff = $diff
    }
}

function Invoke-ReviewGate {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]$Contract,
        [Parameter(Mandatory = $true)][string]$OutputDir,
        [string]$RepoContextPath,
        [string]$PatchPath
    )

    if (-not $RepoContextPath) { $RepoContextPath = Join-Path $OutputDir "repo_context.json" }
    if (-not $PatchPath) { $PatchPath = Join-Path $OutputDir "PATCH.diff" }

    $intent = Get-PropValue -Object $Contract -Name "intent" -Default ""
    if (-not $intent) { throw "Maintenance intent is required." }

    $riskLevel = Resolve-RiskLevel -Intent $intent -RiskLevel (Get-PropValue -Object $Contract -Name "risk_level" -Default $null)

    $baselineGate = Test-BaselineGate -RepoContextPath $RepoContextPath -Contract $Contract
    $diffGate = Test-DiffGate -PatchPath $PatchPath -Contract $Contract

    $evidence = New-EvidenceArtifacts -RepoContextPath $RepoContextPath -OutputDir $OutputDir
    $changeset = New-ChangesetArtifacts -PatchPath $PatchPath -OutputDir $OutputDir

    $commandProv = Test-CommandProvenance -RepoContextPath $RepoContextPath -Contract $Contract -Commands $evidence.Commands

    $errors = @()
    $warnings = @()
    $errors += $baselineGate.Errors
    $warnings += $baselineGate.Warnings
    $errors += $diffGate.Errors
    $warnings += $diffGate.Warnings
    $errors += $commandProv.Errors
    $warnings += $commandProv.Warnings

    $review = [pscustomobject]@{
        status = $(if ($errors.Count -eq 0) { "passed" } else { "failed" })
        intent = $intent
        risk_level = $riskLevel
        baseline = [pscustomobject]@{
            ok = $baselineGate.Ok
            warnings = $baselineGate.Warnings
        }
        diff = [pscustomobject]@{
            ok = $diffGate.Ok
            files_changed = $diffGate.FilesChanged
            loc_changed = $diffGate.LocChanged
            warnings = $diffGate.Warnings
        }
        command_provenance = [pscustomobject]@{
            ok = $commandProv.Ok
            warnings = $commandProv.Warnings
        }
        errors = $errors
        warnings = $warnings
        artifacts = [pscustomobject]@{
            evidence_json = $evidence.EvidencePath
            evidence_md = $evidence.EvidenceMdPath
            changeset_summary = $changeset.SummaryPath
            changeset_patch = $changeset.PatchPath
        }
    }

    $prDescPath = Join-Path $OutputDir "pr_description.md"
    $changeCount = $changeset.Diff.files.Count
    $locChanged = [int]($changeset.Diff.adds + $changeset.Diff.dels)
    $testLines = @()
    if ($evidence.Commands.Count -eq 0) {
        $testLines += "- Not run (no commands executed)."
    }
    else {
        foreach ($res in $evidence.Commands) {
            $testLines += "- $($res.command)"
        }
    }
    @(
        "# Summary",
        "- Intent: $intent",
        "- Risk: $riskLevel",
        "- Files changed: $changeCount",
        "- LOC changed: $locChanged",
        "",
        "# Testing",
        $testLines,
        "",
        "# Notes",
        "- Evidence: $($evidence.EvidencePath)"
    ) | Set-Content -Path $prDescPath -Encoding UTF8

    $review.artifacts | Add-Member -NotePropertyName pr_description -NotePropertyValue $prDescPath -Force

    $reviewPath = Join-Path $OutputDir "review_gate.json"
    $review | ConvertTo-Json -Depth 50 | Set-Content -Path $reviewPath -Encoding UTF8

    $md = @(
        "# Review Gate",
        "",
        "Status: $($review.status)",
        "Intent: $intent",
        "Risk: $riskLevel",
        "",
        "## Errors",
        $(if ($errors.Count -eq 0) { "- None" } else { $errors | ForEach-Object { \"- $_\" } }),
        "",
        "## Warnings",
        $(if ($warnings.Count -eq 0) { "- None" } else { $warnings | ForEach-Object { \"- $_\" } })
    )
    $md | Set-Content -Path (Join-Path $OutputDir "review_gate.md") -Encoding UTF8

    if ($riskLevel -in @("medium", "high")) {
        $rollback = @(
            "# Rollback Plan",
            "",
            "Describe rollback steps if this change causes regressions."
        )
        $rollback | Set-Content -Path (Join-Path $OutputDir "rollback.md") -Encoding UTF8
    }

    if ($errors.Count -gt 0) {
        throw ("Review Gate failed: " + ($errors -join "; "))
    }

    return $review
}
