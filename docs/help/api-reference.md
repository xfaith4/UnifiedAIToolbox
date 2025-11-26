# API Reference

## Base URL

```
http://localhost:8000
```

## Authentication

Most endpoints require authentication using JWT tokens.

### Login
```http
POST /auth/login
Content-Type: application/json

{
  "username": "user@example.com",
  "password": "password"
}
```

**Response:**
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

### Using Access Tokens
Include the access token in the Authorization header:
```http
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

## Endpoints

### Health Check

#### GET /health
Check if the API is running.

**Response:**
```json
{
  "status": "healthy",
  "version": "1.5.0",
  "timestamp": "2025-11-26T13:46:15Z"
}
```

---

## Prompts

### List Prompts

#### GET /prompts
Get a list of all prompts.

**Query Parameters:**
- `category` (optional): Filter by category
- `tags` (optional): Comma-separated list of tags
- `limit` (optional): Maximum number of results (default: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "prompts": [
    {
      "id": "prompt_123",
      "title": "Code Review Assistant",
      "category": "development",
      "tags": ["code", "review", "quality"],
      "description": "Reviews code for quality and best practices",
      "content": "You are a code review assistant...",
      "created_at": "2025-11-20T10:30:00Z",
      "updated_at": "2025-11-25T14:22:00Z"
    }
  ],
  "total": 42,
  "limit": 100,
  "offset": 0
}
```

### Get Prompt

#### GET /prompts/{prompt_id}
Get a specific prompt by ID.

**Response:**
```json
{
  "id": "prompt_123",
  "title": "Code Review Assistant",
  "category": "development",
  "tags": ["code", "review", "quality"],
  "description": "Reviews code for quality and best practices",
  "content": "You are a code review assistant...",
  "variables": ["code_snippet", "language"],
  "created_at": "2025-11-20T10:30:00Z",
  "updated_at": "2025-11-25T14:22:00Z"
}
```

### Create Prompt

#### POST /prompts
Create a new prompt.

**Request Body:**
```json
{
  "title": "New Prompt",
  "category": "general",
  "tags": ["test"],
  "description": "A test prompt",
  "content": "Prompt content here...",
  "variables": ["input"]
}
```

**Response:**
```json
{
  "id": "prompt_456",
  "title": "New Prompt",
  "category": "general",
  "tags": ["test"],
  "description": "A test prompt",
  "content": "Prompt content here...",
  "variables": ["input"],
  "created_at": "2025-11-26T13:46:15Z",
  "updated_at": "2025-11-26T13:46:15Z"
}
```

### Update Prompt

#### PUT /prompts/{prompt_id}
Update an existing prompt.

**Request Body:**
```json
{
  "title": "Updated Prompt Title",
  "description": "Updated description"
}
```

**Response:** Returns the updated prompt object.

### Delete Prompt

#### DELETE /prompts/{prompt_id}
Delete a prompt.

**Response:**
```json
{
  "message": "Prompt deleted successfully",
  "id": "prompt_123"
}
```

---

## Search

### Search Prompts

#### GET /search
Full-text search across prompts.

**Query Parameters:**
- `q` (required): Search query
- `category` (optional): Filter by category
- `tags` (optional): Comma-separated tags
- `owner` (optional): Filter by owner
- `limit` (optional): Results limit (default: 50)

**Response:**
```json
{
  "results": [
    {
      "id": "prompt_123",
      "title": "Code Review Assistant",
      "category": "development",
      "tags": ["code", "review"],
      "snippet": "...code <b>review</b> assistant...",
      "score": 0.95
    }
  ],
  "total": 5,
  "query": "code review",
  "took_ms": 23
}
```

---

## Agents

### List Agents

#### GET /agents
Get all agent definitions.

**Response:**
```json
{
  "agents": [
    {
      "id": "agent_critic",
      "name": "Critic Agent",
      "role": "code_reviewer",
      "description": "Reviews code quality",
      "capabilities": ["analysis", "critique"],
      "prompt_template": "agent_critic_prompt"
    }
  ]
}
```

### Get Agent

#### GET /agents/{agent_id}
Get a specific agent.

### Create Agent

#### POST /agents
Create a new agent definition.

### Update Agent

#### PUT /agents/{agent_id}
Update an agent definition.

### Delete Agent

#### DELETE /agents/{agent_id}
Delete an agent.

---

## Orchestration

### Run Orchestration

#### POST /orchestrator/run
Execute an orchestration workflow.

**Request Body:**
```json
{
  "goal": "Implement user authentication",
  "model": "gpt-4o",
  "max_iterations": 3,
  "pass_threshold": 7,
  "instructions": "Follow best practices",
  "skip_codex": false
}
```

**Response:**
```json
{
  "run_id": "run_789",
  "status": "running",
  "started_at": "2025-11-26T13:46:15Z",
  "log_url": "/orchestrator/runs/run_789/logs"
}
```

### Get Run Status

#### GET /orchestrator/runs/{run_id}
Get the status of an orchestration run.

**Response:**
```json
{
  "run_id": "run_789",
  "status": "completed",
  "started_at": "2025-11-26T13:46:15Z",
  "completed_at": "2025-11-26T13:52:30Z",
  "iterations": 2,
  "score": 8,
  "artifacts": [
    "data/artifacts/run_789_artifact_1.md"
  ]
}
```

### Stream Logs

#### GET /orchestrator/runs/{run_id}/logs
Server-Sent Events stream of run logs.

**Response:** (text/event-stream)
```
data: {"timestamp": "2025-11-26T13:46:16Z", "level": "info", "message": "Starting orchestration..."}

data: {"timestamp": "2025-11-26T13:46:18Z", "level": "info", "message": "Iteration 1 completed"}

data: {"timestamp": "2025-11-26T13:52:30Z", "level": "info", "message": "Orchestration complete"}
```

### Cancel Run

#### DELETE /orchestrator/runs/{run_id}
Cancel a running orchestration.

**Response:**
```json
{
  "message": "Run cancelled successfully",
  "run_id": "run_789"
}
```

---

## GitHub

### Clone Repository

#### POST /github/clone
Clone a GitHub repository.

**Request Body:**
```json
{
  "repo_url": "https://github.com/user/repo",
  "branch": "main",
  "target_dir": "repos/repo"
}
```

**Response:**
```json
{
  "clone_id": "clone_123",
  "status": "cloning",
  "progress_url": "/github/clone/clone_123/progress"
}
```

### Get Clone Progress

#### GET /github/clone/{clone_id}/progress
Get repository clone progress (Server-Sent Events).

### List Repositories

#### GET /github/repos
List cloned repositories.

**Response:**
```json
{
  "repositories": [
    {
      "name": "repo",
      "path": "repos/repo",
      "branch": "main",
      "last_updated": "2025-11-26T13:46:15Z"
    }
  ]
}
```

### Run Codex Swarm

#### POST /github/codex/run
Run Codex multi-agent code review.

**Request Body:**
```json
{
  "repo_path": "repos/repo",
  "agents": ["critic", "security", "lint", "test", "refactor"],
  "instructions": "Focus on security vulnerabilities"
}
```

**Response:**
```json
{
  "run_id": "codex_456",
  "status": "running",
  "agents": 5,
  "log_url": "/github/codex/runs/codex_456/logs"
}
```

### Get Codex Findings

#### GET /github/codex/runs/{run_id}/findings
Get findings from Codex swarm run.

**Response:**
```json
{
  "run_id": "codex_456",
  "findings": [
    {
      "agent": "security",
      "severity": "high",
      "file": "src/auth.py",
      "line": 42,
      "message": "Potential SQL injection vulnerability",
      "suggestion": "Use parameterized queries"
    }
  ],
  "summary": {
    "total": 15,
    "by_severity": {
      "high": 2,
      "medium": 5,
      "low": 8
    }
  }
}
```

---

## Costs

### Get Usage Stats

#### GET /costs/usage
Get API usage and cost statistics.

**Query Parameters:**
- `start_date` (optional): Filter from date (ISO 8601)
- `end_date` (optional): Filter to date (ISO 8601)

**Response:**
```json
{
  "total_tokens": 1250000,
  "total_cost": 15.75,
  "by_provider": {
    "openai": {
      "tokens": 800000,
      "cost": 10.00
    },
    "anthropic": {
      "tokens": 450000,
      "cost": 5.75
    }
  },
  "by_model": {
    "gpt-4o": {
      "tokens": 500000,
      "cost": 7.50
    }
  },
  "period": {
    "start": "2025-11-01T00:00:00Z",
    "end": "2025-11-26T23:59:59Z"
  }
}
```

---

## Error Responses

All endpoints may return error responses with the following structure:

```json
{
  "error": {
    "code": "not_found",
    "message": "Prompt not found",
    "details": {
      "prompt_id": "prompt_123"
    }
  }
}
```

### Common Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 400 | `bad_request` | Invalid request parameters |
| 401 | `unauthorized` | Missing or invalid authentication |
| 403 | `forbidden` | Insufficient permissions |
| 404 | `not_found` | Resource not found |
| 409 | `conflict` | Resource already exists |
| 429 | `rate_limited` | Too many requests |
| 500 | `internal_error` | Server error |

---

## Rate Limiting

API requests are rate-limited to prevent abuse:
- **Authenticated users**: 1000 requests per hour
- **Anonymous users**: 100 requests per hour

Rate limit headers are included in responses:
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 995
X-RateLimit-Reset: 1700000000
```

---

## Pagination

List endpoints support pagination using `limit` and `offset`:

```http
GET /prompts?limit=20&offset=40
```

Responses include pagination metadata:
```json
{
  "data": [...],
  "total": 150,
  "limit": 20,
  "offset": 40,
  "has_more": true
}
```

---

## Interactive API Documentation

For interactive API documentation with try-it-out functionality:

**Swagger UI**: http://localhost:8000/docs
**ReDoc**: http://localhost:8000/redoc
