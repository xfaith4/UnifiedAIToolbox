<#
.SYNOPSIS
    Pester tests for Orchestration scripts (MilestoneController, Orchestrate-Codex).
.DESCRIPTION
    Tests for the core orchestration scripts to validate their functionality:
    - MilestoneController.ps1: Goal-driven orchestration with milestones
    - Orchestrate-Codex.ps1: Multi-agent swarm orchestration
#>

BeforeAll {
    # Get script paths - use direct path resolution
    $scriptPath = $PSCommandPath
    if (-not $scriptPath) {
        $scriptPath = $MyInvocation.MyCommand.Path
    }
    
    $testsDir = Split-Path -Parent $scriptPath
    $script:RepoRoot = Split-Path -Parent $testsDir
    $script:OrchestrationRoot = Join-Path $script:RepoRoot 'Orchestration' 'AI-Orchestration'
    $script:MilestoneScript = Join-Path $script:OrchestrationRoot 'scripts' 'MilestoneController.ps1'
    $script:CodexSwarmScript = Join-Path $script:OrchestrationRoot 'codex-multiagent-swarm' 'Orchestrate-Codex.ps1'
    
    # Create temp test directory
    $script:TestOutputDir = Join-Path $TestDrive 'orchestration-test'
    New-Item -ItemType Directory -Path $script:TestOutputDir -Force | Out-Null
}

Describe "Orchestration Scripts - Existence and Structure" {
    
    Context "Script Files" {
        It "MilestoneController.ps1 should exist" {
            $script:MilestoneScript | Should -Exist
        }
        
        It "Orchestrate-Codex.ps1 should exist" {
            $script:CodexSwarmScript | Should -Exist
        }
        
        It "MilestoneController.ps1 should have valid PowerShell syntax" {
            $errors = $null
            $null = [System.Management.Automation.Language.Parser]::ParseFile(
                $script:MilestoneScript, 
                [ref]$null, 
                [ref]$errors
            )
            $errors | Should -BeNullOrEmpty
        }
        
        It "Orchestrate-Codex.ps1 should have valid PowerShell syntax" {
            $errors = $null
            $null = [System.Management.Automation.Language.Parser]::ParseFile(
                $script:CodexSwarmScript, 
                [ref]$null, 
                [ref]$errors
            )
            $errors | Should -BeNullOrEmpty
        }
    }
}

Describe "MilestoneController.ps1 - DryRun Mode" {
    
    Context "With Goal File containing multiple keywords" {
        BeforeEach {
            # Create test goal file with multiple keywords (research AND implement)
            # This ensures proper milestone generation
            $script:TestGoalFile = Join-Path $script:TestOutputDir 'test-goal.txt'
            Set-Content -Path $script:TestGoalFile -Value "Research and implement a new feature" -Encoding UTF8
        }
        
        It "Should complete successfully with a goal file" {
            $outputDir = Join-Path $script:TestOutputDir 'milestone-goal'
            
            & $script:MilestoneScript -GoalFile $script:TestGoalFile -DryRun -OutputDir $outputDir
            
            $LASTEXITCODE | Should -Be 0
        }
        
        It "Should create orchestration-summary.json" {
            $outputDir = Join-Path $script:TestOutputDir 'milestone-summary'
            
            & $script:MilestoneScript -GoalFile $script:TestGoalFile -DryRun -OutputDir $outputDir
            
            (Join-Path $outputDir 'orchestration-summary.json') | Should -Exist
        }
        
        It "Should generate milestones based on goal keywords" {
            $outputDir = Join-Path $script:TestOutputDir 'milestone-keywords'
            
            & $script:MilestoneScript -GoalFile $script:TestGoalFile -DryRun -OutputDir $outputDir
            
            $summaryPath = Join-Path $outputDir 'orchestration-summary.json'
            $summaryPath | Should -Exist
            
            $summary = Get-Content -Path $summaryPath -Raw | ConvertFrom-Json
            $summary.MilestonesCount | Should -BeGreaterThan 0
        }
        
        It "Should generate milestones for goals with both research and implement" {
            $goalFile = Join-Path $script:TestOutputDir 'full-goal.txt'
            Set-Content -Path $goalFile -Value "Research, plan, and implement the solution" -Encoding UTF8
            $outputDir = Join-Path $script:TestOutputDir 'milestone-full'
            
            & $script:MilestoneScript -GoalFile $goalFile -DryRun -OutputDir $outputDir
            
            $LASTEXITCODE | Should -Be 0
            
            $summaryPath = Join-Path $outputDir 'orchestration-summary.json'
            $summary = Get-Content -Path $summaryPath -Raw | ConvertFrom-Json
            $summary.MilestonesCount | Should -BeGreaterOrEqual 2
        }
    }
}

Describe "Orchestrate-Codex.ps1 - DryRun Mode" {
    
    Context "Repository Analysis" {
        It "Should complete successfully with DryRun" {
            $outputDir = Join-Path $script:TestOutputDir 'swarm-basic'
            
            & $script:CodexSwarmScript -RepoRoot $script:RepoRoot -DryRun -OutputDir $outputDir
            
            $LASTEXITCODE | Should -Be 0
        }
        
        It "Should create swarm-summary.json" {
            $outputDir = Join-Path $script:TestOutputDir 'swarm-summary'
            
            & $script:CodexSwarmScript -RepoRoot $script:RepoRoot -DryRun -OutputDir $outputDir
            
            (Join-Path $outputDir 'swarm-summary.json') | Should -Exist
        }
        
        It "Should create swarm-results.json" {
            $outputDir = Join-Path $script:TestOutputDir 'swarm-results'
            
            & $script:CodexSwarmScript -RepoRoot $script:RepoRoot -DryRun -OutputDir $outputDir
            
            (Join-Path $outputDir 'swarm-results.json') | Should -Exist
        }
    }
    
    Context "Agent Configuration" {
        It "Should respect MaxAgents parameter" {
            $outputDir = Join-Path $script:TestOutputDir 'swarm-maxagents'
            
            & $script:CodexSwarmScript -RepoRoot $script:RepoRoot -MaxAgents 2 -DryRun -OutputDir $outputDir
            
            $summaryPath = Join-Path $outputDir 'swarm-summary.json'
            $summary = Get-Content -Path $summaryPath -Raw | ConvertFrom-Json
            $summary.AgentsUsed.Count | Should -BeLessOrEqual 2
        }
        
        It "Should use default model if not specified" {
            $outputDir = Join-Path $script:TestOutputDir 'swarm-model'
            
            & $script:CodexSwarmScript -RepoRoot $script:RepoRoot -DryRun -OutputDir $outputDir
            
            $summaryPath = Join-Path $outputDir 'swarm-summary.json'
            $summary = Get-Content -Path $summaryPath -Raw | ConvertFrom-Json
            $summary.Model | Should -Be 'gpt-4o-mini'
        }
    }
}

AfterAll {
    # Cleanup is automatic with TestDrive
}
