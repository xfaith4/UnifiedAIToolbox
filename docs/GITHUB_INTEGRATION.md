# GitHub Integration Guide

The UnifiedAIToolbox includes comprehensive GitHub integration capabilities that allow you to authenticate, query repositories, clone repos, run orchestration, and create pull requests with AI-generated improvements.

## Table of Contents

- [Overview](#overview)
- [Configuration](#configuration)
- [Authentication](#authentication)
- [Repository Operations](#repository-operations)
- [Pull Requests and Issues](#pull-requests-and-issues)
- [Orchestration Integration](#orchestration-integration)
- [API Reference](#api-reference)
- [Examples](#examples)

## Overview

The GitHub integration provides:

- **Authentication**: Verify GitHub tokens and authenticate API requests
- **Repository Metadata**: Query repository information, stars, forks, topics, etc.
- **Repository Cloning**: Clone public and private repositories locally
- **Pull Requests**: Query and create pull requests
- **Issues**: Query repository issues
- **Branches**: List and switch between branches
- **Orchestration Integration**: Run AI orchestration on repositories and submit results as PRs

## Configuration

### Environment Variables

Add your GitHub personal access token to the `.env` file:

```env
# GitHub Integration Configuration
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Required Scopes

Your GitHub token should have the following scopes:

- `repo` - Full control of private repositories
- `read:org` - Read organization membership (for private repos in orgs)

### Getting a Token

1. Go to [GitHub Settings → Developer Settings → Personal Access Tokens](https://github.com/settings/tokens)
2. Click "Generate new token" (classic)
3. Select the required scopes
4. Generate and copy the token
5. Add it to your `.env` file

## Authentication

### Check Status

```bash
curl http://localhost:8000/github/status
```

Response:
```json
{
  "available": true,
  "authenticated": true,
  "message": "GitHub integration ready"
}
```

### Verify Token

```bash
curl -X POST http://localhost:8000/github/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"token": "ghp_your_token_here"}'
```

Response:
```json
{
  "authenticated": true,
  "username": "your-github-username",
  "message": "Successfully authenticated as your-github-username"
}
```

## Repository Operations

### Get Repository Metadata

Retrieve detailed information about a repository:

```bash
curl http://localhost:8000/github/repos/owner/repo \
  -H "Authorization: Bearer ghp_your_token_here"
```

Response:
```json
{
  "full_name": "owner/repo",
  "name": "repo",
  "owner": "owner",
  "description": "Repository description",
  "clone_url": "https://github.com/owner/repo.git",
  "html_url": "https://github.com/owner/repo",
  "stars": 100,
  "forks": 50,
  "language": "Python",
  "size": 1024,
  "default_branch": "main",
  "topics": ["python", "ai", "automation"],
  "private": false,
  "archived": false,
  "updated_at": "2023-01-01T00:00:00Z"
}
```

### Clone Repository

Clone a repository locally for processing:

```bash
curl -X POST http://localhost:8000/github/repos/clone \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ghp_your_token_here" \
  -d '{
    "repo_url": "https://github.com/owner/repo",
    "branch": "main"
  }'
```

Response:
```json
{
  "clone_id": "owner_repo_20231201_120000",
  "repo_path": "/tmp/github_clones/repo_20231201_120000",
  "owner": "owner",
  "repo_name": "repo",
  "branch": "main",
  "file_tree": {
    "name": "repo",
    "type": "directory",
    "children": [...]
  }
}
```

### List Branches

Get all branches in a repository:

```bash
curl http://localhost:8000/github/repos/owner/repo/branches \
  -H "Authorization: Bearer ghp_your_token_here"
```

Response:
```json
{
  "branches": ["main", "develop", "feature/new-feature"]
}
```

## Pull Requests and Issues

### List Pull Requests

```bash
curl "http://localhost:8000/github/repos/owner/repo/pulls?state=open&limit=10" \
  -H "Authorization: Bearer ghp_your_token_here"
```

Response:
```json
[
  {
    "number": 42,
    "title": "Add new feature",
    "state": "open",
    "html_url": "https://github.com/owner/repo/pull/42",
    "created_at": "2023-01-01T00:00:00Z",
    "updated_at": "2023-01-02T00:00:00Z",
    "user": "contributor",
    "base": "main",
    "head": "feature-branch",
    "draft": false,
    "mergeable": true
  }
]
```

### List Issues

```bash
curl "http://localhost:8000/github/repos/owner/repo/issues?state=open&limit=10" \
  -H "Authorization: Bearer ghp_your_token_here"
```

Response:
```json
[
  {
    "number": 123,
    "title": "Bug report",
    "state": "open",
    "html_url": "https://github.com/owner/repo/issues/123",
    "created_at": "2023-01-01T00:00:00Z",
    "updated_at": "2023-01-02T00:00:00Z",
    "user": "reporter",
    "labels": ["bug", "priority-high"],
    "comments": 5
  }
]
```

## Orchestration Integration

The GitHub integration provides seamless orchestration workflows:

### 1. Run Orchestration on Repository

This endpoint clones a repository and queues it for orchestration:

```bash
curl -X POST http://localhost:8000/github/orchestration/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ghp_your_token_here" \
  -d '{
    "repo_url": "https://github.com/owner/repo",
    "branch": "main",
    "create_pr": false,
    "orchestration_type": "codex"
  }'
```

Response:
```json
{
  "run_id": "orch_owner_repo_20231201_120000",
  "repo_path": "/tmp/github_clones/orch_owner_repo_20231201_120000",
  "status": "cloned",
  "message": "Repository cloned successfully. Orchestration run queued.",
  "pr_url": null
}
```

### 2. Upload Orchestration Results as PR

After orchestration completes, upload the results as a pull request:

```bash
curl -X POST http://localhost:8000/github/orchestration/upload-results \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ghp_your_token_here" \
  -d '{
    "repo_path": "/tmp/github_clones/orch_owner_repo_20231201_120000",
    "repo_owner": "owner",
    "repo_name": "repo",
    "base_branch": "main",
    "findings": [
      {
        "agent_role": "security",
        "shard": "auth.py",
        "log_content": "Fixed SQL injection vulnerability"
      },
      {
        "agent_role": "linter",
        "shard": "main.py",
        "log_content": "Fixed code style issues"
      }
    ]
  }'
```

Response:
```json
{
  "pr_number": 42,
  "pr_url": "https://github.com/owner/repo/pull/42",
  "title": "🤖 Codex Improvements from 2 AI Agents",
  "state": "open",
  "branch": "codex-improvements-20231201-120000",
  "base_branch": "main",
  "commit_sha": "abc123def456"
}
```

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/github/status` | Check GitHub integration status |
| POST | `/github/auth/verify` | Verify GitHub token |
| GET | `/github/repos/{owner}/{repo}` | Get repository metadata |
| POST | `/github/repos/clone` | Clone repository |
| GET | `/github/repos/{owner}/{repo}/pulls` | List pull requests |
| GET | `/github/repos/{owner}/{repo}/issues` | List issues |
| GET | `/github/repos/{owner}/{repo}/branches` | List branches |
| POST | `/github/orchestration/run` | Run orchestration on repository |
| POST | `/github/orchestration/upload-results` | Upload results as PR |

### Authentication Methods

1. **Environment Variable**: Set `GITHUB_TOKEN` in `.env`
2. **Authorization Header**: `Authorization: Bearer ghp_your_token_here`

The API will use the environment variable by default, but the header takes precedence if provided.

## Examples

### Complete Orchestration Workflow

Here's a complete Python example that clones a repo, runs orchestration, and creates a PR:

```python
import requests
import time

API_BASE = "http://localhost:8000"
TOKEN = "ghp_your_token_here"
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

# 1. Check GitHub status
status = requests.get(f"{API_BASE}/github/status").json()
print(f"GitHub Status: {status}")

# 2. Clone repository and start orchestration
run_response = requests.post(
    f"{API_BASE}/github/orchestration/run",
    headers=HEADERS,
    json={
        "repo_url": "https://github.com/owner/repo",
        "branch": "main",
        "orchestration_type": "codex"
    }
).json()

print(f"Orchestration Started: {run_response}")
run_id = run_response["run_id"]
repo_path = run_response["repo_path"]

# 3. Wait for orchestration to complete (implement your own polling logic)
# time.sleep(60)  # Wait for orchestration

# 4. Upload results as PR
pr_response = requests.post(
    f"{API_BASE}/github/orchestration/upload-results",
    headers=HEADERS,
    json={
        "repo_path": repo_path,
        "repo_owner": "owner",
        "repo_name": "repo",
        "base_branch": "main",
        "findings": [
            {
                "agent_role": "security",
                "shard": "auth.py",
                "log_content": "Fixed security issues"
            }
        ]
    }
).json()

print(f"PR Created: {pr_response}")
print(f"View PR at: {pr_response['pr_url']}")
```

### Query Repository Information

```python
import requests

API_BASE = "http://localhost:8000"
TOKEN = "ghp_your_token_here"

# Get repository metadata
repo = requests.get(
    f"{API_BASE}/github/repos/microsoft/vscode",
    headers={"Authorization": f"Bearer {TOKEN}"}
).json()

print(f"Repository: {repo['full_name']}")
print(f"Stars: {repo['stars']}")
print(f"Language: {repo['language']}")
print(f"Topics: {', '.join(repo['topics'])}")

# List open pull requests
pulls = requests.get(
    f"{API_BASE}/github/repos/microsoft/vscode/pulls?state=open",
    headers={"Authorization": f"Bearer {TOKEN}"}
).json()

print(f"\nOpen Pull Requests: {len(pulls)}")
for pr in pulls[:5]:
    print(f"  #{pr['number']}: {pr['title']}")
```

## Security Best Practices

1. **Never commit tokens**: Add `.env` to `.gitignore`
2. **Use minimal scopes**: Only request necessary permissions
3. **Rotate tokens regularly**: Generate new tokens periodically
4. **Use fine-grained tokens**: Consider using fine-grained personal access tokens for better security
5. **Monitor usage**: Check GitHub's audit log for suspicious activity

## Troubleshooting

### "GitHub integration not available"

- Ensure `GitPython` and `PyGithub` are installed: `pip install GitPython PyGithub`
- Check the API logs for import errors

### "GitHub token required"

- Set `GITHUB_TOKEN` in your `.env` file
- Or provide token in the `Authorization` header

### "Failed to clone repository"

- Verify token has `repo` scope
- Check repository exists and is accessible
- For private repos, ensure token has appropriate permissions

### Rate Limiting

GitHub API has rate limits:
- Authenticated requests: 5,000 per hour
- Unauthenticated requests: 60 per hour

If you hit rate limits, the API will return a 403 error. Wait until the rate limit resets (check the `X-RateLimit-Reset` header).

## Future Enhancements

The following features are planned for future releases:

- [ ] GitHub Actions workflow queries and triggers
- [ ] Repository settings management
- [ ] Artifacts download and upload
- [ ] Collaborative PR review with AI suggestions
- [ ] Dashboard for monitoring GitHub operations
- [ ] Webhooks for automated orchestration triggers
- [ ] GitHub Apps integration for better permissions management

## Related Documentation

- [Orchestration Run Tracking](./ORCHESTRATION_RUN_TRACKING.md)
- [API Reference](./help/api-reference.md)
- [Project Roadmap](./PROJECT_ROADMAP.md)
