<#
.SYNOPSIS
    Pester tests for GatePolicy module.
#>

BeforeAll {
    $script:RepoRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
    $script:ModulePath = Join-Path $script:RepoRoot 'Orchestration\engine\GatePolicy.psm1'
    Import-Module $script:ModulePath -Force

    function New-TempArtifactRoot {
        $dir = Join-Path ([System.IO.Path]::GetTempPath()) ("uaitb-gate-{0}" -f ([guid]::NewGuid().ToString('N').Substring(0,8)))
        New-Item -ItemType Directory -Path $dir | Out-Null
        return $dir
    }
}

Describe "GatePolicy" {

    Context "Get-GatesForCheckpoint" {
        It "matches an exact 'wave:N' anchor" {
            $plan = [pscustomobject]@{
                gates = @(
                    [pscustomobject]@{ id = 'g1'; type = 'Critic'; after = 'wave:1' },
                    [pscustomobject]@{ id = 'g2'; type = 'Critic'; after = 'wave:2' }
                )
            }
            $hits = Get-GatesForCheckpoint -Plan $plan -Checkpoint 'wave:1' -WaveIndex 1 -WaveStepIds @(1, 2)
            $hits.Count | Should -Be 1
            $hits[0].id | Should -Be 'g1'
        }

        It "matches 'all' on every wave checkpoint" {
            $plan = [pscustomobject]@{
                gates = @([pscustomobject]@{ id = 'g'; type = 'Critic'; after = 'all' })
            }
            (Get-GatesForCheckpoint -Plan $plan -Checkpoint 'wave:1' -WaveIndex 1 -WaveStepIds @(1)).Count | Should -Be 1
            (Get-GatesForCheckpoint -Plan $plan -Checkpoint 'wave:5' -WaveIndex 5 -WaveStepIds @(9)).Count | Should -Be 1
        }

        It "matches 'step:N' when N is in the wave" {
            $plan = [pscustomobject]@{
                gates = @([pscustomobject]@{ id = 'g'; type = 'Critic'; after = 'step:4' })
            }
            $hits = Get-GatesForCheckpoint -Plan $plan -Checkpoint 'wave:2' -WaveIndex 2 -WaveStepIds @(3, 4, 5)
            $hits.Count | Should -Be 1
        }

        It "returns empty for plans with no gates section" {
            $plan = [pscustomobject]@{ goal = 'no gates' }
            (Get-GatesForCheckpoint -Plan $plan -Checkpoint 'wave:1').Count | Should -Be 0
        }
    }

    Context "Test-CriticGate" {
        It "PASSes when composite score meets threshold" {
            $artRoot = New-TempArtifactRoot
            try {
                $stepDir = Join-Path $artRoot 'step1'
                New-Item -ItemType Directory -Path $stepDir | Out-Null
                @{
                    rubric = @{ compositeScore = 4.5 }
                    decision = 'APPROVE'
                } | ConvertTo-Json | Set-Content -Path (Join-Path $stepDir 'winner.json') -Encoding UTF8

                $gate = [pscustomobject]@{ type = 'Critic'; threshold = 4.0 }
                $results = @(@{ Dir = $stepDir; Status = 'OK' })
                $v = Test-CriticGate -Gate $gate -WaveResults $results -ArtifactRoot $artRoot
                $v.Status | Should -Be 'PASS'
            } finally {
                Remove-Item -Recurse -Force $artRoot -ErrorAction SilentlyContinue
            }
        }

        It "RETRYs when composite score is below threshold" {
            $artRoot = New-TempArtifactRoot
            try {
                $stepDir = Join-Path $artRoot 'step1'
                New-Item -ItemType Directory -Path $stepDir | Out-Null
                @{ rubric = @{ compositeScore = 2.5 } } | ConvertTo-Json |
                    Set-Content -Path (Join-Path $stepDir 'winner.json') -Encoding UTF8

                $gate = [pscustomobject]@{ type = 'Critic'; threshold = 4.0 }
                $results = @(@{ Dir = $stepDir; Status = 'OK' })
                $v = Test-CriticGate -Gate $gate -WaveResults $results -ArtifactRoot $artRoot
                $v.Status | Should -Be 'RETRY'
            } finally {
                Remove-Item -Recurse -Force $artRoot -ErrorAction SilentlyContinue
            }
        }

        It "FAILs when no winner.json exists" {
            $artRoot = New-TempArtifactRoot
            try {
                $stepDir = Join-Path $artRoot 'step1'
                New-Item -ItemType Directory -Path $stepDir | Out-Null
                $gate = [pscustomobject]@{ type = 'Critic'; threshold = 4.0 }
                $results = @(@{ Dir = $stepDir; Status = 'OK' })
                $v = Test-CriticGate -Gate $gate -WaveResults $results -ArtifactRoot $artRoot
                $v.Status | Should -Be 'FAIL'
            } finally {
                Remove-Item -Recurse -Force $artRoot -ErrorAction SilentlyContinue
            }
        }
    }

    Context "Test-CommissionerGate" {
        It "PASSes when recommendation matches required" {
            $artRoot = New-TempArtifactRoot
            try {
                $stepDir = Join-Path $artRoot 'step1'
                New-Item -ItemType Directory -Path $stepDir | Out-Null
                @{ recommendation = 'PROCEED' } | ConvertTo-Json |
                    Set-Content -Path (Join-Path $stepDir 'commissioner_decision.json') -Encoding UTF8

                $gate = [pscustomobject]@{ type = 'Commissioner'; requireRecommendation = 'PROCEED' }
                $results = @(@{ Dir = $stepDir; Status = 'OK' })
                $v = Test-CommissionerGate -Gate $gate -WaveResults $results -ArtifactRoot $artRoot
                $v.Status | Should -Be 'PASS'
            } finally {
                Remove-Item -Recurse -Force $artRoot -ErrorAction SilentlyContinue
            }
        }

        It "FAILs when recommendation does not match" {
            $artRoot = New-TempArtifactRoot
            try {
                $stepDir = Join-Path $artRoot 'step1'
                New-Item -ItemType Directory -Path $stepDir | Out-Null
                @{ recommendation = 'STOP' } | ConvertTo-Json |
                    Set-Content -Path (Join-Path $stepDir 'commissioner_decision.json') -Encoding UTF8

                $gate = [pscustomobject]@{ type = 'Commissioner'; requireRecommendation = 'PROCEED' }
                $results = @(@{ Dir = $stepDir; Status = 'OK' })
                $v = Test-CommissionerGate -Gate $gate -WaveResults $results
                $v.Status | Should -Be 'FAIL'
            } finally {
                Remove-Item -Recurse -Force $artRoot -ErrorAction SilentlyContinue
            }
        }
    }

    Context "Test-RunCommandGate" {
        It "PASSes on a command that exits 0" {
            $gate = [pscustomobject]@{ type = 'RunCommand'; command = 'echo ok' }
            $v = Test-RunCommandGate -Gate $gate -WaveResults @() -RunContext $null
            $v.Status | Should -Be 'PASS'
        }

        It "FAILs on a command that exits non-zero" {
            $gate = [pscustomobject]@{ type = 'RunCommand'; command = 'exit 7' }
            $v = Test-RunCommandGate -Gate $gate -WaveResults @() -RunContext $null
            $v.Status | Should -Be 'FAIL'
            $v.Details.exitCode | Should -Be 7
        }

        It "RETRYs when maxRetries > 0 and exit non-zero" {
            $gate = [pscustomobject]@{ type = 'RunCommand'; command = 'exit 1'; maxRetries = 2 }
            $v = Test-RunCommandGate -Gate $gate -WaveResults @() -RunContext $null
            $v.Status | Should -Be 'RETRY'
        }
    }

    Context "Invoke-Gate (dispatcher)" {
        It "routes to the correct handler by type" {
            $gate = [pscustomobject]@{ id = 'rc1'; type = 'RunCommand'; command = 'echo hi' }
            $v = Invoke-Gate -Gate $gate -WaveResults @() -RunContext $null
            $v.Status | Should -Be 'PASS'
            $v.GateId | Should -Be 'rc1'
            $v.Type | Should -Be 'RunCommand'
        }

        It "FAILs gracefully on unknown type" {
            $gate = [pscustomobject]@{ id = 'unk'; type = 'Bogus' }
            $v = Invoke-Gate -Gate $gate -WaveResults @() -RunContext $null
            $v.Status | Should -Be 'FAIL'
            $v.Reason | Should -Match "Unknown gate type"
        }

        It "honors a Custom handler registered via Register-GateHandler" {
            Register-GateHandler -TypeName 'Bouncer' -Handler {
                param($args)
                return @{ Status = 'PASS'; Reason = "bouncer ok"; Details = @{} }
            }
            $gate = [pscustomobject]@{ id = 'b1'; type = 'Bouncer' }
            $v = Invoke-Gate -Gate $gate -WaveResults @() -RunContext $null
            $v.Status | Should -Be 'PASS'
            $v.Reason | Should -Be 'bouncer ok'
        }
    }

    Context "Save-GateResult" {
        It "writes a JSON audit file under artifactRoot/<plan>/gates/" {
            $artRoot = New-TempArtifactRoot
            try {
                $verdict = @{
                    GateId = 'gx'; Type = 'Critic'; Status = 'PASS'
                    Blocking = $true; Reason = 'all good'; Details = @{ score = 4.5 }
                }
                $path = Save-GateResult -Verdict $verdict -ArtifactRoot $artRoot -PlanName 'test_plan' -Attempt 1
                Test-Path $path | Should -BeTrue

                $obj = Get-Content -Raw $path | ConvertFrom-Json
                $obj.gateId | Should -Be 'gx'
                $obj.status | Should -Be 'PASS'
                $obj.attempt | Should -Be 1
            } finally {
                Remove-Item -Recurse -Force $artRoot -ErrorAction SilentlyContinue
            }
        }
    }
}
