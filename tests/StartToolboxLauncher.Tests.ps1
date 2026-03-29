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

    It 'does not copy OPENAI_API_KEY into NEXT_PUBLIC_API_KEY' {
        $script:LauncherText | Should -Not -Match '\[Environment\]::SetEnvironmentVariable\("NEXT_PUBLIC_API_KEY", \$env:OPENAI_API_KEY, "Process"\)'
    }

    It 'does not require NEXT_PUBLIC_API_KEY before launch' {
        $script:LauncherText | Should -Not -Match 'ERROR: NEXT_PUBLIC_API_KEY is missing or unresolved\.'
    }
}
