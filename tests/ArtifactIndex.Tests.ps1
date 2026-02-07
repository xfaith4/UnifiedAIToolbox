<#!
.SYNOPSIS
  Pester tests for artifact index metadata.
#>

BeforeAll {
    $scriptPath = $PSCommandPath
    if (-not $scriptPath) { $scriptPath = $MyInvocation.MyCommand.Path }

    $testsDir = Split-Path -Parent $scriptPath
    $script:RepoRoot = Split-Path -Parent $testsDir

    . (Join-Path $script:RepoRoot 'Orchestration' 'scripts' 'MilestoneController.ps1')
}

Describe 'Artifact index metadata' {
    It 'includes job_type and contract fields on each record' {
        $outDir = Join-Path $TestDrive 'artifact-index'
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null

        Set-Content -Path (Join-Path $outDir 'sample.txt') -Value 'hello' -Encoding UTF8

        $script:RunId = 'test-run-id'
        $script:JobType = 'build_new_app'
        $script:Contract = [pscustomobject]@{
            contract_universe = 'build_app'
            contract_version = 'build_app_contract.v1'
            pipeline_id = 'pipeline_build_app.v1'
        }

        $indexPath = Write-ArtifactIndex -OutputDir $outDir
        $indexPath | Should -Exist

        $entries = Get-Content -Raw -LiteralPath $indexPath | ConvertFrom-Json -Depth 10
        $entries.Count | Should -BeGreaterThan 0

        $entry = $entries | Select-Object -First 1
        $entry.run_id | Should -Be 'test-run-id'
        $entry.job_type | Should -Be 'build_new_app'
        $entry.contract_universe | Should -Be 'build_app'
        $entry.contract_version | Should -Be 'build_app_contract.v1'
        $entry.pipeline_id | Should -Be 'pipeline_build_app.v1'
    }
}
