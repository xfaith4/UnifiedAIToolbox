# Architecture Facts Report
**Date**: 2026-02-03  
**Purpose**: Ground truth for AI Toolbox stack to guide future MCP integration work

---

## 1. Technology Stack Summary

### Frontend Framework
- **Primary**: Next.js 16 (React 19, TypeScript)
- **Location**: `/apps/unifiedtoolbox.webapp/`
- **Port**: 3000
- **Build Tool**: Next.js built-in bundler
- **Styling**: TailwindCSS 3.4
- **State Management**: React hooks + local stores
- **Key Dependencies**: 
  - `react` 19.2.0
  - `next` 16.0.8
  - `@mui/material` 5.18.0
  - `reactflow` 11.11.4 (for orchestration designer)
  - `recharts` 2.12.7 (for analytics)
  - `openai` 4.73.0 (direct client SDK)

### Backend Framework
- **Primary**: FastAPI (Python 3.12+)
- **Location**: `/apps/UnifiedPromptApp/services/prompt-api/`
- **Port**: 8000
- **Main Entry**: `app.py` (3,885 lines)
- **ASGI Server**: Uvicorn 0.30.0
- **Key Dependencies**:
  - `fastapi` 0.115.0
  - `pydantic` 2.9.0 (v2, recently migrated from v1)
  - `pydantic-settings` 2.3.0
  - `openai` 1.54.0
  - `anthropic` 0.39.0
  - `PyGithub` 2.1.1
  - `GitPython` 3.1.40

### Database & ORM
- **Database**: SQLite 3 (multiple databases)
- **ORM**: **None** - Direct SQL with `sqlite3` module
- **Database Files**:
  - `prompts.db` - FTS5 full-text search index for YAML prompts
  - `auth.db` - User accounts, JWT tokens, RBAC
  - `audit.db` - Activity logs, cost tracking, usage analytics
  - In-app tables in main DB (cache, audit, orchestrator_tasks)
- **Path Strategy**: Databases created on-demand in working directory
- **Key Pattern**: `with sqlite3.connect(DB_PATH) as conn:` (context manager)

### Authentication & Authorization
- **Strategy**: JWT-based with HMAC-SHA256
- **Location**: `/apps/UnifiedPromptApp/services/prompt-api/auth.py`
- **Password Hashing**: HMAC-SHA256 (not bcrypt as docs claim - discrepancy found)
- **Token Types**:
  - Access token: 30 min expiry (configurable via `AUTH_ACCESS_TOKEN_EXPIRE_MINUTES`)
  - Refresh token: 7 days expiry (configurable via `AUTH_REFRESH_TOKEN_EXPIRE_DAYS`)
- **RBAC Roles**: admin, user, readonly (enum in `auth.py`)
- **User Store**: In-memory dict `_users_db` (development mode - needs DB migration for production)
- **OAuth2 Scheme**: `/auth/login` endpoint
- **Current State**: Optional authentication (can be disabled via env vars)

### API Pattern
- **Style**: REST + SSE (Server-Sent Events for streaming)
- **Versioning**: None (implicit v1)
- **Endpoints Structure**:
  - `/prompts/*` - CRUD for prompts
  - `/agents/*` - Agent management
  - `/search` - Full-text search
  - `/orchestrator/*` - Workflow execution
  - `/github/*` - Repository operations
  - `/costs/*` - Usage tracking
  - `/auth/*` - Authentication
  - `/health` - Health check
- **CORS**: Enabled via `CORSMiddleware` (allow all origins in dev)
- **OpenAPI**: Auto-generated at `/docs` and `/redoc`
- **Response Format**: JSON (Pydantic models)
- **Error Handling**: HTTPException with status codes

### Logging System
- **Framework**: Python `logging` module (stdlib)
- **Logger Configuration**: Module-level `logger = logging.getLogger(__name__)`
- **Log Destinations**: 
  - Console (stdout/stderr)
  - File system (`/logs/` directory)
- **Special Modules**:
  - `orchestrator_logger.py` - Structured JSONL logging for runs
  - `orchestrator_verifier.py` - Verification result logging
- **Telemetry**: JSON file-based telemetry system
  - Path pattern: `telemetry_{timestamp}.json`
  - Schema: `{"audit": {"runs": [...]}}`

---

## 2. Plugin/Tool Integration Patterns

### Current Integration: MCP Registry (File-backed)
- **Location**: `/data/mcp/servers.json`
- **Schema**: `MCPRegistry` and `MCPServer` models in `/apps/orchestration-bridge/src/models.py`
- **Purpose**: Curated catalog of MCP servers for orchestration agents
- **Access Pattern**:
  - Python: `from src.utils.mcp_registry import resolve_servers`
  - Filtering: By tags (e.g., `["default"]`) or capabilities (e.g., `["browser-automation"]`)
- **Current Catalog**: 10 curated MCP servers
  - `local-filesystem` (bundled, default)
  - `stagehand-browser` (experimental)
  - `firecrawl`, `git-ingest`, `composio-rube`, etc. (reference/catalog entries)
- **Transport**: Primarily SSE (Server-Sent Events)
- **Auth Strategies**: 
  - `none` - No authentication
  - `token_env` - Token from environment variable
  - `basic` - Basic authentication
- **Registry Metadata**:
  - `id` (stable identifier)
  - `name`, `description`
  - `url` (HTTP/HTTPS only)
  - `capabilities` (list), `tags` (list)
  - `status` (available, experimental, offline, reference)
  - `owner`, `metadata.repo_url`

### Agent Integration Pattern
- **Agent Definitions**: YAML files in `/data/agents/`
- **Agent Registry**: JSON in `/data/agents/Agents.json`
- **Agent Schema**:
  ```json
  {
    "name": "Researcher",
    "role": "system",
    "prompt": "You are a technical researcher..."
  }
  ```
- **Built-in Agents**:
  - Researcher, Engineer, Critic, Synthesizer, Commissioner
  - Supervisor (orchestration coordinator)
  - Security Analyst, Performance Engineer, UX Specialist
- **Agent Invocation**: Via orchestrator in FastAPI backend
- **Agent Context**: Full prompt library + run context

### Prompt Library Pattern
- **Storage**: YAML files in `/data/prompts/`
- **Indexing**: SQLite FTS5 for full-text search
- **Schema**: Flexible key-value YAML (no strict schema enforced)
- **Common Fields**: 
  - `id`, `version`, `category`, `tags`
  - `content`, `variables`, `metadata`
- **Access Pattern**:
  - Web UI: Search via FTS5, view/edit in React components
  - API: `/prompts/*` endpoints
  - PowerShell: `Get-Prompt` module function

### PowerShell Modules (Legacy Integration)
- **Location**: `/modules/`
- **Key Modules**:
  - `PromptLibrary.psm1` - Core prompt operations
  - `Orchestration.Common.psm1` - Orchestration utilities
  - `AIClient` - AI provider abstraction
  - `GitHubRepoManager` - GitHub operations
  - `Telemetry` - Usage tracking
  - `Alerting` - Notification system
- **Status**: Still functional but being phased out in favor of Python/Node.js
- **Integration**: Called from PowerShell scripts in `/scripts/`

---

## 3. Jobs/Runs Representation

### Orchestration Run Model
- **Primary Schema**: `RunMetadata` in `/apps/UnifiedPromptApp/services/prompt-api/orchestrator_schemas.py`
- **Key Fields**:
  - `run_id` (UUID v4)
  - `timestamp` (ISO-8601)
  - `orchestrator_version`
  - `prompt_library_hash` (SHA-256 of prompt library state)
  - `user_goal` (2-3 sentence goal)
  - `context_payload` (dict)
  - `definition_of_done` (list of criteria)

### Run Tracking System
- **Location**: `/apps/orchestration-bridge/`
- **Storage Pattern**: File-based JSON
  - Individual runs: `/apps/orchestration-bridge/runs/{run_id}.json`
  - Index: `/apps/orchestration-bridge/runs/index.json` (fast summary)
- **API**: Node.js Express server on port 8001
  - `POST /api/runs` - Create/update run
  - `GET /api/runs` - List runs with filtering (`?status=success&limit=10`)
  - Defined in `/apps/orchestration-bridge/lib/api-server.js`
- **Cost Analysis**: Integrated cost tracking
  - API costs (per 1K tokens)
  - Compute costs (CPU/GPU hours)
  - Storage costs (GB-month)
  - Environmental costs (energy, water)
  - Human equivalence (time/cost vs. professional)
  - Config: `/config/costs.example.json`

### Run Lifecycle & Stages
1. **Queued**: Run created, awaiting execution
2. **In Progress**: Active execution
3. **Completed**: Successful completion
4. **Failed**: Execution failed
5. **Cancelled**: User cancelled

### Step-Level Tracking
- **Schema**: `StepEvent` in `orchestrator_schemas.py`
- **Key Fields**:
  - `step_id`, `run_id`, `agent_id`
  - `model` (GPT-4, Claude, etc.)
  - `prompt_id`, `prompt_hash` (SHA-256)
  - `input_payload` (exact JSON)
  - `raw_output` (exact text from AI)
  - `parsed_output` (structured JSON if parseable)
  - `schema_validation` (passed/errors)
  - `timing_ms`, `token_usage`
- **Storage**: JSONL (JSON Lines) format
  - Path: `{run_dir}/steps.jsonl`
  - One event per line for streaming append

### Decision Ledger
- **Purpose**: Track key decisions made during orchestration
- **Schema**: `Decision` in `orchestrator_schemas.py`
- **Key Fields**:
  - `decision_id`, `run_id`, `step_id`
  - `type` (e.g., "stack_choice", "auth_strategy")
  - `chosen`, `alternatives` (list)
  - `rationale`, `assumptions` (list)
  - `constraints_referenced` (list)
  - `confidence` (0.0-1.0)
  - `reversible` (bool)
  - `validation_plan`
- **Storage**: JSONL format at `{run_dir}/decisions.jsonl`

### Artifact Tracking
- **Schema**: `ArtifactManifest` in `orchestrator_schemas.py`
- **Key Fields**:
  - `run_id`, `timestamp`
  - `files` (list of `ArtifactFile` with path, sha256, size_bytes)
  - `detected_stacks` (frontend, backend, db)
  - `entrypoints_found` (list)
  - `warnings` (list)
- **Storage**: `{run_dir}/artifact_manifest.json`

### Policy Attachment Points (Current State)
- **Review Policy**: `review_policy` field in `RunManifest` (default: "default")
  - Location: `/apps/orchestration-bridge/src/models.py`
  - Values: "default", custom policy names
  - Currently: Placeholder, not enforced
- **Prompt Gates**: `prompt_gates.py` module exists
  - Location: `/apps/UnifiedPromptApp/services/prompt-api/prompt_gates.py`
  - Purpose: Pre-execution validation gates
  - Current State: Basic implementation, extensible

---

## 4. Audit/Logging/Event Systems

### Audit System (SQL-based)
- **Database**: `audit.db` or table in main DB
- **Table**: `audit` with columns (assumption based on code patterns):
  - `id`, `timestamp`, `event_type`
  - `user_id`, `run_id`, `action`
  - `metadata` (JSON)
- **Access Functions**: 
  - `audit_log()` in `app.py`
  - `list_audit()` in `app.py`
- **Telemetry File Integration**: 
  - Writes to JSON files: `telemetry_{timestamp}.json`
  - Schema: `{"audit": {"runs": [...]}}`

### Event Logging Patterns
1. **Orchestrator Events** (JSONL)
   - Steps: `{run_dir}/steps.jsonl`
   - Decisions: `{run_dir}/decisions.jsonl`
   - Conflicts: `{run_dir}/conflicts.jsonl`
   - Purpose: Machine-readable, deterministic tracing
   - Secret Redaction: Built-in via `SECRET_PATTERNS` in `orchestrator_logger.py`

2. **Application Logs** (Python logging)
   - Console output (INFO, WARNING, ERROR)
   - File output in `/logs/` directory
   - Module-level loggers

3. **Verification Logs**
   - Schema: `Verification` in `orchestrator_schemas.py`
   - Tracks: normalization, lint, build, tests, Docker Compose validation
   - Fields: `passed`, `output`, `log_path`
   - Storage: `{run_dir}/verification.json`

### Cost Tracking (Dedicated System)
- **Module**: `cost_tracker.py`, `cost_metrics.py`
- **API Endpoints**: `/costs/*` routes in `routes_cost_metrics.py`
- **Tracked Metrics**:
  - Token usage by model
  - API call costs
  - Compute time (CPU/GPU)
  - Storage usage
  - Aggregated by run, prompt, agent
- **Storage**: SQLite tables + JSON aggregation

### Quality Metrics (Dedicated System)
- **Module**: `quality_metrics.py`
- **API Endpoints**: `/quality/*` routes in `routes_quality_metrics.py`
- **Tracked Metrics**:
  - Commissioner score (0-10)
  - Agent performance ratings
  - Output completeness
  - Technical accuracy
- **Schema**: `RunWithQualityResponse` in `routes_quality_metrics.py`

### GitHub Webhook Events
- **Module**: `webhook_handler.py`
- **Event Types**:
  - PR opened/closed
  - Issue created/updated
  - Push events
  - Security scan results
  - Code review comments
- **Processing**: Parse webhook payload, trigger automation
- **Storage**: Logged to audit system

---

## 5. Proposed MCP Integration Architecture

### A. MCP Registry Ingestion Adapter

**Purpose**: Discover and ingest MCP servers from external registries (e.g., official MCP catalog, GitHub topics, private registries)

**Proposed Location**: `/apps/orchestration-bridge/src/mcp/`

**Components**:
1. **Ingestion Service** (`/src/mcp/ingestion_service.py`)
   - Fetch from MCP registry APIs
   - Parse server metadata
   - Validate against `MCPServer` schema
   - Merge with local registry
   - Deduplication by `id`

2. **Discovery Adapters** (`/src/mcp/adapters/`)
   - `github_adapter.py` - Discover via GitHub topics (e.g., `mcp-server`)
   - `official_adapter.py` - Official MCP registry API
   - `custom_adapter.py` - User-provided JSON/YAML registries

3. **Validation Module** (`/src/mcp/validator.py`)
   - Schema validation (Pydantic)
   - Endpoint reachability checks (optional)
   - Security audit (URL whitelist, auth validation)

**API Endpoints** (FastAPI addition):
- `POST /mcp/registry/ingest` - Trigger ingestion from source
- `GET /mcp/registry/sources` - List configured sources
- `POST /mcp/registry/sources` - Add new source

**Storage**:
- Primary: `/data/mcp/servers.json` (existing file)
- Backup: `/data/mcp/servers.backup.json` (before each update)
- Changelog: `/data/mcp/registry_changelog.jsonl` (audit trail)

**Integration Point**: 
- FastAPI backend (`app.py`) - add MCP routes
- Orchestration Bridge - existing `/src/utils/mcp_registry.py` utility

---

### B. MCP Catalog Storage (Installed vs. Discovered)

**Purpose**: Distinguish between locally installed MCP servers vs. catalog entries

**Proposed Schema Extension** (in `MCPServer` model):
```python
class MCPServer(BaseModel):
    # ... existing fields ...
    installation_status: str = Field(
        default="catalog",
        description="Installation status: installed, catalog, deprecated"
    )
    installed_at: Optional[datetime] = Field(
        None, 
        description="Timestamp when server was installed locally"
    )
    installation_path: Optional[Path] = Field(
        None,
        description="Local filesystem path if installed"
    )
    health_check: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Last health check result {status, timestamp, latency_ms}"
    )
```

**Proposed Locations**:
1. **Catalog Registry** (discoverable): `/data/mcp/catalog.json`
   - Servers available for installation
   - Status: "catalog"

2. **Installed Registry** (active): `/data/mcp/installed.json`
   - Servers currently running/available
   - Status: "installed"
   - Includes health check data

3. **Unified View**: `/data/mcp/servers.json`
   - Merged view of catalog + installed
   - Filter by `installation_status`

**API Endpoints**:
- `GET /mcp/servers` - List all (filter: `?status=installed`)
- `POST /mcp/servers/{id}/install` - Install from catalog
- `DELETE /mcp/servers/{id}/uninstall` - Uninstall
- `POST /mcp/servers/{id}/health` - Run health check

**Health Check Service** (`/src/mcp/health_service.py`):
- Periodic health checks (every 5 minutes)
- Update `health_check` field
- Alert on failures
- Store history: `/data/mcp/health_log.jsonl`

---

### C. Search UI for MCP Servers

**Purpose**: Frontend interface for browsing, searching, and managing MCP servers

**Proposed Location**: `/apps/unifiedtoolbox.webapp/src/app/mcp/`

**Components**:

1. **Main Page** (`page.tsx`)
   - List view with cards/table
   - Search bar (name, description, capabilities, tags)
   - Filters: status, capabilities, tags, owner
   - Actions: Install, Uninstall, Health Check, View Details

2. **Server Detail Page** (`[serverId]/page.tsx`)
   - Full metadata display
   - Health status badge
   - Capabilities & tags
   - Installation instructions
   - Configuration form (auth, endpoint override)
   - Action buttons: Install/Uninstall, Test Connection

3. **Search Component** (`/src/components/mcp/MCPServerSearch.tsx`)
   - Real-time search (debounced)
   - Filter chips (capabilities, tags)
   - Sort options (name, status, popularity)

4. **Server Card Component** (`/src/components/mcp/MCPServerCard.tsx`)
   - Visual display of server info
   - Status indicator (installed, available, offline)
   - Quick actions menu

5. **Installation Wizard** (`/src/components/mcp/MCPInstallWizard.tsx`)
   - Multi-step form
   - Auth configuration
   - Endpoint override (for self-hosted)
   - Test connection before install

**API Integration** (`/src/lib/services/mcpService.ts`):
```typescript
export const mcpService = {
  listServers: (filters?: MCPFilters) => Promise<MCPServer[]>,
  getServer: (id: string) => Promise<MCPServer>,
  installServer: (id: string, config: InstallConfig) => Promise<void>,
  uninstallServer: (id: string) => Promise<void>,
  healthCheck: (id: string) => Promise<HealthCheckResult>,
  searchServers: (query: string, filters?: MCPFilters) => Promise<MCPServer[]>
}
```

**State Management** (`/src/lib/services/mcpStore.ts`):
- React hooks or Zustand store
- Cache server list
- Track installation progress
- WebSocket for real-time updates (optional)

**URL Structure**:
- `/mcp` - Browse all servers
- `/mcp/search?q=browser` - Search results
- `/mcp/installed` - Installed servers only
- `/mcp/catalog` - Available catalog
- `/mcp/servers/{serverId}` - Server detail

---

### D. Per-Run Allowlist + Policy Engine

**Purpose**: Control which MCP servers can be used per orchestration run, with security policies

**Proposed Location**: `/apps/UnifiedPromptApp/services/prompt-api/policy_engine/`

**Components**:

1. **Policy Schema** (`policy_schema.py`)
```python
class MCPAccessPolicy(BaseModel):
    policy_id: str
    name: str
    description: str
    
    # Allowlist
    allowed_server_ids: List[str] = Field(default_factory=list)
    allowed_capabilities: List[str] = Field(default_factory=list)
    allowed_tags: List[str] = Field(default_factory=list)
    
    # Denylist
    denied_server_ids: List[str] = Field(default_factory=list)
    denied_capabilities: List[str] = Field(default_factory=list)
    
    # Constraints
    require_auth: bool = True
    max_concurrent_connections: int = 5
    allowed_transports: List[str] = ["sse", "stdio"]
    
    # Network constraints
    allowed_url_patterns: List[str] = ["http://localhost:*", "https://*.example.com"]
    deny_external_network: bool = False
    
    # Fail mode
    fail_mode: str = "closed"  # "closed" (deny by default) or "open"
    
    metadata: Dict[str, Any] = Field(default_factory=dict)
```

2. **Policy Engine** (`policy_engine.py`)
```python
class MCPPolicyEngine:
    def evaluate(self, server: MCPServer, policy: MCPAccessPolicy, context: RunContext) -> PolicyDecision
    def get_allowed_servers(self, policy: MCPAccessPolicy) -> List[MCPServer]
    def audit_access(self, server: MCPServer, policy: MCPAccessPolicy, decision: PolicyDecision, run_id: str)
```

3. **Run Policy Binding** (`run_policy.py`)
   - Attach policy to run at creation
   - Store in `RunMetadata.metadata['mcp_policy_id']`
   - Enforce at MCP connection time

4. **Policy Templates** (`/data/policies/`)
   - `default.json` - Sensible defaults (local servers only)
   - `strict.json` - Minimal access (local filesystem only)
   - `permissive.json` - All catalog servers
   - `development.json` - Local + experimental
   - `production.json` - Vetted servers only

**API Endpoints**:
- `GET /policies/mcp` - List policies
- `POST /policies/mcp` - Create policy
- `GET /policies/mcp/{id}` - Get policy
- `PUT /policies/mcp/{id}` - Update policy
- `DELETE /policies/mcp/{id}` - Delete policy
- `POST /policies/mcp/{id}/validate` - Test policy against server

**Integration with Orchestrator**:
- Modify `RunManifest` to include `mcp_policy_id`
- Enforce policy in orchestration step before MCP invocation
- Log policy violations to audit log
- Fail run if policy violated (configurable via `fail_mode`)

**Audit Trail**:
- Log every MCP access attempt
- Record: run_id, server_id, policy_id, allowed/denied, reason
- Storage: `/data/mcp/access_log.jsonl`
- Schema:
```json
{
  "timestamp": "2026-02-03T12:00:00Z",
  "run_id": "abc-123",
  "server_id": "local-filesystem",
  "policy_id": "default",
  "decision": "allowed",
  "reason": "server in allowlist",
  "user_id": "user-123"
}
```

---

### E. Centralized Audit Log

**Purpose**: Unified audit trail for all system activities including MCP access

**Proposed Location**: `/apps/UnifiedPromptApp/services/prompt-api/audit_service.py`

**Schema Enhancement** (extend existing audit table):
```sql
CREATE TABLE IF NOT EXISTS audit (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    event_type TEXT NOT NULL,  -- 'mcp_access', 'run_created', 'auth_login', etc.
    user_id TEXT,
    run_id TEXT,
    resource_type TEXT,  -- 'mcp_server', 'prompt', 'agent', etc.
    resource_id TEXT,
    action TEXT,  -- 'read', 'write', 'execute', 'delete'
    status TEXT,  -- 'success', 'failure', 'denied'
    metadata TEXT,  -- JSON
    ip_address TEXT,
    user_agent TEXT
);

CREATE INDEX idx_audit_timestamp ON audit(timestamp);
CREATE INDEX idx_audit_event_type ON audit(event_type);
CREATE INDEX idx_audit_user_id ON audit(user_id);
CREATE INDEX idx_audit_run_id ON audit(run_id);
```

**Audit Service API**:
```python
class AuditService:
    def log_event(self, event: AuditEvent) -> str
    def query(self, filters: AuditFilters) -> List[AuditEvent]
    def export(self, format: str, filters: AuditFilters) -> bytes  # CSV, JSON, JSONL
```

**API Endpoints**:
- `GET /audit/events` - Query audit log
  - Filters: `?event_type=mcp_access&start_date=2026-01-01&user_id=user-123`
- `GET /audit/events/{id}` - Get event details
- `GET /audit/export` - Export audit log
- `GET /audit/stats` - Audit statistics

**Integration Points**:
1. **MCP Access**: Log every MCP server connection attempt
2. **Policy Enforcement**: Log policy decisions
3. **Run Lifecycle**: Log run creation, completion, failure
4. **Authentication**: Log login, logout, token refresh
5. **Authorization**: Log access denied events
6. **Configuration Changes**: Log policy updates, server installation

**Retention & Archival**:
- Retention policy: 90 days in active DB
- Archive to JSONL: `/data/audit/archive/{year}/{month}/audit.jsonl.gz`
- Configurable via `.env`: `AUDIT_RETENTION_DAYS=90`

**Alerting Integration** (future):
- Suspicious patterns (e.g., repeated denied access)
- Policy violations
- Integration with existing `/modules/Alerting`

---

## 6. Proposed Module Boundaries & Folder Structure

```
UnifiedAIToolbox/
├── apps/
│   ├── UnifiedPromptApp/services/prompt-api/
│   │   ├── app.py                           # Main FastAPI app (EXISTING)
│   │   ├── auth.py                          # Auth module (EXISTING)
│   │   ├── orchestrator_logger.py           # Run logging (EXISTING)
│   │   ├── orchestrator_schemas.py          # Data models (EXISTING)
│   │   ├── policy_engine/                   # NEW: Policy enforcement
│   │   │   ├── __init__.py
│   │   │   ├── policy_schema.py             # Policy data models
│   │   │   ├── policy_engine.py             # Policy evaluation logic
│   │   │   └── run_policy.py                # Run-policy binding
│   │   ├── audit_service.py                 # NEW: Centralized audit service
│   │   └── mcp/                             # NEW: MCP management
│   │       ├── __init__.py
│   │       ├── routes.py                    # MCP API routes
│   │       ├── health_service.py            # Health check service
│   │       └── registry_service.py          # Registry operations
│   │
│   ├── orchestration-bridge/
│   │   ├── src/
│   │   │   ├── models.py                    # Data models (EXISTING, includes MCPServer)
│   │   │   ├── utils/
│   │   │   │   └── mcp_registry.py          # Registry access (EXISTING)
│   │   │   └── mcp/                         # NEW: MCP ingestion
│   │   │       ├── __init__.py
│   │   │       ├── ingestion_service.py     # External registry ingestion
│   │   │       ├── validator.py             # Server validation
│   │   │       └── adapters/                # Discovery adapters
│   │   │           ├── __init__.py
│   │   │           ├── github_adapter.py
│   │   │           ├── official_adapter.py
│   │   │           └── custom_adapter.py
│   │   └── lib/
│   │       └── api-server.js                # Run tracking API (EXISTING)
│   │
│   └── unifiedtoolbox.webapp/
│       └── src/
│           ├── app/
│           │   └── mcp/                     # NEW: MCP UI pages
│           │       ├── page.tsx             # Browse servers
│           │       ├── installed/page.tsx   # Installed servers
│           │       ├── catalog/page.tsx     # Available catalog
│           │       └── servers/
│           │           └── [serverId]/page.tsx  # Server detail
│           ├── components/
│           │   └── mcp/                     # NEW: MCP React components
│           │       ├── MCPServerSearch.tsx
│           │       ├── MCPServerCard.tsx
│           │       ├── MCPInstallWizard.tsx
│           │       └── MCPHealthBadge.tsx
│           └── lib/
│               └── services/
│                   ├── mcpService.ts         # NEW: MCP API client
│                   └── mcpStore.ts           # NEW: MCP state management
│
├── data/
│   ├── mcp/
│   │   ├── servers.json                     # EXISTING: Unified registry
│   │   ├── catalog.json                     # NEW: Discoverable servers
│   │   ├── installed.json                   # NEW: Installed servers
│   │   ├── registry_changelog.jsonl         # NEW: Change audit trail
│   │   ├── access_log.jsonl                 # NEW: Access audit log
│   │   └── health_log.jsonl                 # NEW: Health check history
│   ├── policies/                            # NEW: Policy templates
│   │   ├── default.json
│   │   ├── strict.json
│   │   ├── permissive.json
│   │   ├── development.json
│   │   └── production.json
│   └── audit/                               # NEW: Archived audit logs
│       └── archive/
│           └── {year}/
│               └── {month}/
│                   └── audit.jsonl.gz
│
└── docs/
    └── ARCHITECTURE_FACTS.md                # THIS DOCUMENT
```

---

## 7. Risks & Unknowns

### 1. **MCP Registry Discoverability**
- **Risk**: No standard MCP registry API exists yet
- **Impact**: Ingestion adapters may need frequent updates
- **Mitigation**: Design adapter interface to be pluggable; support multiple sources

### 2. **Security: MCP Server Trust Model**
- **Risk**: Malicious MCP servers could execute arbitrary code or leak data
- **Impact**: Critical security vulnerability
- **Mitigation**: 
  - Default to "fail closed" policy (deny by default)
  - Require explicit user approval for new servers
  - URL whitelist enforcement
  - Network isolation (future: run in sandboxed containers)

### 3. **Performance: SQLite Scalability for Audit Logs**
- **Risk**: Audit log may grow to millions of rows, slowing queries
- **Impact**: Slow audit queries, large DB file size
- **Mitigation**: 
  - Implement retention policy (archive after 90 days)
  - Add proper indexes on timestamp, event_type, user_id
  - Consider PostgreSQL migration for production (Phase 3)

### 4. **State Management: Multiple Registry Files**
- **Risk**: Catalog vs. installed registries may drift out of sync
- **Impact**: UI shows stale data, inconsistent state
- **Mitigation**: 
  - Single source of truth (`servers.json`) with status field
  - Periodic sync job to reconcile state
  - Use file locks to prevent concurrent writes

### 5. **Health Checks: MCP Server Downtime**
- **Risk**: Frequent health checks may overload servers or trigger rate limits
- **Impact**: False negatives, poor user experience
- **Mitigation**: 
  - Configurable health check intervals (default: 5 min)
  - Exponential backoff on failures
  - User-triggered health checks in addition to periodic

### 6. **Policy Complexity: Overly Restrictive Policies**
- **Risk**: Users may create policies that block legitimate usage
- **Impact**: Orchestration runs fail unexpectedly
- **Mitigation**: 
  - Policy validation at creation time
  - Dry-run mode to test policies
  - Clear error messages with suggested policy changes

### 7. **Authentication: In-Memory User Store**
- **Risk**: Current auth uses in-memory dict, not persistent
- **Impact**: Users lose sessions on restart, not production-ready
- **Mitigation**: 
  - Migrate to SQLite `auth.db` (already exists, just needs migration)
  - Phase 1 work before production deployment

### 8. **Frontend State: No WebSocket for Real-Time Updates**
- **Risk**: UI doesn't reflect server state changes in real-time
- **Impact**: User sees stale data until refresh
- **Mitigation**: 
  - Implement polling (every 10s) as interim solution
  - Add WebSocket support in Phase 2 (Next.js supports it)

---

## 8. Minimal Integration Plan (3 Milestones)

### Milestone 1: Foundation (Weeks 1-2)
**Goal**: Establish core MCP registry infrastructure with basic UI

**Deliverables**:
1. **Backend**: 
   - Extend `MCPServer` schema with `installation_status` field
   - Add `/mcp/servers` API endpoints (list, get, install, uninstall)
   - Implement health check service with basic checks
   - Create policy schema and simple policy engine (allow/deny by server ID)
   - Integrate policy enforcement in orchestrator run creation

2. **Frontend**:
   - Create `/mcp` page with server list (read-only)
   - Display server cards with status badges
   - Basic search by name/description
   - Server detail page with metadata

3. **Data**:
   - Split `servers.json` into `catalog.json` + `installed.json`
   - Create default policy templates (default, strict)
   - Initialize audit log schema in SQLite

4. **Testing**:
   - Unit tests for policy engine
   - API endpoint tests (pytest)
   - UI smoke tests (Playwright)

**Success Criteria**:
- User can view MCP server catalog in web UI
- User can manually mark a server as "installed"
- Basic policy (allow local servers only) is enforced
- All tests pass

**Risk Mitigation**:
- Focus on read-only operations first
- Use existing `mcp_registry.py` utility as reference
- Leverage existing API patterns from `app.py`

---

### Milestone 2: Installation & Ingestion (Weeks 3-4)
**Goal**: Enable server installation, health monitoring, and external registry ingestion

**Deliverables**:
1. **Backend**:
   - Implement server installation workflow (validate, write config, mark installed)
   - Add health check API endpoints and periodic checker (5 min interval)
   - Create ingestion service with GitHub adapter (discover by topic)
   - Add `/mcp/registry/ingest` endpoint
   - Enhance audit logging for MCP events

2. **Frontend**:
   - Add installation wizard component
   - Display health status (green/yellow/red) on server cards
   - Add "Install" and "Uninstall" buttons
   - Show installation progress (loading spinner)
   - Add filters for status (installed, available, offline)

3. **Data**:
   - Create health check log (`health_log.jsonl`)
   - Create MCP access log (`access_log.jsonl`)
   - Add permissive and development policy templates

4. **Testing**:
   - Integration tests for installation workflow
   - Mock health checks in tests
   - Test GitHub ingestion adapter with test repo

**Success Criteria**:
- User can install a catalog server with one click
- Health checks run automatically and update UI
- User can ingest servers from GitHub (e.g., search "mcp-server" topic)
- Audit log captures all MCP installation events

**Risk Mitigation**:
- Implement health checks as async background task
- Add circuit breaker for failing health checks
- Use retry logic for GitHub API (rate limits)

---

### Milestone 3: Advanced Policies & Production Hardening (Weeks 5-6)
**Goal**: Complete policy engine, search UI, and production-ready features

**Deliverables**:
1. **Backend**:
   - Implement full policy engine with:
     - Capability-based filtering
     - Tag-based filtering
     - Network constraints (URL patterns)
     - Fail-closed by default
   - Add policy CRUD endpoints
   - Add policy validation and dry-run mode
   - Implement audit log export (CSV, JSON)
   - Add retention policy and archival

2. **Frontend**:
   - Add advanced search (capabilities, tags, multi-filter)
   - Add policy management UI (list, create, edit policies)
   - Show policy enforcement on run detail page
   - Add audit log viewer
   - Implement real-time updates via polling (every 10s)

3. **Data**:
   - Create production policy template
   - Add policy examples in documentation
   - Set up audit log archival (90-day retention)

4. **Testing**:
   - End-to-end tests for policy enforcement
   - Security tests (attempt to bypass policy)
   - Performance tests (audit log with 10K+ entries)
   - UI accessibility tests (WCAG 2.1 AA)

5. **Documentation**:
   - Update README with MCP section
   - Create MCP integration guide in `/docs/`
   - Add policy writing guide
   - Document API endpoints in OpenAPI spec

**Success Criteria**:
- User can create custom policies with multiple constraints
- Policy violations block MCP access and log to audit
- Search UI supports complex filters
- Audit log can be exported and archived
- All security and performance tests pass

**Risk Mitigation**:
- Test policy engine with adversarial cases
- Implement rate limiting on audit log queries
- Add database indexes before performance testing
- Get security review from user before production

---

## 9. Security Considerations

### Authentication & Authorization
- **Current State**: Optional JWT-based auth
- **Recommendation**: Make auth required for production
- **Action**: Migrate user store from in-memory to `auth.db`

### MCP Server Trust
- **Threat Model**: Malicious server could:
  - Execute arbitrary code
  - Exfiltrate sensitive data
  - Perform SSRF attacks
- **Mitigation**:
  - Fail-closed policies by default
  - URL whitelist enforcement
  - Network isolation (localhost only by default)
  - User approval required for new servers

### Audit Trail
- **Requirement**: All MCP access must be logged
- **Compliance**: GDPR, SOC2, HIPAA (future)
- **Implementation**: Immutable JSONL logs with retention policy

### Secrets Management
- **Current State**: Secrets redaction in `orchestrator_logger.py`
- **Enhancement**: Integrate with secret manager (e.g., HashiCorp Vault) in Phase 3

---

## 10. Assumptions & Constraints

### Assumptions
1. MCP servers follow a standard protocol (SSE, stdio, WebSocket)
2. Server metadata includes capabilities and tags
3. Health checks can be performed via HTTP GET to base URL
4. Users trust servers they explicitly install

### Constraints
1. SQLite is sufficient for MVP; PostgreSQL migration is Phase 3
2. No authentication required for development/demo mode
3. Single-tenant system (multi-tenancy is Phase 3)
4. No WebSocket for real-time updates in Phase 1-2 (polling is acceptable)

### Non-Goals (Out of Scope)
1. MCP server hosting/deployment
2. MCP protocol implementation
3. Custom MCP server development
4. Multi-tenancy (Phase 3)
5. Distributed tracing (Phase 3)

---

## 11. Conclusion

The UnifiedAIToolbox has a solid foundation with:
- Modern FastAPI backend + Next.js frontend
- File-backed SQLite for data persistence
- Existing MCP registry infrastructure (`/data/mcp/servers.json`)
- Structured run tracking with audit logs
- Extensible orchestration engine

The proposed MCP integration builds on these strengths by:
- Adding discovery and ingestion capabilities
- Creating a user-friendly search UI
- Implementing security-first policy engine
- Centralizing audit logging

The 3-milestone plan ensures incremental delivery with clear success criteria and risk mitigation at each step.

**Next Steps**:
1. Review this document with stakeholders
2. Prioritize milestones based on business value
3. Begin Milestone 1 development
4. Schedule security review before production

---

**Document Status**: Draft v1.0  
**Last Updated**: 2026-02-03  
**Author**: AI Codex Agent  
**Reviewers**: TBD
