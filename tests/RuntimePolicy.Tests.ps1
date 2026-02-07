<#
.SYNOPSIS
  Pester tests for SSOT runtime policy helpers.
#>

BeforeAll {
    $scriptPath = $PSCommandPath
    if (-not $scriptPath) { $scriptPath = $MyInvocation.MyCommand.Path }

    $testsDir = Split-Path -Parent $scriptPath
    $script:RepoRoot = Split-Path -Parent $testsDir

    . (Join-Path $script:RepoRoot 'Orchestration' 'scripts' 'MilestoneController.ps1')
}

Describe 'Runtime policy helpers' {
    It 'run_manifest includes job_type, pipeline template, policies, and contract hash' {
        $script:JobType = 'build_new_app'
        $routing = [pscustomobject]@{
            SchemaPath = 'contracts/build_app_contract.v1.json'
            PipelineTemplatePath = 'pipelines/pipeline_build_app.v1.json'
            StageIds = @('Researcher', 'Engineer')
            DefaultAgentRoster = @('Researcher', 'Engineer')
            GatePolicy = @{ mode = 'standard' }
            ArtifactPolicy = @{ mode = 'standard'; required_artifacts = @(@{ name = 'orchestration-summary.json'; origin = 'engine' }) }
            CommandPolicy = @{ only_from_repo_context = $false }
            SupervisorPolicy = @{ rubric_id = 'build_new_app.v1' }
            StagePolicy = @{ required = @('Researcher', 'Engineer'); optional = @(); forbidden = @() }
        }

        $outDir = Join-Path $TestDrive 'manifest'
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null

        $manifestPath = Write-RunManifest -OutputDir $outDir -GoalText 'Test goal' -Routing $routing -ContractPath 'contract.json' -ContractHash 'abc123' -ValidateOnly:$false
        $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json -Depth 20

        $manifest.job_type | Should -Be 'build_new_app'
        $manifest.routing.pipeline_template | Should -Be 'pipelines/pipeline_build_app.v1.json'
        $manifest.contract.hash_sha256 | Should -Be 'abc123'
        $manifest.resolved_policies.artifact_policy.mode | Should -Be 'standard'
    }

    It 'fails when required artifacts are missing' {
        $outDir = Join-Path $TestDrive 'artifacts'
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null

        $policy = @{
            mode = 'standard'
            required_artifacts = @(@{ name = 'required.txt'; origin = 'engine' })
        }

        { Assert-RequiredArtifacts -OutputDir $outDir -ArtifactPolicy $policy } | Should -Throw
    }

    It 'builds supervisor context with required artifacts' {
        $script:JobType = 'maintain_existing_app'
        $outDir = Join-Path $TestDrive 'supervisor'
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null

        $routing = [pscustomobject]@{
            PipelineTemplatePath = 'pipelines/pipeline_maintenance.v1.json'
            GatePolicy = @{ mode = 'strict' }
            ArtifactPolicy = @{ mode = 'standard'; required_artifacts = @(@{ name = 'repo_context.json'; origin = 'engine' }) }
            CommandPolicy = @{ only_from_repo_context = $true }
            SupervisorPolicy = @{ rubric_id = 'maintenance.v1' }
        }

        $context = Build-SupervisorContext -Routing $routing -OutputDir $outDir
        $context | Should -Match 'maintain_existing_app'
        $context | Should -Match 'repo_context.json'
    }

    It 'blocks commands not present in repo_context.json' {
        $outDir = Join-Path $TestDrive 'command-policy'
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null

        $repoContext = @{
            discovery = @{
                commands = @(
                    @{ command = 'pnpm test' }
                )
            }
        }
        $repoContext | ConvertTo-Json -Depth 10 | Set-Content -Path (Join-Path $outDir 'repo_context.json') -Encoding UTF8

        $evidence = @{
            commands_run = @(
                @{ command = 'npm test' }
            )
        }
        $evidence | ConvertTo-Json -Depth 10 | Set-Content -Path (Join-Path $outDir 'evidence.json') -Encoding UTF8

        $contract = @{
            command_policy = @{ only_from_repo_context = $true }
            repo_context_ref = @{ path = 'repo_context.json' }
        }

        { Assert-CommandPolicyCompliance -Contract $contract -OutputDir $outDir } | Should -Throw
    }
}
