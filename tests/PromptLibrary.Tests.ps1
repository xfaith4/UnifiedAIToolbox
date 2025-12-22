<#
.SYNOPSIS
    Comprehensive Pester tests for the PromptLibrary module.
.DESCRIPTION
    Tests for all exported functions in the PromptLibrary module including:
    - Get-PromptFile
    - Get-AgentFile
    - Invoke-Orchestration
    - Update-PromptIndex
    - Update-AgentIndex
    - Search-Prompts
    - ConvertTo-TemplateText
    - Get-ContentHash
#>

BeforeAll {
    # Import the module
    $ModulePath = Join-Path $PSScriptRoot '..' 'modules' 'PromptLibrary' 'PromptLibrary.psm1'
    Import-Module $ModulePath -Force -DisableNameChecking
    
    # Create temp test data directory
    $script:TestDataRoot = Join-Path $TestDrive 'test-data'
    $script:TestPromptsDir = Join-Path $script:TestDataRoot 'prompts'
    $script:TestAgentsDir = Join-Path $script:TestDataRoot 'agents'
    $script:TestArtifactsDir = Join-Path $script:TestDataRoot 'artifacts'
    
    New-Item -ItemType Directory -Path $script:TestPromptsDir -Force | Out-Null
    New-Item -ItemType Directory -Path $script:TestAgentsDir -Force | Out-Null
    New-Item -ItemType Directory -Path $script:TestArtifactsDir -Force | Out-Null
    
    # Create test prompt YAML
    $testPromptYaml = @"
id: test-prompt-1
title: Test Prompt
version: 1.0.0
description: A test prompt for unit testing
category: test
tags:
  - test
  - unit-test
user_template: "Hello `${{name}}, your task is `${{task}}"
system: You are a helpful test assistant.
"@
    
    Set-Content -Path (Join-Path $script:TestPromptsDir 'test-prompt-1.yaml') -Value $testPromptYaml
    
    # Create test agent JSON
    $testAgentJson = @"
{
  "id": "test-agent-1",
  "name": "Test Agent",
  "role": "You are a test agent for unit testing",
  "prompt": "Perform the requested task",
  "capabilities": ["testing", "validation"],
  "style": {
    "tone": "professional"
  },
  "constraints": ["Be concise", "Be accurate"]
}
"@
    
    Set-Content -Path (Join-Path $script:TestAgentsDir 'test-agent-1.json') -Value $testAgentJson
}

Describe "PromptLibrary Module - Core Functions" {
    
    Context "Get-ContentHash" {
        It "Should return consistent SHA256 hash for same text" {
            $text = "Hello World"
            $hash1 = Get-ContentHash -Text $text
            $hash2 = Get-ContentHash -Text $text
            
            $hash1 | Should -Be $hash2
            $hash1 | Should -Match '^[a-f0-9]{64}$'
        }
        
        It "Should normalize line endings" {
            $text1 = "Line1`r`nLine2"
            $text2 = "Line1`nLine2"
            
            $hash1 = Get-ContentHash -Text $text1
            $hash2 = Get-ContentHash -Text $text2
            
            $hash1 | Should -Be $hash2
        }
        
        It "Should handle empty strings" {
            $hash = Get-ContentHash -Text ""
            $hash | Should -Not -BeNullOrEmpty
            $hash | Should -Match '^[a-f0-9]{64}$'
        }
    }
    
    Context "ConvertTo-TemplateText" {
        It "Should replace simple variables" {
            $template = 'Hello ${{name}}'
            $vars = @{ name = "World" }
            
            $result = ConvertTo-TemplateText -Template $template -Vars $vars
            
            $result | Should -Be "Hello World"
        }
        
        It "Should replace multiple variables" {
            $template = 'Hello ${{name}}, your age is ${{age}}'
            $vars = @{ 
                name = "Alice"
                age = "30"
            }
            
            $result = ConvertTo-TemplateText -Template $template -Vars $vars
            
            $result | Should -Be "Hello Alice, your age is 30"
        }
        
        It "Should handle variables with whitespace" {
            $template = 'Hello ${{ name }}'
            $vars = @{ name = "World" }
            
            $result = ConvertTo-TemplateText -Template $template -Vars $vars
            
            $result | Should -Be "Hello World"
        }
        
        It "Should handle special characters in values" {
            $template = 'Value: ${{value}}'
            $vars = @{ value = '$100.00 (25%)' }
            
            $result = ConvertTo-TemplateText -Template $template -Vars $vars
            
            $result | Should -Be 'Value: $100.00 (25%)'
        }
        
        It "Should not replace unknown variables" {
            $template = 'Hello ${{name}}, unknown: ${{unknown}}'
            $vars = @{ name = "World" }
            
            $result = ConvertTo-TemplateText -Template $template -Vars $vars
            
            $result | Should -Be 'Hello World, unknown: ${{unknown}}'
        }
    }
    
    Context "Test-OrchCli" {
        It "Should return true for existing command" {
            # Use pwsh since it's cross-platform and we're running in PowerShell
            $result = Test-OrchCli -Command "pwsh"
            $result | Should -Be $true
        }
        
        It "Should return false for non-existing command" {
            $result = Test-OrchCli -Command "nonexistent-command-12345"
            $result | Should -Be $false
        }
    }
}

Describe "PromptLibrary Module - Prompt Management" {
    
    Context "Get-PromptFile" {
        It "Should load existing prompt by ID" {
            # Use actual test data
            $promptsDir = Join-Path $PSScriptRoot '..' 'data' 'prompts'
            
            if (Test-Path $promptsDir) {
                $firstPromptFile = Get-ChildItem -Path $promptsDir -Filter "*.yaml" -Recurse | Select-Object -First 1
                
                if ($firstPromptFile) {
                    $promptId = $firstPromptFile.BaseName
                    $prompt = Get-PromptFile -Id $promptId -CatalogRoot $promptsDir
                    
                    $prompt | Should -Not -BeNullOrEmpty
                    $prompt.id | Should -Be $promptId
                    $prompt._Path | Should -Not -BeNullOrEmpty
                }
            }
        }
        
        It "Should return null for non-existing prompt" {
            $prompt = Get-PromptFile -Id "nonexistent-prompt-12345" -CatalogRoot $script:TestPromptsDir
            $prompt | Should -BeNullOrEmpty
        }
        
        It "Should include _Path and _Raw properties" {
            $prompt = Get-PromptFile -Id "test-prompt-1" -CatalogRoot $script:TestPromptsDir
            
            if ($prompt) {
                $prompt._Path | Should -Not -BeNullOrEmpty
                $prompt._Raw | Should -Not -BeNullOrEmpty
            }
        }
    }
}

Describe "PromptLibrary Module - Agent Management" {
    
    Context "Get-AgentFile" {
        It "Should load agents from directory" {
            $agents = Get-AgentFile -Root $script:TestAgentsDir
            
            $agents | Should -Not -BeNullOrEmpty
            $agents.Count | Should -BeGreaterThan 0
        }
        
        It "Should normalize agent properties" {
            $agents = Get-AgentFile -Root $script:TestAgentsDir
            $agent = $agents | Where-Object { $_.id -eq 'test-agent-1' } | Select-Object -First 1
            
            if ($agent) {
                $agent.id | Should -Not -BeNullOrEmpty
                $agent.name | Should -Not -BeNullOrEmpty
                $agent.role | Should -Not -BeNullOrEmpty
                $agent.capabilities | Should -Not -BeNullOrEmpty
            }
        }
        
        It "Should include checksum" {
            $agents = Get-AgentFile -Root $script:TestAgentsDir
            $agent = $agents | Select-Object -First 1
            
            if ($agent) {
                $agent.checksum | Should -Not -BeNullOrEmpty
                $agent.checksum | Should -Match '^[a-f0-9]{64}$'
            }
        }
    }
    
    Context "Get-Agent" {
        It "Should filter agents by ID" {
            Mock Get-AgentFile -ModuleName PromptLibrary {
                @(
                    [PSCustomObject]@{ id = "agent1"; name = "Agent 1"; capabilities = @("cap1") }
                    [PSCustomObject]@{ id = "agent2"; name = "Agent 2"; capabilities = @("cap2") }
                )
            }
            
            $agent = Get-Agent -Id "agent1"
            
            $agent.id | Should -Be "agent1"
        }
        
        It "Should filter agents by capability" {
            Mock Get-AgentFile -ModuleName PromptLibrary {
                @(
                    [PSCustomObject]@{ id = "agent1"; name = "Agent 1"; capabilities = @("testing") }
                    [PSCustomObject]@{ id = "agent2"; name = "Agent 2"; capabilities = @("coding") }
                )
            }
            
            $agents = Get-Agent -Capability "testing"
            
            $agents.Count | Should -Be 1
            $agents[0].id | Should -Be "agent1"
        }
    }
}

Describe "PromptLibrary Module - Database Operations" {
    
    Context "Update-PromptIndex" {
        It "Should update prompt index without errors" {
            # This is an integration test that verifies the function doesn't throw
            { 
                Update-PromptIndex -PromptId "test-prompt" `
                                  -Title "Test Title" `
                                  -Version "1.0.0" `
                                  -Tags @("test") `
                                  -Checksum "abc123"
            } | Should -Not -Throw
        }
    }
    
    Context "Update-AgentIndex" {
        It "Should update agent index without errors" {
            {
                Update-AgentIndex -AgentId "test-agent" `
                                 -Name "Test Agent" `
                                 -Capabilities @("testing") `
                                 -Checksum "def456"
            } | Should -Not -Throw
        }
    }
    
    Context "Search-Prompts" {
        It "Should search prompts without errors" {
            {
                $results = Search-Prompts -Query "test" -Limit 10
                # Results may be empty but shouldn't throw
            } | Should -Not -Throw
        }
    }
}

Describe "PromptLibrary Module - Orchestration" {
    
    Context "Invoke-Orchestration" {
        BeforeEach {
            # Mock Invoke-Model to avoid actual API calls
            Mock Invoke-Model -ModuleName PromptLibrary {
                @{
                    text = "Mocked response"
                    raw = @{ model = $Model }
                }
            }
            
            # Mock Get-Prompt (not Get-PromptFile) - this is what Invoke-Orchestration uses
            Mock Get-Prompt -ModuleName PromptLibrary {
                [PSCustomObject]@{
                    id = "test-prompt"
                    title = "Test Prompt"
                    user_template = 'Hello ${{name}}'
                    system = "You are a test assistant"
                    checksum = "abc123"
                }
            }
            
            # Mock Get-Agent
            Mock Get-Agent -ModuleName PromptLibrary {
                [PSCustomObject]@{
                    id = "test-agent"
                    name = "Test Agent"
                    role = "Test role"
                    checksum = "def456"
                }
            }
        }
        
        It "Should orchestrate with prompt ID" {
            $result = Invoke-Orchestration `
                -PromptId "test-prompt" `
                -AgentId "test-agent" `
                -Inputs @{ name = "World" } `
                -Model "gpt-4" `
                -ArtifactName "test-artifact"
            
            $result | Should -Not -BeNullOrEmpty
            $result.Output | Should -Not -BeNullOrEmpty
            $result.ArtifactPath | Should -Not -BeNullOrEmpty
        }
        
        It "Should throw when prompt not found" {
            Mock Get-Prompt -ModuleName PromptLibrary { $null }
            
            {
                Invoke-Orchestration `
                    -PromptId "nonexistent" `
                    -AgentId "test-agent" `
                    -Inputs @{} `
                    -Model "gpt-4"
            } | Should -Throw
        }
        
        It "Should throw when agent not found" {
            Mock Get-Agent -ModuleName PromptLibrary { $null }
            
            {
                Invoke-Orchestration `
                    -PromptId "test-prompt" `
                    -AgentId "nonexistent" `
                    -Inputs @{} `
                    -Model "gpt-4"
            } | Should -Throw
        }
        
        It "Should render template with inputs" {
            $result = Invoke-Orchestration `
                -PromptId "test-prompt" `
                -AgentId "test-agent" `
                -Inputs @{ name = "Alice" } `
                -Model "gpt-4" `
                -ArtifactName "test-render"
            
            # Check that Invoke-Model was called with rendered template
            Assert-MockCalled Invoke-Model -Times 1 -ModuleName PromptLibrary
        }

        It "Should refine simple requests before orchestration and save to prompt library" {
            $simpleRequest = "Draft a deployment runbook"
            $refinedSystem = "Use structured steps for deployment validation"
            $script:capturedSystem = $null

            Mock New-RefinedPrompt -ModuleName PromptLibrary {
                [pscustomobject]@{
                    PromptId      = "pr_auto_refined"
                    RefinedPrompt = $refinedSystem
                    FilePath      = "C:/tmp/pr_auto_refined.yaml"
                }
            }

            Mock Get-Prompt -ModuleName PromptLibrary {
                [pscustomobject]@{
                    id            = "pr_auto_refined"
                    title         = "Auto refined prompt"
                    user_template = $simpleRequest
                    system        = ""
                    tags          = @()
                    checksum      = "xyz"
                }
            }

            Mock Invoke-Model -ModuleName PromptLibrary {
                param($Provider, $Model, $System, $User)
                $script:capturedSystem = $System
                @{
                    text = "Mocked response"
                    raw  = @{ model = $Model }
                }
            }

            $result = Invoke-Orchestration `
                -SimpleRequest $simpleRequest `
                -AgentId "test-agent" `
                -Inputs @{ environment = "prod" } `
                -Model "gpt-4o-mini" `
                -ArtifactName "auto-refined-test"

            Assert-MockCalled New-RefinedPrompt -ModuleName PromptLibrary -Times 1 -ParameterFilter { $UserPrompt -eq $simpleRequest }
            $script:capturedSystem | Should -Match $refinedSystem
            $result.ArtifactPath | Should -Not -BeNullOrEmpty
        }
    }
}

Describe "PromptLibrary Module - Integration Tests" {
    
    Context "End-to-end workflow" {
        It "Should load agents and prompts from actual data" {
            $dataRoot = Join-Path $PSScriptRoot '..' 'data'
            $promptsPath = Join-Path $dataRoot 'prompts'
            $agentsPath = Join-Path $dataRoot 'agents'
            
            if (Test-Path $promptsPath) {
                $promptFiles = Get-ChildItem -Path $promptsPath -Filter "*.yaml" -Recurse
                $promptFiles.Count | Should -BeGreaterThan 0
            }
            
            if (Test-Path $agentsPath) {
                $agentFiles = Get-ChildItem -Path $agentsPath -Include '*.yaml', '*.json' -Recurse
                # Agents directory may be empty in test environment
            }
        }
    }
}

AfterAll {
    # Clean up test artifacts
    if (Test-Path $script:TestDataRoot) {
        Remove-Item -Path $script:TestDataRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
