<#
.SYNOPSIS
  Pester tests for maintenance gates (Phase 3).
#>

BeforeAll {
    $scriptPath = $PSCommandPath
    if (-not $scriptPath) { $scriptPath = $MyInvocation.MyCommand.Path }

    $testsDir = Split-Path -Parent $scriptPath
    $script:RepoRoot = Split-Path -Parent $testsDir

    . (Join-Path $script:RepoRoot 'supervisor' 'maintenance_gates.ps1')
}

function script:New-BaseMaintenanceContract {
    $contract = @{
        intent = 'bugfix'
        constraints = @{
            hard = @{
                no_stack_change = $true
                dependency_updates = 'disallow'
                forbidden_paths = @()
                forbidden_file_patterns = @()
                max_loc_changed = $null
                max_files_touched = $null
            }
            soft = @{
                max_loc_changed = 500
                max_files_touched = 20
                require_acknowledgment = $false
                acknowledged = $true
            }
        }
        change_surface = @{
            allowed_paths = @()
            forbidden_paths = @()
            forbidden_file_patterns = @()
            touch_policy = @{
                ci_workflows = 'deny'
                dependency_manifests = 'allow'
                infra = 'allow'
            }
        }
        baseline = @{ mode = 'required_pass' }
        command_policy = @{
            only_from_repo_context = $true
            thresholds = @{ min_confidence_auto_run = 0.7; allow_convention = $false }
        }
        repo_context_ref = @{ path = 'repo_context.json' }
    }
    return ($contract | ConvertTo-Json -Depth 20 | ConvertFrom-Json -Depth 20)
}

Describe 'Maintenance gates' {
    It 'fails when dependency_updates=disallow and package.json changes' {
        $patchPath = Join-Path $TestDrive 'dep.patch'
        @(
            "diff --git a/package.json b/package.json",
            "index 1111111..2222222 100644",
            "--- a/package.json",
            "+++ b/package.json",
            "@@ -1 +1 @@",
            "-{`"name`": `"old`"}",
            "+{`"name`": `"new`"}"
        ) | Set-Content -Path $patchPath -Encoding UTF8

        $contract = New-BaseMaintenanceContract
        $result = Test-DiffGate -PatchPath $patchPath -Contract $contract

        $result.Ok | Should -BeFalse
        ($result.Errors -join "`n") | Should -Match 'dependency_updates'
    }

    It 'fails when no_stack_change=true and Dockerfile changes' {
        $patchPath = Join-Path $TestDrive 'stack.patch'
        @(
            "diff --git a/Dockerfile b/Dockerfile",
            "new file mode 100644",
            "index 0000000..1111111",
            "--- /dev/null",
            "+++ b/Dockerfile",
            "@@ -0,0 +1,2 @@",
            "+FROM node:20-alpine",
            "+CMD [`"node`"]"
        ) | Set-Content -Path $patchPath -Encoding UTF8

        $contract = New-BaseMaintenanceContract
        $result = Test-DiffGate -PatchPath $patchPath -Contract $contract

        $result.Ok | Should -BeFalse
        ($result.Errors -join "`n") | Should -Match 'Stack change detected'
    }

    It 'fails when baseline required_pass and baseline results fail' {
        $repoContextPath = Join-Path $TestDrive 'repo_context.json'
        $context = @{
            baseline = @{
                attempted = $true
                results = @(
                    @{ command = 'pnpm test'; exit_code = 1 }
                )
            }
        }
        $context | ConvertTo-Json -Depth 10 | Set-Content -Path $repoContextPath -Encoding UTF8

        $contract = New-BaseMaintenanceContract
        $contract.baseline = @{ mode = 'required_pass' }

        $result = Test-BaselineGate -RepoContextPath $repoContextPath -Contract $contract

        $result.Ok | Should -BeFalse
        ($result.Errors -join "`n") | Should -Match 'required_pass'
    }

    It 'fails when hard LOC limit is exceeded' {
        $patchPath = Join-Path $TestDrive 'loc.patch'
        @(
            "diff --git a/src/app.ts b/src/app.ts",
            "index 1111111..2222222 100644",
            "--- a/src/app.ts",
            "+++ b/src/app.ts",
            "@@ -1,0 +1,3 @@",
            "+console.log('a');",
            "+console.log('b');",
            "+console.log('c');"
        ) | Set-Content -Path $patchPath -Encoding UTF8

        $contract = New-BaseMaintenanceContract
        $contract.constraints.hard.max_loc_changed = 1
        $contract.constraints.soft.max_loc_changed = 1000

        $result = Test-DiffGate -PatchPath $patchPath -Contract $contract

        $result.Ok | Should -BeFalse
        ($result.Errors -join "`n") | Should -Match 'Hard limit exceeded'
    }

    It 'blocks commands not present in repo_context' {
        $repoContextPath = Join-Path $TestDrive 'repo_context_cmd.json'
        $context = @{
            discovery = @{
                commands = @(
                    @{
                        kind = 'test'
                        command = 'pnpm test'
                        confidence = 0.9
                        source = 'ci'
                        evidence_paths = @('ci.yml')
                    }
                )
            }
        }
        $context | ConvertTo-Json -Depth 10 | Set-Content -Path $repoContextPath -Encoding UTF8

        $contract = New-BaseMaintenanceContract
        $commands = @(
            [pscustomobject]@{ command = 'npm test' }
        )

        $result = Test-CommandProvenance -RepoContextPath $repoContextPath -Contract $contract -Commands $commands

        $result.Ok | Should -BeFalse
        ($result.Errors -join "`n") | Should -Match 'not approved'
    }
}
