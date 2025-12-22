<#
.SYNOPSIS
    Pester tests for Invoke-UATPromptBatchRefinement.
#>

BeforeAll {
    $ModulePath = Join-Path $PSScriptRoot '..' 'modules' 'PromptLibrary' 'PromptLibrary.psm1'
    Import-Module $ModulePath -Force -DisableNameChecking

    $script:PromptRoot = Join-Path $TestDrive 'prompts'
    New-Item -ItemType Directory -Path $script:PromptRoot -Force | Out-Null

    $promptOne = @'
id: network.prompt
title: Network Prompt
category: analysis
tags: [network, test]
user_template: |
  Analyze ${foo} and {{bar}}.
  Keep it short.
'@

    $promptTwo = @'
id: spec.prompt
version: 1
blocks:
  instructions: |
    Process ${foo} with {{bar}}.
'@

    Set-Content -LiteralPath (Join-Path $script:PromptRoot 'network.prompt.yaml') -Value $promptOne -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $script:PromptRoot 'spec.yaml') -Value $promptTwo -Encoding UTF8

    $global:PromptBatchTestPromptRoot = $script:PromptRoot
}

Describe "Invoke-UATPromptBatchRefinement" {
    BeforeEach {
        Mock New-RefinedPrompt -ModuleName PromptLibrary {
            param(
                $UserPrompt,
                $PromptId,
                $Title,
                $Category,
                $Tags,
                $RefinementIterations,
                $RefinementGoals,
                $SaveArtifacts
            )

            $artifactPath = Join-Path $TestDrive ("artifacts/" + $PromptId)
            New-Item -ItemType Directory -Path $artifactPath -Force | Out-Null
            Set-Content -LiteralPath (Join-Path $artifactPath "iteration_1.txt") -Value "Refined Result:`nRefined for $PromptId" -Encoding UTF8

            [pscustomobject]@{
                RefinedPrompt = "Refined for $PromptId"
                ArtifactsPath = $artifactPath
                TokensUsed = 123
                EstimatedCost = 0.01
            }
        }
    }

    It "creates refined copies and summary output in copy mode" {
        $outRoot = Join-Path $TestDrive 'batch-out'
        $global:PromptBatchOutRoot = $outRoot
        $results = InModuleScope PromptLibrary {
            Invoke-UATPromptBatchRefinement -PromptRoot $global:PromptBatchTestPromptRoot -OutRoot $global:PromptBatchOutRoot -Iterations 2 -SaveArtifacts -Mode Copy -Confirm:$false
        }

        $results.Count | Should -Be 2

        $refinedDir = Join-Path $outRoot 'refined_prompts'
        Test-Path -LiteralPath (Join-Path $refinedDir 'network.prompt.refined.yaml') | Should -BeTrue
        Test-Path -LiteralPath (Join-Path $refinedDir 'spec.refined.yaml') | Should -BeTrue

        $summaryPath = Join-Path $outRoot 'summary.json'
        Test-Path -LiteralPath $summaryPath | Should -BeTrue

        $summary = Get-Content -LiteralPath $summaryPath -Raw | ConvertFrom-Json
        @($summary).Count | Should -Be 2
        ($summary | Where-Object { $_.status -eq 'ok' }).Count | Should -Be 2
    }

    It "preserves placeholders by passing refinement goals" {
        $outRoot = Join-Path $TestDrive 'batch-out-placeholders'
        $global:PromptBatchOutRoot = $outRoot
        InModuleScope PromptLibrary {
            Invoke-UATPromptBatchRefinement -PromptRoot $global:PromptBatchTestPromptRoot -OutRoot $global:PromptBatchOutRoot -Iterations 1 -Mode Copy -Confirm:$false | Out-Null
        }

        Assert-MockCalled New-RefinedPrompt -ModuleName PromptLibrary -Times 2 -ParameterFilter {
            ($RefinementGoals -join ' ') -match '\$\{foo\}' -and
            ($RefinementGoals -join ' ') -match '\{\{bar\}\}'
        }
    }
}
