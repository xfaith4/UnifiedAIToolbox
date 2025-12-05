#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Configure and manage alert rules for the Unified AI Toolbox
.DESCRIPTION
    This script sets up default alert rules for monitoring telemetry events.
    Alert rules monitor for failures, performance issues, and anomalies.
.PARAMETER Action
    Action to perform: Setup, List, Test, Clear
.PARAMETER OutputPath
    Path where alerts will be stored (default: artifacts/alerts)
.EXAMPLE
    ./Configure-Alerts.ps1 -Action Setup
    Sets up default alert rules
.EXAMPLE
    ./Configure-Alerts.ps1 -Action List
    Lists all configured alert rules
.EXAMPLE
    ./Configure-Alerts.ps1 -Action Test
    Tests alert rules with sample events
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [ValidateSet('Setup', 'List', 'Test', 'Clear')]
    [string]$Action = 'Setup',
    
    [Parameter(Mandatory = $false)]
    [string]$OutputPath = "$PSScriptRoot/../../artifacts/alerts"
)

$ErrorActionPreference = 'Stop'

# Determine repository root more reliably
if ($PSScriptRoot) {
    $repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
} else {
    $repoRoot = (Get-Location).Path
}

$alertingModule = Join-Path $repoRoot 'modules' 'Alerting' 'Alerting.psd1'
$telemetryModule = Join-Path $repoRoot 'modules' 'Telemetry' 'Telemetry.psd1'

# Verify modules exist before importing
if (-not (Test-Path $alertingModule)) {
    Write-Error "Alerting module not found at: $alertingModule"
    exit 1
}

if (-not (Test-Path $telemetryModule)) {
    Write-Error "Telemetry module not found at: $telemetryModule"
    exit 1
}

Import-Module $alertingModule -Force
Import-Module $telemetryModule -Force

# ============================================================================
# Default Alert Rules
# ============================================================================

function Get-DefaultAlertRules {
    return @(
        # Critical: AI Summary Generation Failures
        (New-AlertRule `
            -Name "AI-Summary-Failures" `
            -Description "AI summary generation is failing repeatedly" `
            -Condition Threshold `
            -EventType "AIInsight.Summary.Failed" `
            -ThresholdProperty "metadata.consecutive_failures" `
            -ThresholdValue 3 `
            -ThresholdOperator GreaterThanOrEqual `
            -Severity Critical),
        
        # High: Repository Analysis Failures
        (New-AlertRule `
            -Name "Repo-Analysis-Failures" `
            -Description "Repository analysis has failed" `
            -Condition Pattern `
            -EventType "RepoAnalysis.*" `
            -Pattern '"status":\s*"failed"' `
            -Severity High),
        
        # High: High Error Rate
        (New-AlertRule `
            -Name "High-Error-Rate" `
            -Description "Error rate is above threshold" `
            -Condition Threshold `
            -EventType "*" `
            -ThresholdProperty "metadata.error_count" `
            -ThresholdValue 10 `
            -ThresholdOperator GreaterThan `
            -Severity High),
        
        # Medium: Low Health Score
        (New-AlertRule `
            -Name "Low-Health-Score" `
            -Description "Repository health score is below threshold" `
            -Condition Threshold `
            -EventType "RepoAnalysis.Completed" `
            -ThresholdProperty "metadata.health_score" `
            -ThresholdValue 50 `
            -ThresholdOperator LessThan `
            -Severity Medium),
        
        # Medium: Artifact Upload Failures
        (New-AlertRule `
            -Name "Artifact-Upload-Failures" `
            -Description "Artifact upload to GitHub has failed" `
            -Condition Pattern `
            -EventType "Artifact.*" `
            -Pattern '"status":\s*"failed"' `
            -Severity Medium),
        
        # Low: Long Analysis Duration
        (New-AlertRule `
            -Name "Long-Analysis-Duration" `
            -Description "Repository analysis took longer than expected" `
            -Condition Threshold `
            -EventType "RepoAnalysis.Completed" `
            -ThresholdProperty "metadata.duration_seconds" `
            -ThresholdValue 600 `
            -ThresholdOperator GreaterThan `
            -Severity Low),
        
        # Info: New Analysis Completed
        (New-AlertRule `
            -Name "Analysis-Completed" `
            -Description "Repository analysis completed successfully" `
            -Condition Threshold `
            -EventType "RepoAnalysis.Completed" `
            -ThresholdProperty "metadata.health_score" `
            -ThresholdValue 0 `
            -ThresholdOperator GreaterThanOrEqual `
            -Severity Info `
            -Enabled $false)  # Disabled by default to reduce noise
    )
}

# ============================================================================
# Actions
# ============================================================================

function Invoke-Setup {
    Write-Host "`n🔧 Setting up alerting system..." -ForegroundColor Cyan
    
    # Initialize alerting system
    Initialize-AlertingSystem -OutputPath $OutputPath
    
    # Add default rules
    $rules = Get-DefaultAlertRules
    foreach ($rule in $rules) {
        Add-AlertRule -Rule $rule
        $enabledStr = if ($rule.enabled) { "✓" } else { "✗" }
        Write-Host "  $enabledStr [$($rule.severity)] $($rule.name): $($rule.description)" -ForegroundColor Gray
    }
    
    Write-Host "`n✅ Alerting system configured with $($rules.Count) rules" -ForegroundColor Green
    Write-Host "   Output path: $OutputPath" -ForegroundColor Gray
}

function Invoke-List {
    Write-Host "`n📋 Alert Rules:" -ForegroundColor Cyan
    
    $rules = Get-AlertRules
    if ($rules.Count -eq 0) {
        Write-Host "   No alert rules configured. Run with -Action Setup to add default rules." -ForegroundColor Yellow
        return
    }
    
    foreach ($rule in $rules) {
        $enabledStr = if ($rule.enabled) { "✓ Enabled" } else { "✗ Disabled" }
        $color = switch ($rule.severity) {
            'Critical' { 'Red' }
            'High' { 'DarkRed' }
            'Medium' { 'Yellow' }
            'Low' { 'DarkYellow' }
            'Info' { 'Cyan' }
            default { 'White' }
        }
        
        Write-Host "`n  [$($rule.severity)] $($rule.name)" -ForegroundColor $color
        Write-Host "    $($rule.description)" -ForegroundColor Gray
        Write-Host "    Status: $enabledStr" -ForegroundColor Gray
        Write-Host "    Event Type: $($rule.eventType)" -ForegroundColor Gray
        Write-Host "    Condition: $($rule.condition)" -ForegroundColor Gray
        
        if ($rule.condition -eq 'Threshold') {
            Write-Host "    Threshold: $($rule.thresholdProperty) $($rule.thresholdOperator) $($rule.thresholdValue)" -ForegroundColor Gray
        }
        elseif ($rule.condition -eq 'Pattern') {
            Write-Host "    Pattern: $($rule.pattern)" -ForegroundColor Gray
        }
    }
    
    Write-Host "`n📊 Summary: $($rules.Count) total rules ($($rules | Where-Object { $_.enabled } | Measure-Object).Count enabled)" -ForegroundColor Cyan
}

function Invoke-Test {
    Write-Host "`n🧪 Testing alert rules with sample events..." -ForegroundColor Cyan
    
    # Initialize system
    Initialize-AlertingSystem -OutputPath $OutputPath
    
    # Add default rules
    $rules = Get-DefaultAlertRules
    foreach ($rule in $rules) {
        Add-AlertRule -Rule $rule
    }
    
    # Create sample telemetry events
    $sampleEvents = @(
        @{
            timestamp = (Get-Date).ToUniversalTime().ToString("o")
            eventType = "RepoAnalysis.Completed"
            source = "Test"
            metadata = @{
                health_score = 35
                duration_seconds = 120
            }
            schema_version = "1.0"
        },
        @{
            timestamp = (Get-Date).ToUniversalTime().ToString("o")
            eventType = "AIInsight.Summary.Failed"
            source = "Test"
            metadata = @{
                consecutive_failures = 5
                error = "API rate limit exceeded"
            }
            schema_version = "1.0"
        },
        @{
            timestamp = (Get-Date).ToUniversalTime().ToString("o")
            eventType = "RepoAnalysis.Completed"
            source = "Test"
            metadata = @{
                health_score = 85
                duration_seconds = 45
            }
            schema_version = "1.0"
        }
    )
    
    Write-Host "`n  Testing $($sampleEvents.Count) sample events against $($rules.Count) rules..." -ForegroundColor Gray
    
    $alertCount = 0
    foreach ($event in $sampleEvents) {
        Write-Host "`n  Event: $($event.eventType)" -ForegroundColor Cyan
        
        foreach ($rule in $rules) {
            if (Test-AlertCondition -Rule $rule -Event $event) {
                $alertCount++
                Send-Alert -Rule $rule -Event $event -Message "Test alert: $($rule.name)"
            }
        }
    }
    
    Write-Host "`n✅ Test complete: $alertCount alerts triggered" -ForegroundColor Green
    
    # Show recent alerts
    Write-Host "`n📋 Recent alerts:" -ForegroundColor Cyan
    $alerts = Get-Alerts -Last 5
    foreach ($alert in $alerts) {
        Write-Host "  [$($alert.severity)] $($alert.message)" -ForegroundColor Gray
        Write-Host "    Rule: $($alert.ruleName)" -ForegroundColor DarkGray
        Write-Host "    Time: $($alert.timestamp)" -ForegroundColor DarkGray
    }
}

function Invoke-Clear {
    Write-Host "`n🗑️  Clearing old alerts..." -ForegroundColor Cyan
    
    Clear-Alerts -OlderThanDays 30 -Confirm:$false
    
    Write-Host "✅ Alert history cleared" -ForegroundColor Green
}

# ============================================================================
# Main Execution
# ============================================================================

Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Unified AI Toolbox - Alert Configuration" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan

switch ($Action) {
    'Setup' { Invoke-Setup }
    'List' { Invoke-List }
    'Test' { Invoke-Test }
    'Clear' { Invoke-Clear }
}

Write-Host "`n═══════════════════════════════════════════════════════════`n" -ForegroundColor Cyan
