# Alerting System Guide

> **Monitor telemetry events and trigger alerts based on configurable rules**

The Unified AI Toolbox Alerting System provides real-time monitoring and alerting capabilities on top of the telemetry infrastructure. Define custom alert rules to detect failures, performance issues, and anomalies in your repository operations.

## Overview

The alerting system builds on the telemetry module to provide:

- **Rule-based Alerting**: Define threshold, pattern, and custom alert conditions
- **Severity Levels**: Categorize alerts from Info to Critical
- **Alert Storage**: JSONL-based storage for easy querying and analysis
- **Multiple Condition Types**: Threshold-based, regex patterns, and custom scripts
- **Real-time Monitoring**: Evaluate events as they occur

## Architecture

```
Telemetry Events → Alert Rules → Alert Evaluation → Alert Storage → Notifications
                                      ↓
                            (Threshold, Pattern, Custom)
```

### Components

1. **Alerting Module** (`modules/Alerting/`)
   - Rule management
   - Condition evaluation
   - Alert storage and retrieval

2. **Alert Configuration** (`scripts/alerting/Configure-Alerts.ps1`)
   - Default rule setup
   - Rule testing
   - Alert viewing

3. **Unified CLI** (`tools/utb.ps1`)
   - User-friendly interface
   - Command-line access

## Alert Rule Types

### 1. Threshold-Based Alerts

Monitor numeric values and trigger when thresholds are crossed.

**Example: High Error Rate**

```powershell
New-AlertRule `
    -Name "High-Error-Rate" `
    -Description "Error rate is above threshold" `
    -Condition Threshold `
    -EventType "*" `
    -ThresholdProperty "metadata.error_count" `
    -ThresholdValue 10 `
    -ThresholdOperator GreaterThan `
    -Severity High
```

**Supported Operators:**

- `GreaterThan`
- `LessThan`
- `Equal`
- `NotEqual`
- `GreaterThanOrEqual`
- `LessThanOrEqual`

### 2. Pattern-Based Alerts

Use regex patterns to match against event data.

**Example: Analysis Failures**

```powershell
New-AlertRule `
    -Name "Repo-Analysis-Failures" `
    -Description "Repository analysis has failed" `
    -Condition Pattern `
    -EventType "RepoAnalysis.*" `
    -Pattern '"status":\s*"failed"' `
    -Severity High
```

### 3. Custom Script Alerts

Use PowerShell script blocks for complex logic.

**Example: Custom Business Logic**

```powershell
New-AlertRule `
    -Name "Custom-Check" `
    -Description "Custom business logic check" `
    -Condition Custom `
    -EventType "CustomEvent" `
    -ScriptBlock {
        param($Event)
        $metadata = $Event.metadata
        return ($metadata.value1 -gt 100) -and ($metadata.value2 -eq 'failed')
    } `
    -Severity Medium
```

## Default Alert Rules

The system comes with 7 pre-configured alert rules:

### Critical Severity

- **AI-Summary-Failures**: AI summary generation failing 3+ times consecutively

### High Severity

- **Repo-Analysis-Failures**: Repository analysis failures
- **High-Error-Rate**: Error count exceeds 10

### Medium Severity

- **Low-Health-Score**: Repository health score below 50
- **Artifact-Upload-Failures**: GitHub artifact uploads failing

### Low Severity

- **Long-Analysis-Duration**: Repository analysis taking >600 seconds

### Info Severity

- **Analysis-Completed**: Analysis completed successfully (disabled by default)

## Getting Started

### 1. Configure Default Alerts

```powershell
# Set up default alert rules
pwsh tools/utb.ps1 alerts setup
```

This initializes the alerting system and adds default rules covering common scenarios.

### 2. View Alert Rules

```powershell
# List all configured alert rules
pwsh tools/utb.ps1 alerts list
```

### 3. Test Alert Rules

```powershell
# Test rules with sample events
pwsh tools/utb.ps1 alerts test
```

This sends test telemetry events and shows which alerts would trigger.

### 4. Monitor Alerts

```powershell
# View recent alerts
pwsh tools/utb.ps1 alerts view

# View last 50 alerts
pwsh tools/utb.ps1 alerts view --last 50

# View only critical alerts
pwsh tools/utb.ps1 alerts view --severity Critical
```

## Working with Alert Rules

### Adding Custom Rules

```powershell
# Import the alerting module
Import-Module ./modules/Alerting/Alerting.psd1 -Force

# Initialize the system
Initialize-AlertingSystem -OutputPath "./artifacts/alerts"

# Create a custom rule
$rule = New-AlertRule `
    -Name "My-Custom-Alert" `
    -Description "Detect my custom condition" `
    -Condition Threshold `
    -EventType "MyApp.Event" `
    -ThresholdProperty "metadata.response_time" `
    -ThresholdValue 5000 `
    -ThresholdOperator GreaterThan `
    -Severity High `
    -Enabled $true

# Add the rule
Add-AlertRule -Rule $rule
```

### Modifying Existing Rules

```powershell
# Remove the old rule
Remove-AlertRule -Name "My-Custom-Alert"

# Add the modified version
$updatedRule = New-AlertRule `
    -Name "My-Custom-Alert" `
    -Description "Updated description" `
    -Condition Threshold `
    -EventType "MyApp.Event" `
    -ThresholdProperty "metadata.response_time" `
    -ThresholdValue 3000 `
    -ThresholdOperator GreaterThan `
    -Severity Critical `
    -Enabled $true

Add-AlertRule -Rule $updatedRule
```

### Disabling/Enabling Rules

```powershell
# Create a disabled rule
$rule = New-AlertRule `
    -Name "Temporary-Rule" `
    -Description "Only needed sometimes" `
    -Condition Threshold `
    -EventType "Test" `
    -ThresholdProperty "metadata.value" `
    -ThresholdValue 1 `
    -Severity Info `
    -Enabled $false  # Disabled by default
```

## Alert Storage and Retrieval

### Storage Format

Alerts are stored in JSONL (JSON Lines) format:

```jsonl
{"id":"abc123","timestamp":"2024-12-05T12:00:00Z","ruleName":"High-Error-Rate","severity":"High","message":"Alert triggered","eventType":"Error","eventTimestamp":"2024-12-05T11:59:00Z","eventSource":"CLI","eventMetadata":{"error_count":15},"schema_version":"1.0"}
```

### File Organization

```
artifacts/alerts/
├── alerts_2024-12-05.jsonl
├── alerts_2024-12-04.jsonl
└── alerts_2024-12-03.jsonl
```

Daily rotation keeps files manageable and organized.

### Querying Alerts

```powershell
# Get all alerts from last 7 days
$alerts = Get-Alerts -Days 7

# Get last 100 alerts
$alerts = Get-Alerts -Last 100

# Get alerts by severity
$criticalAlerts = Get-Alerts -Severity Critical -Days 30

# Get alerts for specific rule
$ruleAlerts = Get-Alerts -RuleName "High-Error-Rate" -Days 7
```

### Alert Statistics

```powershell
$stats = Get-AlertStats -Days 7

Write-Host "Total Alerts: $($stats.total)"
Write-Host "By Severity:"
foreach ($severity in $stats.bySeverity.GetEnumerator()) {
    Write-Host "  $($severity.Key): $($severity.Value)"
}

Write-Host "By Rule:"
foreach ($rule in $stats.byRule.GetEnumerator()) {
    Write-Host "  $($rule.Key): $($rule.Value)"
}
```

## Integration with Telemetry

### Event-Driven Alerting

```powershell
# Import modules
Import-Module ./modules/Telemetry/Telemetry.psd1 -Force
Import-Module ./modules/Alerting/Alerting.psd1 -Force

# Initialize systems
Initialize-TelemetrySink -SinkType JSONL
Initialize-AlertingSystem

# Add alert rule
$rule = New-AlertRule `
    -Name "Error-Detector" `
    -Description "Detect error events" `
    -Condition Threshold `
    -EventType "App.Error" `
    -ThresholdProperty "metadata.severity" `
    -ThresholdValue 5 `
    -ThresholdOperator GreaterThanOrEqual `
    -Severity High

Add-AlertRule -Rule $rule

# Send telemetry event
$event = @{
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    eventType = "App.Error"
    source = "MyApp"
    metadata = @{
        severity = 8
        message = "Database connection failed"
    }
}

# Check if alert should trigger
if (Test-AlertCondition -Rule $rule -Event $event) {
    Send-Alert -Rule $rule -Event $event
}
```

### Batch Processing

```powershell
# Process recent telemetry events
$events = Get-TelemetryEvents -Last 100
$rules = Get-AlertRules

foreach ($event in $events) {
    foreach ($rule in $rules) {
        if (Test-AlertCondition -Rule $rule -Event $event) {
            Send-Alert -Rule $rule -Event $event
        }
    }
}
```

## Alert Lifecycle Management

### Clearing Old Alerts

```powershell
# Clear alerts older than 30 days
Clear-Alerts -OlderThanDays 30

# Clear with confirmation
Clear-Alerts -OlderThanDays 60 -Confirm
```

### Archiving Alerts

```powershell
# Manual archival process
$archiveDate = (Get-Date).AddDays(-90)
$alertFiles = Get-ChildItem -Path "artifacts/alerts" -Filter "*.jsonl" |
    Where-Object { $_.LastWriteTime -lt $archiveDate }

# Move to archive
$archiveDir = "artifacts/alerts/archive"
New-Item -ItemType Directory -Force -Path $archiveDir
foreach ($file in $alertFiles) {
    Move-Item -Path $file.FullName -Destination $archiveDir
}
```

## Best Practices

### 1. Start with Default Rules

```powershell
# Use defaults as a starting point
pwsh tools/utb.ps1 alerts setup

# Customize based on your needs
pwsh tools/utb.ps1 alerts list
```

### 2. Use Appropriate Severity Levels

- **Critical**: Immediate action required (system failures)
- **High**: Urgent attention needed (feature failures)
- **Medium**: Should be addressed soon (degraded performance)
- **Low**: Minor issues (slow operations)
- **Info**: Informational only (successful operations)

### 3. Avoid Alert Fatigue

```powershell
# Disable noisy info-level alerts
$rule = New-AlertRule `
    -Name "Success-Notification" `
    -Description "Operation completed" `
    -Condition Threshold `
    -EventType "Operation.Complete" `
    -ThresholdProperty "metadata.status" `
    -ThresholdValue "success" `
    -ThresholdOperator Equal `
    -Severity Info `
    -Enabled $false  # Disabled to reduce noise
```

### 4. Regular Review

```powershell
# Weekly alert review
$stats = Get-AlertStats -Days 7

if ($stats.bySeverity['Critical'] -gt 0) {
    Write-Warning "Critical alerts this week: $($stats.bySeverity['Critical'])"
}

# Review most triggered rules
$stats.byRule.GetEnumerator() |
    Sort-Object Value -Descending |
    Select-Object -First 5
```

### 5. Document Custom Rules

```powershell
# Add detailed descriptions
$rule = New-AlertRule `
    -Name "Custom-Business-Logic" `
    -Description "Monitors compliance with business rule XYZ. Triggers when condition ABC is met. Owner: Team@company.com" `
    -Condition Custom `
    -EventType "Business.Event" `
    -ScriptBlock { /* ... */ } `
    -Severity Medium
```

## Advanced Scenarios

### Multi-Condition Alerts

```powershell
# Use custom script for AND/OR conditions
$rule = New-AlertRule `
    -Name "Complex-Alert" `
    -Description "Multiple conditions must be met" `
    -Condition Custom `
    -EventType "App.*" `
    -ScriptBlock {
        param($Event)
        $m = $Event.metadata
        return ($m.error_rate -gt 0.1) -and
               ($m.response_time -gt 1000) -and
               ($m.active_users -gt 100)
    } `
    -Severity Critical
```

### Time-Based Alerts

```powershell
# Alert only during business hours
$rule = New-AlertRule `
    -Name "Business-Hours-Alert" `
    -Description "Monitor during business hours only" `
    -Condition Custom `
    -EventType "App.Error" `
    -ScriptBlock {
        param($Event)
        $hour = (Get-Date).Hour
        $isBusinessHours = ($hour -ge 9) -and ($hour -le 17)
        return $isBusinessHours -and ($Event.metadata.severity -gt 5)
    } `
    -Severity High
```

### Aggregated Alerts

```powershell
# Alert on rate of events
$recentEvents = Get-TelemetryEvents -Last 100
$errorCount = ($recentEvents | Where-Object { $_.eventType -match "Error" }).Count

if ($errorCount -gt 10) {
    # Manually create and send alert
    $event = @{
        timestamp = (Get-Date).ToUniversalTime().ToString("o")
        eventType = "System.HighErrorRate"
        source = "Monitoring"
        metadata = @{ error_count = $errorCount }
    }

    # Trigger alert handling
    Write-Warning "High error rate detected: $errorCount errors in last 100 events"
}
```

## Troubleshooting

### Alerts Not Triggering

```powershell
# 1. Check if rule is enabled
$rule = Get-AlertRules -Name "My-Rule"
if (-not $rule.enabled) {
    Write-Warning "Rule is disabled"
}

# 2. Test the condition manually
$testEvent = @{
    eventType = "Test.Event"
    metadata = @{ value = 15 }
}
Test-AlertCondition -Rule $rule -Event $testEvent

# 3. Verify event type matching
Write-Host "Rule monitors: $($rule.eventType)"
Write-Host "Event type: $($testEvent.eventType)"
```

### Missing Alerts

```powershell
# Check if alerts are being written
ls artifacts/alerts/

# Check alert file permissions
Get-Acl artifacts/alerts/

# Verify alerting system is initialized
Initialize-AlertingSystem -Verbose
```

## Future Enhancements

Planned features for future releases:

1. **External Notifications**
   - Email notifications
   - Slack/Teams integration
   - Webhook support

2. **Alert Acknowledgment**
   - Mark alerts as acknowledged
   - Track resolution time

3. **Alert Dashboard**
   - Web UI for viewing alerts
   - Real-time updates
   - Filtering and search

4. **Alert Correlation**
   - Group related alerts
   - Detect patterns
   - Root cause analysis

5. **SLA Monitoring**
   - Define SLAs
   - Track compliance
   - Generate reports

## Support

For issues or questions:

- Check the [Telemetry & AI Insights Guide](TELEMETRY_AND_AI_INSIGHTS.md)
- Review the [Unified CLI Guide](UNIFIED_CLI.md)
- Check [GitHub Discussions](https://github.com/xfaith4/UnifiedAIToolbox/discussions)

---

**Ready to set up alerts?** Run `pwsh tools/utb.ps1 alerts setup` to get started!
