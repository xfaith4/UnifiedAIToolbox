# GitHub Webhook Setup Guide

This guide explains how to configure GitHub webhooks to trigger automated orchestration workflows in the Unified AI Toolbox.

## Overview

GitHub webhooks allow you to automatically trigger actions in response to repository events such as:
- Code pushes
- Pull request creation/updates
- Workflow runs
- Issue activity
- Release creation

The Unified AI Toolbox can receive these webhooks and automatically trigger:
- Repository health analysis
- Code reviews
- Security scans
- Build artifact collection
- Custom orchestration workflows

## Architecture

```
GitHub Repository
    |
    | (webhook event)
    v
Unified AI Toolbox API (/webhooks/github endpoint)
    |
    | (parses event, verifies signature)
    v
Webhook Handler
    |
    | (triggers appropriate orchestrations)
    v
PowerShell Orchestration Scripts
```

## Prerequisites

1. **Running API Server**: The Unified AI Toolbox API must be accessible from the internet
2. **GitHub Repository Admin Access**: You need admin access to configure webhooks
3. **Webhook Secret**: A secure random string for payload verification

## Configuration Steps

### 1. Generate a Webhook Secret

Generate a strong random secret for webhook verification:

```bash
# On Linux/Mac
openssl rand -hex 32

# On Windows (PowerShell)
[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Save this secret - you'll need it in both GitHub and your API configuration.

### 2. Configure the API

Set the webhook secret as an environment variable:

```bash
# .env file or environment
GITHUB_WEBHOOK_SECRET=your-generated-secret-here
```

Restart the API server to apply the configuration:

```bash
cd Orchestration/UnifiedPromptApp/services/prompt-api
python app.py
```

Verify the webhook endpoint is accessible:

```bash
curl http://your-api-domain.com/webhooks/github/config
```

### 3. Configure GitHub Webhook

1. Go to your GitHub repository settings
2. Navigate to **Settings** → **Webhooks** → **Add webhook**
3. Configure the webhook:

   - **Payload URL**: `https://your-api-domain.com/webhooks/github`
   - **Content type**: `application/json`
   - **Secret**: Enter the webhook secret you generated
   - **SSL verification**: Enable SSL verification (recommended for production)
   - **Events**: Select events to trigger:
     - ✅ Push events
     - ✅ Pull request events
     - ✅ Workflow run events
     - ✅ Issue events (optional)
     - Or select "Send me everything" for all events

4. Click **Add webhook**

### 4. Test the Webhook

#### Test from GitHub

Push a commit or create a pull request to trigger the webhook. GitHub will show delivery status in the webhook settings.

#### Test Manually

Use the test endpoint to simulate webhook events:

```bash
# Test push event
curl -X POST "http://localhost:8000/webhooks/github/test?event_type=push"

# Test pull request event
curl -X POST "http://localhost:8000/webhooks/github/test?event_type=pull_request&action=opened"
```

#### Check Webhook Configuration

```bash
curl http://localhost:8000/webhooks/github/config
```

This returns:
```json
{
  "webhook_secret_configured": true,
  "orchestrator_script_exists": true,
  "repo_analysis_script_exists": true,
  "triggers": [
    {
      "event_types": ["push"],
      "actions": null,
      "orchestration_action": "repo_analysis",
      "enabled": true,
      "script_exists": true
    },
    {
      "event_types": ["pull_request"],
      "actions": ["opened", "synchronize", "reopened"],
      "orchestration_action": "code_review",
      "enabled": true,
      "script_exists": true
    }
  ]
}
```

## Webhook Event Triggers

### Default Triggers

The webhook handler has the following default triggers configured:

| Event Type | Action | Orchestration | Description |
|------------|--------|---------------|-------------|
| `push` | Any | Repository Analysis | Run quick repo health check on push to any branch |
| `pull_request` | `opened`, `synchronize`, `reopened` | Code Review | Trigger automated code review for PR changes |
| `pull_request` | `opened` | Security Scan | Run security analysis on new PRs |

### Customizing Triggers

Edit the webhook handler configuration in:
```
Orchestration/UnifiedPromptApp/services/prompt-api/webhook_handler.py
```

Modify the `DEFAULT_TRIGGERS` list:

```python
DEFAULT_TRIGGERS: List[OrchestrationTrigger] = [
    OrchestrationTrigger(
        event_types=[WebhookEventType.PUSH],
        actions=None,  # Any push action
        orchestration_action=OrchestrationAction.REPO_ANALYSIS,
        script_path=REPO_ANALYSIS_SCRIPT,
        script_args={"AnalysisType": "quick"},
        enabled=True
    ),
    # Add your custom triggers here
]
```

## Webhook Payload

When a webhook is received, the handler:

1. **Verifies** the signature using HMAC SHA-256
2. **Parses** the event type and action
3. **Matches** against configured triggers
4. **Executes** orchestration scripts in the background
5. **Returns** immediately with a response

Example response:

```json
{
  "received": true,
  "event_type": "pull_request",
  "action": "opened",
  "triggered_orchestrations": [
    "code_review_20231205123456",
    "security_scan_20231205123456"
  ],
  "message": "Webhook processed. Triggered 2 orchestration(s).",
  "webhook_id": "abc123def456"
}
```

## Security Considerations

### 1. Webhook Secret

- **Always** use a strong, random webhook secret
- **Never** commit the secret to source control
- Store it securely using environment variables or secret management systems

### 2. Signature Verification

The webhook handler verifies all incoming payloads using HMAC SHA-256. Requests with invalid signatures are rejected with HTTP 401.

### 3. HTTPS

- Use HTTPS in production to encrypt webhook payloads in transit
- Enable SSL verification in GitHub webhook settings

### 4. Rate Limiting

Consider implementing rate limiting on the webhook endpoint to prevent abuse.

### 5. IP Allowlisting

For additional security, restrict webhook endpoint access to [GitHub's IP ranges](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-githubs-ip-addresses).

## Troubleshooting

### Webhook Deliveries Failing

1. **Check GitHub webhook delivery logs**:
   - Go to Settings → Webhooks → Recent Deliveries
   - Click on a delivery to see request/response details

2. **Verify API is accessible**:
   ```bash
   curl https://your-api-domain.com/health
   ```

3. **Check webhook secret**:
   - Ensure the secret matches in both GitHub and your API configuration

### Orchestrations Not Triggering

1. **Check API logs**:
   ```bash
   tail -f Orchestration/UnifiedPromptApp/services/prompt-api/logs/app.log
   ```

2. **Verify trigger configuration**:
   ```bash
   curl http://localhost:8000/webhooks/github/config
   ```

3. **Test manually**:
   ```bash
   curl -X POST "http://localhost:8000/webhooks/github/test?event_type=push"
   ```

### Signature Verification Failures

1. **Verify secret is set**:
   ```bash
   echo $GITHUB_WEBHOOK_SECRET
   ```

2. **Check secret matches GitHub configuration**

3. **Inspect X-Hub-Signature-256 header** in GitHub delivery logs

## Advanced Configuration

### Custom Orchestration Scripts

To add a custom orchestration script:

1. Create your PowerShell script:
   ```powershell
   # scripts/My-CustomOrchestration.ps1
   param(
       [string]$WebhookId,
       [string]$EventType,
       [string]$Repository
   )
   
   Write-Host "Custom orchestration triggered!"
   Write-Host "Webhook ID: $WebhookId"
   Write-Host "Event: $EventType"
   Write-Host "Repository: $Repository"
   ```

2. Add trigger to `webhook_handler.py`:
   ```python
   OrchestrationTrigger(
       event_types=[WebhookEventType.RELEASE],
       actions=["published"],
       orchestration_action=OrchestrationAction.CUSTOM_ORCHESTRATION,
       script_path=REPO_ROOT / "scripts" / "My-CustomOrchestration.ps1",
       script_args={"CustomArg": "value"},
       enabled=True
   )
   ```

### Webhook Filtering

To only trigger on specific branches:

```python
def should_trigger_orchestration(trigger, event_type, action, payload):
    # ... existing checks ...
    
    # Only trigger on main branch
    if payload.get("ref") != "refs/heads/main":
        return False
    
    return True
```

## API Endpoints

### POST /webhooks/github

Main webhook receiver endpoint.

**Headers:**
- `X-GitHub-Event`: Event type
- `X-Hub-Signature-256`: Payload signature
- `X-GitHub-Delivery`: Unique delivery ID

### GET /webhooks/github/config

Get current webhook configuration and status.

### POST /webhooks/github/test

Test webhook processing with simulated events.

**Parameters:**
- `event_type`: Event type to simulate (push, pull_request, etc.)
- `action`: Optional action within the event

## Examples

### Example 1: Trigger Analysis on Push to Main

```bash
# GitHub automatically sends this webhook when code is pushed to main
# The webhook handler will:
# 1. Verify the signature
# 2. Parse the push event
# 3. Trigger Run-RepoAnalysis.ps1 with AnalysisType=quick
# 4. Return immediately while analysis runs in background
```

### Example 2: Automated PR Review

```bash
# When a PR is opened, GitHub sends pull_request webhook
# The webhook handler will:
# 1. Verify the signature
# 2. Parse the pull_request event with action=opened
# 3. Trigger MilestoneController.ps1 with Action=review-pr
# 4. Trigger MilestoneController.ps1 with Action=security-scan
# 5. Return immediately while both orchestrations run in background
```

## Related Documentation

- [GitHub Webhook Documentation](https://docs.github.com/en/developers/webhooks-and-events/webhooks)
- [Orchestration Guide](ORCHESTRATOR_ENHANCEMENTS.md)
- [Repository Analysis](../scripts/Run-RepoAnalysis.ps1)
- [CI/CD Workflows](../.github/workflows/)

## Support

For issues or questions about webhook configuration:
- Check the [troubleshooting section](#troubleshooting)
- Review API logs for error messages
- Open an issue on the GitHub repository
