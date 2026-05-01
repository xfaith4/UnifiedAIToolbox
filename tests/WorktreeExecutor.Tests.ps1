<#
.SYNOPSIS
    Pester tests for the WorktreeExecutor module.
.DESCRIPTION
    Verifies the worktree-isolated execution layer:
      - Per-step worktree + branch creation
      - OK step merge into integration
      - FAILED step quarantine (branch preserved, worktree gone)
      - Final fast-forward of target branch
      - Aggressive cleanup
#>

BeforeAll {
    $script:RepoRoot   = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
    $script:ModulePath = Join-Path $script:RepoRoot 'Orchestration\engine\WorktreeExecutor.psm1'
    Import-Module $script:ModulePath -Force

    function New-TempGitRepo {
        $dir = Join-Path ([System.IO.Path]::GetTempPath()) ("uaitb-wt-test-{0}" -f ([guid]::NewGuid().ToString('N').Substring(0,8)))
        New-Item -ItemType Directory -Path $dir | Out-Null
        & git -C $dir init --initial-branch=main 2>&1 | Out-Null
        & git -C $dir config user.email "test@uaitb.local" 2>&1 | Out-Null
        & git -C $dir config user.name  "Test User" 2>&1 | Out-Null
        Set-Content -Path (Join-Path $dir 'README.md') -Value "# test" -Encoding UTF8
        & git -C $dir add . 2>&1 | Out-Null
        & git -C $dir commit -m "init" 2>&1 | Out-Null
        return $dir
    }

    function Remove-TempGitRepo {
        param([string]$Path)
        if ($Path -and (Test-Path $Path)) {
            # Worktrees may have read-only files; force
            try { Remove-Item -Recurse -Force -Path $Path -ErrorAction Stop }
            catch {
                Get-ChildItem -Path $Path -Recurse -Force | ForEach-Object { $_.Attributes = 'Normal' }
                Remove-Item -Recurse -Force -Path $Path -ErrorAction SilentlyContinue
            }
        }
    }
}

Describe "WorktreeExecutor module" {

    Context "Initialize-RunIntegration" {
        BeforeEach {
            $script:Repo = New-TempGitRepo
        }
        AfterEach {
            Remove-TempGitRepo -Path $script:Repo
        }

        It "creates an integration branch off the base ref" {
            $ctx = Initialize-RunIntegration -RepoRoot $script:Repo -RunId "t1" -BaseRef "main"
            $ctx.IntegrationBranch | Should -Be "uaitb/t1/integration"

            $branches = & git -C $script:Repo branch --list "uaitb/t1/integration"
            $branches | Should -Match "uaitb/t1/integration"
        }

        It "creates an integration worktree directory" {
            $ctx = Initialize-RunIntegration -RepoRoot $script:Repo -RunId "t2" -BaseRef "main"
            $ctx.IntegrationDir | Should -Not -BeNullOrEmpty
            Test-Path $ctx.IntegrationDir | Should -BeTrue
        }

        It "throws when base ref does not exist" {
            { Initialize-RunIntegration -RepoRoot $script:Repo -RunId "t3" -BaseRef "nonexistent" } |
                Should -Throw -ExpectedMessage "*does not exist*"
        }

        It "throws when path is not a git repo" {
            $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("not-a-repo-{0}" -f ([guid]::NewGuid().ToString('N').Substring(0,8)))
            New-Item -ItemType Directory -Path $tmp | Out-Null
            try {
                { Initialize-RunIntegration -RepoRoot $tmp -RunId "t4" -BaseRef "main" } |
                    Should -Throw -ExpectedMessage "*Not a git repository*"
            } finally {
                Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
            }
        }
    }

    Context "Per-step worktree lifecycle" {
        BeforeEach {
            $script:Repo = New-TempGitRepo
            $script:Ctx = Initialize-RunIntegration -RepoRoot $script:Repo -RunId "lifecycle" -BaseRef "main"
        }
        AfterEach {
            Remove-TempGitRepo -Path $script:Repo
        }

        It "creates an isolated worktree on a step branch" {
            $dir = New-RunWorktree -Context $script:Ctx -StepId 1
            Test-Path $dir | Should -BeTrue

            $branches = (& git -C $script:Repo branch --list "uaitb/lifecycle/step-1") | Out-String
            $branches | Should -Match "uaitb/lifecycle/step-1"
        }

        It "merges an OK step's changes into integration" {
            $dir = New-RunWorktree -Context $script:Ctx -StepId 5
            Set-Content -Path (Join-Path $dir 'feature.txt') -Value "added by step 5" -Encoding UTF8

            Merge-RunWorktree -Context $script:Ctx -StepId 5 -Status 'OK' -CommitMessage "test"

            # Integration worktree should contain the file
            Test-Path (Join-Path $script:Ctx.IntegrationDir 'feature.txt') | Should -BeTrue

            # Worktree dir should be gone
            Test-Path $dir | Should -BeFalse

            # Step branch should be gone
            $stepBr = (& git -C $script:Repo branch --list "uaitb/lifecycle/step-5") | Out-String
            $stepBr.Trim() | Should -BeNullOrEmpty

            $script:Ctx.Merged | Should -Contain 5
        }

        It "quarantines a FAILED step (branch preserved, worktree removed)" {
            $dir = New-RunWorktree -Context $script:Ctx -StepId 9
            Set-Content -Path (Join-Path $dir 'broken.txt') -Value "bad output" -Encoding UTF8

            Merge-RunWorktree -Context $script:Ctx -StepId 9 -Status 'FAILED'

            # Step branch should be renamed to quarantine
            $quar = (& git -C $script:Repo branch --list "uaitb/lifecycle/quarantine/step-9") | Out-String
            $quar | Should -Match "uaitb/lifecycle/quarantine/step-9"

            # Original step branch is gone
            $orig = (& git -C $script:Repo branch --list "uaitb/lifecycle/step-9") | Out-String
            $orig.Trim() | Should -BeNullOrEmpty

            # Worktree dir gone
            Test-Path $dir | Should -BeFalse

            $script:Ctx.Quarantined.Count | Should -Be 1
        }

        It "skips a step cleanly without merging or quarantining" {
            $dir = New-RunWorktree -Context $script:Ctx -StepId 12
            Merge-RunWorktree -Context $script:Ctx -StepId 12 -Status 'SKIP'

            Test-Path $dir | Should -BeFalse
            $script:Ctx.Merged | Should -Not -Contain 12
            $script:Ctx.Quarantined.Count | Should -Be 0
        }

        It "supports multiple parallel steps in one wave" {
            $d1 = New-RunWorktree -Context $script:Ctx -StepId 100
            $d2 = New-RunWorktree -Context $script:Ctx -StepId 101

            Set-Content -Path (Join-Path $d1 'a.txt') -Value "from 100" -Encoding UTF8
            Set-Content -Path (Join-Path $d2 'b.txt') -Value "from 101" -Encoding UTF8

            Merge-RunWorktree -Context $script:Ctx -StepId 100 -Status 'OK'
            Merge-RunWorktree -Context $script:Ctx -StepId 101 -Status 'OK'

            Test-Path (Join-Path $script:Ctx.IntegrationDir 'a.txt') | Should -BeTrue
            Test-Path (Join-Path $script:Ctx.IntegrationDir 'b.txt') | Should -BeTrue
        }
    }

    Context "Complete-RunIntegration" {
        BeforeEach {
            $script:Repo = New-TempGitRepo
            $script:Ctx = Initialize-RunIntegration -RepoRoot $script:Repo -RunId "complete" -BaseRef "main"
            $d = New-RunWorktree -Context $script:Ctx -StepId 1
            Set-Content -Path (Join-Path $d 'output.txt') -Value "final" -Encoding UTF8
            Merge-RunWorktree -Context $script:Ctx -StepId 1 -Status 'OK'
        }
        AfterEach {
            Remove-TempGitRepo -Path $script:Repo
        }

        It "fast-forwards a target branch when MergeTo is provided" {
            # Detach HEAD so 'main' isn't checked out in the bare working tree
            & git -C $script:Repo checkout --detach 2>&1 | Out-Null

            $result = Complete-RunIntegration -Context $script:Ctx -MergeTo "main"
            $result.mergedTo | Should -Be "main"

            $log = (& git -C $script:Repo log main --oneline) | Out-String
            $log | Should -Match "merge step 1"
        }

        It "tears down the integration worktree" {
            & git -C $script:Repo checkout --detach 2>&1 | Out-Null

            $intDir = $script:Ctx.IntegrationDir
            Complete-RunIntegration -Context $script:Ctx -MergeTo "main" | Out-Null
            Test-Path $intDir | Should -BeFalse
        }

        It "refuses to fast-forward MergeTo when it is checked out in another worktree" {
            # main is checked out in the temp repo's working tree by default
            { Complete-RunIntegration -Context $script:Ctx -MergeTo "main" } |
                Should -Throw -ExpectedMessage "*checked out in another worktree*"
        }

        It "leaves integration branch intact when no MergeTo is given" {
            Complete-RunIntegration -Context $script:Ctx | Out-Null
            $br = (& git -C $script:Repo branch --list "uaitb/complete/integration") | Out-String
            $br | Should -Match "uaitb/complete/integration"
        }
    }

    Context "Remove-RunArtifacts" {
        It "purges all run worktrees and branches" {
            $repo = New-TempGitRepo
            try {
                $ctx = Initialize-RunIntegration -RepoRoot $repo -RunId "purge" -BaseRef "main"
                $d1 = New-RunWorktree -Context $ctx -StepId 1
                $d2 = New-RunWorktree -Context $ctx -StepId 2
                Set-Content -Path (Join-Path $d2 'x.txt') -Value "x" -Encoding UTF8
                Merge-RunWorktree -Context $ctx -StepId 2 -Status 'FAILED'

                Remove-RunArtifacts -Context $ctx -IncludeQuarantine

                Test-Path $d1 | Should -BeFalse
                $remaining = (& git -C $repo branch --list "uaitb/purge/*") | Out-String
                $remaining.Trim() | Should -BeNullOrEmpty
            } finally {
                Remove-TempGitRepo -Path $repo
            }
        }

        It "preserves quarantine branches by default" {
            $repo = New-TempGitRepo
            try {
                $ctx = Initialize-RunIntegration -RepoRoot $repo -RunId "preserve" -BaseRef "main"
                $d = New-RunWorktree -Context $ctx -StepId 1
                Set-Content -Path (Join-Path $d 'x.txt') -Value "x" -Encoding UTF8
                Merge-RunWorktree -Context $ctx -StepId 1 -Status 'FAILED'

                Remove-RunArtifacts -Context $ctx

                $quar = (& git -C $repo branch --list "uaitb/preserve/quarantine/*") | Out-String
                $quar | Should -Match "quarantine/step-1"
            } finally {
                Remove-TempGitRepo -Path $repo
            }
        }
    }
}
