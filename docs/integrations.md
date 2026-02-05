# Integrations

Purpose: Document GitHub integration and webhook setup for orchestration workflows.

## GitHub integration

### Configuration
Set a GitHub token in `.env`:
```env
GITHUB_TOKEN=ghp_xxx
```

Required scopes:
- `repo`
- `read:org` (for private org repos)

### Core endpoints
- `GET /github/status`
- `POST /github/auth/verify`
- `GET /github/repos/{owner}/{repo}`
- `POST /github/repos/clone`
- `GET /github/repos/{owner}/{repo}/pulls`
- `GET /github/repos/{owner}/{repo}/issues`
- `POST /github/orchestration/run`
- `POST /github/orchestration/upload-results`

### Orchestration flow (high level)
1. Clone repo via `/github/orchestration/run`
2. Execute orchestration externally (PowerShell / swarm)
3. Upload results as a PR via `/github/orchestration/upload-results`

## Webhooks

### Configuration
Set a webhook secret:
```env
GITHUB_WEBHOOK_SECRET=your-secret
```

Webhook endpoints:
- `POST /webhooks/github`
- `GET /webhooks/github/config`
- `POST /webhooks/github/test`

### Default triggers
Typical triggers include push events and PR events (opened, synchronize, reopened). Configure in:
- `apps/UnifiedPromptApp/services/prompt-api/webhook_handler.py`

## Security notice (OAuth secrets)
If any OAuth client secrets were ever committed:
- Rotate secrets immediately in the provider console.
- Store secrets in `.env` or outside the repo.
- Ensure `client_secret*.json` is gitignored.

## Troubleshooting
- “GitHub token required”: ensure `GITHUB_TOKEN` is set.
- “Webhook signature invalid”: verify `GITHUB_WEBHOOK_SECRET`.
- “Failed to clone”: confirm token scopes and repo access.

## Related docs
- [Orchestration](orchestration.md)
- [Workflows](workflows.md)
