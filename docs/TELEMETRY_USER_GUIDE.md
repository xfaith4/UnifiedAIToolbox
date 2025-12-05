# Telemetry & Analytics User Guide

> **Complete guide to using telemetry, analytics, and AI insights in Unified AI Toolbox**

## 📊 Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [Telemetry Dashboard](#telemetry-dashboard)
- [AI Insights](#ai-insights)
- [PowerShell API](#powershell-api)
- [REST API](#rest-api)
- [Privacy & Security](#privacy--security)
- [Troubleshooting](#troubleshooting)

## Overview

The Unified AI Toolbox includes comprehensive telemetry and analytics features that help you:

- **Track Usage**: Monitor repository analyses, dashboard interactions, and AI operations
- **Visualize Trends**: View time-series charts and breakdowns by event type
- **AI Insights**: Get AI-generated summaries of repository health and PR activity
- **Performance Monitoring**: Detect failures and track system health

### Key Features

✅ **Real-time Telemetry Dashboard** - View metrics for last 7, 14, 30, or 90 days  
✅ **Event Tracking** - Automatic tracking of key operations  
✅ **AI-Generated Reports** - Weekly snapshots of repository health  
✅ **REST API** - Programmatic access to telemetry data  
✅ **Privacy-First** - Local storage only, no external transmission  
✅ **Security Hardened** - Path validation, no secret leakage  

## Getting Started

### Prerequisites

- Unified AI Toolbox installed and running
- Dashboard accessible at `http://localhost:3001`
- (Optional) OpenAI API key for AI insights

### Quick Access

1. **Web Dashboard**: Navigate to `/telemetry` in the dashboard
2. **PowerShell**: Use the `Telemetry` module
3. **REST API**: Query `/api/telemetry/stats` endpoint

### First Steps

1. **Generate some events** by using the toolbox:
   - Run a repository analysis
   - Visit the PR dashboard
   - Use the orchestrator

2. **View telemetry**:
   ```bash
   # Open dashboard
   http://localhost:3001/telemetry
   ```

3. **Query via PowerShell**:
   ```powershell
   Import-Module ./modules/Telemetry/Telemetry.psd1
   Get-TelemetryStats -Days 7
   ```

## Telemetry Dashboard

### Accessing the Dashboard

1. Launch the dashboard:
   ```bash
   cd apps/dashboard
   npm run dev
   ```

2. Navigate to: `http://localhost:3001/telemetry`

### Dashboard Features

#### Overview Cards

The dashboard displays four key metrics:

- **Total Events**: All telemetry events in the selected period
- **Repo Analyses**: Number of completed repository analyses
- **AI Summaries**: Count of AI-generated summaries
- **PR Dashboard Views**: Number of dashboard page visits

#### Time Period Selector

Switch between different time ranges:
- Last 24 hours
- Last 7 days (default)
- Last 14 days
- Last 30 days
- Last 90 days

#### Charts & Visualizations

**Events by Type**
- Bar chart showing top 10 event types
- Sorted by frequency

**Events by Source**
- Breakdown by source (GitHubAction, DashboardWebApp, CLI)

**Daily Event Volume**
- Time-series line chart
- Shows trends over the selected period

**Event Type Details Table**
- Complete list of all event types
- Count and percentage for each type

#### AI Failures Alert

If any AI requests have failed, you'll see a yellow alert banner with:
- Number of failures
- Recommendation to check API key configuration

### Interpreting the Data

**High Event Volume** → System is being actively used  
**Low/Zero Events** → Check if telemetry is enabled  
**Many AI Failures** → Verify `OPENAI_API_KEY` configuration  
**Spike in Activity** → Correlate with scheduled workflows or manual usage  

## AI Insights

### Weekly AI Snapshots

The toolbox can automatically generate AI-powered insights on a weekly schedule.

#### Configuration

1. **Add OpenAI API Key** to repository secrets:
   ```
   OPENAI_API_KEY=sk-...
   ```

2. **Enable the workflow**:
   - Workflow: `.github/workflows/ai-snapshot-weekly.yml`
   - Runs: Every Monday at 6 AM UTC
   - Manual trigger: Available via GitHub Actions UI

#### What's Generated

**Repository Analysis Summary**
- Health score interpretation
- Top issues and risks
- Prioritized next steps
- Trend analysis

**PR Activity Snapshot**
- Weekly merged PR summary
- Key themes and focus areas
- Notable improvements
- Pattern detection

#### Accessing AI Reports

1. **Via GitHub Artifacts**:
   - Go to Actions → AI Snapshot workflow
   - Download artifacts from the latest run

2. **Via File System**:
   ```
   artifacts/reports/RepoAnalysis_Summary_*.md
   artifacts/reports/PRSnapshot_Summary_*.md
   ```

#### Understanding AI Summaries

⚠️ **Important**: AI summaries are advisory only. Always validate with human review.

**Good Uses**:
- Quickly understand repository state
- Identify potential areas of concern
- Get a high-level overview

**Limitations**:
- AI may misinterpret context
- Cannot access code contents (privacy-preserving)
- Based on metadata and metrics only

## PowerShell API

### Telemetry Module

#### Initialization

```powershell
# Import the module
Import-Module ./modules/Telemetry/Telemetry.psd1

# Initialize with custom path (optional)
Initialize-TelemetrySink -OutputPath "C:\telemetry" -BatchSize 10
```

#### Sending Events

```powershell
# Send a telemetry event
Send-TelemetryEvent `
    -EventType 'CustomOperation.Completed' `
    -Source 'MyScript' `
    -Metadata @{
        duration_seconds = 42
        items_processed = 150
    }
```

#### Retrieving Events

```powershell
# Get all events
$events = Get-TelemetryEvents

# Filter by event type
$analyses = Get-TelemetryEvents -EventType 'RepoAnalysis.Completed'

# Filter by date range
$startDate = (Get-Date).AddDays(-7)
$recentEvents = Get-TelemetryEvents -StartDate $startDate

# Get last 10 events
$latest = Get-TelemetryEvents -Last 10
```

#### Statistics

```powershell
# Get stats for last 7 days
$stats = Get-TelemetryStats -Days 7

# View total events
Write-Host "Total events: $($stats.total_events)"

# View breakdown by event type
$stats.by_event_type | Format-Table

# View breakdown by source
$stats.by_source | Format-Table
```

### AIClient Module

#### Initialization

```powershell
# Import the module
Import-Module ./modules/AIClient/AIClient.psd1

# Initialize with API key
Initialize-AIClient -ApiKey $env:OPENAI_API_KEY -Model 'gpt-4o-mini'
```

#### AI Completion

```powershell
# Generate AI completion
$result = Invoke-AICompletion -Prompt "Analyze this data..." `
    -SystemPrompt "You are a helpful analyst."

if ($result.success) {
    Write-Host "AI Response:"
    Write-Host $result.content
} else {
    Write-Warning "AI request failed: $($result.error)"
}
```

#### Connection Test

```powershell
# Test AI connection
if (Test-AIConnection) {
    Write-Host "AI client is working!"
} else {
    Write-Warning "AI client configuration issue"
}
```

## REST API

### Endpoints

#### POST /api/telemetry

Send telemetry events to the backend.

**Request**:
```json
{
  "events": [
    {
      "timestamp": "2024-12-05T12:00:00Z",
      "eventType": "CustomEvent",
      "source": "MyApp",
      "metadata": {
        "key": "value"
      },
      "schema_version": "1.0"
    }
  ]
}
```

**Response**:
```json
{
  "ok": true,
  "events_received": 1,
  "file": "telemetry_2024-12-05.jsonl"
}
```

#### GET /api/telemetry/stats

Retrieve telemetry statistics.

**Query Parameters**:
- `days` (optional): Number of days (1-90, default: 7)

**Request**:
```
GET /api/telemetry/stats?days=14
```

**Response**:
```json
{
  "total_events": 523,
  "period_days": 14,
  "start_date": "2024-11-21T00:00:00Z",
  "end_date": "2024-12-05T12:00:00Z",
  "by_event_type": {
    "RepoAnalysis.Completed": 5,
    "PRDashboard.View": 342,
    "AI.SummaryGenerated": 2
  },
  "by_source": {
    "GitHubAction": 7,
    "DashboardWebApp": 516
  },
  "by_day": {
    "2024-12-04": 156,
    "2024-12-05": 367
  }
}
```

### JavaScript/TypeScript Integration

```typescript
import { track } from './services/telemetry'

// Track an event
track('UserAction.ButtonClick', {
  button: 'submit',
  page: 'settings'
})

// Track page view
import { trackPageView } from './services/telemetry'
trackPageView('HomePage')

// Track filter change
import { trackFilterChange } from './services/telemetry'
trackFilterChange('status', 'active')
```

## Privacy & Security

### What Data is Collected?

**Collected**:
- Event types (e.g., "RepoAnalysis.Completed")
- Timestamps
- Source identifiers
- Metadata (counts, durations, categories)

**NOT Collected**:
- Source code
- File contents
- Secrets or API keys
- Personal identifiable information (PII)
- Stack traces with sensitive data

### Storage

- **Location**: `artifacts/telemetry/` directory
- **Format**: JSON Lines (.jsonl)
- **Rotation**: Daily files with size-based rotation
- **Retention**: Manual cleanup (no auto-deletion)

### Security Features

✅ **Path Validation** - Prevents directory traversal attacks  
✅ **No External Transmission** - All data stays local  
✅ **Secret Detection** - Best practices prevent secret leakage  
✅ **Configurable** - Can be disabled entirely  

### Disabling Telemetry

**PowerShell**:
```powershell
# Disable globally
$env:TELEMETRY_ENABLED = 'false'
```

**TypeScript**:
```typescript
import { getTelemetryClient } from './services/telemetry'
const client = getTelemetryClient()
client.setEnabled(false)
```

### Best Practices

1. **Never log secrets** in telemetry metadata
2. **Sanitize inputs** before adding to metadata
3. **Review telemetry files** periodically
4. **Use .gitignore** to exclude telemetry data from commits
5. **Document event types** your team uses

## Troubleshooting

### No Telemetry Data Showing

**Symptom**: Dashboard shows 0 events

**Solutions**:
1. Check if telemetry is enabled:
   ```powershell
   $env:TELEMETRY_ENABLED
   ```

2. Verify telemetry files exist:
   ```powershell
   Get-ChildItem artifacts/telemetry/*.jsonl
   ```

3. Check file permissions:
   ```powershell
   Test-Path -Path artifacts/telemetry -PathType Container
   ```

### AI Summaries Not Generated

**Symptom**: No AI reports in artifacts

**Solutions**:
1. Verify API key is set:
   ```powershell
   if ($env:OPENAI_API_KEY) { "Set" } else { "Not set" }
   ```

2. Check workflow logs:
   - Go to Actions → AI Snapshot workflow
   - Review run logs for errors

3. Test AI client manually:
   ```powershell
   Import-Module ./modules/AIClient/AIClient.psd1
   Test-AIConnection
   ```

### Dashboard Not Loading Stats

**Symptom**: "Error Loading Telemetry" message

**Solutions**:
1. Verify API server is running:
   ```bash
   curl http://localhost:8000/api/telemetry/stats
   ```

2. Check PowerShell module path:
   ```powershell
   Test-Path ./modules/Telemetry/Telemetry.psd1
   ```

3. Review browser console for errors:
   - Open DevTools (F12)
   - Check Console and Network tabs

### High Memory Usage

**Symptom**: Process using excessive memory

**Solutions**:
1. Reduce batch size:
   ```powershell
   Initialize-TelemetrySink -BatchSize 5
   ```

2. Increase flush interval:
   ```typescript
   getTelemetryClient({ flushInterval: 60000 }) // 60 seconds
   ```

3. Archive old telemetry files:
   ```powershell
   # Move files older than 30 days
   Get-ChildItem artifacts/telemetry/*.jsonl |
     Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
     Move-Item -Destination artifacts/telemetry/archive/
   ```

### Permission Denied Errors

**Symptom**: Cannot write to telemetry directory

**Solutions**:
1. Check directory permissions:
   ```bash
   ls -la artifacts/telemetry
   ```

2. Create directory if missing:
   ```powershell
   New-Item -ItemType Directory -Force -Path artifacts/telemetry
   ```

3. Fix permissions (Linux/Mac):
   ```bash
   chmod 755 artifacts/telemetry
   ```

## Getting Help

- **Documentation**: See `/docs` directory
- **Issues**: [GitHub Issues](https://github.com/xfaith4/UnifiedAIToolbox/issues)
- **Tests**: Run `tests/E2E-Smoketest.ps1` for system validation

---

**Version**: 1.0  
**Last Updated**: December 2024  
**Authors**: Unified AI Toolbox Team
