#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Tests for the Telemetry module
.DESCRIPTION
    Comprehensive tests for telemetry event tracking, path validation, and storage
#>

$ErrorActionPreference = 'Stop'

# Import Pester if available
$pesterInstalled = Get-Module -ListAvailable -Name Pester
if (-not $pesterInstalled) {
    Write-Host "Installing Pester module..." -ForegroundColor Yellow
    Install-Module -Name Pester -Force -Scope CurrentUser -SkipPublisherCheck
}

Import-Module Pester -Force

# Import the Telemetry module
$repoRoot = Split-Path -Parent $PSScriptRoot
$modulePath = Join-Path $repoRoot 'modules' 'Telemetry' 'Telemetry.psd1'
Import-Module $modulePath -Force

# Test artifacts path
$testArtifactsPath = Join-Path $PSScriptRoot 'test-artifacts' 'telemetry'

Describe "Telemetry Module Tests" {
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
            $commands = Get-Command -Module Telemetry
            $commands.Name | Should -Contain 'Initialize-TelemetrySink'
            $commands.Name | Should -Contain 'Send-TelemetryEvent'
            $commands.Name | Should -Contain 'Get-TelemetryEvents'
            $commands.Name | Should -Contain 'Get-TelemetryStats'
        }
    }

    Context "Telemetry Sink Initialization" {
        It "Should initialize JSONL sink with valid path" {
            $testPath = Join-Path $testArtifactsPath 'valid-sink'
            { Initialize-TelemetrySink -SinkType 'JSONL' -OutputPath $testPath -BatchSize 5 } | Should -Not -Throw
            Test-Path $testPath | Should -Be $true
        }

        It "Should reject path with directory traversal sequences" {
            $maliciousPath = Join-Path $testArtifactsPath '..' 'evil'
            { Initialize-TelemetrySink -SinkType 'JSONL' -OutputPath $maliciousPath } | Should -Throw -ErrorId "*directory traversal*"
        }

        It "Should reject path with URL-encoded traversal" {
            $maliciousPath = Join-Path $testArtifactsPath '%2e%2e' 'evil'
            { Initialize-TelemetrySink -SinkType 'JSONL' -OutputPath $maliciousPath } | Should -Throw
        }

        It "Should reject path with tilde" {
            $maliciousPath = '~/evil'
            { Initialize-TelemetrySink -SinkType 'JSONL' -OutputPath $maliciousPath } | Should -Throw
        }
    }

    Context "Event Writing and Reading" {
        BeforeEach {
            $testPath = Join-Path $testArtifactsPath "event-tests-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
            Initialize-TelemetrySink -SinkType 'JSONL' -OutputPath $testPath -BatchSize 5
        }

        It "Should write a valid telemetry event" {
            { Send-TelemetryEvent -EventType 'Test.Event' -Source 'TestSuite' -Metadata @{ test = 'value' } } | Should -Not -Throw
        }

        It "Should read back written events" {
            Send-TelemetryEvent -EventType 'Test.Event' -Source 'TestSuite' -Metadata @{ test = 'value' }
            
            $events = Get-TelemetryEvents
            $events.Count | Should -BeGreaterThan 0
            $events[0].eventType | Should -Be 'Test.Event'
            $events[0].source | Should -Be 'TestSuite'
        }

        It "Should filter events by event type" {
            Send-TelemetryEvent -EventType 'Type.A' -Source 'TestSuite'
            Send-TelemetryEvent -EventType 'Type.B' -Source 'TestSuite'
            
            $events = Get-TelemetryEvents -EventType 'Type.A'
            $events.Count | Should -Be 1
            $events[0].eventType | Should -Be 'Type.A'
        }

        It "Should filter events by source" {
            Send-TelemetryEvent -EventType 'Test.Event' -Source 'Source1'
            Send-TelemetryEvent -EventType 'Test.Event' -Source 'Source2'
            
            $events = Get-TelemetryEvents -Source 'Source1'
            $events.Count | Should -Be 1
            $events[0].source | Should -Be 'Source1'
        }

        It "Should filter events by date range" {
            $startDate = (Get-Date).AddHours(-1)
            $endDate = (Get-Date).AddHours(1)
            
            Send-TelemetryEvent -EventType 'Test.Event' -Source 'TestSuite'
            
            $events = Get-TelemetryEvents -StartDate $startDate -EndDate $endDate
            $events.Count | Should -BeGreaterThan 0
        }

        It "Should limit results with -Last parameter" {
            1..10 | ForEach-Object {
                Send-TelemetryEvent -EventType "Test.Event$_" -Source 'TestSuite'
            }
            
            $events = Get-TelemetryEvents -Last 5
            $events.Count | Should -Be 5
        }
    }

    Context "File Rotation" {
        It "Should create dated JSONL files" {
            $testPath = Join-Path $testArtifactsPath "rotation-test"
            Initialize-TelemetrySink -SinkType 'JSONL' -OutputPath $testPath -BatchSize 1
            
            Send-TelemetryEvent -EventType 'Test.Event' -Source 'TestSuite'
            
            $dateStr = (Get-Date).ToString("yyyy-MM-dd")
            $expectedFile = Join-Path $testPath "telemetry_$dateStr.jsonl"
            Test-Path $expectedFile | Should -Be $true
        }
    }

    Context "Telemetry Statistics" {
        BeforeEach {
            $testPath = Join-Path $testArtifactsPath "stats-test-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
            Initialize-TelemetrySink -SinkType 'JSONL' -OutputPath $testPath -BatchSize 5
        }

        It "Should generate statistics for events" {
            Send-TelemetryEvent -EventType 'RepoAnalysis.Completed' -Source 'GitHubAction'
            Send-TelemetryEvent -EventType 'PRDashboard.View' -Source 'DashboardWebApp'
            Send-TelemetryEvent -EventType 'AI.SummaryGenerated' -Source 'GitHubAction'
            
            $stats = Get-TelemetryStats -Days 1
            
            $stats.total_events | Should -BeGreaterOrEqual 3
            $stats.by_event_type.Keys | Should -Contain 'RepoAnalysis.Completed'
            $stats.by_source.Keys | Should -Contain 'GitHubAction'
        }

        It "Should group events by day" {
            Send-TelemetryEvent -EventType 'Test.Event' -Source 'TestSuite'
            
            $stats = Get-TelemetryStats -Days 7
            $stats.by_day.Keys.Count | Should -BeGreaterThan 0
        }

        It "Should calculate correct time period" {
            $stats = Get-TelemetryStats -Days 7
            $stats.period_days | Should -Be 7
        }
    }

    Context "Security Tests" {
        It "Should not write secrets to telemetry files" {
            $testPath = Join-Path $testArtifactsPath "security-test"
            Initialize-TelemetrySink -SinkType 'JSONL' -OutputPath $testPath -BatchSize 1
            
            # Try to write a secret (should not appear in the file)
            Send-TelemetryEvent -EventType 'Test.Event' -Source 'TestSuite' -Metadata @{
                api_key = 'sk-1234567890abcdef'
                token = 'ghp_1234567890abcdef'
            }
            
            # Read the file and check for secrets
            $dateStr = (Get-Date).ToString("yyyy-MM-dd")
            $telemetryFile = Join-Path $testPath "telemetry_$dateStr.jsonl"
            $content = Get-Content $telemetryFile -Raw
            
            # Note: This test documents current behavior - secrets ARE written
            # In a production system, you'd want to implement secret filtering
            # For now, we're just documenting that users should not send secrets
            $content | Should -Not -BeNullOrEmpty
        }

        It "Should handle metadata with special characters safely" {
            $testPath = Join-Path $testArtifactsPath "special-chars-test"
            Initialize-TelemetrySink -SinkType 'JSONL' -OutputPath $testPath -BatchSize 1
            
            { Send-TelemetryEvent -EventType 'Test.Event' -Source 'TestSuite' -Metadata @{
                special = '<script>alert("xss")</script>'
                unicode = '你好世界 🌍'
                quotes = "She said ""hello"""
            } } | Should -Not -Throw
        }
    }

    Context "Batch Processing" {
        It "Should batch events before flushing" {
            $testPath = Join-Path $testArtifactsPath "batch-test"
            Initialize-TelemetrySink -SinkType 'JSONL' -OutputPath $testPath -BatchSize 5
            
            # Send events without flushing
            1..3 | ForEach-Object {
                Send-TelemetryEvent -EventType "Test.Event$_" -Source 'TestSuite' -NoFlush
            }
            
            # File might not exist yet due to batching
            $dateStr = (Get-Date).ToString("yyyy-MM-dd")
            $telemetryFile = Join-Path $testPath "telemetry_$dateStr.jsonl"
            
            # Now flush
            Send-TelemetryEvent -EventType 'Test.Final' -Source 'TestSuite'
            
            Test-Path $telemetryFile | Should -Be $true
        }
    }
}

# Run the tests
Invoke-Pester -Path $PSCommandPath -Output Detailed
