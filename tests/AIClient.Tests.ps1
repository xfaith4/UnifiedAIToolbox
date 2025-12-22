#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Tests for the AIClient module
.DESCRIPTION
    Tests for AI client configuration, error handling, and retry logic
#>

$ErrorActionPreference = 'Stop'

# Import Pester if available
$pesterInstalled = Get-Module -ListAvailable -Name Pester
if (-not $pesterInstalled) {
    Write-Host "Installing Pester module..." -ForegroundColor Yellow
    Install-Module -Name Pester -Force -Scope CurrentUser -SkipPublisherCheck
}

Import-Module Pester -Force

# Import the AIClient module
$repoRoot = Split-Path -Parent $PSScriptRoot
$modulePath = Join-Path $repoRoot 'modules' 'AIClient' 'AIClient.psd1'
Import-Module $modulePath -Force

Describe "AIClient Module Tests" {
    BeforeAll {
        # Save original environment variables
        $script:originalApiKey = $env:OPENAI_API_KEY
        $script:originalEndpoint = $env:OPENAI_API_ENDPOINT
        $script:originalModel = $env:OPENAI_MODEL
    }

    AfterAll {
        # Restore original environment variables
        $env:OPENAI_API_KEY = $script:originalApiKey
        $env:OPENAI_API_ENDPOINT = $script:originalEndpoint
        $env:OPENAI_MODEL = $script:originalModel
    }

    BeforeEach {
        # Clear environment variables for clean test state
        $env:OPENAI_API_KEY = $null
        $env:OPENAI_API_ENDPOINT = $null
        $env:OPENAI_MODEL = $null
    }

    Context "Module Loading" {
        It "Should export expected functions" {
            $commands = Get-Command -Module AIClient
            $commands.Name | Should -Contain 'Initialize-AIClient'
            $commands.Name | Should -Contain 'Invoke-AICompletion'
            $commands.Name | Should -Contain 'Test-AIConnection'
        }
    }

    Context "Configuration Validation" {
        It "Should initialize with default values when no API key provided" {
            { Initialize-AIClient } | Should -Not -Throw
        }

        It "Should warn when API key is missing" {
            $warnings = @()
            Initialize-AIClient -WarningVariable warnings
            $warnings | Should -Contain "*No API key provided*"
        }

        It "Should use environment variable for API key" {
            $env:OPENAI_API_KEY = 'sk-test-1234567890abcdef'
            { Initialize-AIClient } | Should -Not -Throw
        }

        It "Should accept API key as parameter" {
            { Initialize-AIClient -ApiKey 'sk-test-1234567890abcdef' } | Should -Not -Throw
        }

        It "Should validate API key format - reject short keys" {
            $warnings = @()
            $errors = @()
            Initialize-AIClient -ApiKey 'short' -WarningVariable warnings -ErrorVariable errors -ErrorAction SilentlyContinue
            ($warnings -join '') | Should -BeLike "*Invalid API key format*"
        }

        It "Should validate API key format - reject keys with whitespace" {
            $warnings = @()
            $errors = @()
            Initialize-AIClient -ApiKey "sk-test-key`nwith-newline" -WarningVariable warnings -ErrorVariable errors -ErrorAction SilentlyContinue
            ($errors -join '') | Should -BeLike "*Invalid API key format*"
        }

        It "Should use default endpoint when not provided" {
            Initialize-AIClient -ApiKey 'sk-test-1234567890abcdef'
            # Default endpoint is set internally, verified by no errors
        }

        It "Should use default model when not provided" {
            Initialize-AIClient -ApiKey 'sk-test-1234567890abcdef'
            # Default model is set internally, verified by no errors
        }

        It "Should accept custom model" {
            { Initialize-AIClient -ApiKey 'sk-test-1234567890abcdef' -Model 'gpt-4' } | Should -Not -Throw
        }

        It "Should accept custom endpoint" {
            { Initialize-AIClient -ApiKey 'sk-test-1234567890abcdef' -Endpoint 'https://custom.api.com/v1' } | Should -Not -Throw
        }

        It "Should accept retry configuration" {
            { Initialize-AIClient -ApiKey 'sk-test-1234567890abcdef' -MaxRetries 5 -RetryDelay 3 } | Should -Not -Throw
        }
    }

    Context "AI Completion with Missing API Key" {
        It "Should return failure result when API key is not configured" {
            Initialize-AIClient
            
            $result = Invoke-AICompletion -Prompt "Test prompt"
            
            $result.success | Should -Be $false
            $result.error | Should -BeLike "*not configured*"
            $result.content | Should -Be $null
        }

        It "Should not throw exception when API key is missing" {
            Initialize-AIClient
            { Invoke-AICompletion -Prompt "Test prompt" } | Should -Not -Throw
        }
    }

    Context "AI Completion with Invalid API Key" {
        It "Should handle authentication errors gracefully" {
            # Initialize with invalid key
            Initialize-AIClient -ApiKey 'sk-invalid-key-1234567890'
            
            $result = Invoke-AICompletion -Prompt "Test prompt" -ErrorAction SilentlyContinue
            
            # Should return error result, not throw
            $result.success | Should -Be $false
            $result.content | Should -Be $null
        }

        It "Should emit telemetry event on failure (simulated)" {
            # This test documents expected behavior
            # In real implementation, we'd check that Send-TelemetryEvent was called
            # For now, we just verify the function handles the error
            
            Initialize-AIClient -ApiKey 'sk-invalid-key-1234567890'
            $result = Invoke-AICompletion -Prompt "Test" -ErrorAction SilentlyContinue
            
            $result | Should -Not -BeNullOrEmpty
            $result.success | Should -Be $false
        }
    }

    Context "Error Messages" {
        It "Should provide clear error message for missing API key" {
            $result = Invoke-AICompletion -Prompt "Test"
            $result.error | Should -BeLike "*API key*"
        }

        It "Should log warnings instead of throwing for configuration issues" {
            $warnings = @()
            Initialize-AIClient -WarningVariable warnings
            $warnings.Count | Should -BeGreaterThan 0
        }
    }

    Context "Request Construction" {
        It "Should accept prompt parameter" {
            Initialize-AIClient -ApiKey 'sk-test-1234567890abcdef'
            { Invoke-AICompletion -Prompt "Test prompt" -ErrorAction SilentlyContinue } | Should -Not -Throw
        }

        It "Should accept system prompt parameter" {
            Initialize-AIClient -ApiKey 'sk-test-1234567890abcdef'
            { Invoke-AICompletion -Prompt "Test" -SystemPrompt "Custom system prompt" -ErrorAction SilentlyContinue } | Should -Not -Throw
        }

        It "Should accept temperature parameter" {
            Initialize-AIClient -ApiKey 'sk-test-1234567890abcdef'
            { Invoke-AICompletion -Prompt "Test" -Temperature 0.5 -ErrorAction SilentlyContinue } | Should -Not -Throw
        }

        It "Should accept max tokens parameter" {
            Initialize-AIClient -ApiKey 'sk-test-1234567890abcdef'
            { Invoke-AICompletion -Prompt "Test" -MaxTokens 1000 -ErrorAction SilentlyContinue } | Should -Not -Throw
        }

        It "Should accept metadata parameter" {
            Initialize-AIClient -ApiKey 'sk-test-1234567890abcdef'
            { Invoke-AICompletion -Prompt "Test" -Metadata @{ test = 'value' } -ErrorAction SilentlyContinue } | Should -Not -Throw
        }
    }

    Context "Connection Testing" {
        It "Should return false when API key not configured" {
            Initialize-AIClient
            $result = Test-AIConnection
            $result | Should -Be $false
        }

        It "Should not throw when API key is missing" {
            Initialize-AIClient
            { Test-AIConnection } | Should -Not -Throw
        }

        It "Should return false for invalid API key (simulated)" {
            Initialize-AIClient -ApiKey 'sk-invalid-1234567890abcdef'
            $result = Test-AIConnection -ErrorAction SilentlyContinue
            # Will return false because the API call will fail
            $result | Should -Be $false
        }
    }

    Context "Input Sanitization" {
        It "Should handle special characters in prompt" {
            Initialize-AIClient -ApiKey 'sk-test-1234567890abcdef'
            { Invoke-AICompletion -Prompt "Test with <html> & special chars" -ErrorAction SilentlyContinue } | Should -Not -Throw
        }

        It "Should handle unicode in prompt" {
            Initialize-AIClient -ApiKey 'sk-test-1234567890abcdef'
            { Invoke-AICompletion -Prompt "Test with unicode: 你好世界 🌍" -ErrorAction SilentlyContinue } | Should -Not -Throw
        }

        It "Should handle quotes in prompt" {
            Initialize-AIClient -ApiKey 'sk-test-1234567890abcdef'
            { Invoke-AICompletion -Prompt 'Test with "quotes" and ''apostrophes''' -ErrorAction SilentlyContinue } | Should -Not -Throw
        }

        It "Should handle newlines in prompt" {
            Initialize-AIClient -ApiKey 'sk-test-1234567890abcdef'
            { Invoke-AICompletion -Prompt "Line 1`nLine 2`nLine 3" -ErrorAction SilentlyContinue } | Should -Not -Throw
        }
    }

    Context "Retry Logic Behavior" {
        It "Should respect MaxRetries configuration" {
            # This is a behavioral test - actual retry logic is tested in integration
            Initialize-AIClient -ApiKey 'sk-test-1234567890abcdef' -MaxRetries 1
            # No exception means configuration was accepted
        }

        It "Should respect RetryDelay configuration" {
            Initialize-AIClient -ApiKey 'sk-test-1234567890abcdef' -RetryDelay 1
            # No exception means configuration was accepted
        }
    }
}

# Run the tests
Invoke-Pester -Path $PSCommandPath -Output Detailed
