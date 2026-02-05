# MCP Governance Backend Contracts - Design Document

**Date**: 2026-02-03  
**Version**: 1.0  
**Status**: Design Complete

---

## Executive Summary

This document defines the core backend contracts for the MCP (Model Context Protocol) governance system in UnifiedAIToolbox. The design provides comprehensive policy enforcement, audit logging, and access control for MCP server and tool invocations.

### Key Deliverables

✅ **API Endpoint Specifications** - Complete REST API for registry, servers, collections, installs, allowlists, and audit logs  
✅ **Policy Engine Interface** - Abstract policy engine with default implementation (deny by default)  
✅ **Runtime Enforcement Integration** - Clear integration points for intercepting tool calls  
✅ **Data Models** - Pydantic models aligned with FastAPI/SQLite stack  
✅ **Audit Event Schema** - Comprehensive audit logging with redaction rules  
✅ **Sequence Diagram** - Complete tool call → policy → audit flow  

---

## System Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Backend                          │
│                     (Port 8000)                             │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         MCP Governance API                           │  │
│  │         /api/mcp/*                                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Policy     │  │   Runtime    │  │    Audit     │    │
│  │   Engine     │  │   Enforcer   │  │    Logger    │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
│         │                  │                  │            │
└─────────┼──────────────────┼──────────────────┼────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐
│  Install        │  │  MCP Servers    │  │  Audit DB    │
│  Records        │  │  & Allowlists   │  │  (JSONL)     │
│  (SQLite/JSON)  │  │  (JSON)         │  │              │
└─────────────────┘  └─────────────────┘  └──────────────┘
```

---

## Data Models

### Install Records

Tracks installation and enablement status of MCP servers.

**Schema**: [`InstallRecord`](../apps/UnifiedPromptApp/services/prompt-api/mcp_governance/models.py)

**Key Fields**:
- `install_id`: Unique identifier
- `server_id`: Reference to MCP server
- `status`: enabled | disabled | pending | failed | deprecated
- `installed_at`, `enabled_at`, `disabled_at`: Timestamps
- `config`: Server-specific configuration

**Use Cases**:
- Track which servers are installed
- Enable/disable servers dynamically
- Store server-specific configuration

---

### Collections

Named groups of MCP servers for easier management.

**Schema**: [`Collection`](../apps/UnifiedPromptApp/services/prompt-api/mcp_governance/models.py)

**Key Fields**:
- `collection_id`: Unique identifier
- `name`: Human-readable name
- `server_ids`: List of MCP server IDs
- `tags`: Tags for filtering

**Use Cases**:
- Group related servers (e.g., "data-analysis", "web-automation")
- Apply policies to multiple servers at once
- Simplify allowlist management

---

### Allowlists

Control which MCP servers/tools are available for specific scopes.

**Schema**: [`Allowlist`](../apps/UnifiedPromptApp/services/prompt-api/mcp_governance/models.py)

**Key Fields**:
- `allowlist_id`: Unique identifier
- `scope`: run | job | user | global
- `scope_id`: ID of the run, job, user, or "global"
- `allowed_servers`: List of allowed server IDs
- `allowed_collections`: List of allowed collection IDs
- `allowed_tools`: Optional list of specific tools (format: "server_id:tool_name")
- `denied_servers`, `denied_tools`: Explicit denials
- `expires_at`: Optional expiration time

**Use Cases**:
- Enforce least privilege (deny by default)
- Scope access to specific runs/jobs
- Temporarily grant access with expiration
- Explicitly deny dangerous tools

---

### Audit Events

Comprehensive logging of all policy decisions and tool invocations.

**Schema**: [`AuditEvent`](../apps/UnifiedPromptApp/services/prompt-api/mcp_governance/models.py)

**Key Fields**:
- `event_id`: Unique identifier
- `event_type`: Enum (policy.allow, tool.call.executed, etc.)
- `timestamp`: When event occurred
- `run_id`, `job_id`, `user_id`: Context
- `server_id`, `tool_name`: What was accessed
- `decision`: allow | deny
- `reason`: Human-readable explanation
- `policy_name`: Which policy made the decision
- `request_payload`, `response_payload`: Request/response (redacted)
- `redacted_fields`: List of redacted field paths
- `duration_ms`: Performance tracking

**Use Cases**:
- Security audit trail
- Compliance reporting
- Debugging policy issues
- Performance monitoring

---

## Policy Engine Interface

### Abstract Base Class

**File**: [`policy_engine.py`](../apps/UnifiedPromptApp/services/prompt-api/mcp_governance/policy_engine.py)

```python
class PolicyEngine(ABC):
    @abstractmethod
    def evaluate(
        self,
        context: RunContext,
        request: ToolCallRequest
    ) -> PolicyResult:
        """Evaluate a tool call request."""
        pass
```

### Input: RunContext

Provides context about who is making the request:

```python
@dataclass
class RunContext:
    run_id: Optional[str]
    job_id: Optional[str]
    user_id: str
    scope_type: str  # run, job, user, global
    scope_id: str
    agent_id: Optional[str]
    metadata: Dict[str, Any]
```

### Input: ToolCallRequest

Describes the tool being called:

```python
@dataclass
class ToolCallRequest:
    server_id: str
    tool_name: str
    arguments: Dict[str, Any]
    server_capabilities: List[str]
    metadata: Dict[str, Any]
```

### Output: PolicyResult

Decision with reasoning and redaction directives:

```python
@dataclass
class PolicyResult:
    decision: PolicyDecision  # ALLOW | DENY
    reason: str
    policy_name: str
    
    # Redaction directives
    redact_request_fields: List[str]
    redact_response_fields: List[str]
    redaction_method: RedactionDirective  # MASK | HASH | REMOVE | PARTIAL
    
    # Metadata
    matched_allowlist: Optional[str]
    matched_rule: Optional[str]
    risk_score: Optional[float]
```

---

## Default Policy Engine

**Implementation**: [`DefaultPolicyEngine`](../apps/UnifiedPromptApp/services/prompt-api/mcp_governance/policy_engine.py)

### Evaluation Logic

**Default Behavior**: DENY (fail-secure)

**Evaluation Steps**:

1. **Check Installation Status**
   - Verify server is installed
   - Verify status = "enabled"
   - ❌ DENY if not installed or disabled

2. **Find Applicable Allowlist**
   - Search order: run → job → user → global
   - Check expiration
   - ❌ DENY if no allowlist found

3. **Check Explicit Denials**
   - Check `denied_servers` list
   - Check `denied_tools` list
   - ❌ DENY if explicitly denied

4. **Check Explicit Allows**
   - Check `allowed_servers` list
   - Check `allowed_collections` list
   - If `allowed_tools` specified, verify tool in list
   - ❌ DENY if not in allowlist

5. **Detect Sensitive Fields**
   - Scan argument keys for patterns (api_key, secret, password, etc.)
   - Mark fields for redaction
   - ✅ ALLOW with redaction

### Redaction Patterns

Default patterns for sensitive field detection:

- `api[_-]?key`
- `secret`
- `password`
- `token`
- `credential`
- `auth`
- `bearer`

---

## Runtime Enforcement Integration

### RuntimeEnforcer

**File**: [`runtime_enforcer.py`](../apps/UnifiedPromptApp/services/prompt-api/mcp_governance/runtime_enforcer.py)

**Purpose**: Intercepts tool calls, enforces policy, logs audit events.

### Integration Point 1: Pre-Execution Check

**Before** invoking any MCP tool:

```python
from mcp_governance.runtime_enforcer import RuntimeEnforcer

enforcer = RuntimeEnforcer(policy_engine, audit_logger)

# Check policy
enforcement_result = enforcer.enforce_tool_call(context, request)

if enforcement_result.allowed:
    # Proceed with tool execution
    response = mcp_client.call_tool(...)
else:
    # Blocked by policy
    raise PolicyDeniedError(enforcement_result.policy_result.reason)
```

### Integration Point 2: Post-Execution Logging

**After** executing an MCP tool:

```python
# Log execution result
enforcer.log_tool_execution(
    context,
    request,
    response,
    success=True,
    duration_ms=125.0,
    enforcement_result
)
```

### Integration Point 3: Simplified Helper

For convenience, use `enforce_and_execute()`:

```python
from mcp_governance.runtime_enforcer import enforce_and_execute

response = enforce_and_execute(
    enforcer,
    context,
    request,
    execute_fn=lambda: mcp_client.call_tool(...)
)
```

---

## API Endpoints

### Complete Endpoint Table

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| **Registry Management** |
| `/api/mcp/registry/sync` | POST | Sync registry from external sources | Admin |
| `/api/mcp/registry/sources` | GET | List registry sources | Required |
| `/api/mcp/registry/sources` | POST | Add registry source | Admin |
| **Server Search & Browse** |
| `/api/mcp/servers/search` | POST | Search MCP servers | Required |
| `/api/mcp/servers/{server_id}` | GET | Get server details | Required |
| **Collections (CRUD)** |
| `/api/mcp/collections` | GET | List collections | Required |
| `/api/mcp/collections` | POST | Create collection | Required |
| `/api/mcp/collections/{id}` | GET | Get collection | Required |
| `/api/mcp/collections/{id}` | PUT | Update collection | Required |
| `/api/mcp/collections/{id}` | DELETE | Delete collection | Required |
| **Install Records (CRUD)** |
| `/api/mcp/installs` | GET | List install records | Required |
| `/api/mcp/installs` | POST | Install MCP server | Admin |
| `/api/mcp/installs/{id}` | GET | Get install record | Required |
| `/api/mcp/installs/{id}` | PUT | Update install record | Admin |
| `/api/mcp/installs/{id}/enable` | POST | Enable server | Admin |
| `/api/mcp/installs/{id}/disable` | POST | Disable server | Admin |
| **Allowlists (CRUD)** |
| `/api/mcp/allowlists` | GET | List allowlists | Required |
| `/api/mcp/allowlists` | POST | Create allowlist | Required |
| `/api/mcp/allowlists/{id}` | GET | Get allowlist | Required |
| `/api/mcp/allowlists/{id}` | PUT | Update allowlist | Required |
| `/api/mcp/allowlists/{id}` | DELETE | Delete allowlist | Required |
| `/api/mcp/allowlists/bind` | POST | Bind allowlist to scope | Required |
| **Audit Logs** |
| `/api/mcp/audit/query` | POST | Query audit events | Required |
| `/api/mcp/audit/events/{id}` | GET | Get audit event | Required |
| `/api/mcp/audit/summary` | GET | Get audit summary | Required |
| **Health Check** |
| `/api/mcp/health` | GET | Health check | Public |

**Full Documentation**: [MCP_GOVERNANCE_API.md](MCP_GOVERNANCE_API.md)

---

## Audit Event Schema & Redaction

### Event Types

```python
class AuditEventType(str, Enum):
    # MCP lifecycle
    MCP_SERVER_DISCOVERED = "mcp.server.discovered"
    MCP_SERVER_INSTALLED = "mcp.server.installed"
    MCP_SERVER_ENABLED = "mcp.server.enabled"
    MCP_SERVER_DISABLED = "mcp.server.disabled"
    
    # Policy decisions
    POLICY_ALLOW = "policy.allow"
    POLICY_DENY = "policy.deny"
    
    # Tool invocations
    TOOL_CALL_REQUESTED = "tool.call.requested"
    TOOL_CALL_ALLOWED = "tool.call.allowed"
    TOOL_CALL_DENIED = "tool.call.denied"
    TOOL_CALL_EXECUTED = "tool.call.executed"
    TOOL_CALL_FAILED = "tool.call.failed"
    
    # Collections & allowlists
    COLLECTION_CREATED = "collection.created"
    ALLOWLIST_CREATED = "allowlist.created"
    # ... etc
```

### Redaction Rules

**Purpose**: Protect sensitive data in audit logs

**Redaction Methods**:

| Method | Description | Example |
|--------|-------------|---------|
| `mask` | Replace with asterisks | `sk-1234` → `***REDACTED***` |
| `hash` | One-way hash (16 chars) | `sk-1234` → `a1b2c3d4e5f6g7h8` |
| `remove` | Remove field entirely | Field not in payload |
| `partial` | Show first/last chars | `sk-1234567890` → `sk***90` |

**Default Patterns**: See [Default Policy Engine](#default-policy-engine)

**Example Redacted Event**:

```json
{
  "event_id": "...",
  "event_type": "tool.call.allowed",
  "request_payload": {
    "api_key": "***REDACTED***",
    "query": "list files"
  },
  "redacted_fields": ["api_key"],
  "redaction_method": "mask"
}
```

---

## Sequence Diagram

### Tool Call → Policy → Audit Flow

**Full Diagram**: [MCP_GOVERNANCE_SEQUENCE_DIAGRAM.md](MCP_GOVERNANCE_SEQUENCE_DIAGRAM.md)

**Summary**:

1. **Orchestrator** initiates tool call with context
2. **RuntimeEnforcer** intercepts and evaluates policy
3. **PolicyEngine** checks installation, allowlist, denials, allows
4. **AuditLogger** logs policy decision (allow/deny)
5. **MCP Server** executes tool (if allowed)
6. **RuntimeEnforcer** logs execution result
7. **Orchestrator** receives response (redacted if needed)

---

## Alignment with Stage 0 Architecture

### Current MCP Integration (Stage 0)

From [ARCHITECTURE_FACTS.md](ARCHITECTURE_FACTS.md):

- **MCP Registry**: `/data/mcp/servers.json`
- **Schema**: `MCPServer` and `MCPRegistry` in `/apps/orchestration-bridge/src/models.py`
- **Access Pattern**: `from src.utils.mcp_registry import resolve_servers`
- **Current Catalog**: 10 curated MCP servers
- **Transport**: SSE (Server-Sent Events)
- **Auth Strategies**: none, token_env, basic

### How This Design Integrates

✅ **Reuses existing MCP registry** (`/data/mcp/servers.json`)  
✅ **Extends MCPServer model** with installation_status, health_check  
✅ **Adds governance layer** without changing MCP protocol  
✅ **FastAPI integration** follows existing patterns in `app.py`  
✅ **Audit logging** follows orchestrator_logger.py JSONL pattern  
✅ **SQLite storage** consistent with existing auth.db, audit.db  

### Integration Points

1. **FastAPI Backend** (`app.py`):
   ```python
   from mcp_governance.api_routes import router as mcp_router
   app.include_router(mcp_router)
   ```

2. **Orchestrator** (before MCP calls):
   ```python
   from mcp_governance.runtime_enforcer import create_runtime_enforcer
   enforcer = create_runtime_enforcer(policy_engine)
   enforcement_result = enforcer.enforce_tool_call(context, request)
   ```

3. **Swarms MCP Integration** (`scripts/swarms/examples/mcp/`):
   - Wrap existing MCP client calls with enforcement

---

## Implementation Checklist

### Phase 1: Core Models & Policy Engine ✅

- [x] Define data models (InstallRecord, Collection, Allowlist, AuditEvent)
- [x] Implement PolicyEngine interface
- [x] Implement DefaultPolicyEngine with deny-by-default logic
- [x] Add redaction utilities

### Phase 2: Runtime Enforcement ✅

- [x] Implement RuntimeEnforcer
- [x] Add AuditLogger interface
- [x] Implement JsonlAuditLogger
- [x] Add integration helpers

### Phase 3: API Endpoints ✅

- [x] Define all REST endpoints
- [x] Create FastAPI router
- [x] Add request/response models
- [x] Add health check endpoint

### Phase 4: Documentation ✅

- [x] Create API endpoint table
- [x] Create sequence diagram
- [x] Document data models
- [x] Document integration points
- [x] Create design summary document

### Phase 5: Implementation (Future Work)

- [ ] Implement storage layer (SQLite/JSON)
- [ ] Implement API endpoint handlers
- [ ] Integrate with FastAPI app.py
- [ ] Add unit tests
- [ ] Add integration tests
- [ ] Add UI components (Next.js frontend)

---

## Security & Compliance

### Security Features

✅ **Deny by Default**: Explicit allowlist required  
✅ **Fail-Secure**: Policy errors result in denial  
✅ **Redaction**: Sensitive data masked in logs  
✅ **Least Privilege**: Scope-based access control  
✅ **Audit Trail**: Every decision logged  
✅ **Time-bound Access**: Allowlists can expire  

### Compliance Features

✅ **Immutable Audit Log**: JSONL append-only format  
✅ **Tamper Detection**: SHA-256 hashes for events  
✅ **PII Protection**: Automatic redaction of sensitive fields  
✅ **Access Tracking**: User ID logged for every action  
✅ **Denial Reasons**: Clear explanations for policy denials  

---

## Performance Considerations

### Expected Latency

| Operation | Expected Time |
|-----------|---------------|
| Policy evaluation | < 5ms |
| Audit event write | < 2ms |
| Full enforcement check | < 10ms |
| Tool execution | 50-500ms (varies) |

### Optimization Strategies

1. **In-memory caching**: Cache allowlists and install records
2. **Async logging**: Fire-and-forget audit writes
3. **Connection pooling**: Reuse MCP server connections
4. **Lazy loading**: Load collections only when needed

---

## Testing Strategy

### Unit Tests

- Policy engine evaluation logic
- Redaction utilities
- Allowlist matching
- Sensitive field detection

### Integration Tests

- End-to-end tool call flow
- API endpoint functionality
- Audit log persistence
- Error handling (fail-secure)

### Performance Tests

- Policy evaluation latency
- Concurrent tool calls
- Audit log write throughput

---

## Future Enhancements

### Potential Extensions

1. **Policy as Code**: Define policies in YAML/Python
2. **Risk Scoring**: ML-based risk assessment
3. **Rate Limiting**: Per-user/per-server limits
4. **Alerting**: Real-time alerts for suspicious activity
5. **Web UI**: Visual policy editor and audit viewer
6. **OpenTelemetry**: Distributed tracing integration
7. **RBAC**: Role-based access control for admin operations
8. **Policy Versioning**: Track policy changes over time

---

## Conclusion

This design provides a comprehensive, secure, and auditable governance system for MCP tool calls in UnifiedAIToolbox. The system:

- ✅ Enforces least privilege (deny by default)
- ✅ Provides clear denial reasons
- ✅ Logs all policy decisions
- ✅ Protects sensitive data via redaction
- ✅ Aligns with existing Stage 0 architecture
- ✅ Offers clean integration points

All deliverables are complete and ready for implementation.

---

## References

- **API Documentation**: [MCP_GOVERNANCE_API.md](MCP_GOVERNANCE_API.md)
- **Sequence Diagram**: [MCP_GOVERNANCE_SEQUENCE_DIAGRAM.md](MCP_GOVERNANCE_SEQUENCE_DIAGRAM.md)
- **Data Models**: [models.py](../apps/UnifiedPromptApp/services/prompt-api/mcp_governance/models.py)
- **Policy Engine**: [policy_engine.py](../apps/UnifiedPromptApp/services/prompt-api/mcp_governance/policy_engine.py)
- **Runtime Enforcer**: [runtime_enforcer.py](../apps/UnifiedPromptApp/services/prompt-api/mcp_governance/runtime_enforcer.py)
- **API Routes**: [api_routes.py](../apps/UnifiedPromptApp/services/prompt-api/mcp_governance/api_routes.py)
- **Architecture Facts**: [ARCHITECTURE_FACTS.md](ARCHITECTURE_FACTS.md)
