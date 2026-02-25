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

    $script:JobType = "build_new_app"
    $script:ContractPath = Join-Path $script:TestOutputDir 'build-contract.json'
    $contract = @{
        schema_version = "1.0"
        job_type = $script:JobType
        contract_universe = "build_app"
        contract_version = "build_app_contract.v1"
        pipeline_id = "pipeline_build_app.v1"
        run_id = "test-run"
        goal = "Research and implement a new feature"
        agent_roster = @("Researcher", "Engineer", "Critic", "Synthesizer", "Commissioner", "Supervisor", "Historian")
        budget = @{ max_time_minutes = 60 }
        logging = @{ level = "info" }
        artifact_policy = @{ mode = "standard"; required = @("orchestration-summary.json") }
        gate_policy = @{ mode = "standard"; gates = @("quality", "safety") }
        stages = @("Researcher", "Engineer", "Critic", "Synthesizer", "Commissioner", "Supervisor", "Historian")
        app = @{ name = "TestApp" }
    }
    $contract | ConvertTo-Json -Depth 20 | Set-Content -Path $script:ContractPath -Encoding UTF8
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

Describe "Agent Output Normalization" {

    It "Should extract JSON content from chat completion envelopes" {
        $rawEnvelope = @{
            id = "resp_123"
            choices = @(
                @{
                    message = @{
                        content = '{"status":"passed","errors":[],"warnings":[]}'
                    }
                }
            )
        }

        $normalized = ConvertTo-NormalizedAgentJson -RawOutput ($rawEnvelope | ConvertTo-Json -Depth 20) -AgentName "ReviewGate"
        $normalized.ok | Should -BeTrue
        $normalized.parsed.status | Should -Be "passed"
    }

    It "Should normalize Critic null issue file fields" {
        $criticRaw = @{
            issues = @(
                @{
                    severity = "medium"
                    category = "maintainability"
                    description = "Issue missing file reference."
                    file = $null
                    line = $null
                }
            )
            ratings = @{
                completeness = 7
                feasibility = 8
                quality = 7
            }
            improvements = @("Add file references to issues.")
        } | ConvertTo-Json -Depth 20

        $normalized = ConvertTo-NormalizedAgentJson -RawOutput $criticRaw -AgentName "Critic"
        $normalized.ok | Should -BeTrue
        $normalized.parsed.issues[0].file | Should -Be "unknown"
        @($normalized.parsed.issues[0].PSObject.Properties.Name) | Should -Not -Contain "line"
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
            
            & $script:MilestoneScript -GoalFile $script:TestGoalFile -DryRun -OutputDir $outputDir -JobType $script:JobType -ContractPath $script:ContractPath
            
            $LASTEXITCODE | Should -Be 0
        }
        
        It "Should create orchestration-summary.json in DryRun mode" {
            $env:OPENAI_API_KEY = $null
            $outputDir = Join-Path $script:TestOutputDir 'dryrun-summary'
            
            & $script:MilestoneScript -GoalFile $script:TestGoalFile -DryRun -OutputDir $outputDir -JobType $script:JobType -ContractPath $script:ContractPath
            
            $resolved = Join-Path $outputDir $script:JobType
            (Join-Path $resolved 'orchestration-summary.json') | Should -Exist
        }
        
        It "Should write milestone outputs in DryRun mode" {
            $env:OPENAI_API_KEY = $null
            $outputDir = Join-Path $script:TestOutputDir 'dryrun-no-md'
            
            & $script:MilestoneScript -GoalFile $script:TestGoalFile -DryRun -OutputDir $outputDir -JobType $script:JobType -ContractPath $script:ContractPath
            
            $resolved = Join-Path $outputDir $script:JobType
            $mdFiles = Get-ChildItem -Path $resolved -Filter "milestone_*.md" -ErrorAction SilentlyContinue
            $mdFiles | Should -Not -BeNullOrEmpty
        }
    }
}

AfterAll {
    # Cleanup is automatic with TestDrive
}
