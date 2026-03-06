BeforeAll {
    $scriptPath = $PSCommandPath
    if (-not $scriptPath) { $scriptPath = $MyInvocation.MyCommand.Path }

    $testsDir = Split-Path -Parent $scriptPath
    $script:RepoRoot = Split-Path -Parent $testsDir
    $script:LauncherPath = Join-Path $script:RepoRoot 'Start-Toolbox.ps1'
    $script:LauncherText = Get-Content -Path $script:LauncherPath -Raw
}

Describe 'Start-Toolbox launcher guards' {
    It 'has valid PowerShell syntax' {
        $errors = $null
        $null = [System.Management.Automation.Language.Parser]::ParseFile(
            $script:LauncherPath,
            [ref]$null,
            [ref]$errors
        )
        $errors | Should -BeNullOrEmpty
    }

    It 'verifies API and web process health after startup' {
        $script:LauncherText | Should -Match 'Assert-ProcessRunning -Process \$apiProc -Name "API" -ErrorLogPath \$apiErrLog'
        $script:LauncherText | Should -Match 'Assert-ProcessRunning -Process \$webProc -Name "Web Portal" -ErrorLogPath \$webErrLog'
    }

    It 'checks process existence before taskkill in Stop-ProcessTree' {
        $script:LauncherText | Should -Match 'Get-Process -Id \$procid -ErrorAction SilentlyContinue'
    }
}
