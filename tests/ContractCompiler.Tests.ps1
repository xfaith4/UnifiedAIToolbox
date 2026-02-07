<#
.SYNOPSIS
  Pester tests for SSOT contract compilation.
#>

BeforeAll {
    $scriptPath = $PSCommandPath
    if (-not $scriptPath) { $scriptPath = $MyInvocation.MyCommand.Path }

    $testsDir = Split-Path -Parent $scriptPath
    $script:RepoRoot = Split-Path -Parent $testsDir
    $script:JobTypesPath = Join-Path $script:RepoRoot 'job_types.json'

    . (Join-Path $script:RepoRoot 'supervisor' 'contract_compiler.ps1')
}

Describe 'Contract compiler' {
    It 'unknown job_type fails fast' {
        $request = @{
            job_type = 'unknown_job'
            goal = 'Test goal'
            app = @{ name = 'Demo' }
        }
        $requestPath = Join-Path $TestDrive 'request-unknown.json'
        $request | ConvertTo-Json -Depth 10 | Set-Content -Path $requestPath -Encoding UTF8

        $outDir = Join-Path $TestDrive 'out-unknown'
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null

        { Invoke-ContractCompiler -RequestPath $requestPath -JobTypesPath $script:JobTypesPath -RepoRoot $script:RepoRoot -OutputDir $outDir } | Should -Throw
    }

    It 'build request compiles and selects pipeline_build_app' {
        $request = @{
            job_type = 'build_new_app'
            goal = 'Build a demo app'
            app = @{ name = 'DemoApp' }
        }
        $requestPath = Join-Path $TestDrive 'request-build.json'
        $request | ConvertTo-Json -Depth 10 | Set-Content -Path $requestPath -Encoding UTF8

        $outDir = Join-Path $TestDrive 'out-build'
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null

        $result = Invoke-ContractCompiler -RequestPath $requestPath -JobTypesPath $script:JobTypesPath -RepoRoot $script:RepoRoot -OutputDir $outDir
        $result.ContractPath | Should -Exist
        $result.Contract.job_type | Should -Be 'build_new_app'
        $result.PipelineTemplatePath | Should -Match 'pipeline_build_app'
    }

    It 'maintenance request compiles and selects pipeline_maintenance' {
        $request = @{
            job_type = 'maintain_existing_app'
            goal = 'Fix a bug'
            intent = 'bugfix'
            repo = @{ full_name = 'owner/repo' }
            ref = @{ branch = 'main' }
        }
        $requestPath = Join-Path $TestDrive 'request-maint.json'
        $request | ConvertTo-Json -Depth 10 | Set-Content -Path $requestPath -Encoding UTF8

        $outDir = Join-Path $TestDrive 'out-maint'
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null

        $result = Invoke-ContractCompiler -RequestPath $requestPath -JobTypesPath $script:JobTypesPath -RepoRoot $script:RepoRoot -OutputDir $outDir
        $result.ContractPath | Should -Exist
        $result.Contract.job_type | Should -Be 'maintain_existing_app'
        $result.PipelineTemplatePath | Should -Match 'pipeline_maintenance'
    }

    It 'applies defaults when request omits budget' {
        $request = @{
            job_type = 'build_new_app'
            goal = 'Build a demo app'
            app = @{ name = 'DemoApp' }
        }
        $requestPath = Join-Path $TestDrive 'request-defaults.json'
        $request | ConvertTo-Json -Depth 10 | Set-Content -Path $requestPath -Encoding UTF8

        $outDir = Join-Path $TestDrive 'out-defaults'
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null

        $result = Invoke-ContractCompiler -RequestPath $requestPath -JobTypesPath $script:JobTypesPath -RepoRoot $script:RepoRoot -OutputDir $outDir
        $result.Contract.budget.max_time_minutes | Should -Be 60
    }
}
