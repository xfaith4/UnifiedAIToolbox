<#!
.SYNOPSIS
  Pester tests for contract validation and job routing.
#>

BeforeAll {
    $scriptPath = $PSCommandPath
    if (-not $scriptPath) { $scriptPath = $MyInvocation.MyCommand.Path }

    $testsDir = Split-Path -Parent $scriptPath
    $script:RepoRoot = Split-Path -Parent $testsDir
    $script:JobTypesPath = Join-Path $script:RepoRoot 'job_types.json'

    . (Join-Path $script:RepoRoot 'supervisor' 'contract_validator.ps1')
    . (Join-Path $script:RepoRoot 'supervisor' 'job_router.ps1')

    $script:BuildContractPath = Join-Path $TestDrive 'build-contract.json'
    $buildContract = @{
        schema_version = '1.0'
        job_type = 'build_new_app'
        run_id = 'test-run-build'
        goal = 'Build a test app'
        agent_roster = @('Researcher', 'Engineer', 'Critic', 'Synthesizer', 'Commissioner', 'Supervisor', 'Historian')
        budget = @{ max_time_minutes = 60 }
        logging = @{ level = 'info' }
        artifact_policy = @{ mode = 'standard'; required = @('orchestration-summary.json') }
        gate_policy = @{ mode = 'standard'; gates = @('quality', 'safety') }
        stages = @('Researcher', 'Engineer', 'Critic', 'Synthesizer', 'Commissioner', 'Supervisor', 'Historian')
        app = @{ name = 'TestApp' }
    }
    $buildContract | ConvertTo-Json -Depth 20 | Set-Content -Path $script:BuildContractPath -Encoding UTF8

    $script:MaintenanceContractPath = Join-Path $TestDrive 'maintenance-contract.json'
    $maintenanceContract = @{
        schema_version = '1.0'
        job_type = 'maintain_existing_app'
        run_id = 'test-run-maint'
        goal = 'Fix a bug'
        intent = 'bugfix'
        risk_level = 'low'
        agent_roster = @('RepoContextBuilder', 'Researcher', 'Engineer', 'ReviewGate', 'Critic', 'Synthesizer', 'Commissioner', 'Supervisor', 'Historian')
        budget = @{ max_time_minutes = 45 }
        logging = @{ level = 'info' }
        artifact_policy = @{ mode = 'standard'; required = @('repo_context.json', 'evidence.json', 'changeset.summary.json', 'changeset.patch') }
        gate_policy = @{ mode = 'strict'; gates = @('baseline', 'change', 'diff') }
        stages = @('RepoContextBuilder', 'Researcher', 'Engineer', 'ReviewGate', 'Critic', 'Synthesizer', 'Commissioner', 'Supervisor', 'Historian')
        repo = @{ full_name = 'owner/repo' }
        ref = @{ branch = 'main' }
        constraints = @{
            hard = @{ no_stack_change = $true; dependency_updates = 'disallow'; forbidden_paths = @('secrets') }
            soft = @{ max_loc_changed = 200; max_files_touched = 5; require_acknowledgment = $true; acknowledged = $true }
        }
        change_surface = @{
            allowed_paths = @('src')
            forbidden_paths = @('.git')
            forbidden_file_patterns = @('*.pem')
            touch_policy = @{ ci_workflows = 'deny'; dependency_manifests = 'deny'; infra = 'deny' }
        }
        baseline = @{ mode = 'required_pass' }
        command_policy = @{ only_from_repo_context = $true; thresholds = @{ min_confidence_auto_run = 0.7; allow_convention = $false } }
        repo_context_ref = @{ path = 'repo_context.json' }
    }
    $maintenanceContract | ConvertTo-Json -Depth 20 | Set-Content -Path $script:MaintenanceContractPath -Encoding UTF8

    $script:MissingFieldContractPath = Join-Path $TestDrive 'missing-field.json'
    $missingField = @{
        schema_version = '1.0'
        job_type = 'build_new_app'
        goal = 'Missing run_id'
        agent_roster = @('Researcher')
        budget = @{ max_time_minutes = 30 }
        logging = @{ level = 'info' }
        artifact_policy = @{ mode = 'standard' }
        gate_policy = @{ mode = 'standard' }
        app = @{ name = 'TestApp' }
    }
    $missingField | ConvertTo-Json -Depth 20 | Set-Content -Path $script:MissingFieldContractPath -Encoding UTF8

    $script:ForbiddenStageContractPath = Join-Path $TestDrive 'forbidden-stage.json'
    $forbiddenStage = @{
        schema_version = '1.0'
        job_type = 'maintain_existing_app'
        run_id = 'test-run-forbidden'
        goal = 'Forbidden stage test'
        intent = 'bugfix'
        agent_roster = @('RepoContextBuilder', 'Researcher', 'Engineer', 'ReviewGate', 'Critic', 'Synthesizer', 'Commissioner', 'Supervisor', 'Historian')
        budget = @{ max_time_minutes = 15 }
        logging = @{ level = 'info' }
        artifact_policy = @{ mode = 'standard' }
        gate_policy = @{ mode = 'strict' }
        stages = @('RepoContextBuilder', 'Researcher', 'Engineer', 'AppFactoryBootstrap')
        repo = @{ full_name = 'owner/repo' }
        ref = @{ branch = 'main' }
        constraints = @{
            hard = @{ no_stack_change = $true; dependency_updates = 'disallow'; forbidden_paths = @('secrets') }
            soft = @{ max_loc_changed = 200; max_files_touched = 5; require_acknowledgment = $true; acknowledged = $true }
        }
        change_surface = @{
            allowed_paths = @('src')
            forbidden_paths = @('.git')
            forbidden_file_patterns = @('*.pem')
            touch_policy = @{ ci_workflows = 'deny'; dependency_manifests = 'deny'; infra = 'deny' }
        }
        baseline = @{ mode = 'required_pass' }
        command_policy = @{ only_from_repo_context = $true; thresholds = @{ min_confidence_auto_run = 0.7; allow_convention = $false } }
        repo_context_ref = @{ path = 'repo_context.json' }
    }
    $forbiddenStage | ConvertTo-Json -Depth 20 | Set-Content -Path $script:ForbiddenStageContractPath -Encoding UTF8
}

Describe 'Contract validation' {
    It 'valid build_app_contract passes validation' {
        $schemaPath = Join-Path $script:RepoRoot 'contracts' 'build_app_contract.v1.json'
        { Assert-Contract -ContractPath $script:BuildContractPath -SchemaPath $schemaPath -ExpectedJobType 'build_new_app' } | Should -Not -Throw
    }

    It 'valid maintenance_contract passes validation' {
        $schemaPath = Join-Path $script:RepoRoot 'contracts' 'maintenance_contract.v1.json'
        { Assert-Contract -ContractPath $script:MaintenanceContractPath -SchemaPath $schemaPath -ExpectedJobType 'maintain_existing_app' } | Should -Not -Throw
    }

    It 'missing required fields fails validation' {
        $schemaPath = Join-Path $script:RepoRoot 'contracts' 'build_app_contract.v1.json'
        { Assert-Contract -ContractPath $script:MissingFieldContractPath -SchemaPath $schemaPath -ExpectedJobType 'build_new_app' } | Should -Throw
    }
}

Describe 'Job routing' {
    It 'unknown job_type fails' {
        $contract = Get-Content -Raw -Path $script:BuildContractPath | ConvertFrom-Json -Depth 20
        { Resolve-JobRouting -JobType 'unknown_job' -JobTypesPath $script:JobTypesPath -RepoRoot $script:RepoRoot -Contract $contract } | Should -Throw
    }

    It 'forbidden stage enforcement fails with clear message' {
        $contract = Get-Content -Raw -Path $script:ForbiddenStageContractPath | ConvertFrom-Json -Depth 20
        { Resolve-JobRouting -JobType 'maintain_existing_app' -JobTypesPath $script:JobTypesPath -RepoRoot $script:RepoRoot -Contract $contract } | Should -Throw '*Forbidden stage*'
    }
}
