# Telemetry & AI-Assisted Insights Guide

> **New capabilities added to the Unified AI Toolbox for enhanced observability and intelligent analysis**

This guide covers the telemetry collection system and AI-powered insights features recently added to the repository.

## 📊 Overview

The Unified AI Toolbox now includes:

1. **Telemetry & Metrics** - Track usage patterns, analysis runs, and artifact downloads
2. **AI-Assisted Insights** - Generate intelligent summaries of repository health and PR status
3. **Reusable CI/CD Templates** - Extract and adapt our battle-tested workflows

## 🔍 Telemetry System

### What is Tracked

The telemetry system captures:

- **Repository Analysis Events**
  - Analysis start/completion
  - Analysis type (full, quick, security-only)
  - Health score and critical issues
  - Duration and outcome

- **Artifact Events**
  - Artifact publication (via GitHub API)
  - Artifact metadata (size, workflow, expiration)
  - Periodic summaries

- **Dashboard Usage**
  - Page views (PR dashboard)
  - Filter changes (state, label, author)
  - Sort changes
  - Search queries

### Event Schema

All telemetry events follow a consistent schema:

```json
{
  "timestamp": "2024-12-05T12:34:56.789Z",
  "eventType": "RepoAnalysis.Completed",
  "source": "GitHubAction",
  "metadata": {
    "health_score": 85,
    "duration_seconds": 45.2,
    "success": true
  },
  "schema_version": "1.0"
}
```

### Storage

Telemetry is stored in JSONL (JSON Lines) format:

```
artifacts/telemetry/
└── telemetry_2024-12-05.jsonl
```

Each line is a complete JSON event. Files are rotated daily and when they exceed 10MB.

### Configuration

Telemetry is enabled by default. To disable:

```powershell
# In PowerShell scripts
$script:TelemetryConfig.Enabled = $false

# Or in environment
$env:TELEMETRY_ENABLED = "false"
```

### Viewing Telemetry

```powershell
# Import the Telemetry module
Import-Module ./modules/Telemetry/Telemetry.psm1

# Get events from the last 7 days
$events = Get-TelemetryEvents -Last 100

# Get statistics
$stats = Get-TelemetryStats -Days 7

# View by event type
Get-TelemetryEvents -EventType "RepoAnalysis.Completed"
```

### Programmatic Access

#### PowerShell

```powershell
# Send a custom event
Send-TelemetryEvent -EventType "CustomEvent" -Source "MyScript" -Metadata @{
    user = $env:USERNAME
    action = "deployed"
    environment = "production"
}
```

#### TypeScript/JavaScript (Dashboard)

```typescript
import { track } from '../services/telemetry'

// Track a custom event
track('UserAction', {
  action: 'button_clicked',
  button_id: 'export-report',
  page: 'analytics'
})
```

#### API Endpoint

The backend exposes `/api/telemetry` for receiving events:

```bash
curl -X POST http://localhost:8000/api/telemetry \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "timestamp": "2024-12-05T12:00:00Z",
        "eventType": "Custom.Event",
        "source": "ExternalTool",
        "metadata": {"key": "value"},
        "schema_version": "1.0"
      }
    ]
  }'
```

## 🤖 AI-Assisted Insights

### Overview

AI insights leverage OpenAI-compatible LLMs to generate actionable summaries of:

- Repository health analysis reports
- Pull request and CI status snapshots

**Important:** AI insights are advisory only. Always validate with human review.

### Configuration

Set your OpenAI API key:

```bash
# Linux/Mac
export OPENAI_API_KEY="sk-..."

# Windows PowerShell
$env:OPENAI_API_KEY = "sk-..."

# Optional: Use a different model
export OPENAI_MODEL="gpt-4o-mini"  # Default, cheapest

# Optional: Use Azure OpenAI
export OPENAI_API_ENDPOINT="https://your-resource.openai.azure.com"
```

### Generating Repository Analysis Summaries

After running a repository analysis:

```powershell
# Run analysis first
pwsh scripts/Run-RepoAnalysis.ps1 -AnalysisType full

# Generate AI summary
pwsh scripts/ai-insights/Generate-RepoAnalysisSummary.ps1
```

This creates a markdown summary at:
```
artifacts/reports/RepoAnalysis_Summary_2024-12-05_12-34-56.md
```

The summary includes:

1. **Executive Summary** - High-level health status
2. **Top Issues/Risks** - Prioritized list with severity
3. **Next Steps** - Actionable recommendations
4. **Metadata** - Health score, AI usage stats

### AI Client Architecture

The AI client provides a pluggable abstraction:

```powershell
# Initialize with custom settings
Initialize-AIClient -Model "gpt-4o" -MaxRetries 5

# Test connection
Test-AIConnection

# Make a completion
$result = Invoke-AICompletion -Prompt "Analyze this code..." -Temperature 0.7
```

**Features:**

- **Automatic retry** with exponential backoff
- **Error handling** for auth, rate limits, timeouts
- **Token usage tracking**
- **Telemetry integration** (tracks AI usage and failures)
- **Provider-agnostic** (OpenAI, Azure OpenAI, or compatible APIs)

### Prompt Templates

AI prompts are stored as templates:

```
scripts/ai-insights/prompts/
├── RepoAnalysisSummary.txt
└── PRSnapshotSummary.txt
```

Templates use `{PLACEHOLDER}` syntax for variable substitution.

### Cost Considerations

Using `gpt-4o-mini` (default):

- **Input:** $0.150 per 1M tokens
- **Output:** $0.600 per 1M tokens

Typical costs per run:

- **Repo analysis summary:** ~$0.01-0.05 (2-5K tokens)
- **PR snapshot summary:** ~$0.005-0.02 (500-2K tokens)

**Monitor usage:** Check your [OpenAI dashboard](https://platform.openai.com/usage)

### Guardrails

AI insights include explicit disclaimers:

> ⚠️ **Advisory**  
> This summary is AI-generated and should complement, not replace:
> - Human code review
> - Security audits
> - Manual testing
> - Team discussion

Summaries are timestamped and include generation metadata for auditability.

## 🎯 Usage Patterns

### Pattern 1: Daily Health Monitoring

```yaml
# In .github/workflows/repo-analysis-scheduled.yml
- name: Generate AI summary
  if: success()
  shell: pwsh
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
  run: |
    pwsh scripts/ai-insights/Generate-RepoAnalysisSummary.ps1
```

**Result:** Daily AI-powered health summaries in artifacts

### Pattern 2: PR Review Priority

Generate a PR snapshot summary to help prioritize reviews:

```powershell
# Fetch PR data and generate summary
pwsh scripts/ai-insights/Generate-PRSnapshot.ps1
```

**Result:** Markdown report recommending review order based on:
- CI failures
- PR age
- Size/complexity
- Dependencies

### Pattern 3: Post-Mortem Analysis

After an incident, generate insights:

```powershell
# Run comprehensive analysis
pwsh scripts/Run-RepoAnalysis.ps1 -AnalysisType full

# Generate AI summary
pwsh scripts/ai-insights/Generate-RepoAnalysisSummary.ps1

# Review telemetry
$events = Get-TelemetryEvents -EventType "RepoAnalysis.Completed" -Last 30
$events | Select-Object timestamp, metadata | ConvertTo-Json
```

**Result:** Timeline of health changes and AI-identified issues

## 🔒 Security & Privacy

### Telemetry

- **No PII by default** - Telemetry doesn't collect personal information
- **Local storage** - Data stays in your repository (JSONL files)
- **Configurable** - Easy to disable or customize
- **Gitignored** - `artifacts/telemetry/` excluded from git by default

### AI Insights

- **API key security** - Never commit API keys, use environment variables
- **Data transmission** - Code/data sent to OpenAI API (see [OpenAI's data policy](https://openai.com/policies/api-data-usage-policies))
- **Opt-in** - AI features only work if API key is provided
- **Audit trail** - All AI calls logged in telemetry

**Recommendation:** For sensitive codebases, consider:
- Using Azure OpenAI with your own deployment
- Self-hosted LLMs (requires custom client implementation)
- Disabling AI features entirely

## 📦 Integration with CI/CD Template

The telemetry and AI insights are designed to work seamlessly with the CI/CD blueprint:

```
templates/ci-cd-blueprint/
├── workflows/
│   ├── ci-comprehensive.yml          # Can emit telemetry
│   └── repo-analysis-scheduled.yml   # Includes AI summary step
├── scripts/
│   └── Run-RepoAnalysis.ps1          # Telemetry-aware
└── docs/
    └── SECRETS_AND_ENV.md             # Documents OPENAI_API_KEY
```

See [CI/CD Blueprint README](../templates/ci-cd-blueprint/README.md) for details.

## 🛠️ Extending the System

### Adding New Telemetry Events

```powershell
# Define event type and metadata
Send-TelemetryEvent `
  -EventType "Deployment.Started" `
  -Source "DeploymentScript" `
  -Metadata @{
    environment = "production"
    version = "v1.2.3"
    deployer = $env:USERNAME
  }
```

### Creating Custom AI Prompts

1. Create a new prompt template:
   ```
   scripts/ai-insights/prompts/MyCustomPrompt.txt
   ```

2. Use placeholders for variable data:
   ```
   Analyze this deployment log:
   
   {DEPLOYMENT_LOG}
   
   Identify any errors or warnings.
   ```

3. Load and render in your script:
   ```powershell
   $template = Get-Content "prompts/MyCustomPrompt.txt" -Raw
   $prompt = $template -replace '{DEPLOYMENT_LOG}', $logContent
   $result = Invoke-AICompletion -Prompt $prompt
   ```

### Custom Telemetry Sinks

Extend the telemetry system to send to external services:

```powershell
# Example: Custom sink for Application Insights
class AppInsightsSink : TelemetrySink {
    [string]$InstrumentationKey
    
    [void] Write([hashtable]$event) {
        # Send to App Insights API
        Invoke-RestMethod -Uri "..." -Body ($event | ConvertTo-Json)
    }
}
```

## 📈 Analytics & Reporting

### Telemetry Queries

```powershell
# How many analyses in the last 30 days?
$stats = Get-TelemetryStats -Days 30
Write-Host "Total analyses: $($stats.by_event_type['RepoAnalysis.Completed'])"

# Average health score over time
$events = Get-TelemetryEvents -EventType "RepoAnalysis.Completed" -Last 100
$avgScore = ($events.metadata.health_score | Measure-Object -Average).Average

# Find failures
$failures = Get-TelemetryEvents | Where-Object {
    $_.eventType -like "*.Error" -or $_.eventType -like "*.Failed"
}
```

### Exporting Data

```powershell
# Export to CSV
Get-TelemetryEvents -Last 1000 | 
  Select-Object timestamp, eventType, source | 
  Export-Csv telemetry-export.csv

# Export to JSON for analysis
Get-TelemetryEvents -Last 1000 | 
  ConvertTo-Json -Depth 10 | 
  Out-File telemetry-export.json
```

## 🐛 Troubleshooting

### Telemetry not working

**Issue:** Events not being recorded

**Solutions:**
- Check `artifacts/telemetry/` exists and is writable
- Verify telemetry is enabled: `$script:TelemetryConfig.Enabled`
- Check for errors in script output
- Manually call `Initialize-TelemetrySink`

### AI insights failing

**Issue:** AI summary generation fails

**Solutions:**
- Verify `OPENAI_API_KEY` is set and valid
- Test connection: `Test-AIConnection`
- Check API quota and billing
- Review error message for authentication/rate limit issues
- Try with a simpler prompt to isolate the issue

### High costs

**Issue:** Unexpected OpenAI API costs

**Solutions:**
- Use `gpt-4o-mini` instead of `gpt-4o`
- Reduce `MaxTokens` in AI calls
- Limit AI summary generation frequency
- Monitor usage in OpenAI dashboard
- Consider caching summaries

## 📚 Further Reading

- **[CI/CD Blueprint](../templates/ci-cd-blueprint/README.md)** - Reusable workflow templates
- **[Customization Guide](../templates/ci-cd-blueprint/docs/CUSTOMIZATION_GUIDE.md)** - Adapt templates
- **[Secrets & Environment](../templates/ci-cd-blueprint/docs/SECRETS_AND_ENV.md)** - Configuration
- **[Workflow Guide](WORKFLOW_GUIDE.md)** - GitHub Actions workflows
- **[Project Roadmap](PROJECT_ROADMAP.md)** - Future enhancements

---

**Questions or feedback?** Open a discussion on [GitHub Discussions](https://github.com/xfaith4/UnifiedAIToolbox/discussions).
