#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Tests for the Alerting module
.DESCRIPTION
    Comprehensive tests for alert rules, conditions, and alert storage
#>

$ErrorActionPreference = 'Stop'

# Import Pester if available
$pesterInstalled = Get-Module -ListAvailable -Name Pester
if (-not $pesterInstalled) {
    Write-Host "Pester module not found. Install it to run tests:" -ForegroundColor Yellow
    Write-Host "  Install-Module -Name Pester -Force -Scope CurrentUser -SkipPublisherCheck" -ForegroundColor Gray
    Write-Error "Pester module is required to run tests"
    exit 1
}

Import-Module Pester -Force

# Import the Alerting module
$repoRoot = Split-Path -Parent $PSScriptRoot
$modulePath = Join-Path $repoRoot 'modules' 'Alerting' 'Alerting.psd1'
Import-Module $modulePath -Force

# Test artifacts path
$testArtifactsPath = Join-Path $PSScriptRoot 'test-artifacts' 'alerting'

Describe "Alerting Module Tests" {
    BeforeAll {
        # Clean up any existing test artifacts
        if (Test-Path $testArtifactsPath) {
            Remove-Item -Path $testArtifactsPath -Recurse -Force
        }
    }

    AfterAll {
        # Clean up test artifacts
        if (Test-Path $testArtifactsPath) {
            Remove-Item -Path $testArtifactsPath -Recurse -Force
        }
    }

    Context "Module Loading" {
        It "Should export expected functions" {
            $commands = Get-Command -Module Alerting
            $commands.Name | Should -Contain 'Initialize-AlertingSystem'
            $commands.Name | Should -Contain 'Add-AlertRule'
            $commands.Name | Should -Contain 'Remove-AlertRule'
            $commands.Name | Should -Contain 'Get-AlertRules'
            $commands.Name | Should -Contain 'Test-AlertCondition'
            $commands.Name | Should -Contain 'Send-Alert'
            $commands.Name | Should -Contain 'Get-Alerts'
            $commands.Name | Should -Contain 'Get-AlertStats'
            $commands.Name | Should -Contain 'Clear-Alerts'
        }
    }

    Context "Alerting System Initialization" {
        It "Should initialize with default path" {
            { Initialize-AlertingSystem } | Should -Not -Throw
        }

        It "Should initialize with custom path" {
            $testPath = Join-Path $testArtifactsPath 'custom-path'
            { Initialize-AlertingSystem -OutputPath $testPath } | Should -Not -Throw
            Test-Path $testPath | Should -Be $true
        }

        It "Should initialize with custom check interval" {
            { Initialize-AlertingSystem -CheckInterval 30 } | Should -Not -Throw
        }
    }

    Context "Alert Rule Management" {
        BeforeEach {
            Initialize-AlertingSystem -OutputPath (Join-Path $testArtifactsPath 'rules-test')
        }

        It "Should create a threshold-based alert rule" {
            $rule = New-AlertRule `
                -Name "TestThreshold" `
                -Description "Test threshold rule" `
                -Condition Threshold `
                -EventType "TestEvent" `
                -ThresholdProperty "metadata.count" `
                -ThresholdValue 10 `
                -ThresholdOperator GreaterThan `
                -Severity High

            $rule | Should -Not -BeNullOrEmpty
            $rule.name | Should -Be "TestThreshold"
            $rule.condition | Should -Be "Threshold"
            $rule.severity | Should -Be "High"
        }

        It "Should create a pattern-based alert rule" {
            $rule = New-AlertRule `
                -Name "TestPattern" `
                -Description "Test pattern rule" `
                -Condition Pattern `
                -EventType "TestEvent" `
                -Pattern '"error":\s*true' `
                -Severity Critical

            $rule | Should -Not -BeNullOrEmpty
            $rule.name | Should -Be "TestPattern"
            $rule.condition | Should -Be "Pattern"
            $rule.pattern | Should -Be '"error":\s*true'
        }

        It "Should add an alert rule" {
            $rule = New-AlertRule `
                -Name "TestAdd" `
                -Description "Test add rule" `
                -Condition Threshold `
                -EventType "TestEvent" `
                -ThresholdProperty "metadata.value" `
                -ThresholdValue 5 `
                -ThresholdOperator Equal `
                -Severity Medium

            { Add-AlertRule -Rule $rule } | Should -Not -Throw
            
            $rules = Get-AlertRules
            $rules | Should -Not -BeNullOrEmpty
            $rules | Where-Object { $_.name -eq "TestAdd" } | Should -Not -BeNullOrEmpty
        }

        It "Should remove an alert rule" {
            $rule = New-AlertRule `
                -Name "TestRemove" `
                -Description "Test remove rule" `
                -Condition Threshold `
                -EventType "TestEvent" `
                -ThresholdProperty "metadata.value" `
                -ThresholdValue 1 `
                -ThresholdOperator GreaterThan `
                -Severity Low

            Add-AlertRule -Rule $rule
            { Remove-AlertRule -Name "TestRemove" } | Should -Not -Throw
            
            $rules = Get-AlertRules
            $rules | Where-Object { $_.name -eq "TestRemove" } | Should -BeNullOrEmpty
        }

        It "Should get all alert rules" {
            $rule1 = New-AlertRule -Name "Test1" -Description "Test 1" -Condition Threshold -EventType "Test" -ThresholdProperty "metadata.val" -ThresholdValue 1 -Severity Info
            $rule2 = New-AlertRule -Name "Test2" -Description "Test 2" -Condition Threshold -EventType "Test" -ThresholdProperty "metadata.val" -ThresholdValue 2 -Severity Info

            Add-AlertRule -Rule $rule1
            Add-AlertRule -Rule $rule2

            $rules = Get-AlertRules
            $rules.Count | Should -BeGreaterOrEqual 2
        }

        It "Should get a specific alert rule by name" {
            $rule = New-AlertRule -Name "TestSpecific" -Description "Test specific" -Condition Threshold -EventType "Test" -ThresholdProperty "metadata.val" -ThresholdValue 1 -Severity Info
            Add-AlertRule -Rule $rule

            $retrieved = Get-AlertRules -Name "TestSpecific"
            $retrieved | Should -Not -BeNullOrEmpty
            $retrieved.name | Should -Be "TestSpecific"
        }
    }

    Context "Alert Condition Testing" {
        BeforeEach {
            Initialize-AlertingSystem -OutputPath (Join-Path $testArtifactsPath 'conditions-test')
        }

        It "Should evaluate threshold condition - GreaterThan" {
            $rule = New-AlertRule `
                -Name "ThresholdTest" `
                -Description "Test" `
                -Condition Threshold `
                -EventType "TestEvent" `
                -ThresholdProperty "metadata.count" `
                -ThresholdValue 10 `
                -ThresholdOperator GreaterThan `
                -Severity Medium

            $event = @{
                eventType = "TestEvent"
                metadata = @{ count = 15 }
            }

            Test-AlertCondition -Rule $rule -Event $event | Should -Be $true
        }

        It "Should evaluate threshold condition - LessThan" {
            $rule = New-AlertRule `
                -Name "ThresholdTest" `
                -Description "Test" `
                -Condition Threshold `
                -EventType "TestEvent" `
                -ThresholdProperty "metadata.score" `
                -ThresholdValue 50 `
                -ThresholdOperator LessThan `
                -Severity High

            $event = @{
                eventType = "TestEvent"
                metadata = @{ score = 30 }
            }

            Test-AlertCondition -Rule $rule -Event $event | Should -Be $true
        }

        It "Should evaluate threshold condition - Equal" {
            $rule = New-AlertRule `
                -Name "ThresholdTest" `
                -Description "Test" `
                -Condition Threshold `
                -EventType "TestEvent" `
                -ThresholdProperty "metadata.status" `
                -ThresholdValue "failed" `
                -ThresholdOperator Equal `
                -Severity Critical

            $event = @{
                eventType = "TestEvent"
                metadata = @{ status = "failed" }
            }

            Test-AlertCondition -Rule $rule -Event $event | Should -Be $true
        }

        It "Should not trigger when threshold not met" {
            $rule = New-AlertRule `
                -Name "ThresholdTest" `
                -Description "Test" `
                -Condition Threshold `
                -EventType "TestEvent" `
                -ThresholdProperty "metadata.count" `
                -ThresholdValue 10 `
                -ThresholdOperator GreaterThan `
                -Severity Medium

            $event = @{
                eventType = "TestEvent"
                metadata = @{ count = 5 }
            }

            Test-AlertCondition -Rule $rule -Event $event | Should -Be $false
        }

        It "Should evaluate pattern condition" {
            $rule = New-AlertRule `
                -Name "PatternTest" `
                -Description "Test" `
                -Condition Pattern `
                -EventType "TestEvent" `
                -Pattern '"error":\s*true' `
                -Severity High

            $event = @{
                eventType = "TestEvent"
                metadata = @{ error = $true }
            }

            Test-AlertCondition -Rule $rule -Event $event | Should -Be $true
        }

        It "Should not trigger when pattern doesn't match" {
            $rule = New-AlertRule `
                -Name "PatternTest" `
                -Description "Test" `
                -Condition Pattern `
                -EventType "TestEvent" `
                -Pattern '"error":\s*true' `
                -Severity High

            $event = @{
                eventType = "TestEvent"
                metadata = @{ error = $false }
            }

            Test-AlertCondition -Rule $rule -Event $event | Should -Be $false
        }

        It "Should match wildcard event types" {
            $rule = New-AlertRule `
                -Name "WildcardTest" `
                -Description "Test" `
                -Condition Threshold `
                -EventType "RepoAnalysis.*" `
                -ThresholdProperty "metadata.count" `
                -ThresholdValue 0 `
                -ThresholdOperator GreaterThanOrEqual `
                -Severity Info

            $event1 = @{
                eventType = "RepoAnalysis.Started"
                metadata = @{ count = 1 }
            }

            $event2 = @{
                eventType = "RepoAnalysis.Completed"
                metadata = @{ count = 1 }
            }

            Test-AlertCondition -Rule $rule -Event $event1 | Should -Be $true
            Test-AlertCondition -Rule $rule -Event $event2 | Should -Be $true
        }

        It "Should not match when event type doesn't match pattern" {
            $rule = New-AlertRule `
                -Name "EventTypeTest" `
                -Description "Test" `
                -Condition Threshold `
                -EventType "RepoAnalysis.Completed" `
                -ThresholdProperty "metadata.count" `
                -ThresholdValue 0 `
                -ThresholdOperator GreaterThanOrEqual `
                -Severity Info

            $event = @{
                eventType = "DifferentEvent"
                metadata = @{ count = 1 }
            }

            Test-AlertCondition -Rule $rule -Event $event | Should -Be $false
        }

        It "Should not trigger when rule is disabled" {
            $rule = New-AlertRule `
                -Name "DisabledTest" `
                -Description "Test" `
                -Condition Threshold `
                -EventType "TestEvent" `
                -ThresholdProperty "metadata.count" `
                -ThresholdValue 5 `
                -ThresholdOperator GreaterThan `
                -Severity Medium `
                -Enabled $false

            $event = @{
                eventType = "TestEvent"
                metadata = @{ count = 10 }
            }

            Test-AlertCondition -Rule $rule -Event $event | Should -Be $false
        }
    }

    Context "Alert Sending and Storage" {
        BeforeEach {
            $testPath = Join-Path $testArtifactsPath "storage-test-$(Get-Date -Format 'yyyyMMddHHmmss')"
            Initialize-AlertingSystem -OutputPath $testPath
        }

        It "Should send an alert" {
            $rule = New-AlertRule `
                -Name "SendTest" `
                -Description "Test send" `
                -Condition Threshold `
                -EventType "TestEvent" `
                -ThresholdProperty "metadata.value" `
                -ThresholdValue 10 `
                -Severity High

            $event = @{
                timestamp = (Get-Date).ToUniversalTime().ToString("o")
                eventType = "TestEvent"
                source = "Test"
                metadata = @{ value = 15 }
            }

            { Send-Alert -Rule $rule -Event $event -Message "Test alert message" } | Should -Not -Throw
        }

        It "Should retrieve sent alerts" {
            $rule = New-AlertRule `
                -Name "RetrieveTest" `
                -Description "Test retrieve" `
                -Condition Threshold `
                -EventType "TestEvent" `
                -ThresholdProperty "metadata.value" `
                -ThresholdValue 5 `
                -Severity Medium

            $event = @{
                timestamp = (Get-Date).ToUniversalTime().ToString("o")
                eventType = "TestEvent"
                source = "Test"
                metadata = @{ value = 10 }
            }

            Send-Alert -Rule $rule -Event $event

            Start-Sleep -Milliseconds 100  # Brief pause for file write

            $alerts = Get-Alerts -Last 10
            $alerts | Should -Not -BeNullOrEmpty
            $alerts | Where-Object { $_.ruleName -eq "RetrieveTest" } | Should -Not -BeNullOrEmpty
        }

        It "Should filter alerts by severity" {
            $rule1 = New-AlertRule -Name "Critical1" -Description "Test" -Condition Threshold -EventType "Test" -ThresholdProperty "metadata.val" -ThresholdValue 1 -Severity Critical
            $rule2 = New-AlertRule -Name "Low1" -Description "Test" -Condition Threshold -EventType "Test" -ThresholdProperty "metadata.val" -ThresholdValue 1 -Severity Low

            $event = @{
                timestamp = (Get-Date).ToUniversalTime().ToString("o")
                eventType = "Test"
                source = "Test"
                metadata = @{ val = 1 }
            }

            Send-Alert -Rule $rule1 -Event $event
            Send-Alert -Rule $rule2 -Event $event

            Start-Sleep -Milliseconds 100

            $criticalAlerts = Get-Alerts -Severity Critical
            $criticalAlerts | Where-Object { $_.severity -eq "Critical" } | Should -Not -BeNullOrEmpty
        }
    }

    Context "Alert Statistics" {
        BeforeEach {
            $testPath = Join-Path $testArtifactsPath "stats-test-$(Get-Date -Format 'yyyyMMddHHmmss')"
            Initialize-AlertingSystem -OutputPath $testPath
        }

        It "Should calculate alert statistics" {
            $rule1 = New-AlertRule -Name "Stat1" -Description "Test" -Condition Threshold -EventType "Test" -ThresholdProperty "metadata.val" -ThresholdValue 1 -Severity Critical
            $rule2 = New-AlertRule -Name "Stat2" -Description "Test" -Condition Threshold -EventType "Test" -ThresholdProperty "metadata.val" -ThresholdValue 1 -Severity High
            $rule3 = New-AlertRule -Name "Stat3" -Description "Test" -Condition Threshold -EventType "Test" -ThresholdProperty "metadata.val" -ThresholdValue 1 -Severity Medium

            $event = @{
                timestamp = (Get-Date).ToUniversalTime().ToString("o")
                eventType = "Test"
                source = "Test"
                metadata = @{ val = 1 }
            }

            Send-Alert -Rule $rule1 -Event $event
            Send-Alert -Rule $rule2 -Event $event
            Send-Alert -Rule $rule3 -Event $event

            Start-Sleep -Milliseconds 100

            $stats = Get-AlertStats -Days 1
            $stats.total | Should -BeGreaterOrEqual 3
            $stats.bySeverity | Should -Not -BeNullOrEmpty
        }
    }
}

# Run tests
Write-Host "`nRunning Alerting Module Tests..." -ForegroundColor Cyan
Invoke-Pester -Path $PSCommandPath -Output Detailed
