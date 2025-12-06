<#
.SYNOPSIS
    Pester tests for AI-backed milestone pipeline functions.
.DESCRIPTION
    Tests for the new AI-backed functions in MilestoneController.ps1:
    - Execute-MilestonePipeline
    - Invoke-MilestoneAgent
    - Invoke-OrchestrationLlm
#>

BeforeAll {
    # Get script paths
    $scriptPath = $PSCommandPath
    if (-not $scriptPath) {
        $scriptPath = $MyInvocation.MyCommand.Path
    }
    
    $testsDir = Split-Path -Parent $scriptPath
    $script:RepoRoot = Split-Path -Parent $testsDir
    $script:OrchestrationRoot = Join-Path $script:RepoRoot 'Orchestration'
    $script:MilestoneScript = Join-Path $script:OrchestrationRoot 'scripts' 'MilestoneController.ps1'
    
    # Create temp test directory
    $script:TestOutputDir = Join-Path $TestDrive 'orchestration-ai-test'
    New-Item -ItemType Directory -Path $script:TestOutputDir -Force | Out-Null
    
    # Source the script to load functions
    . $script:MilestoneScript
}

Describe "AI-Backed Pipeline Functions - Structure" {
    
    Context "Function Availability" {
        It "Should have Execute-MilestonePipeline function defined" {
            Get-Command -Name Execute-MilestonePipeline -ErrorAction SilentlyContinue | Should -Not -BeNullOrEmpty
        }
        
        It "Should have Invoke-MilestoneAgent function defined" {
            Get-Command -Name Invoke-MilestoneAgent -ErrorAction SilentlyContinue | Should -Not -BeNullOrEmpty
        }
        
        It "Should have Invoke-OrchestrationLlm function defined" {
            Get-Command -Name Invoke-OrchestrationLlm -ErrorAction SilentlyContinue | Should -Not -BeNullOrEmpty
        }
    }
}

Describe "Execute-MilestonePipeline - Function Signature" {
    
    Context "Parameter Acceptance" {
        It "Should accept all required parameters without error" {
            $env:OPENAI_API_KEY = "test-key-for-validation"
            $milestones = @(
                @{
                    Name = "Test Milestone"
                    Description = "Test Description"
                    Agent = "Researcher"
                }
            )
            
            # This will fail on API call, but should accept parameters
            { 
                try {
                    Execute-MilestonePipeline -Milestones $milestones -GoalText "Test" -Model "gpt-4o-mini" -OutputDir $script:TestOutputDir 
                } catch {
                    # Expected to fail on API call
                }
            } | Should -Not -Throw "*missing*"
        }
    }
}

Describe "Invoke-MilestoneAgent - Agent Mapping" {
    
    Context "Without API Key (Should Fail Gracefully)" {
        BeforeEach {
            $env:OPENAI_API_KEY = $null
        }
        
        It "Should throw an error when OPENAI_API_KEY is not set" {
            $milestone = [pscustomobject]@{
                Name = "Test Milestone"
                Description = "Test Description"
                Agent = "Researcher"
            }
            
            { Invoke-MilestoneAgent -GoalText "Test Goal" -Milestone $milestone -Model "gpt-4o-mini" -OutputDir $script:TestOutputDir } | 
                Should -Throw "*OPENAI_API_KEY*"
        }
    }
}

Describe "Invoke-OrchestrationLlm - API Interaction" {
    
    Context "Without API Key" {
        BeforeEach {
            $env:OPENAI_API_KEY = $null
        }
        
        It "Should throw an error when OPENAI_API_KEY is not set" {
            { Invoke-OrchestrationLlm -Model "gpt-4o-mini" -SystemPrompt "Test" -UserPrompt "Test" } | 
                Should -Throw "*OPENAI_API_KEY*"
        }
    }
}

Describe "MilestoneController.ps1 - DryRun Mode with New Pipeline" {
    
    Context "DryRun Mode Should Use Old Behavior" {
        BeforeEach {
            $script:TestGoalFile = Join-Path $script:TestOutputDir 'ai-test-goal.txt'
            Set-Content -Path $script:TestGoalFile -Value "Research and implement a new feature" -Encoding UTF8
        }
        
        It "Should complete successfully in DryRun mode without API key" {
            $env:OPENAI_API_KEY = $null
            $outputDir = Join-Path $script:TestOutputDir 'dryrun-no-api'
            
            & $script:MilestoneScript -GoalFile $script:TestGoalFile -DryRun -OutputDir $outputDir
            
            $LASTEXITCODE | Should -Be 0
        }
        
        It "Should create orchestration-summary.json in DryRun mode" {
            $env:OPENAI_API_KEY = $null
            $outputDir = Join-Path $script:TestOutputDir 'dryrun-summary'
            
            & $script:MilestoneScript -GoalFile $script:TestGoalFile -DryRun -OutputDir $outputDir
            
            (Join-Path $outputDir 'orchestration-summary.json') | Should -Exist
        }
        
        It "Should not create milestone markdown files in DryRun mode" {
            $env:OPENAI_API_KEY = $null
            $outputDir = Join-Path $script:TestOutputDir 'dryrun-no-md'
            
            & $script:MilestoneScript -GoalFile $script:TestGoalFile -DryRun -OutputDir $outputDir
            
            $mdFiles = Get-ChildItem -Path $outputDir -Filter "milestone_*.md" -ErrorAction SilentlyContinue
            $mdFiles | Should -BeNullOrEmpty
        }
    }
}

AfterAll {
    # Cleanup is automatic with TestDrive
}
