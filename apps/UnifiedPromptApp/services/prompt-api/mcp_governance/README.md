# MCP Governance System

A comprehensive policy enforcement, audit logging, and access control system for MCP (Model Context Protocol) servers in UnifiedAIToolbox.

## Overview

The MCP Governance system provides enterprise-grade security and compliance for MCP tool invocations:

- ✅ **Deny by Default**: Explicit allowlist required for all tool calls
- ✅ **Policy Engine**: Pluggable policy evaluation with clear deny reasons
- ✅ **Runtime Enforcement**: Intercepts and blocks unauthorized tool calls
- ✅ **Audit Logging**: Complete trail of all decisions and executions
- ✅ **Data Redaction**: Automatic masking of sensitive fields (API keys, passwords, etc.)
- ✅ **Collection Management**: Group servers for easier policy application
- ✅ **Scope-based Access**: Run, job, user, and global allowlists

## Quick Start

### 1. Import the Governance System

```python
from mcp_governance.policy_engine import DefaultPolicyEngine, RunContext, ToolCallRequest
from mcp_governance.runtime_enforcer import create_runtime_enforcer
```

### 2. Set Up Policy Engine

```python
# Load install records, allowlists, and collections from storage
install_records = {...}  # Dict of server_id -> InstallRecord
allowlists = {...}       # Dict of allowlist_id -> Allowlist
collections = {...}      # Dict of collection_id -> Collection

# Create policy engine
policy_engine = DefaultPolicyEngine(
    install_records=install_records,
    allowlists=allowlists,
    collections=collections
)

# Create runtime enforcer
enforcer = create_runtime_enforcer(policy_engine, audit_log_dir="./data/audit")
```

### 3. Enforce Policy on Tool Calls

```python
# Define context and request
context = RunContext(
    run_id="run-abc123",
    user_id="admin",
    scope_type="run",
    scope_id="run-abc123"
)

request = ToolCallRequest(
    server_id="local-filesystem",
    tool_name="read_file",
    arguments={"path": "/data/config.json"}
)

# Enforce policy
enforcement_result = enforcer.enforce_tool_call(context, request)

if enforcement_result.allowed:
    # Execute tool
    response = mcp_client.call_tool(...)
    
    # Log execution
    enforcer.log_tool_execution(
        context, request, response,
        success=True, duration_ms=125,
        enforcement_result=enforcement_result
    )
else:
    # Blocked by policy
    raise PolicyDeniedError(enforcement_result.policy_result.reason)
```

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────┐
│                    FastAPI Backend                      │
│                     (Port 8000)                         │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │         MCP Governance API                       │  │
│  │         /api/mcp/*                               │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Policy     │  │   Runtime    │  │    Audit     │ │
│  │   Engine     │  │   Enforcer   │  │    Logger    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Data Models

- **InstallRecord**: Tracks installed MCP servers and their enablement status
- **Collection**: Groups related servers for easier management
- **Allowlist**: Controls which servers/tools are accessible per scope
- **AuditEvent**: Records all policy decisions and tool executions

### Policy Evaluation Flow

1. **Check Installation**: Is the server installed and enabled?
2. **Find Allowlist**: Search run → job → user → global
3. **Check Denials**: Any explicit denials?
4. **Check Allows**: Is server/tool in allowlist?
5. **Detect Sensitive Data**: Mark fields for redaction
6. **Make Decision**: Allow or deny with clear reason

## Module Structure

```
mcp_governance/
├── __init__.py                 # Module initialization
├── models.py                   # Pydantic data models
├── policy_engine.py            # Policy evaluation logic
├── runtime_enforcer.py         # Runtime enforcement & audit logging
├── api_routes.py               # FastAPI REST endpoints
├── test_policy_engine.py       # Unit tests
└── demo_policy_engine.py       # Demonstration script
```

## Documentation

- **[MCP_GOVERNANCE_API.md](../../../docs/MCP_GOVERNANCE_API.md)** - Complete REST API reference
- **[MCP_GOVERNANCE_SEQUENCE_DIAGRAM.md](../../../docs/MCP_GOVERNANCE_SEQUENCE_DIAGRAM.md)** - Detailed flow diagrams
- **[MCP_GOVERNANCE_DESIGN.md](../../../docs/MCP_GOVERNANCE_DESIGN.md)** - Comprehensive design document

## API Endpoints

### Registry Management
- `POST /api/mcp/registry/sync` - Sync from external registries
- `GET /api/mcp/registry/sources` - List registry sources
- `POST /api/mcp/registry/sources` - Add registry source

### Server Search & Browse
- `POST /api/mcp/servers/search` - Search MCP servers
- `GET /api/mcp/servers/{server_id}` - Get server details

### Collections (CRUD)
- `GET /api/mcp/collections` - List collections
- `POST /api/mcp/collections` - Create collection
- `GET /api/mcp/collections/{id}` - Get collection
- `PUT /api/mcp/collections/{id}` - Update collection
- `DELETE /api/mcp/collections/{id}` - Delete collection

### Install Records (CRUD)
- `GET /api/mcp/installs` - List installs
- `POST /api/mcp/installs` - Install server
- `POST /api/mcp/installs/{id}/enable` - Enable server
- `POST /api/mcp/installs/{id}/disable` - Disable server

### Allowlists (CRUD)
- `GET /api/mcp/allowlists` - List allowlists
- `POST /api/mcp/allowlists` - Create allowlist
- `POST /api/mcp/allowlists/bind` - Bind to scope

### Audit Logs
- `POST /api/mcp/audit/query` - Query audit events
- `GET /api/mcp/audit/summary` - Get audit summary

## Running the Demo

The demo script demonstrates all key features:

```bash
cd apps/UnifiedPromptApp/services/prompt-api
python mcp_governance/demo_policy_engine.py
```

**Demonstrations include**:
1. Basic policy evaluation (allow/deny)
2. Sensitive field detection and redaction
3. Collection-based allowlisting
4. Runtime enforcement with audit logging

## Running Tests

Unit tests cover policy engine logic:

```bash
cd apps/UnifiedPromptApp/services/prompt-api
python -m pytest mcp_governance/test_policy_engine.py -v
```

**Test coverage**:
- Installation status checks
- Allowlist matching (run/job/user/global)
- Denial checks (explicit denials)
- Allow checks (servers, collections, tools)
- Sensitive field detection
- Policy result structure

## Security Features

### Deny by Default
All tool calls are denied unless explicitly allowed in an allowlist.

### Fail-Secure
Policy evaluation errors result in denial, not allowance.

### Sensitive Data Redaction
Fields matching these patterns are automatically redacted:
- `api[_-]?key`
- `secret`
- `password`
- `token`
- `credential`
- `auth`
- `bearer`

**Redaction methods**:
- `mask`: Replace with `***REDACTED***`
- `hash`: One-way hash (first 16 chars)
- `remove`: Remove field entirely
- `partial`: Show first/last characters only

### Audit Trail
Every policy decision and tool execution is logged:
- Event type (allow, deny, executed, failed)
- Timestamp and duration
- User, run, and server context
- Decision reason
- Redacted request/response payloads

## Integration with Existing Stack

### Aligns with Stage 0 Architecture
- ✅ Reuses existing MCP registry (`/data/mcp/servers.json`)
- ✅ Extends `MCPServer` model from orchestration-bridge
- ✅ Follows FastAPI patterns in `app.py`
- ✅ Uses SQLite/JSONL like orchestrator_logger.py
- ✅ Compatible with existing auth system

### Integration Points

**FastAPI Backend**:
```python
from mcp_governance.api_routes import router as mcp_router
app.include_router(mcp_router)
```

**Orchestrator** (before MCP calls):
```python
from mcp_governance.runtime_enforcer import create_runtime_enforcer
enforcer = create_runtime_enforcer(policy_engine)
enforcement_result = enforcer.enforce_tool_call(context, request)
```

## Performance

Expected latency per operation:
- Policy evaluation: < 5ms
- Audit event write: < 2ms
- Full enforcement check: < 10ms

## Future Enhancements

Potential extensions for future releases:
1. **Policy as Code**: YAML/Python policy definitions
2. **Risk Scoring**: ML-based risk assessment
3. **Rate Limiting**: Per-user/server limits
4. **Real-time Alerts**: Suspicious activity notifications
5. **Web UI**: Visual policy editor and audit viewer
6. **RBAC**: Role-based access control for admin operations

## License

Part of UnifiedAIToolbox - MIT License

## Support

For issues, questions, or contributions:
- **Documentation**: See `docs/` directory
- **Issues**: [GitHub Issues](https://github.com/xfaith4/UnifiedAIToolbox/issues)
- **Discussions**: [GitHub Discussions](https://github.com/xfaith4/UnifiedAIToolbox/discussions)
