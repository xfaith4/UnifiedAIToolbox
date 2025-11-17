# GitHub Automation Guide

This guide explains how to use the GitHub automation features in UnifiedAIToolbox to clone repositories and run Codex swarm analysis.

## Overview

The GitHub automation feature allows you to:
- Search for GitHub repositories
- Clone repositories for analysis
- Run Codex swarm for multi-agent code review
- View findings and analysis results
- Manage cloned repositories

## Prerequisites

### 1. GitHub Personal Access Token

To use GitHub integration, you need a GitHub Personal Access Token (PAT):

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Give it a descriptive name (e.g., "UnifiedAIToolbox")
4. Select scopes:
   - `repo` (Full control of private repositories)
   - `read:org` (Read org and team membership)
5. Click "Generate token"
6. Copy the token immediately (you won't be able to see it again)

### 2. Set Environment Variable

Add your GitHub token to your environment:

**Windows (PowerShell):**
```powershell
$env:GITHUB_TOKEN = "your_token_here"
```

**Linux/Mac (bash):**
```bash
export GITHUB_TOKEN="your_token_here"
```

**Or add to `.env` file:**
```bash
GITHUB_TOKEN=your_token_here
```

### 3. PowerShell Core (for Codex execution)

Codex swarm requires PowerShell Core (pwsh):

**Windows:**
```powershell
winget install Microsoft.PowerShell
```

**Linux:**
```bash
sudo snap install powershell --classic
# or
wget https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb
sudo dpkg -i packages-microsoft-prod.deb
sudo apt-get update
sudo apt-get install -y powershell
```

**Mac:**
```bash
brew install --cask powershell
```

## Architecture

### Components

1. **GitHub Integration Service** (`apps/orchestration-bridge/github_integration/`)
   - `clone_service.py` - Handles repository cloning and management
   - `codex_service.py` - Executes Codex swarm analysis

2. **API Endpoints** (`services/prompt-api/github_api.py`)
   - Repository search and metadata
   - Clone operations
   - Codex run management
   - Findings retrieval

3. **Dashboard UI** (`apps/dashboard/src/`)
   - `components/GitHubRepoSelector.tsx` - Repository search and clone UI
   - `components/CodexRunViewer.tsx` - Codex execution and findings viewer
   - `services/githubApi.ts` - API client

## Usage

### From the Dashboard

#### 1. Search for Repositories

1. Navigate to the Orchestrator page
2. Go to the "GitHub Repo" tab
3. Enter search terms in the search box (e.g., "machine learning python")
4. Click "Search"
5. Browse results showing:
   - Repository name
   - Description
   - Stars, language, size
   - Topics

#### 2. Clone a Repository

1. Click on a repository from search results
2. Optionally specify a branch (default: main/master)
3. Click "Clone Repository"
4. Wait for cloning to complete
5. View the file tree and available branches

#### 3. Run Codex Swarm

1. Select a cloned repository
2. Configure options:
   - Model (GPT-4, GPT-4 Turbo, GPT-3.5 Turbo)
   - Max parallel agents (1-10)
3. Click "Start Codex Swarm"
4. Watch live logs as the analysis runs
5. View findings when complete

#### 4. View Findings

Findings include:
- Agent role (critic, security, lint, tests, refactor)
- Code shard analyzed
- Analysis results
- Log files for detailed review

### From the API

#### Search Repositories

```bash
curl "http://localhost:8000/github/search?query=react&limit=10"
```

#### Get Repository Metadata

```bash
curl "http://localhost:8000/github/repo/facebook/react"
```

#### Clone a Repository

```bash
curl -X POST "http://localhost:8000/github/clone" \
  -H "Content-Type: application/json" \
  -d '{
    "repo_url": "https://github.com/facebook/react",
    "branch": "main",
    "clone_id": "react-analysis-001"
  }'
```

#### List Branches

```bash
curl "http://localhost:8000/github/clone/react-analysis-001/branches"
```

#### Get File Tree

```bash
curl "http://localhost:8000/github/clone/react-analysis-001/tree?max_depth=3"
```

#### Start Codex Run

```bash
curl -X POST "http://localhost:8000/github/codex/run" \
  -H "Content-Type: application/json" \
  -d '{
    "repo_path": "/tmp/github_clones/react_20231117",
    "model": "gpt-4",
    "max_parallel": 3
  }'
```

#### Stream Run Progress (SSE)

```bash
curl "http://localhost:8000/github/codex/run/{run_id}/stream"
```

#### Get Run Status

```bash
curl "http://localhost:8000/github/codex/run/{run_id}/status"
```

#### Get Findings

```bash
curl "http://localhost:8000/github/codex/run/{run_id}/findings"
```

#### Cancel Running Swarm

```bash
curl -X POST "http://localhost:8000/github/codex/run/{run_id}/cancel"
```

#### Delete Clone

```bash
curl -X DELETE "http://localhost:8000/github/clone/react-analysis-001"
```

## Codex Swarm Configuration

The Codex swarm uses the `Orchestrate-Codex.ps1` script with multiple agents:

### Agents

1. **Critic** - General code review and best practices
2. **Security** - Security vulnerability detection
3. **Lint** - Code style and formatting issues
4. **Tests** - Test coverage and quality
5. **Refactor** - Refactoring opportunities

### Shards

Repositories are divided into shards by file type:
- `ps-core` - PowerShell files (*.ps1, *.psm1, *.psd1)
- `ts-ui` - TypeScript/TSX UI files
- `server` - Server-side code

Each agent analyzes each shard in parallel (up to max_parallel at a time).

### Customization

To customize agents or shards, edit:
```
packages/prompt-registry/tooling/Orchestrate-Codex.ps1
```

## Data Management

### Storage Locations

- **Cloned Repositories:** `/tmp/github_clones/` (or custom location)
- **Codex Outputs:** `apps/orchestration-bridge/runs/{run_id}/`
- **Findings:** `apps/orchestration-bridge/runs/{run_id}/findings.json`
- **Logs:** `apps/orchestration-bridge/runs/{run_id}/codex_run.log`

### Cleanup

Clones are temporary and can be deleted:
- From the dashboard: Click "Delete" button
- Via API: `DELETE /github/clone/{clone_id}`
- Manually: Remove from clone directory

### Run History

All Codex runs are preserved with:
- Run metadata (start/end time, model, status)
- Complete logs
- Findings JSON
- Agent outputs

## Best Practices

### 1. Repository Selection

- Start with smaller repositories (<100MB) to test
- Check language support (PS, TS, JS work best)
- Verify branch exists before cloning

### 2. Performance

- Use `max_parallel=3` for balanced performance
- Lower parallelism if rate-limited by API
- Use GPT-3.5 Turbo for faster, cheaper analysis
- Use GPT-4 for higher quality findings

### 3. Cost Management

- Monitor API costs in the Cost Tracker dashboard
- Set budget alerts to avoid surprises
- Use smaller shards or fewer agents to reduce costs
- Cache and reuse analysis results

### 4. Security

- Keep GitHub token secure (never commit to code)
- Use tokens with minimal required scopes
- Rotate tokens regularly
- Clean up clones containing sensitive data

## Troubleshooting

### "PowerShell is not available"

**Solution:** Install PowerShell Core (pwsh)
```bash
# See Prerequisites section above
```

### "GitHub token required"

**Solution:** Set GITHUB_TOKEN environment variable
```bash
export GITHUB_TOKEN="your_token_here"
```

### "Failed to clone repository"

**Causes:**
- Invalid repository URL or name
- Private repository without access
- Network issues
- Disk space insufficient

**Solutions:**
- Verify repository exists and is accessible
- Check GitHub token has repo access
- Free up disk space
- Check network connectivity

### "Codex run failed"

**Causes:**
- PowerShell script errors
- Missing dependencies
- API rate limits
- Invalid repository structure

**Solutions:**
- Check logs in run directory
- Verify repository has supported file types
- Wait if rate-limited
- Check PowerShell script configuration

### "Clone directory already exists"

**Solution:** Service automatically cleans up existing directory with same name. If this fails, manually delete the directory.

## API Reference

### Data Models

#### RepositorySearchResult
```typescript
{
  full_name: string;
  description: string;
  stars: number;
  language: string;
  size: number;
  html_url: string;
  private: boolean;
  topics: string[];
}
```

#### CloneRequest
```typescript
{
  repo_url: string;
  branch?: string;
  clone_id?: string;
}
```

#### CodexRunRequest
```typescript
{
  repo_path: string;
  model?: string;  // default: "gpt-4"
  max_parallel?: number;  // default: 3
}
```

#### CodexRunStatus
```typescript
{
  run_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  repo_path: string;
  model: string;
  start_time: string;
  end_time?: string;
  findings_count?: number;
  log_file: string;
}
```

#### CodexFinding
```typescript
{
  id: string;
  agent_role: string;
  shard: string;
  log_content: string;
  log_file: string;
  directory: string;
}
```

## Examples

### Complete Workflow Example

```python
import requests

BASE_URL = "http://localhost:8000"

# 1. Search for repository
search_response = requests.get(
    f"{BASE_URL}/github/search",
    params={"query": "react hooks", "limit": 5}
)
repos = search_response.json()
print(f"Found {len(repos)} repositories")

# 2. Clone first result
repo = repos[0]
clone_response = requests.post(
    f"{BASE_URL}/github/clone",
    json={
        "repo_url": repo["full_name"],
        "clone_id": "my-analysis"
    }
)
clone_data = clone_response.json()
print(f"Cloned to: {clone_data['clone_path']}")

# 3. Start Codex run
run_response = requests.post(
    f"{BASE_URL}/github/codex/run",
    json={
        "repo_path": clone_data["clone_path"],
        "model": "gpt-4",
        "max_parallel": 3
    }
)
run_data = run_response.json()
run_id = run_data["run_id"]
print(f"Started run: {run_id}")

# 4. Poll for completion
import time
while True:
    status_response = requests.get(
        f"{BASE_URL}/github/codex/run/{run_id}/status"
    )
    status = status_response.json()
    
    print(f"Status: {status['status']}")
    
    if status["status"] in ["completed", "failed", "cancelled"]:
        break
    
    time.sleep(10)

# 5. Get findings
findings_response = requests.get(
    f"{BASE_URL}/github/codex/run/{run_id}/findings"
)
findings_data = findings_response.json()
print(f"Found {findings_data['count']} findings")

for finding in findings_data["findings"]:
    print(f"- {finding['agent_role']}/{finding['shard']}")
    print(f"  {finding['log_content'][:100]}...")

# 6. Cleanup
requests.delete(f"{BASE_URL}/github/clone/my-analysis")
print("Clone deleted")
```

## Future Enhancements

Planned improvements for future sprints:

1. **PR Creation** - Automatically create PRs from findings
2. **Multi-repo Analysis** - Analyze multiple repositories in parallel
3. **Custom Agent Templates** - Define custom analysis agents
4. **Scheduled Scans** - Schedule periodic repository scans
5. **Integration with GitHub Actions** - Trigger on commits/PRs
6. **Comparative Analysis** - Compare findings across branches/commits
7. **Export Reports** - Generate PDF/HTML reports from findings

## Support

For issues or questions:
- Check the logs in `apps/orchestration-bridge/runs/`
- Review the API documentation at `/docs` (FastAPI interactive docs)
- File issues in the GitHub repository
- Contact the team via project channels

## License

This feature is part of UnifiedAIToolbox and follows the project's license terms.
