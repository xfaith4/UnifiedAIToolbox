# Repo Context Builder (Phase 2)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RelativePath {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$Path
    )
    try {
        $rootFull = (Resolve-Path -LiteralPath $Root).Path
        $pathFull = (Resolve-Path -LiteralPath $Path).Path
        if ($pathFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
            $rel = $pathFull.Substring($rootFull.Length)
            $rel = $rel.TrimStart("\\", "/")
            return ($rel -replace "\\", "/")
        }
    }
    catch { }
    return $Path
}

function Get-ExcludePatterns {
    return @(
        "node_modules",
        "\.git",
        "\.venv",
        "\.codex_out",
        "\.uaitoolbox",
        "\.vs",
        "\.vscode",
        "venv",
        "bin",
        "obj",
        "dist",
        "build",
        "artifacts",
        "logs"
    )
}

function Get-RepoFiles {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][int]$MaxFiles,
        [Parameter(Mandatory = $true)][string[]]$ExcludePatterns
    )

    $pattern = $null
    if ($ExcludePatterns -and $ExcludePatterns.Count -gt 0) {
        $pattern = "[\\/]({0})[\\/]" -f ($ExcludePatterns -join "|")
    }

    $query = Get-ChildItem -LiteralPath $Root -Recurse -File -ErrorAction SilentlyContinue
    if ($pattern) {
        $query = $query | Where-Object { $_.FullName -notmatch $pattern }
    }

    $files = @()
    $truncated = $false
    if ($MaxFiles -gt 0) {
        $files = @($query | Select-Object -First $MaxFiles)
        if ($files.Count -ge $MaxFiles) { $truncated = $true }
    }
    else {
        $files = @($query)
    }

    return [pscustomobject]@{
        Files = $files
        Truncated = $truncated
        ExcludePattern = $pattern
    }
}

function Find-Files {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$Pattern,
        [Parameter(Mandatory = $true)][string]$ExcludePattern,
        [int]$MaxResults = 50
    )

    $files = Get-ChildItem -LiteralPath $Root -Recurse -File -Filter $Pattern -ErrorAction SilentlyContinue
    if ($ExcludePattern) {
        $files = $files | Where-Object { $_.FullName -notmatch $ExcludePattern }
    }
    if ($MaxResults -gt 0) {
        $files = $files | Select-Object -First $MaxResults
    }
    return @($files)
}

function Get-CommandKind {
    param([Parameter(Mandatory = $true)][string]$Command)

    if ($Command -match "(?i)\btest\b|pytest|go test|dotnet test|npm test|pnpm test|yarn test") { return "test" }
    if ($Command -match "(?i)\blint\b|eslint|flake8|pylint|ruff") { return "lint" }
    if ($Command -match "(?i)\bformat\b|prettier|black|gofmt") { return "format" }
    if ($Command -match "(?i)\bbuild\b|compile|dotnet build|npm run build|pnpm build|yarn build") { return "build" }

    return $null
}

function Add-CommandEntry {
    param(
        [Parameter(Mandatory = $true)][ref]$Commands,
        [Parameter(Mandatory = $true)][hashtable]$CommandIndex,
        [Parameter(Mandatory = $true)][string]$Kind,
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][double]$Confidence,
        [Parameter(Mandatory = $true)][string]$Source,
        [string[]]$EvidencePaths
    )

    $normalized = ($Command.Trim() -replace "\s+", " ")
    if ([string]::IsNullOrWhiteSpace($normalized)) { return }

    $key = "$Kind|$normalized"
    if ($CommandIndex.ContainsKey($key)) { return }

    $CommandIndex[$key] = $true
    $Commands.Value += [pscustomobject]@{
        kind = $Kind
        command = $normalized
        confidence = $Confidence
        source = $Source
        evidence_paths = @($EvidencePaths)
    }
}
function Add-DetectionEntry {
    param(
        [Parameter(Mandatory = $true)][ref]$Detections,
        [Parameter(Mandatory = $true)][string]$Item,
        [Parameter(Mandatory = $true)][string]$Value,
        [Parameter(Mandatory = $true)][double]$Confidence,
        [string[]]$EvidencePaths
    )

    $Detections.Value += [pscustomobject]@{
        item = $Item
        value = $Value
        confidence = $Confidence
        evidence_paths = @($EvidencePaths)
    }
}

function Get-CommandsFromText {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$EvidencePath,
        [Parameter(Mandatory = $true)][ref]$Commands,
        [Parameter(Mandatory = $true)][hashtable]$CommandIndex
    )

    $confidence = 0.8
    if ($Source -eq "ci") { $confidence = 0.9 }
    if ($Source -eq "convention") { $confidence = 0.3 }

    $lines = $Text -split "`r`n|`n|`r"
    foreach ($line in $lines) {
        if ($line -match "^\s*(\$|>)?\s*(?<cmd>(npm|pnpm|yarn|dotnet|python|py|pytest|make|mvn|gradle|cargo|go|powershell|pwsh)\b.+)$") {
            $cmd = $Matches['cmd'].Trim()
            $kind = Get-CommandKind -Command $cmd
            if ($kind) {
                Add-CommandEntry -Commands $Commands -CommandIndex $CommandIndex -Kind $kind -Command $cmd -Confidence $confidence -Source $Source -EvidencePaths @($EvidencePath)
            }
        }
    }
}

function Get-CiEntries {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$ExcludePattern,
        [Parameter(Mandatory = $true)][ref]$Commands,
        [Parameter(Mandatory = $true)][hashtable]$CommandIndex
    )

    $ciEntries = @()

    $githubDir = Join-Path $RepoRoot ".github\workflows"
    if (Test-Path -LiteralPath $githubDir) {
        $workflowFiles = Get-ChildItem -LiteralPath $githubDir -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -in @(".yml", ".yaml") }
        if ($workflowFiles.Count -gt 0) {
            $evidence = @()
            $workflows = @()
            foreach ($wf in $workflowFiles) {
                $rel = Get-RelativePath -Root $RepoRoot -Path $wf.FullName
                $evidence += $rel
                $workflows += $wf.Name

                $lines = Get-Content -LiteralPath $wf.FullName -ErrorAction SilentlyContinue
                for ($i = 0; $i -lt $lines.Count; $i++) {
                    $line = $lines[$i]
                    if ($line -match "^\s*run:\s*(.+)$") {
                        $cmdText = $Matches[1].Trim()
                        if ($cmdText -eq "|") {
                            $indent = ($line -replace "run:.*$", "")
                            $block = @()
                            $j = $i + 1
                            while ($j -lt $lines.Count -and $lines[$j] -match "^$indent\s+") {
                                $block += $lines[$j].Trim()
                                $j++
                            }
                            $cmdText = ($block -join " ; ")
                        }
                        if (-not [string]::IsNullOrWhiteSpace($cmdText)) {
                            Get-CommandsFromText -Text $cmdText -Source "ci" -EvidencePath $rel -Commands $Commands -CommandIndex $CommandIndex
                        }
                    }
                }
            }

            $ciEntries += [pscustomobject]@{
                system = "github_actions"
                workflows = @($workflows)
                evidence_paths = @($evidence)
            }
        }
    }

    $azureFiles = @("azure-pipelines.yml", "azure-pipelines.yaml")
    foreach ($azureFile in $azureFiles) {
        $azurePath = Join-Path $RepoRoot $azureFile
        if (Test-Path -LiteralPath $azurePath) {
            $rel = Get-RelativePath -Root $RepoRoot -Path $azurePath
            $lines = Get-Content -LiteralPath $azurePath -ErrorAction SilentlyContinue
            foreach ($line in $lines) {
                if ($line -match "^\s*script:\s*(.+)$") {
                    $cmdText = $Matches[1].Trim()
                    if (-not [string]::IsNullOrWhiteSpace($cmdText)) {
                        Get-CommandsFromText -Text $cmdText -Source "ci" -EvidencePath $rel -Commands $Commands -CommandIndex $CommandIndex
                    }
                }
            }

            $ciEntries += [pscustomobject]@{
                system = "azure_pipelines"
                workflows = @($azureFile)
                evidence_paths = @($rel)
            }
        }
    }

    $gitlabPath = Join-Path $RepoRoot ".gitlab-ci.yml"
    if (Test-Path -LiteralPath $gitlabPath) {
        $rel = Get-RelativePath -Root $RepoRoot -Path $gitlabPath
        $lines = Get-Content -LiteralPath $gitlabPath -ErrorAction SilentlyContinue
        foreach ($line in $lines) {
            if ($line -match "^\s*-\s+(.+)$") {
                $cmdText = $Matches[1].Trim()
                if (-not [string]::IsNullOrWhiteSpace($cmdText)) {
                    Get-CommandsFromText -Text $cmdText -Source "ci" -EvidencePath $rel -Commands $Commands -CommandIndex $CommandIndex
                }
            }
        }
        $ciEntries += [pscustomobject]@{
            system = "gitlab"
            workflows = @(".gitlab-ci.yml")
            evidence_paths = @($rel)
        }
    }

    $jenkinsPath = Join-Path $RepoRoot "Jenkinsfile"
    if (Test-Path -LiteralPath $jenkinsPath) {
        $rel = Get-RelativePath -Root $RepoRoot -Path $jenkinsPath
        $ciEntries += [pscustomobject]@{
            system = "jenkins"
            workflows = @("Jenkinsfile")
            evidence_paths = @($rel)
        }
    }

    return $ciEntries
}

function Get-ToolingDetections {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$ExcludePattern,
        [Parameter(Mandatory = $true)][ref]$Detections
    )

    $patterns = @(
        @{ item = "package_manager"; value = "npm"; files = @("package.json", "package-lock.json") },
        @{ item = "package_manager"; value = "pnpm"; files = @("pnpm-lock.yaml") },
        @{ item = "package_manager"; value = "yarn"; files = @("yarn.lock") },
        @{ item = "runtime"; value = ".NET"; files = @("*.sln", "*.csproj") },
        @{ item = "runtime"; value = "Python"; files = @("pyproject.toml", "requirements.txt", "setup.py", "Pipfile") },
        @{ item = "runtime"; value = "Go"; files = @("go.mod") },
        @{ item = "runtime"; value = "Rust"; files = @("Cargo.toml") },
        @{ item = "runtime"; value = "Java"; files = @("pom.xml", "build.gradle", "build.gradle.kts") }
    )

    foreach ($entry in $patterns) {
        $evidence = @()
        foreach ($pattern in $entry.files) {
            $found = Find-Files -Root $RepoRoot -Pattern $pattern -ExcludePattern $ExcludePattern -MaxResults 10
            foreach ($file in $found) {
                $evidence += (Get-RelativePath -Root $RepoRoot -Path $file.FullName)
            }
        }
        if ($evidence.Count -gt 0) {
            Add-DetectionEntry -Detections $Detections -Item $entry.item -Value $entry.value -Confidence 0.9 -EvidencePaths $evidence
        }
    }
}

function Get-LanguageDetections {
    param(
        [AllowEmptyCollection()][object[]]$Files,
        [Parameter(Mandatory = $true)][ref]$Detections
    )

    $extMap = @{
        ".ps1" = "PowerShell"
        ".py" = "Python"
        ".js" = "JavaScript"
        ".ts" = "TypeScript"
        ".cs" = "C#"
        ".go" = "Go"
        ".java" = "Java"
        ".rb" = "Ruby"
        ".rs" = "Rust"
    }

    $seen = @{}
    foreach ($file in $Files) {
        $ext = $file.Extension.ToLowerInvariant()
        if ($extMap.ContainsKey($ext) -and -not $seen.ContainsKey($ext)) {
            $seen[$ext] = $true
            Add-DetectionEntry -Detections $Detections -Item "language" -Value $extMap[$ext] -Confidence 0.7 -EvidencePaths @($file.Name)
        }
    }
}
function Get-ProjectLayout {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [AllowEmptyCollection()][object[]]$Files,
        [Parameter(Mandatory = $true)][bool]$Truncated
    )

    $rootFiles = @()
    $topDirs = @()
    $extensionCounts = @{}

    foreach ($file in (Get-ChildItem -LiteralPath $RepoRoot -File -ErrorAction SilentlyContinue)) {
        $rootFiles += $file.Name
    }
    foreach ($dir in (Get-ChildItem -LiteralPath $RepoRoot -Directory -ErrorAction SilentlyContinue)) {
        $topDirs += $dir.Name
    }

    foreach ($file in $Files) {
        $ext = $file.Extension.ToLowerInvariant()
        if (-not $extensionCounts.ContainsKey($ext)) { $extensionCounts[$ext] = 0 }
        $extensionCounts[$ext]++
    }

    return [pscustomobject]@{
        top_level_dirs = @($topDirs)
        root_files = @($rootFiles)
        file_counts = [pscustomobject]@{
            total_files = [int]$Files.Count
            scanned_files = [int]$Files.Count
            extension_counts = $extensionCounts
        }
        scan_truncated = $Truncated
    }
}

function Get-RepoShape {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$ExcludePattern
    )

    $rootCandidates = @()
    $manifestPatterns = @("package.json", "pyproject.toml", "requirements.txt", "go.mod", "Cargo.toml", "*.sln", "*.csproj")

    foreach ($pattern in $manifestPatterns) {
        $files = Find-Files -Root $RepoRoot -Pattern $pattern -ExcludePattern $ExcludePattern -MaxResults 50
        foreach ($file in $files) {
            $rootCandidates += (Split-Path -Parent $file.FullName)
        }
    }

    $projectRoots = @($rootCandidates | Sort-Object -Unique | ForEach-Object { Get-RelativePath -Root $RepoRoot -Path $_ })
    $isMonorepo = $projectRoots.Count -gt 1

    return [pscustomobject]@{
        is_monorepo = [bool]$isMonorepo
        project_roots = @($projectRoots)
        size_class = "unknown"
    }
}

function Get-WorkingTree {
    param([Parameter(Mandatory = $true)][string]$RepoRoot)

    $status = "unknown"
    $hasGit = $false
    try {
        $hasGit = [bool](Get-Command git -ErrorAction SilentlyContinue)
    }
    catch { $hasGit = $false }

    if ($hasGit -and (Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
        try {
            $result = & git -C $RepoRoot status --porcelain 2>$null
            if ([string]::IsNullOrWhiteSpace($result)) { $status = "clean" } else { $status = "dirty" }
        }
        catch { $status = "unknown" }
    }

    $hasSubmodules = Test-Path -LiteralPath (Join-Path $RepoRoot ".gitmodules")

    $hasLfs = $false
    $gitattributes = Join-Path $RepoRoot ".gitattributes"
    if (Test-Path -LiteralPath $gitattributes) {
        $content = Get-Content -LiteralPath $gitattributes -ErrorAction SilentlyContinue
        if ($content -match "filter=lfs") { $hasLfs = $true }
    }
    if (-not $hasLfs -and $hasGit) {
        try {
            $lfs = & git -C $RepoRoot lfs ls-files 2>$null
            if ($lfs) { $hasLfs = $true }
        }
        catch { }
    }

    return [pscustomobject]@{
        status = $status
        has_submodules = [bool]$hasSubmodules
        has_lfs = [bool]$hasLfs
    }
}
function Get-HighRiskAreas {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$ExcludePattern
    )

    $items = @()

    $hasGit = $false
    try { $hasGit = [bool](Get-Command git -ErrorAction SilentlyContinue) } catch { $hasGit = $false }

    if ($hasGit -and (Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
        try {
            $log = & git -C $RepoRoot log -n 50 --name-only --pretty=format: 2>$null
            $paths = $log -split "`r`n|`n|`r" | Where-Object { $_ -and $_.Trim().Length -gt 0 }
            $counts = @{}
            foreach ($path in $paths) {
                if (-not $counts.ContainsKey($path)) { $counts[$path] = 0 }
                $counts[$path]++
            }
            $top = $counts.GetEnumerator() | Sort-Object -Property Value -Descending | Select-Object -First 10
            foreach ($entry in $top) {
                $items += [pscustomobject]@{
                    path = $entry.Key
                    signal = "churn"
                    reason = "Touched in recent commits"
                    score = [double]$entry.Value
                }
            }
        }
        catch { }
    }

    $blastPatterns = @(
        ".github/workflows",
        "azure-pipelines.yml",
        "azure-pipelines.yaml",
        ".gitlab-ci.yml",
        "Jenkinsfile",
        "package.json",
        "pnpm-lock.yaml",
        "yarn.lock",
        "requirements.txt",
        "pyproject.toml",
        "*.csproj",
        "*.sln",
        "go.mod",
        "Cargo.toml",
        "docker-compose.yml",
        "docker-compose.yaml",
        "*.tf",
        "kustomization.yaml",
        "helm",
        "auth",
        "oauth"
    )

    foreach ($pattern in $blastPatterns) {
        $candidatePath = Join-Path $RepoRoot $pattern
        if (Test-Path -LiteralPath $candidatePath) {
            $items += [pscustomobject]@{
                path = (Get-RelativePath -Root $RepoRoot -Path $candidatePath)
                signal = "blast_radius"
                reason = "Config or dependency surface"
                score = 1
            }
        }
        $files = Find-Files -Root $RepoRoot -Pattern $pattern -ExcludePattern $ExcludePattern -MaxResults 10
        foreach ($file in $files) {
            $items += [pscustomobject]@{
                path = (Get-RelativePath -Root $RepoRoot -Path $file.FullName)
                signal = "blast_radius"
                reason = "Config or dependency surface"
                score = 1
            }
        }
    }

    $corePatterns = @("*core*.*", "*common*.*", "*shared*.*", "*utils*.*")
    foreach ($pattern in $corePatterns) {
        $files = Find-Files -Root $RepoRoot -Pattern $pattern -ExcludePattern $ExcludePattern -MaxResults 10
        foreach ($file in $files) {
            $items += [pscustomobject]@{
                path = (Get-RelativePath -Root $RepoRoot -Path $file.FullName)
                signal = "core"
                reason = "Core/shared module heuristic"
                score = 1
            }
        }
    }

    return @($items | Sort-Object -Property path -Unique)
}

function Get-EnvVarRequirements {
    param([Parameter(Mandatory = $true)][string]$RepoRoot)

    $patterns = @(".env.example", ".env.sample", ".env.template")
    $vars = @{}

    foreach ($pattern in $patterns) {
        $path = Join-Path $RepoRoot $pattern
        if (-not (Test-Path -LiteralPath $path)) { continue }
        $lines = Get-Content -LiteralPath $path -ErrorAction SilentlyContinue
        foreach ($line in $lines) {
            if ($line -match "^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=") {
                $name = $Matches[1]
                $vars[$name] = $true
            }
        }
    }

    return @($vars.Keys)
}

function Get-CommandVersion {
    param([Parameter(Mandatory = $true)][string]$Name)
    try {
        $cmd = Get-Command $Name -ErrorAction SilentlyContinue
        if (-not $cmd) { return $null }
        $output = & $Name --version 2>&1 | Select-Object -First 1
        if ($output) { return $output.Trim() }
    }
    catch { }
    return $null
}

function Get-EnvironmentFingerprint {
    param(
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [string[]]$RequiredEnvVars
    )

    $runtimes = @{}
    $packageManagers = @{}

    $runtimeNames = @("node", "python", "dotnet", "java", "go", "rustc")
    foreach ($name in $runtimeNames) {
        $version = Get-CommandVersion -Name $name
        if ($version) { $runtimes[$name] = $version }
    }

    $pmNames = @("npm", "pnpm", "yarn", "pip", "poetry", "nuget")
    foreach ($name in $pmNames) {
        $version = Get-CommandVersion -Name $name
        if ($version) { $packageManagers[$name] = $version }
    }

    $envVars = @()
    foreach ($name in ($RequiredEnvVars | Sort-Object -Unique)) {
        $present = $false
        try {
            $val = [Environment]::GetEnvironmentVariable($name)
            if (-not [string]::IsNullOrWhiteSpace($val)) { $present = $true }
        }
        catch { $present = $false }
        $envVars += [pscustomobject]@{
            name = $name
            present = [bool]$present
            redacted = $true
        }
    }

    $shell = "pwsh $($PSVersionTable.PSVersion)"
    if (-not $PSVersionTable.PSVersion) { $shell = "powershell" }

    return [pscustomobject]@{
        os = [System.Environment]::OSVersion.VersionString
        shell = $shell
        runtimes = $runtimes
        package_managers = $packageManagers
        working_directory = $WorkingDirectory
        env_vars = @($envVars)
    }
}
function Invoke-CommandWithTimeout {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][int]$TimeoutSeconds,
        [Parameter(Mandatory = $true)][string]$LogDir,
        [Parameter(Mandatory = $true)][int]$Index
    )

    if (-not (Test-Path -LiteralPath $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }

    $stdoutPath = Join-Path $LogDir ("cmd_{0}_stdout.log" -f $Index)
    $stderrPath = Join-Path $LogDir ("cmd_{0}_stderr.log" -f $Index)
    $combinedPath = Join-Path $LogDir ("cmd_{0}.log" -f $Index)

    $shell = $null
    $shellArgs = @()
    $useWindowsShell = $false
    if (Get-Variable -Name IsWindows -ErrorAction SilentlyContinue) {
        $useWindowsShell = [bool]$IsWindows
    }
    elseif ($env:OS -match "Windows") {
        $useWindowsShell = $true
    }
    if ($useWindowsShell) {
        $shell = "cmd.exe"
        $shellArgs = @("/c", $Command)
    }
    else {
        $shell = "/bin/bash"
        $shellArgs = @("-lc", $Command)
    }

    $start = Get-Date
    $process = Start-Process -FilePath $shell -ArgumentList $shellArgs -WorkingDirectory $WorkingDirectory -NoNewWindow -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
    $completed = $process | Wait-Process -Timeout $TimeoutSeconds -ErrorAction SilentlyContinue
    if (-not $completed) {
        try { $process.Kill() } catch { }
    }
    $end = Get-Date

    $exitCode = $process.ExitCode
    if (-not $completed) { $exitCode = 124 }

    $stdout = ""
    $stderr = ""
    if (Test-Path -LiteralPath $stdoutPath) { $stdout = Get-Content -LiteralPath $stdoutPath -Raw -ErrorAction SilentlyContinue }
    if (Test-Path -LiteralPath $stderrPath) { $stderr = Get-Content -LiteralPath $stderrPath -Raw -ErrorAction SilentlyContinue }

    $summaryOut = ($stdout -split "`r`n|`n|`r" | Select-Object -First 10) -join "`n"
    $summaryErr = ($stderr -split "`r`n|`n|`r" | Select-Object -First 10) -join "`n"

    @(
        "COMMAND: $Command",
        "EXIT_CODE: $exitCode",
        "--- STDOUT ---",
        $stdout,
        "--- STDERR ---",
        $stderr
    ) | Set-Content -Path $combinedPath -Encoding UTF8

    return [pscustomobject]@{
        command = $Command
        exit_code = [int]$exitCode
        duration_seconds = [math]::Round(($end - $start).TotalSeconds, 2)
        stdout_summary = $summaryOut
        stderr_summary = $summaryErr
        log_path = $combinedPath
    }
}

function Invoke-BaselineVerification {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][array]$Commands,
        [Parameter(Mandatory = $true)][int]$MaxRuntimeSeconds,
        [Parameter(Mandatory = $true)][bool]$AllowConvention,
        [Parameter(Mandatory = $true)][double]$ConfidenceThreshold,
        [Parameter(Mandatory = $true)][string]$OutputDir,
        [string[]]$RequiredEnvVars = @()
    )

    $warnings = @()
    $commandPolicyPath = Join-Path $PSScriptRoot "command_policy.ps1"
    if (Test-Path -LiteralPath $commandPolicyPath) {
        . $commandPolicyPath
    }

    $approved = Select-ApprovedCommands -Commands $Commands -ConfidenceThreshold $ConfidenceThreshold -AllowConvention $AllowConvention
    if ($approved.Count -eq 0) {
        return [pscustomobject]@{
            attempted = $false
            commands_run = @()
            results = @()
            environment = (Get-EnvironmentFingerprint -WorkingDirectory $RepoRoot -RequiredEnvVars $RequiredEnvVars)
            warnings = @([pscustomobject]@{ code = "NO_APPROVED_COMMANDS"; severity = "info"; message = "No commands met baseline threshold."; evidence_paths = @() })
        }
    }

    $results = @()
    $logDir = Join-Path $OutputDir "baseline-logs"
    $index = 1
    foreach ($cmd in $approved) {
        $results += Invoke-CommandWithTimeout -Command $cmd.command -WorkingDirectory $RepoRoot -TimeoutSeconds $MaxRuntimeSeconds -LogDir $logDir -Index $index
        $index++
    }

    return [pscustomobject]@{
        attempted = $true
        commands_run = @($approved)
        results = @($results)
        environment = (Get-EnvironmentFingerprint -WorkingDirectory $RepoRoot -RequiredEnvVars $RequiredEnvVars)
        warnings = @($warnings)
    }
}
function Invoke-RepoContextBuilder {
    [CmdletBinding()]
    param(
        [string]$RepoRoot,
        [string]$ContractPath,
        [string]$OutputDir,
        [string]$SchemaPath
    )

    $contract = $null
    if ($ContractPath -and (Test-Path -LiteralPath $ContractPath)) {
        $contract = Get-Content -Raw -LiteralPath $ContractPath | ConvertFrom-Json -Depth 50
    }

    if (-not $RepoRoot) {
        if ($contract -and $contract.repo -and $contract.repo.local_path) {
            $RepoRoot = $contract.repo.local_path
        }
    }
    if (-not $RepoRoot) {
        $RepoRoot = (Get-Location).Path
    }
    if (-not (Test-Path -LiteralPath $RepoRoot)) {
        throw "RepoRoot not found: $RepoRoot"
    }

    if (-not $OutputDir) {
        $OutputDir = $RepoRoot
    }
    if (-not (Test-Path -LiteralPath $OutputDir)) {
        New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    }

    $repoContextSettings = $null
    if ($contract -and $contract.repo_context) { $repoContextSettings = $contract.repo_context }

    $maxFiles = 5000
    $maxRuntimeSeconds = 300
    $maxCloneSizeMb = $null
    $baselineEnabled = $false
    $confidenceThreshold = 0.7
    $allowConvention = $false
    $requiredEnvVars = @()

    if ($repoContextSettings) {
        $props = @($repoContextSettings.PSObject.Properties.Name)
        if ($props -contains "max_files_scanned" -and $repoContextSettings.max_files_scanned) {
            $maxFiles = [int]$repoContextSettings.max_files_scanned
        }
        if ($props -contains "max_runtime_seconds" -and $repoContextSettings.max_runtime_seconds) {
            $maxRuntimeSeconds = [int]$repoContextSettings.max_runtime_seconds
        }
        if ($props -contains "max_clone_size_mb" -and $repoContextSettings.max_clone_size_mb) {
            $maxCloneSizeMb = [double]$repoContextSettings.max_clone_size_mb
        }
        if ($props -contains "baseline_verification_enabled" -and $repoContextSettings.baseline_verification_enabled -eq $true) {
            $baselineEnabled = $true
        }
        if ($props -contains "command_confidence_threshold" -and $repoContextSettings.command_confidence_threshold) {
            $confidenceThreshold = [double]$repoContextSettings.command_confidence_threshold
        }
        if ($props -contains "allow_convention_commands" -and $repoContextSettings.allow_convention_commands -eq $true) {
            $allowConvention = $true
        }
        if ($props -contains "required_env_vars" -and $repoContextSettings.required_env_vars) {
            $requiredEnvVars = @($repoContextSettings.required_env_vars)
        }
    }

    $excludePatterns = Get-ExcludePatterns
    $scan = Get-RepoFiles -Root $RepoRoot -MaxFiles $maxFiles -ExcludePatterns $excludePatterns
    $files = $scan.Files

    $detections = @()
    $commands = @()
    $commandIndex = @{}
    $warnings = @()

    Get-ToolingDetections -RepoRoot $RepoRoot -ExcludePattern $scan.ExcludePattern -Detections ([ref]$detections)
    Get-LanguageDetections -Files $files -Detections ([ref]$detections)

    $ciEntries = Get-CiEntries -RepoRoot $RepoRoot -ExcludePattern $scan.ExcludePattern -Commands ([ref]$commands) -CommandIndex $commandIndex

    $docFiles = @()
    $docFiles += Get-ChildItem -LiteralPath $RepoRoot -Filter "README*.md" -File -ErrorAction SilentlyContinue
    $docsDir = Join-Path $RepoRoot "docs"
    if (Test-Path -LiteralPath $docsDir) {
        $docFiles += Get-ChildItem -LiteralPath $docsDir -Filter "*.md" -File -ErrorAction SilentlyContinue | Select-Object -First 5
    }

    foreach ($doc in $docFiles) {
        $text = Get-Content -LiteralPath $doc.FullName -Raw -ErrorAction SilentlyContinue
        if ($text) {
            $rel = Get-RelativePath -Root $RepoRoot -Path $doc.FullName
            Get-CommandsFromText -Text $text -Source "docs" -EvidencePath $rel -Commands ([ref]$commands) -CommandIndex $commandIndex
        }
    }

    # Add convention commands for known tooling when no evidence-based commands exist
    $hasNpm = $detections | Where-Object { $_.item -eq "package_manager" -and $_.value -eq "npm" }
    $hasPnpm = $detections | Where-Object { $_.item -eq "package_manager" -and $_.value -eq "pnpm" }
    $hasYarn = $detections | Where-Object { $_.item -eq "package_manager" -and $_.value -eq "yarn" }
    $hasDotnet = $detections | Where-Object { $_.item -eq "runtime" -and $_.value -eq ".NET" }
    $hasPython = $detections | Where-Object { $_.item -eq "runtime" -and $_.value -eq "Python" }

    if ($hasNpm) {
        Add-CommandEntry -Commands ([ref]$commands) -CommandIndex $commandIndex -Kind "build" -Command "npm run build" -Confidence 0.3 -Source "convention" -EvidencePaths @()
        Add-CommandEntry -Commands ([ref]$commands) -CommandIndex $commandIndex -Kind "test" -Command "npm test" -Confidence 0.3 -Source "convention" -EvidencePaths @()
        Add-CommandEntry -Commands ([ref]$commands) -CommandIndex $commandIndex -Kind "lint" -Command "npm run lint" -Confidence 0.3 -Source "convention" -EvidencePaths @()
        Add-CommandEntry -Commands ([ref]$commands) -CommandIndex $commandIndex -Kind "format" -Command "npm run format" -Confidence 0.3 -Source "convention" -EvidencePaths @()
    }
    if ($hasPnpm) {
        Add-CommandEntry -Commands ([ref]$commands) -CommandIndex $commandIndex -Kind "build" -Command "pnpm build" -Confidence 0.3 -Source "convention" -EvidencePaths @()
        Add-CommandEntry -Commands ([ref]$commands) -CommandIndex $commandIndex -Kind "test" -Command "pnpm test" -Confidence 0.3 -Source "convention" -EvidencePaths @()
        Add-CommandEntry -Commands ([ref]$commands) -CommandIndex $commandIndex -Kind "lint" -Command "pnpm lint" -Confidence 0.3 -Source "convention" -EvidencePaths @()
        Add-CommandEntry -Commands ([ref]$commands) -CommandIndex $commandIndex -Kind "format" -Command "pnpm format" -Confidence 0.3 -Source "convention" -EvidencePaths @()
    }
    if ($hasYarn) {
        Add-CommandEntry -Commands ([ref]$commands) -CommandIndex $commandIndex -Kind "build" -Command "yarn build" -Confidence 0.3 -Source "convention" -EvidencePaths @()
        Add-CommandEntry -Commands ([ref]$commands) -CommandIndex $commandIndex -Kind "test" -Command "yarn test" -Confidence 0.3 -Source "convention" -EvidencePaths @()
        Add-CommandEntry -Commands ([ref]$commands) -CommandIndex $commandIndex -Kind "lint" -Command "yarn lint" -Confidence 0.3 -Source "convention" -EvidencePaths @()
        Add-CommandEntry -Commands ([ref]$commands) -CommandIndex $commandIndex -Kind "format" -Command "yarn format" -Confidence 0.3 -Source "convention" -EvidencePaths @()
    }
    if ($hasDotnet) {
        Add-CommandEntry -Commands ([ref]$commands) -CommandIndex $commandIndex -Kind "build" -Command "dotnet build" -Confidence 0.3 -Source "convention" -EvidencePaths @()
        Add-CommandEntry -Commands ([ref]$commands) -CommandIndex $commandIndex -Kind "test" -Command "dotnet test" -Confidence 0.3 -Source "convention" -EvidencePaths @()
    }
    if ($hasPython) {
        Add-CommandEntry -Commands ([ref]$commands) -CommandIndex $commandIndex -Kind "test" -Command "python -m pytest" -Confidence 0.3 -Source "convention" -EvidencePaths @()
    }

    foreach ($cmd in $commands) {
        if ($cmd.source -ne "convention" -and $cmd.evidence_paths.Count -eq 0) {
            $warnings += [pscustomobject]@{
                code = "COMMAND_MISSING_EVIDENCE"
                severity = "warn"
                message = "Command '$($cmd.command)' lacks evidence_paths."
                evidence_paths = @()
            }
        }
        if ($cmd.source -eq "convention" -and $cmd.confidence -gt 0.5) {
            $warnings += [pscustomobject]@{
                code = "CONVENTION_CONFIDENCE_HIGH"
                severity = "warn"
                message = "Convention command '$($cmd.command)' has elevated confidence."
                evidence_paths = @()
            }
        }
    }

    $projectLayout = Get-ProjectLayout -RepoRoot $RepoRoot -Files $files -Truncated $scan.Truncated
    $repoShape = Get-RepoShape -RepoRoot $RepoRoot -ExcludePattern $scan.ExcludePattern

    # Determine repo size class
    if (-not $scan.Truncated) {
        $repoShape.size_class = if ($files.Count -gt 5000) { "large" } else { "normal" }
    }
    else {
        $repoShape.size_class = "unknown"
        $warnings += [pscustomobject]@{
            code = "SCAN_TRUNCATED"
            severity = "info"
            message = "File scan truncated at max_files_scanned."
            evidence_paths = @()
        }
    }

    $workingTree = Get-WorkingTree -RepoRoot $RepoRoot
    $highRisk = Get-HighRiskAreas -RepoRoot $RepoRoot -ExcludePattern $scan.ExcludePattern

    if ($workingTree.has_submodules) {
        $warnings += [pscustomobject]@{
            code = "SUBMODULES_PRESENT"
            severity = "info"
            message = "Repo contains submodules."
            evidence_paths = @(".gitmodules")
        }
    }
    if ($workingTree.has_lfs) {
        $warnings += [pscustomobject]@{
            code = "LFS_PRESENT"
            severity = "info"
            message = "Repo uses Git LFS."
            evidence_paths = @(".gitattributes")
        }
    }

    $policyHooks = [pscustomobject]@{
        pr_status = [pscustomobject]@{ status = "not_collected"; target_branches = @() }
        release = [pscustomobject]@{ status = "not_collected"; tags_present = $false; versioning_scheme = "" }
        security = [pscustomobject]@{ status = "not_collected"; dependency_update_policy = "" }
    }

    $sizeBytes = ($files | Measure-Object -Property Length -Sum).Sum
    if ($null -eq $sizeBytes) { $sizeBytes = 0 }
    $scanEstimate = [pscustomobject]@{
        max_files_scanned = $maxFiles
        files_scanned = [int]$files.Count
        truncated = [bool]$scan.Truncated
        excluded_patterns = @($excludePatterns)
        size_mb_estimate = [math]::Round($sizeBytes / 1MB, 2)
    }

    if ($null -ne $maxCloneSizeMb -and $scanEstimate.size_mb_estimate -gt $maxCloneSizeMb) {
        $warnings += [pscustomobject]@{
            code = "MAX_CLONE_SIZE_EXCEEDED"
            severity = "warn"
            message = "Repo size estimate exceeds max_clone_size_mb budget."
            evidence_paths = @()
        }
        $baselineEnabled = $false
    }

    $discovery = [pscustomobject]@{
        scan = $scanEstimate
        detection = @($detections)
        commands = @($commands)
        ci = @($ciEntries)
        project_layout = $projectLayout
        repo_shape = $repoShape
        working_tree = $workingTree
        high_risk_areas = @($highRisk)
        warnings = @($warnings)
        policy_hooks = $policyHooks
    }

    $requiredEnvVars = @($requiredEnvVars + (Get-EnvVarRequirements -RepoRoot $RepoRoot))

    $baseline = if ($baselineEnabled) {
        Invoke-BaselineVerification -RepoRoot $RepoRoot -Commands $commands -MaxRuntimeSeconds $maxRuntimeSeconds -AllowConvention $allowConvention -ConfidenceThreshold $confidenceThreshold -OutputDir $OutputDir -RequiredEnvVars $requiredEnvVars
    }
    else {
        [pscustomobject]@{
            attempted = $false
            commands_run = @()
            results = @()
            environment = (Get-EnvironmentFingerprint -WorkingDirectory $RepoRoot -RequiredEnvVars $requiredEnvVars)
            warnings = @([pscustomobject]@{ code = "BASELINE_DISABLED"; severity = "info"; message = "Baseline verification disabled."; evidence_paths = @() })
        }
    }

    $repoUrl = ""
    if ($contract -and $contract.repo) {
        $repoProps = @($contract.repo.PSObject.Properties.Name)
        if ($repoProps -contains "url" -and $contract.repo.url) { $repoUrl = $contract.repo.url }
    }
    $refBranch = ""
    $refCommit = ""
    if ($contract -and $contract.ref) {
        $refProps = @($contract.ref.PSObject.Properties.Name)
        if ($refProps -contains "branch" -and $contract.ref.branch) { $refBranch = $contract.ref.branch }
        if ($refProps -contains "commit" -and $contract.ref.commit) { $refCommit = $contract.ref.commit }
    }

    $repoContext = [pscustomobject]@{
        schema_version = "1.0"
        run_id = $(if ($contract -and $contract.run_id) { $contract.run_id } else { "" })
        generated_at_utc = (Get-Date).ToUniversalTime().ToString("o")
        repo = [pscustomobject]@{
            root_path = (Resolve-Path -LiteralPath $RepoRoot).Path
            url = $repoUrl
            branch = $refBranch
            commit = $refCommit
            ref = $refBranch
        }
        discovery = $discovery
        baseline = $baseline
    }

    $discoveryPath = Join-Path $OutputDir "repo_context.discovery.json"
    $baselinePath = Join-Path $OutputDir "repo_context.baseline.json"
    $contextPath = Join-Path $OutputDir "repo_context.json"

    $discoveryObject = [pscustomobject]@{
        schema_version = "1.0"
        run_id = $repoContext.run_id
        generated_at_utc = $repoContext.generated_at_utc
        repo = $repoContext.repo
        discovery = $repoContext.discovery
    }

    $baselineObject = [pscustomobject]@{
        schema_version = "1.0"
        run_id = $repoContext.run_id
        generated_at_utc = $repoContext.generated_at_utc
        repo = $repoContext.repo
        baseline = $repoContext.baseline
    }

    $discoveryObject | ConvertTo-Json -Depth 50 | Set-Content -Path $discoveryPath -Encoding UTF8
    $baselineObject | ConvertTo-Json -Depth 50 | Set-Content -Path $baselinePath -Encoding UTF8
    $repoContext | ConvertTo-Json -Depth 50 | Set-Content -Path $contextPath -Encoding UTF8

    if (-not $SchemaPath) {
        $SchemaPath = Join-Path (Split-Path -Parent $PSScriptRoot) "contracts\repo_context_schema.v1.json"
    }

    $validation = $null
    $validatorPath = Join-Path $PSScriptRoot "contract_validator.ps1"
    if ((Test-Path -LiteralPath $validatorPath) -and (Test-Path -LiteralPath $SchemaPath)) {
        . $validatorPath
        $validation = Test-Contract -ContractPath $contextPath -SchemaPath $SchemaPath
        if (-not $validation.Ok) {
            throw ("Repo context schema validation failed: " + ($validation.Errors -join "; "))
        }
    }

    return [pscustomobject]@{
        RepoRoot = $RepoRoot
        OutputDir = $OutputDir
        RepoContextPath = $contextPath
        DiscoveryPath = $discoveryPath
        BaselinePath = $baselinePath
        Validation = $validation
    }
}

# Allow running as a script
if ($MyInvocation.InvocationName -ne '.') {
    param(
        [string]$RepoRoot,
        [string]$ContractPath,
        [string]$OutputDir,
        [string]$SchemaPath
    )
    Invoke-RepoContextBuilder -RepoRoot $RepoRoot -ContractPath $ContractPath -OutputDir $OutputDir -SchemaPath $SchemaPath | Out-Null
}
