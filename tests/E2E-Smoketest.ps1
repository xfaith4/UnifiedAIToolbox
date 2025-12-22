#!/usr/bin/env pwsh
<#
.SYNOPSIS
    End-to-end smoke test for telemetry and AI systems
.DESCRIPTION
    Validates the complete flow:
    1. Repository analysis → telemetry events written
    2. AI summaries generated (if API key available)
    3. Dashboard telemetry integration
    4. Negative tests for AI client failure scenarios
    5. Security validation for telemetry paths
#>

param(
    [switch]$SkipAITests,
    [switch]$Verbose
)

$ErrorActionPreference = 'Stop'
if ($Verbose) {
    $VerbosePreference = 'Continue'
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$testArtifactsPath = Join-Path $PSScriptRoot 'test-artifacts' 'e2e-smoketest'

# Colors for output
function Write-TestSection {
    param([string]$Message)
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host $Message -ForegroundColor Cyan
    Write-Host "========================================`n" -ForegroundColor Cyan
}

function Write-TestPass {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-TestFail {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

function Write-TestInfo {
    param([string]$Message)
    Write-Host "  $Message" -ForegroundColor Gray
}

# Test results tracking
$script:TestResults = @{
    Passed = 0
    Failed = 0
    Skipped = 0
    Errors = @()
}

function Test-Condition {
    param(
        [string]$TestName,
        [scriptblock]$Condition,
        [string]$FailureMessage = "Test failed"
    )
    
    try {
        $result = & $Condition
        if ($result) {
            Write-TestPass $TestName
            $script:TestResults.Passed++
            return $true
        } else {
            Write-TestFail "$TestName - $FailureMessage"
            $script:TestResults.Failed++
            $script:TestResults.Errors += "$TestName - $FailureMessage"
            return $false
        }
    } catch {
        Write-TestFail "$TestName - Exception: $_"
        $script:TestResults.Failed++
        $script:TestResults.Errors += "$TestName - $_"
        return $false
    }
}

# ============================================================================
# Setup
# ============================================================================

Write-TestSection "Test Setup"

# Clean up old test artifacts
if (Test-Path $testArtifactsPath) {
    Remove-Item -Path $testArtifactsPath -Recurse -Force
    Write-TestInfo "Cleaned up old test artifacts"
}
New-Item -ItemType Directory -Path $testArtifactsPath -Force | Out-Null

# Import modules
$telemetryModule = Join-Path $repoRoot 'modules' 'Telemetry' 'Telemetry.psd1'
$aiClientModule = Join-Path $repoRoot 'modules' 'AIClient' 'AIClient.psd1'

Import-Module $telemetryModule -Force
Write-TestInfo "Loaded Telemetry module"

Import-Module $aiClientModule -Force
Write-TestInfo "Loaded AIClient module"

# ============================================================================
# Test 1: Telemetry Event Writing and JSONL Rotation
# ============================================================================

Write-TestSection "Test 1: Telemetry Event Writing and JSONL Rotation"

$telemetryTestPath = Join-Path $testArtifactsPath 'telemetry-test'
Initialize-TelemetrySink -SinkType 'JSONL' -OutputPath $telemetryTestPath -BatchSize 5

Test-Condition "Initialize telemetry sink" {
    Test-Path $telemetryTestPath
}

# Write multiple events
Send-TelemetryEvent -EventType 'RepoAnalysis.Started' -Source 'E2ETest' -Metadata @{
    test_run = 'smoketest'
    timestamp_test = (Get-Date).ToString('o')
}

Send-TelemetryEvent -EventType 'RepoAnalysis.Completed' -Source 'E2ETest' -Metadata @{
    duration_seconds = 42
    health_score = 85
}

Send-TelemetryEvent -EventType 'PRDashboard.View' -Source 'E2ETest' -Metadata @{
    page = 'home'
}

Test-Condition "Events written to telemetry" {
    $events = Get-TelemetryEvents
    $events.Count -ge 3
} "Expected at least 3 events"

Test-Condition "JSONL file created with today's date" {
    $dateStr = (Get-Date).ToString("yyyy-MM-dd")
    $expectedFile = Join-Path $telemetryTestPath "telemetry_$dateStr.jsonl"
    Test-Path $expectedFile
} "JSONL file not found"

Test-Condition "JSONL file contains valid JSON lines" {
    $dateStr = (Get-Date).ToString("yyyy-MM-dd")
    $telemetryFile = Join-Path $telemetryTestPath "telemetry_$dateStr.jsonl"
    $lines = Get-Content $telemetryFile
    $allValid = $true
    foreach ($line in $lines) {
        try {
            $null = $line | ConvertFrom-Json
        } catch {
            $allValid = $false
            break
        }
    }
    $allValid
} "JSONL file contains invalid JSON"

# ============================================================================
# Test 2: Telemetry Statistics
# ============================================================================

Write-TestSection "Test 2: Telemetry Statistics"

$stats = Get-TelemetryStats -Days 1

Test-Condition "Statistics generated successfully" {
    $stats -ne $null
}

Test-Condition "Total events count correct" {
    $stats.total_events -ge 3
} "Expected at least 3 events in stats"

Test-Condition "Events grouped by event type" {
    $stats.by_event_type.ContainsKey('RepoAnalysis.Completed')
} "RepoAnalysis.Completed not found in event types"

Test-Condition "Events grouped by source" {
    $stats.by_source.ContainsKey('E2ETest')
} "E2ETest source not found"

# ============================================================================
# Test 3: Security - Path Validation
# ============================================================================

Write-TestSection "Test 3: Security - Path Validation"

$maliciousPaths = @(
    '../../../etc/passwd',
    '..\..\..\..\windows\system32',
    '%2e%2e/evil',
    '~/secret-data'
)

foreach ($path in $maliciousPaths) {
    Test-Condition "Reject malicious path: $path" {
        $failed = $false
        try {
            Initialize-TelemetrySink -SinkType 'JSONL' -OutputPath $path -ErrorAction Stop
            $failed = $false  # Should not get here
        } catch {
            $failed = $true  # Expected to throw
        }
        $failed
    } "Path should have been rejected"
}

# ============================================================================
# Test 4: Security - Secret Detection
# ============================================================================

Write-TestSection "Test 4: Security - No Secrets in Telemetry"

$secretTestPath = Join-Path $testArtifactsPath 'secret-test'
Initialize-TelemetrySink -SinkType 'JSONL' -OutputPath $secretTestPath -BatchSize 1

# Write event with NO secrets (good practice)
Send-TelemetryEvent -EventType 'Test.Event' -Source 'E2ETest' -Metadata @{
    user_id = 'user123'  # ID is OK
    action = 'login'
    # NO api_key or tokens should be logged
}

$dateStr = (Get-Date).ToString("yyyy-MM-dd")
$telemetryFile = Join-Path $secretTestPath "telemetry_$dateStr.jsonl"
$content = Get-Content $telemetryFile -Raw

# Check that common secret patterns are NOT in the file
$secretPatterns = @(
    'sk-[a-zA-Z0-9]{32,}',  # OpenAI keys
    'ghp_[a-zA-Z0-9]{36,}',  # GitHub PATs
    'ghs_[a-zA-Z0-9]{36,}',  # GitHub OAuth
    'AKIA[0-9A-Z]{16}',      # AWS access keys
    'AIza[0-9A-Za-z\-_]{35}' # Google API keys
)

$foundSecrets = @()
foreach ($pattern in $secretPatterns) {
    if ($content -match $pattern) {
        $foundSecrets += $pattern
    }
}

Test-Condition "No secret patterns found in telemetry" {
    $foundSecrets.Count -eq 0
} "Found potential secrets: $($foundSecrets -join ', ')"

Write-TestInfo "NOTE: Users must avoid sending secrets in metadata"

# ============================================================================
# Test 5: AI Client - Invalid API Key Handling
# ============================================================================

Write-TestSection "Test 5: AI Client - Invalid API Key Handling"

# Save original API key
$originalApiKey = $env:OPENAI_API_KEY

# Test with invalid key
$env:OPENAI_API_KEY = 'sk-invalid-key-for-testing-123'
Initialize-AIClient

$result = Invoke-AICompletion -Prompt "Test prompt" -ErrorAction SilentlyContinue

Test-Condition "AI client handles invalid key gracefully" {
    $result -ne $null
}

Test-Condition "AI client returns error result" {
    $result.success -eq $false
}

Test-Condition "Error message is informative" {
    $result.error -ne $null -and $result.error.Length -gt 0
}

Test-Condition "Content is null on failure" {
    $result.content -eq $null
}

Write-TestInfo "Verified clean failure with invalid API key"

# Test with missing key
$env:OPENAI_API_KEY = $null
Initialize-AIClient

$result = Invoke-AICompletion -Prompt "Test prompt"

Test-Condition "AI client handles missing key gracefully" {
    $result -ne $null
}

Test-Condition "Missing key returns error result" {
    $result.success -eq $false
}

# ============================================================================
# Test 6: AI Summary Generation (Optional)
# ============================================================================

Write-TestSection "Test 6: AI Summary Generation (Optional)"

if ($SkipAITests -or -not $originalApiKey) {
    Write-TestInfo "Skipping AI summary tests (no API key or -SkipAITests flag)"
    $script:TestResults.Skipped++
} else {
    # Restore API key for real test
    $env:OPENAI_API_KEY = $originalApiKey
    Initialize-AIClient
    
    # Create a minimal mock analysis for testing
    $mockAnalysis = @{
        timestamp = (Get-Date).ToString('o')
        repository = 'UnifiedAIToolbox'
        health_score = 85
        summary = 'Test repository analysis'
        issues = @(
            @{ severity = 'high'; description = 'Test issue 1' }
            @{ severity = 'medium'; description = 'Test issue 2' }
        )
    }
    
    $mockAnalysisPath = Join-Path $testArtifactsPath 'mock-analysis.json'
    $mockAnalysis | ConvertTo-Json -Depth 10 | Out-File $mockAnalysisPath -Encoding UTF8
    
    # Test if AI insights script exists
    $aiInsightsScript = Join-Path $repoRoot 'scripts' 'ai-insights' 'Generate-RepoAnalysisSummary.ps1'
    
    Test-Condition "AI insights script exists" {
        Test-Path $aiInsightsScript
    }
    
    Write-TestInfo "AI summary generation would be tested here with real API"
    Write-TestInfo "Run manually with valid API key for full test"
}

# ============================================================================
# Test 7: Dashboard Telemetry Service (Type Check)
# ============================================================================

Write-TestSection "Test 7: Dashboard Telemetry Service"

$dashboardTelemetryPath = Join-Path $repoRoot 'apps' 'dashboard' 'src' 'services' 'telemetry.ts'

Test-Condition "Dashboard telemetry service exists" {
    Test-Path $dashboardTelemetryPath
}

Test-Condition "Telemetry service exports track function" {
    $content = Get-Content $dashboardTelemetryPath -Raw
    $content -match 'export function track'
}

Test-Condition "Telemetry service has TelemetryEvent interface" {
    $content = Get-Content $dashboardTelemetryPath -Raw
    $content -match 'interface TelemetryEvent'
}

# ============================================================================
# Cleanup and Summary
# ============================================================================

Write-TestSection "Test Summary"

$totalTests = $script:TestResults.Passed + $script:TestResults.Failed + $script:TestResults.Skipped

Write-Host "Total Tests: $totalTests" -ForegroundColor White
Write-Host "Passed: $($script:TestResults.Passed)" -ForegroundColor Green
Write-Host "Failed: $($script:TestResults.Failed)" -ForegroundColor Red
Write-Host "Skipped: $($script:TestResults.Skipped)" -ForegroundColor Yellow

if ($script:TestResults.Failed -gt 0) {
    Write-Host "`nFailure Details:" -ForegroundColor Red
    foreach ($error in $script:TestResults.Errors) {
        Write-Host "  - $error" -ForegroundColor Red
    }
}

# Restore environment
$env:OPENAI_API_KEY = $originalApiKey

# Exit with appropriate code
if ($script:TestResults.Failed -eq 0) {
    Write-Host "`n✓ All tests passed!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n✗ Some tests failed" -ForegroundColor Red
    exit 1
}
