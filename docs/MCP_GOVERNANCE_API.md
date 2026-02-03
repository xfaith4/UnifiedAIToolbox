# MCP Governance API Endpoints

This document specifies all REST API endpoints for MCP (Model Context Protocol) governance.

## Base URL

All endpoints are prefixed with `/api/mcp`

Example: `http://localhost:8000/api/mcp/health`

---

## Table of Contents

1. [Registry Management](#registry-management)
2. [Server Search & Browse](#server-search--browse)
3. [Collections (CRUD)](#collections-crud)
4. [Install Records (CRUD)](#install-records-crud)
5. [Allowlists (CRUD)](#allowlists-crud)
6. [Audit Logs](#audit-logs)

---

## Registry Management

### Sync Registry from External Sources

Discover and ingest MCP servers from external registries.

- **Endpoint**: `POST /api/mcp/registry/sync`
- **Method**: POST
- **Authentication**: Required (admin)

**Request Body**:
```json
{
  "source_id": "official",  // Optional: specific source, null = all
  "force": false            // Force refresh even if recently synced
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "servers_added": 5,
  "servers_updated": 3,
  "servers_total": 15,
  "source_id": "official",
  "synced_at": "2026-02-03T03:47:33.537Z",
  "errors": []
}
```

---

### List Registry Sources

Get all configured external registry sources.

- **Endpoint**: `GET /api/mcp/registry/sources`
- **Method**: GET
- **Authentication**: Required

**Response** (200 OK):
```json
[
  {
    "source_id": "official",
    "source_type": "official",
    "url": "https://registry.modelcontextprotocol.io/v1/servers",
    "enabled": true,
    "metadata": {}
  },
  {
    "source_id": "github-mcp-servers",
    "source_type": "github",
    "url": "https://github.com/topics/mcp-server",
    "enabled": true,
    "metadata": {"topic": "mcp-server"}
  }
]
```

---

### Add Registry Source

Configure a new external source for MCP server discovery.

- **Endpoint**: `POST /api/mcp/registry/sources`
- **Method**: POST
- **Authentication**: Required (admin)

**Request Body**:
```json
{
  "source_id": "custom-registry",
  "source_type": "custom",
  "url": "https://my-company.com/mcp-registry.json",
  "enabled": true,
  "metadata": {}
}
```

**Response** (201 Created):
```json
{
  "source_id": "custom-registry",
  "source_type": "custom",
  "url": "https://my-company.com/mcp-registry.json",
  "enabled": true,
  "metadata": {}
}
```

---

## Server Search & Browse

### Search MCP Servers

Search and filter available MCP servers (both catalog and installed).

- **Endpoint**: `POST /api/mcp/servers/search`
- **Method**: POST
- **Authentication**: Required

**Request Body**:
```json
{
  "query": "browser automation",  // Optional: text search
  "tags": ["demo", "ui"],         // Optional: filter by tags
  "capabilities": ["browser-automation"],  // Optional: filter by capabilities
  "status": "available",          // Optional: available, experimental, offline
  "installation_status": "installed",  // Optional: installed, catalog, deprecated
  "limit": 50,
  "offset": 0
}
```

**Response** (200 OK):
```json
{
  "results": [
    {
      "server_id": "stagehand-browser",
      "name": "Stagehand Browser MCP",
      "description": "Browser automation with Playwright-like tools",
      "url": "http://localhost:3000/mcp",
      "tags": ["demo", "ui"],
      "capabilities": ["browser-automation", "playwright"],
      "status": "experimental",
      "installation_status": "installed",
      "owner": "platform"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

---

### Get Server Details

Get full details of a specific MCP server.

- **Endpoint**: `GET /api/mcp/servers/{server_id}`
- **Method**: GET
- **Authentication**: Required

**Response** (200 OK):
```json
{
  "server_id": "local-filesystem",
  "name": "Local Filesystem MCP",
  "url": "http://localhost:5174/mcp",
  "transport": "sse",
  "description": "Local file system and search MCP",
  "capabilities": ["filesystem", "search"],
  "tags": ["default", "local", "safe"],
  "status": "available",
  "installation_status": "installed",
  "owner": "platform",
  "auth": {
    "type": "none"
  },
  "health_check": {
    "status": "healthy",
    "last_checked": "2026-02-03T03:40:00Z",
    "latency_ms": 15
  }
}
```

---

## Collections (CRUD)

Collections group related MCP servers for easier management.

### List Collections

- **Endpoint**: `GET /api/mcp/collections`
- **Method**: GET
- **Query Parameters**:
  - `tag` (optional): Filter by tag
  - `limit` (default: 50, max: 200)
  - `offset` (default: 0)
- **Authentication**: Required

**Response** (200 OK):
```json
[
  {
    "collection_id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Data Analysis Tools",
    "description": "MCP servers for data analysis and visualization",
    "server_ids": ["postgres-sql", "context-optimizer"],
    "tags": ["data", "analytics"],
    "created_at": "2026-02-01T10:00:00Z",
    "created_by": "admin",
    "updated_at": null,
    "metadata": {}
  }
]
```

---

### Create Collection

- **Endpoint**: `POST /api/mcp/collections`
- **Method**: POST
- **Authentication**: Required

**Request Body**:
```json
{
  "name": "Web Research",
  "description": "Tools for web scraping and research",
  "server_ids": ["firecrawl", "git-ingest"],
  "tags": ["web", "research"]
}
```

**Response** (201 Created):
```json
{
  "collection_id": "660e8400-e29b-41d4-a716-446655440001",
  "name": "Web Research",
  "description": "Tools for web scraping and research",
  "server_ids": ["firecrawl", "git-ingest"],
  "tags": ["web", "research"],
  "created_at": "2026-02-03T03:47:33Z",
  "created_by": "admin",
  "updated_at": null,
  "metadata": {}
}
```

---

### Get Collection

- **Endpoint**: `GET /api/mcp/collections/{collection_id}`
- **Method**: GET
- **Authentication**: Required

**Response** (200 OK): Same as Create response

---

### Update Collection

- **Endpoint**: `PUT /api/mcp/collections/{collection_id}`
- **Method**: PUT
- **Authentication**: Required

**Request Body** (all fields optional):
```json
{
  "name": "Web Research & Scraping",
  "description": "Updated description",
  "server_ids": ["firecrawl", "git-ingest", "context-optimizer"],
  "tags": ["web", "research", "data"]
}
```

**Response** (200 OK): Updated collection object

---

### Delete Collection

- **Endpoint**: `DELETE /api/mcp/collections/{collection_id}`
- **Method**: DELETE
- **Authentication**: Required

**Response** (204 No Content)

---

## Install Records (CRUD)

Install records track which MCP servers are installed and their enablement status.

### List Install Records

- **Endpoint**: `GET /api/mcp/installs`
- **Method**: GET
- **Query Parameters**:
  - `status` (optional): Filter by status (enabled, disabled, pending, failed, deprecated)
  - `limit` (default: 50, max: 200)
  - `offset` (default: 0)
- **Authentication**: Required

**Response** (200 OK):
```json
[
  {
    "install_id": "770e8400-e29b-41d4-a716-446655440002",
    "server_id": "local-filesystem",
    "status": "enabled",
    "installed_at": "2026-02-01T10:00:00Z",
    "installed_by": "admin",
    "enabled_at": "2026-02-01T10:00:00Z",
    "disabled_at": null,
    "version": "1.0.0",
    "config": {},
    "metadata": {},
    "notes": "Default filesystem MCP"
  }
]
```

---

### Create Install Record (Install Server)

- **Endpoint**: `POST /api/mcp/installs`
- **Method**: POST
- **Authentication**: Required (admin)

**Request Body**:
```json
{
  "server_id": "stagehand-browser",
  "config": {
    "max_sessions": 3,
    "timeout_ms": 30000
  },
  "notes": "For UI automation testing"
}
```

**Response** (201 Created):
```json
{
  "install_id": "880e8400-e29b-41d4-a716-446655440003",
  "server_id": "stagehand-browser",
  "status": "pending",
  "installed_at": "2026-02-03T03:47:33Z",
  "installed_by": "admin",
  "enabled_at": null,
  "disabled_at": null,
  "version": null,
  "config": {
    "max_sessions": 3,
    "timeout_ms": 30000
  },
  "metadata": {},
  "notes": "For UI automation testing"
}
```

---

### Get Install Record

- **Endpoint**: `GET /api/mcp/installs/{install_id}`
- **Method**: GET
- **Authentication**: Required

**Response** (200 OK): Install record object

---

### Update Install Record

- **Endpoint**: `PUT /api/mcp/installs/{install_id}`
- **Method**: PUT
- **Authentication**: Required (admin)

**Request Body** (all fields optional):
```json
{
  "status": "enabled",
  "config": {
    "max_sessions": 5
  },
  "notes": "Increased max sessions"
}
```

**Response** (200 OK): Updated install record

---

### Enable Install

Convenience endpoint to enable a disabled server.

- **Endpoint**: `POST /api/mcp/installs/{install_id}/enable`
- **Method**: POST
- **Authentication**: Required (admin)

**Response** (200 OK): Install record with status = "enabled"

---

### Disable Install

Convenience endpoint to disable an enabled server.

- **Endpoint**: `POST /api/mcp/installs/{install_id}/disable`
- **Method**: POST
- **Authentication**: Required (admin)

**Response** (200 OK): Install record with status = "disabled"

---

## Allowlists (CRUD)

Allowlists control which MCP servers/tools are available for specific scopes (run, job, user, global).

### List Allowlists

- **Endpoint**: `GET /api/mcp/allowlists`
- **Method**: GET
- **Query Parameters**:
  - `scope` (optional): Filter by scope (run, job, user, global)
  - `scope_id` (optional): Filter by scope ID
  - `limit` (default: 50, max: 200)
  - `offset` (default: 0)
- **Authentication**: Required

**Response** (200 OK):
```json
[
  {
    "allowlist_id": "990e8400-e29b-41d4-a716-446655440004",
    "scope": "run",
    "scope_id": "run-abc123",
    "allowed_servers": ["local-filesystem"],
    "allowed_collections": ["data-analysis"],
    "allowed_tools": null,
    "denied_servers": [],
    "denied_tools": ["stagehand-browser:screenshot"],
    "created_at": "2026-02-03T03:00:00Z",
    "created_by": "admin",
    "expires_at": "2026-02-04T03:00:00Z",
    "metadata": {}
  }
]
```

---

### Create Allowlist

- **Endpoint**: `POST /api/mcp/allowlists`
- **Method**: POST
- **Authentication**: Required

**Request Body**:
```json
{
  "scope": "job",
  "scope_id": "nightly-sync",
  "allowed_servers": ["postgres-sql", "firecrawl"],
  "allowed_collections": [],
  "allowed_tools": null,
  "denied_servers": [],
  "denied_tools": [],
  "expires_at": null
}
```

**Response** (201 Created): Allowlist object

---

### Get Allowlist

- **Endpoint**: `GET /api/mcp/allowlists/{allowlist_id}`
- **Method**: GET
- **Authentication**: Required

**Response** (200 OK): Allowlist object

---

### Update Allowlist

- **Endpoint**: `PUT /api/mcp/allowlists/{allowlist_id}`
- **Method**: PUT
- **Authentication**: Required

**Request Body** (all fields optional):
```json
{
  "allowed_servers": ["postgres-sql", "firecrawl", "git-ingest"],
  "expires_at": "2026-03-01T00:00:00Z"
}
```

**Response** (200 OK): Updated allowlist

---

### Delete Allowlist

- **Endpoint**: `DELETE /api/mcp/allowlists/{allowlist_id}`
- **Method**: DELETE
- **Authentication**: Required

**Response** (204 No Content)

---

### Bind Allowlist to Scope

Convenience endpoint to create and bind an allowlist in one operation.

- **Endpoint**: `POST /api/mcp/allowlists/bind`
- **Method**: POST
- **Query Parameters**:
  - `scope`: Scope type (run, job, user, global)
  - `scope_id`: Scope identifier
- **Authentication**: Required

**Request Body**:
```json
{
  "allowed_servers": ["local-filesystem"],
  "allowed_collections": [],
  "allowed_tools": null,
  "denied_servers": [],
  "denied_tools": [],
  "expires_at": null
}
```

**Response** (201 Created): Allowlist object with bound scope

---

## Audit Logs

### Query Audit Logs

Search audit events with flexible filtering.

- **Endpoint**: `POST /api/mcp/audit/query`
- **Method**: POST
- **Authentication**: Required

**Request Body**:
```json
{
  "event_types": ["policy.allow", "tool.call.executed"],
  "run_id": "run-abc123",
  "job_id": null,
  "user_id": "admin",
  "server_id": "local-filesystem",
  "tool_name": "read_file",
  "decision": "allow",
  "start_time": "2026-02-03T00:00:00Z",
  "end_time": "2026-02-03T23:59:59Z",
  "limit": 100,
  "offset": 0
}
```

**Response** (200 OK):
```json
[
  {
    "event_id": "aa0e8400-e29b-41d4-a716-446655440005",
    "event_type": "tool.call.allowed",
    "timestamp": "2026-02-03T03:47:33Z",
    "run_id": "run-abc123",
    "job_id": null,
    "user_id": "admin",
    "server_id": "local-filesystem",
    "tool_name": "read_file",
    "decision": "allow",
    "reason": "Server 'local-filesystem' is in allowed_servers",
    "policy_name": "default",
    "request_payload": {
      "path": "/data/config.json"
    },
    "response_payload": null,
    "redacted_fields": [],
    "duration_ms": 2.5,
    "metadata": {
      "matched_allowlist": "990e8400-e29b-41d4-a716-446655440004",
      "matched_rule": "allowed_servers"
    },
    "tags": []
  }
]
```

---

### Get Audit Event

Get a specific audit event by ID.

- **Endpoint**: `GET /api/mcp/audit/events/{event_id}`
- **Method**: GET
- **Authentication**: Required

**Response** (200 OK): Audit event object

---

### Get Audit Summary

Get summary statistics for audit logs.

- **Endpoint**: `GET /api/mcp/audit/summary`
- **Method**: GET
- **Query Parameters**:
  - `start_time` (optional): Start of time range
  - `end_time` (optional): End of time range
  - `run_id` (optional): Filter by run
  - `user_id` (optional): Filter by user
- **Authentication**: Required

**Response** (200 OK):
```json
{
  "total_events": 1547,
  "policy_decisions": 234,
  "tools_allowed": 189,
  "tools_denied": 45,
  "tools_executed": 185,
  "tools_failed": 4,
  "unique_servers": 5,
  "unique_users": 3,
  "time_range_start": "2026-02-01T00:00:00Z",
  "time_range_end": "2026-02-03T23:59:59Z"
}
```

---

## Health Check

### MCP Governance Health

Check if MCP governance system is operational.

- **Endpoint**: `GET /api/mcp/health`
- **Method**: GET
- **Authentication**: Not required

**Response** (200 OK):
```json
{
  "status": "healthy",
  "policy_engine": "operational",
  "audit_logger": "operational",
  "timestamp": "2026-02-03T03:47:33Z"
}
```

---

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "detail": "Invalid request body: missing required field 'scope_id'"
}
```

### 401 Unauthorized
```json
{
  "detail": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "detail": "Insufficient permissions"
}
```

### 404 Not Found
```json
{
  "detail": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "detail": "Internal server error"
}
```
