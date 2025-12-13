function Get-RepoRootPath {
    [CmdletBinding()]
    param(
        [string]$RootPath
    )

    if ($RootPath) {
        $resolved = Resolve-Path -Path $RootPath -ErrorAction Stop
        return $resolved.ProviderPath
    }

    $default = Join-Path -Path $env:USERPROFILE -ChildPath 'GitHubRepoManager'
    return $default
}

function Get-RepoDirectoryMap {
    param(
        [string]$RootPath
    )

    $root = Get-RepoRootPath -RootPath $RootPath
    return [PSCustomObject]@{
        Root      = $root
        Templates = Join-Path $root '00_Templates'
        Active    = Join-Path $root '10_Active'
        Staging   = Join-Path $root '20_Staging'
        Archive   = Join-Path $root '30_Archive'
        Clones    = Join-Path $root '99_Clones'
        Reports   = Join-Path $root 'Reports'
        Logs      = Join-Path $root 'Logs'
    }
}

function Get-RepoLogPath {
    param(
        [string]$RootPath
    )

    $map = Get-RepoDirectoryMap -RootPath $RootPath
    New-Item -ItemType Directory -Force -Path $map.Logs | Out-Null
    return Join-Path -Path $map.Logs -ChildPath 'GitHubRepoManager.log'
}

function Write-RepoManagerLog {
    param(
        [string]$Message,
        [string]$RootPath
    )

    $logPath = Get-RepoLogPath -RootPath $RootPath
    $timestamp = (Get-Date).ToString('o')
    Add-Content -Path $logPath -Value "$timestamp`t$Message"
}

function Get-GitRepositories {
    param(
        [string]$RootPath,
        [ValidateSet('Templates','Active','Staging','Archive','Clones','Reports','Logs')]
        [string]$Section = 'Clones'
    )

    $map = Get-RepoDirectoryMap -RootPath $RootPath
    $target = $map.$Section
    if (-not (Test-Path $target)) {
        return @()
    }

    return Get-ChildItem -Path $target -Directory -ErrorAction SilentlyContinue
}

function Invoke-GitCommand {
    param(
        [string]$RepositoryPath,
        [string[]]$Arguments
    )

    $command = 'git'
    $processInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processInfo.FileName = $command
    $processInfo.Arguments = $Arguments -join ' '
    $processInfo.WorkingDirectory = $RepositoryPath
    $processInfo.RedirectStandardOutput = $true
    $processInfo.RedirectStandardError = $true
    $processInfo.UseShellExecute = $false
    $processInfo.CreateNoWindow = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $processInfo
    $process.Start() | Out-Null
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    return [PSCustomObject]@{
        ExitCode = $process.ExitCode
        StdOut   = $stdout.Trim()
        StdErr   = $stderr.Trim()
    }
}

function Get-DefaultBranch {
    param(
        [string]$RepositoryPath
    )

    $result = Invoke-GitCommand -RepositoryPath $RepositoryPath -Arguments @('symbolic-ref','refs/remotes/origin/HEAD')
    if ($result.ExitCode -ne 0 -or -not $result.StdOut) {
        return 'main'
    }

    $parts = $result.StdOut -split '/' | Select-Object -Last 1
    return $parts
}

function Get-LastCommitInfo {
    param(
        [string]$RepositoryPath
    )

    $result = Invoke-GitCommand -RepositoryPath $RepositoryPath -Arguments @('log','-1','--format=%H;%cI')
    if ($result.ExitCode -ne 0 -or -not $result.StdOut) {
        return $null
    }

    $split = $result.StdOut -split ';'
    return [PSCustomObject]@{
        Hash = $split[0]
        Date = (Get-Date $split[1])
    }
}

function Get-RepoStatus {
    param(
        [string]$RepositoryPath
    )

    $branchResult = Invoke-GitCommand -RepositoryPath $RepositoryPath -Arguments @('rev-parse','--abbrev-ref','HEAD')
    $branch = if ($branchResult.ExitCode -eq 0) { $branchResult.StdOut } else { 'detached' }

    $ahead = 0
    $behind = 0
    $countsResult = Invoke-GitCommand -RepositoryPath $RepositoryPath -Arguments @('rev-list','--left-right','--count','origin/' + $branch + '...HEAD')
    if ($countsResult.ExitCode -eq 0) {
        $numbers = $countsResult.StdOut -split '\s+'
        if ($numbers.Count -ge 2) {
            $behind = [int]$numbers[0]
            $ahead = [int]$numbers[1]
        }
    }

    $commitInfo = Get-LastCommitInfo -RepositoryPath $RepositoryPath
    $daysOld = 9999
    $dateText = 'unavailable'
    if ($commitInfo) {
        $daysOld = (New-TimeSpan -Start $commitInfo.Date -End (Get-Date)).Days
        $dateText = $commitInfo.Date.ToString('yyyy-MM-dd HH:mm:ss')
    }

    return [PSCustomObject]@{
        Repo     = Split-Path -Leaf $RepositoryPath
        Path     = $RepositoryPath
        Branch   = $branch
        Ahead    = $ahead
        Behind   = $behind
        BehindFlag = if ($behind -gt 0) { 'Yes' } else { 'No' }
        Date     = $dateText
        DaysOld  = $daysOld
        Status   = "Ahead $ahead / Behind $behind"
    }
}
