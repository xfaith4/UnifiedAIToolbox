# Unified CLI Guide

> **Single command-line interface for all Unified AI Toolbox operations**

The Unified AI Toolbox CLI (`tools/utb.ps1`) provides a consistent command-line interface for all major toolbox features. Instead of remembering multiple scripts and paths, you can use a single entry point with intuitive subcommands.

## Overview

The unified CLI consolidates access to:
- **Telemetry**: View and analyze usage metrics
- **Alerts**: Configure and monitor alert rules
- **Analysis**: Run repository analysis
- **AI Insights**: Generate AI-powered summaries
- **Templates**: Manage CI/CD template versions

## Getting Started

### Basic Usage

```powershell
# Show help
pwsh tools/utb.ps1 help

# Show version
pwsh tools/utb.ps1 version

# Get help for a specific command
pwsh tools/utb.ps1 <command> help
```

### Prerequisites

- **PowerShell 7.4+** - Cross-platform PowerShell
- **Modules**: Telemetry, Alerting, AIClient (auto-imported as needed)

## Commands Reference

### Telemetry Commands

View and manage telemetry events collected by the system.

```powershell
# Show telemetry statistics (last 7 days)
pwsh tools/utb.ps1 telemetry stats

# Show statistics for last 30 days
pwsh tools/utb.ps1 telemetry stats --days 30

# Show recent telemetry events (last 20)
pwsh tools/utb.ps1 telemetry events

# Show last 50 events
pwsh tools/utb.ps1 telemetry events --last 50

# Show telemetry help
pwsh tools/utb.ps1 telemetry help
```

**Telemetry Statistics Include:**
- Total event count
- Events by type
- Last event timestamp
- Events by source

### Alerts Commands

Configure, monitor, and manage alert rules for telemetry events.

```powershell
# Configure default alert rules
pwsh tools/utb.ps1 alerts setup

# List all alert rules
pwsh tools/utb.ps1 alerts list

# Test alert rules with sample events
pwsh tools/utb.ps1 alerts test

# View recent alerts (last 20)
pwsh tools/utb.ps1 alerts view

# View last 50 alerts
pwsh tools/utb.ps1 alerts view --last 50

# View alerts of specific severity
pwsh tools/utb.ps1 alerts view --severity Critical

# Clear old alert history
pwsh tools/utb.ps1 alerts clear

# Show alerts help
pwsh tools/utb.ps1 alerts help
```

**Default Alert Rules:**
- **Critical**: AI summary generation failures
- **High**: Repository analysis failures, high error rates
- **Medium**: Low health scores, artifact upload failures
- **Low**: Long analysis duration
- **Info**: Analysis completed (disabled by default)

### Analysis Commands

Run repository analysis to assess code health and quality.

```powershell
# Run repository analysis
pwsh tools/utb.ps1 analysis run

# Pass additional options (see Run-RepoAnalysis.ps1 for details)
pwsh tools/utb.ps1 analysis run -Quick

# Show analysis help
pwsh tools/utb.ps1 analysis help

# Get detailed analysis options
pwsh scripts/Run-RepoAnalysis.ps1 -?
```

**Analysis Output:**
- Health score calculation
- Code metrics and statistics
- Security vulnerabilities
- Test coverage
- Documentation coverage

### AI Insights Commands

Generate AI-powered summaries and insights from analysis data.

```powershell
# Generate AI-powered summary
pwsh tools/utb.ps1 ai-insights generate

# Pass additional options (see Generate-RepoAnalysisSummary.ps1)
pwsh tools/utb.ps1 ai-insights generate -Model gpt-4

# Show AI insights help
pwsh tools/utb.ps1 ai-insights help

# Get detailed AI insights options
pwsh scripts/ai-insights/Generate-RepoAnalysisSummary.ps1 -?
```

**Requirements:**
- `OPENAI_API_KEY` environment variable
- Repository analysis data (run analysis first)

**Output:**
- Executive summary
- Top issues and risks
- Prioritized next steps
- Markdown format report

### Templates Commands

Manage CI/CD template versions and changelogs.

```powershell
# Show template version
pwsh tools/utb.ps1 templates version

# Show template changelog
pwsh tools/utb.ps1 templates changelog

# List available templates
pwsh tools/utb.ps1 templates list

# Show templates help
pwsh tools/utb.ps1 templates help
```

**Template Management:**
- Semantic versioning (MAJOR.MINOR.PATCH)
- Changelog tracking
- Version comparison
- Migration guidelines

## Advanced Usage

### Creating Aliases

For convenience, you can create a shell alias:

**PowerShell:**
```powershell
# Add to your PowerShell profile
Set-Alias -Name utb -Value "$PSScriptRoot/tools/utb.ps1"

# Usage
utb telemetry stats
utb alerts setup
```

**Bash/Zsh:**
```bash
# Add to your .bashrc or .zshrc
# Replace /path/to/UnifiedAIToolbox with your actual repository path
alias utb='pwsh /path/to/UnifiedAIToolbox/tools/utb.ps1'

# Usage
utb telemetry stats
utb alerts setup
```

### Piping and Output

```powershell
# Pipe output to files
pwsh tools/utb.ps1 telemetry events --last 100 > events.log

# Pipe to filtering tools
pwsh tools/utb.ps1 alerts view | Select-String "Critical"

# Use with other PowerShell cmdlets
pwsh tools/utb.ps1 telemetry stats | Out-GridView
```

### Automation Scripts

```powershell
# Daily monitoring script
$stats = pwsh tools/utb.ps1 telemetry stats --days 1
$alerts = pwsh tools/utb.ps1 alerts view --severity Critical --last 10

if ($alerts.Count -gt 5) {
    Write-Warning "Critical alerts detected: $($alerts.Count)"
    # Send notification
}
```

## Workflow Integration

### GitHub Actions

```yaml
- name: Check Telemetry Stats
  run: pwsh tools/utb.ps1 telemetry stats --days 7

- name: Configure Alerts
  run: pwsh tools/utb.ps1 alerts setup

- name: Run Analysis
  run: pwsh tools/utb.ps1 analysis run
```

### Pre-commit Hooks

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Check for critical alerts before committing
pwsh tools/utb.ps1 alerts view --severity Critical --last 1
if [ $? -ne 0 ]; then
    echo "Critical alerts found. Review before committing."
    exit 1
fi
```

### Scheduled Tasks

**Windows Task Scheduler:**
```powershell
$trigger = New-ScheduledTaskTrigger -Daily -At "09:00AM"
$action = New-ScheduledTaskAction -Execute "pwsh" -Argument "-File tools/utb.ps1 analysis run"
Register-ScheduledTask -TaskName "DailyRepoAnalysis" -Trigger $trigger -Action $action
```

**Cron (Linux/Mac):**
```bash
# Run daily at 9 AM
0 9 * * * cd /path/to/UnifiedAIToolbox && pwsh tools/utb.ps1 analysis run
```

## Best Practices

### 1. Regular Monitoring

```powershell
# Morning routine: Check telemetry and alerts
pwsh tools/utb.ps1 telemetry stats
pwsh tools/utb.ps1 alerts view --severity Critical
```

### 2. Alert Configuration

```powershell
# Set up alerts once, then monitor regularly
pwsh tools/utb.ps1 alerts setup
pwsh tools/utb.ps1 alerts view --last 50
```

### 3. Weekly Analysis

```powershell
# Weekly deep dive
pwsh tools/utb.ps1 analysis run
pwsh tools/utb.ps1 ai-insights generate
pwsh tools/utb.ps1 telemetry stats --days 7
```

### 4. Template Updates

```powershell
# Check template version before updating
pwsh tools/utb.ps1 templates version
pwsh tools/utb.ps1 templates changelog
```

## Troubleshooting

### Common Issues

**Module Not Found:**
```powershell
# Ensure modules are in the correct location
ls modules/Telemetry/
ls modules/Alerting/

# Import manually if needed
Import-Module ./modules/Telemetry/Telemetry.psd1 -Force
Import-Module ./modules/Alerting/Alerting.psd1 -Force
```

**Permission Errors:**
```powershell
# Make script executable (Linux/Mac)
chmod +x tools/utb.ps1

# Run with explicit PowerShell
pwsh -File tools/utb.ps1 help
```

**Path Issues:**
```powershell
# Always run from repository root
cd /path/to/UnifiedAIToolbox
pwsh tools/utb.ps1 <command>
```

## Examples

### Daily Monitoring Workflow

```powershell
# 1. Check telemetry
pwsh tools/utb.ps1 telemetry stats

# 2. Review critical alerts
pwsh tools/utb.ps1 alerts view --severity Critical

# 3. Run analysis if issues found
pwsh tools/utb.ps1 analysis run

# 4. Generate AI summary for insights
pwsh tools/utb.ps1 ai-insights generate
```

### Release Preparation

```powershell
# 1. Check template version
pwsh tools/utb.ps1 templates version

# 2. Review changelog
pwsh tools/utb.ps1 templates changelog

# 3. Run comprehensive analysis
pwsh tools/utb.ps1 analysis run

# 4. Review telemetry for the release period
pwsh tools/utb.ps1 telemetry stats --days 30
```

### Debugging Failed CI

```powershell
# 1. Check recent telemetry events
pwsh tools/utb.ps1 telemetry events --last 50

# 2. Look for failure alerts
pwsh tools/utb.ps1 alerts view --severity High

# 3. Run analysis to identify issues
pwsh tools/utb.ps1 analysis run
```

## Extending the CLI

The unified CLI is designed to be extensible. To add new commands:

1. Create a new function in `tools/utb.ps1`:
   ```powershell
   function Invoke-MyNewCommand {
       param(
           [string]$SubCommand,
           [string[]]$Args
       )
       
       # Your command logic here
   }
   ```

2. Add the command to the router:
   ```powershell
   switch ($Command) {
       'mynew' {
           $exitCode = Invoke-MyNewCommand -SubCommand $SubCommand -Args $ArgumentList
       }
   }
   ```

3. Update the help text in `Show-Help` function

## Support

For issues or questions:
- Check the [main README](../README.md)
- Review [TELEMETRY_AND_AI_INSIGHTS.md](TELEMETRY_AND_AI_INSIGHTS.md)
- Review [ALERTING_SYSTEM.md](ALERTING_SYSTEM.md)
- Open a [GitHub Discussion](https://github.com/xfaith4/UnifiedAIToolbox/discussions)

---

**Ready to start?** Run `pwsh tools/utb.ps1 help` to see all available commands!
