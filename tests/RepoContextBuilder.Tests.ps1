<#
.SYNOPSIS
  Pester tests for repo context builder and command policy enforcement.
#>

BeforeAll {
    $scriptPath = $PSCommandPath
    if (-not $scriptPath) { $scriptPath = $MyInvocation.MyCommand.Path }

    $testsDir = Split-Path -Parent $scriptPath
    $script:RepoRoot = Split-Path -Parent $testsDir

    . (Join-Path $script:RepoRoot 'supervisor' 'repo_context_builder.ps1')
    . (Join-Path $script:RepoRoot 'supervisor' 'command_policy.ps1')
    . (Join-Path $script:RepoRoot 'supervisor' 'contract_validator.ps1')

    $script:SchemaPath = Join-Path $script:RepoRoot 'contracts' 'repo_context_schema.v1.json'
}

Describe 'Repo Context Builder' {
    It 'produces schema-valid repo_context.json' {
        $repoDir = Join-Path $TestDrive 'repo'
        New-Item -ItemType Directory -Path $repoDir -Force | Out-Null

        Set-Content -Path (Join-Path $repoDir 'README.md') -Value "powershell -NoProfile -Command `"Write-Output test`"" -Encoding UTF8
        Set-Content -Path (Join-Path $repoDir 'package.json') -Value "{`"name`": `"demo`"}" -Encoding UTF8

        $contract = @{
            run_id = 'test-run'
            repo = @{ local_path = $repoDir; url = 'https://example.com/demo' }
            ref = @{ branch = 'main' }
            repo_context = @{ max_files_scanned = 200; max_runtime_seconds = 5; baseline_verification_enabled = $false; command_confidence_threshold = 0.7 }
        }
        $contractPath = Join-Path $TestDrive 'contract.json'
        $contract | ConvertTo-Json -Depth 10 | Set-Content -Path $contractPath -Encoding UTF8

        $outDir = Join-Path $TestDrive 'out'
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null

        $result = Invoke-RepoContextBuilder -RepoRoot $repoDir -ContractPath $contractPath -OutputDir $outDir -SchemaPath $script:SchemaPath
        $result.RepoContextPath | Should -Exist

        $validation = Test-Contract -ContractPath $result.RepoContextPath -SchemaPath $script:SchemaPath
        $validation.Ok | Should -BeTrue
    }

    It 'command policy rejects unlisted command' {
        $repoDir = Join-Path $TestDrive 'repo-policy'
        New-Item -ItemType Directory -Path $repoDir -Force | Out-Null

        Set-Content -Path (Join-Path $repoDir 'README.md') -Value "powershell -NoProfile -Command `"Write-Output test`"" -Encoding UTF8

        $contract = @{
            run_id = 'policy-run'
            repo = @{ local_path = $repoDir }
            ref = @{ branch = 'main' }
            repo_context = @{ max_files_scanned = 200; baseline_verification_enabled = $false }
        }
        $contractPath = Join-Path $TestDrive 'contract-policy.json'
        $contract | ConvertTo-Json -Depth 10 | Set-Content -Path $contractPath -Encoding UTF8

        $outDir = Join-Path $TestDrive 'out-policy'
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null

        $result = Invoke-RepoContextBuilder -RepoRoot $repoDir -ContractPath $contractPath -OutputDir $outDir -SchemaPath $script:SchemaPath

        { Assert-CommandAllowed -RepoContextPath $result.RepoContextPath -Command "powershell -NoProfile -Command `"Write-Output test`"" } | Should -Not -Throw
        { Assert-CommandAllowed -RepoContextPath $result.RepoContextPath -Command "make build" } | Should -Throw
    }

    It 'baseline captures transcript when enabled' {
        $repoDir = Join-Path $TestDrive 'repo-baseline'
        New-Item -ItemType Directory -Path $repoDir -Force | Out-Null

        Set-Content -Path (Join-Path $repoDir 'README.md') -Value "powershell -NoProfile -Command `"Write-Output test`"" -Encoding UTF8

        $contract = @{
            run_id = 'baseline-run'
            repo = @{ local_path = $repoDir }
            ref = @{ branch = 'main' }
            repo_context = @{
                max_files_scanned = 200
                max_runtime_seconds = 5
                baseline_verification_enabled = $true
                command_confidence_threshold = 0.7
            }
        }
        $contractPath = Join-Path $TestDrive 'contract-baseline.json'
        $contract | ConvertTo-Json -Depth 10 | Set-Content -Path $contractPath -Encoding UTF8

        $outDir = Join-Path $TestDrive 'out-baseline'
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null

        $result = Invoke-RepoContextBuilder -RepoRoot $repoDir -ContractPath $contractPath -OutputDir $outDir -SchemaPath $script:SchemaPath
        $context = Get-Content -Raw -Path $result.RepoContextPath | ConvertFrom-Json -Depth 20

        $context.baseline.attempted | Should -BeTrue
        $context.baseline.results.Count | Should -BeGreaterThan 0
        $context.baseline.results[0].exit_code | Should -Not -BeNullOrEmpty
        $context.baseline.results[0].stdout_summary | Should -Not -BeNullOrEmpty
    }
}
