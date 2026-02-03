# MCP Library Feature Specification
## Unified AI Toolbox v2.0

**Status**: Implementation Ready  
**Owner**: Platform Team  
**Created**: 2026-02-03  
**Stage**: Post-Architecture Facts (Stage 0)

---

## Executive Summary

The MCP (Model Context Protocol) Library is a secure, curated discovery and governance system for MCP servers within the Unified AI Toolbox. It enables users to browse, install, configure, and audit MCP tool usage in orchestration workflows with a deny-by-default security posture and comprehensive audit trail.

**Key Goals**:
- Enable safe discovery of MCP servers from official registry and optional community feeds
- Enforce explicit permission model for MCP tool usage in jobs/runs
- Provide comprehensive audit trail of all MCP tool invocations
- Support user-curated collections for common workflow patterns

---

## A) User Stories

### US-1: Browse & Search MCP Servers
**As a** platform user  
**I want to** browse and search available MCP servers from the official registry  
**So that** I can discover tools that can enhance my orchestration workflows

**Acceptance**:
- Search by name, description, capabilities, tags
- Filter by status (available, experimental, reference)
- Filter by owner (official, community, verified)
- View count of available vs. installed servers
- See community ratings/usage stats (Phase 2+)

### US-2: View MCP Server Details
**As a** platform user  
**I want to** view detailed information about an MCP server  
**So that** I can understand its capabilities, security requirements, and installation method

**Acceptance**:
- Display server metadata (name, description, version, owner)
- List all exposed capabilities/tools
- Show required secrets and environment variables
- Display permission footprint (network egress, filesystem access)
- Show installation instructions and compatibility info
- Display security verification status and provenance
- Link to source repository and documentation

### US-3: Install & Configure MCP Servers
**As a** platform user  
**I want to** install an MCP server to my workspace  
**So that** its tools become available for use in my workflows

**Acceptance**:
- One-click install from registry
- Configure required secrets via secure input (masked)
- Pin specific version or use "latest"
- Validate installation (connectivity, auth test)
- View installation status and health
- Update or uninstall servers
- View dependency tree (if MCP depends on other services)

### US-4: Enable/Disable MCP Servers
**As a** platform administrator  
**I want to** enable or disable installed MCP servers  
**So that** I can control which tools are available without uninstalling

**Acceptance**:
- Toggle enabled/disabled state per server
- Disabled servers are not available in run allowlists
- Audit log captures enable/disable actions
- Bulk enable/disable operations (Phase 2)
- Auto-disable on failed health checks (Phase 2)

### US-5: Create MCP Collections
**As a** power user  
**I want to** create curated collections of MCP servers  
**So that** I can quickly configure common workflow patterns

**Acceptance**:
- Create named collections with description
- Add/remove servers to/from collections
- Share collections with team (Phase 2)
- Apply collection to a run with one click
- Collections support tags for categorization
- View collection usage analytics (Phase 2)

**Examples**:
- "Web Research Kit" = firecrawl + stagehand-browser + context-optimizer
- "GitHub DevOps Stack" = git-ingest + github + composio-rube
- "Data Engineering" = postgres-sql + duckdb + s3-tools

### US-6: Bind MCP Allowlist to Jobs/Runs
**As a** workflow author  
**I want to** specify which MCP servers a job/run can access  
**So that** I have explicit control over tool availability

**Acceptance**:
- Attach allowlist when creating orchestration run
- Specify individual servers OR collections
- Empty allowlist = no MCP access (deny-by-default)
- Allowlist stored in run manifest
- Runtime enforcement: only allowed MCPs are loaded
- Override/extend allowlist in child runs (opt-in)

### US-7: Enforce Deny-by-Default Policy
**As a** security engineer  
**I want to** ensure no MCP tools are available unless explicitly allowed  
**So that** workflows cannot access unauthorized external systems

**Acceptance**:
- Default run configuration has empty MCP allowlist
- Runtime MCP loader rejects servers not in allowlist
- Audit log records allowlist violations
- Clear error messages when tools are unavailable
- No "auto-discover and install" behavior

### US-8: Audit MCP Tool Calls
**As a** compliance officer  
**I want to** view audit logs of all MCP tool invocations  
**So that** I can track who used what tools, when, and with what data

**Acceptance**:
- Append-only audit log for all MCP calls
- Capture: user_id, run_id, timestamp, mcp_id, tool_name, redacted_args
- Secret/credential redaction in logs
- Query interface: filter by user, run, MCP, date range
- Export audit data to JSONL or CSV
- Integration with external SIEM (Phase 3)
- Retention policy configuration (Phase 2)

### US-9: View Permission Footprint
**As a** security-conscious user  
**I want to** see what permissions an MCP server requires  
**So that** I can make informed decisions about installation

**Acceptance**:
- Display required permissions in UI (network, filesystem, database)
- Show egress domains (which external APIs it calls)
- Highlight sensitive capabilities (execute code, access credentials)
- Compare permission footprint across similar servers
- Warning badges for high-risk permissions

### US-10: Verify MCP Server Provenance
**As a** platform administrator  
**I want to** verify the source and integrity of MCP servers  
**So that** I only install trusted software

**Acceptance**:
- Display signature verification status (GPG, Sigstore)
- Show source repository and commit hash
- Verify package checksums
- Display SLSA provenance level (Phase 2)
- Flag unsigned or unverified servers
- Require admin approval for unverified servers (config)

---

## B) Data Model

### MCPServer (Discovery Registry)
Discovered metadata from official/community registries.

```python
class MCPServer(BaseModel):
    # Identity
    id: str                           # Stable identifier (e.g., "firecrawl")
    name: str                         # Display name
    slug: str                         # URL-safe identifier
    
    # Metadata
    description: str
    version: str                      # Semantic version
    homepage_url: Optional[str]
    repo_url: str
    
    # Discovery source
    registry_source: str              # "official" | "community" | "private"
    registry_url: str
    last_synced_at: datetime
    
    # Classification
    capabilities: List[str]           # ["web-crawl", "search"]
    tags: List[str]                   # ["research", "web"]
    category: str                     # "data" | "automation" | "integration"
    
    # Technical
    transport: str                    # "sse" | "http" | "stdio"
    protocol_version: str             # "1.0" | "1.1"
    endpoint_url: Optional[str]       # Runtime endpoint if known
    
    # Ownership & Trust
    owner: str                        # GitHub org or username
    owner_type: str                   # "official" | "verified" | "community"
    verified: bool
    verification_method: Optional[str] # "signature" | "slsa" | "manual"
    
    # Lifecycle
    status: str                       # "active" | "deprecated" | "archived"
    maturity: str                     # "stable" | "beta" | "alpha"
    
    # Requirements
    required_secrets: List[str]       # ["FIRECRAWL_API_KEY"]
    required_env_vars: List[str]
    dependencies: List[str]           # Other MCP IDs required
    
    # Security
    permissions_required: Dict[str, Any]  # {network: [...], filesystem: ...}
    egress_domains: List[str]             # Known external API calls
    
    # Metrics (optional)
    install_count: Optional[int]
    avg_rating: Optional[float]
```

**Storage**: 
- SQLite table `mcp_servers` (indexed by id, registry_source, tags)
- Synced from `/data/mcp/servers.json` + external registries
- Updated via background sync job (daily)

---

### MCPInstall (Installed State)
User's installed instance of an MCP server.

```python
class MCPInstall(BaseModel):
    # Identity
    install_id: str                   # UUID
    mcp_id: str                       # FK to MCPServer.id
    
    # Ownership
    tenant_id: Optional[str]          # For multi-tenant (Phase 3)
    user_id: str                      # Installer
    
    # Version
    installed_version: str            # Pinned semantic version
    auto_update: bool                 # Auto-update to latest
    
    # Configuration
    config_overrides: Dict[str, Any]  # User-provided config
    secrets_key_ids: List[str]        # References to secret store
    
    # State
    enabled: bool
    health_status: str                # "healthy" | "unhealthy" | "unknown"
    last_health_check: Optional[datetime]
    
    # Lifecycle
    installed_at: datetime
    installed_by_user_id: str
    updated_at: Optional[datetime]
    
    # Runtime
    endpoint_override: Optional[str]  # Custom endpoint
    timeout_seconds: int              # Default: 30
    retry_policy: Dict[str, Any]
    
    # Usage tracking
    total_calls: int                  # Cached counter
    last_used_at: Optional[datetime]
```

**Storage**: SQLite table `mcp_installs`

**Indexes**:
- `(tenant_id, user_id)` - User's installs
- `(mcp_id, enabled)` - Active installs per MCP
- `(health_status)` - Unhealthy servers

---

### MCPCollection (User-Curated Bundle)
User-defined sets of MCP servers for workflow patterns.

```python
class MCPCollection(BaseModel):
    # Identity
    collection_id: str                # UUID
    name: str
    slug: str                         # URL-safe
    
    # Ownership
    tenant_id: Optional[str]
    owner_user_id: str
    
    # Metadata
    description: str
    tags: List[str]
    icon: Optional[str]               # Emoji or icon name
    
    # Members
    mcp_ids: List[str]                # Ordered list of MCP IDs
    
    # Sharing (Phase 2)
    visibility: str                   # "private" | "team" | "public"
    shared_with_user_ids: List[str]
    
    # Lifecycle
    created_at: datetime
    updated_at: datetime
    
    # Usage
    usage_count: int
    last_used_at: Optional[datetime]
```

**Storage**: SQLite table `mcp_collections`

**Indexes**:
- `(owner_user_id)` - User's collections
- `(visibility, tenant_id)` - Shared collections

---

### MCPRunAllowlist (Run/Job Binding)
Specifies which MCPs are available to a specific orchestration run.

```python
class MCPRunAllowlist(BaseModel):
    # Identity
    allowlist_id: str                 # UUID
    run_id: str                       # FK to RunMetadata.run_id
    
    # Allowlist definition
    mode: str                         # "explicit" | "collection" | "inherit"
    
    # Explicit MCPs
    allowed_mcp_ids: List[str]        # Explicit list
    
    # Collection reference
    collection_id: Optional[str]      # If mode="collection"
    
    # Inheritance (Phase 2)
    parent_run_id: Optional[str]      # If mode="inherit"
    additional_mcp_ids: List[str]     # Extend parent allowlist
    
    # Enforcement
    deny_by_default: bool = True      # Always True
    allow_dynamic_loading: bool = False  # Phase 2 feature
    
    # Audit
    created_at: datetime
    created_by_user_id: str
    
    # Snapshot for auditability
    resolved_mcp_ids: List[str]       # Computed list at run start
    mcp_versions_snapshot: Dict[str, str]  # {mcp_id: version}
```

**Storage**: SQLite table `mcp_run_allowlists`

**Indexes**:
- `(run_id)` - Unique per run
- `(collection_id)` - Runs using collection

**Behavior**:
- Created when orchestration run starts
- Immutable once created (snapshot)
- Runtime loader validates against this allowlist

---

### MCPAuditEvent (Append-Only Log)
Immutable record of all MCP-related actions.

```python
class MCPAuditEvent(BaseModel):
    # Identity
    event_id: str                     # UUID
    
    # Context
    timestamp: datetime               # UTC
    event_type: str                   # Enum: tool_call, install, enable, disable, etc.
    
    # Actor
    user_id: Optional[str]
    run_id: Optional[str]
    agent_id: Optional[str]
    
    # Subject
    mcp_id: str
    install_id: Optional[str]
    
    # Tool invocation details (if event_type="tool_call")
    tool_name: Optional[str]
    tool_args_redacted: Optional[Dict[str, Any]]  # Secrets redacted
    tool_result_summary: Optional[str]            # Truncated result
    
    # Outcome
    success: bool
    error_message: Optional[str]
    duration_ms: Optional[int]
    
    # Network activity (Phase 2)
    egress_calls: Optional[List[Dict[str, str]]]  # [{domain, method, status}]
    
    # Metadata
    ip_address: Optional[str]
    user_agent: Optional[str]
```

**Storage**: 
- SQLite table `mcp_audit_events` (append-only)
- JSONL file exports for long-term retention
- Path: `{audit_dir}/{year}/{month}/mcp_audit_{date}.jsonl`

**Indexes**:
- `(timestamp DESC)` - Recent events
- `(run_id, timestamp)` - Events per run
- `(mcp_id, timestamp)` - Events per MCP
- `(user_id, timestamp)` - User activity

**Secret Redaction**:
- Apply regex patterns from `SECRET_PATTERNS` config
- Redact: API keys, tokens, passwords, URLs with credentials
- Replace with `[REDACTED:{type}]` placeholder

---

## C) Security & Trust Model

### 1. Verification Steps

#### Source Provenance
- **Package Signing**: Verify GPG signatures for official MCP packages
- **Checksum Validation**: SHA-256 hash verification against registry
- **Repository Verification**: Validate GitHub repository ownership
- **Commit Pinning**: Reference specific commit hashes, not branches

#### Trust Levels
```
Official (Highest)
  └─ Signed by platform team
  └─ Source code audited
  └─ Continuous security scanning
  
Verified
  └─ Signed by known publisher
  └─ SLSA provenance level 2+
  └─ Automated security checks passed
  
Community
  └─ Unsigned or self-signed
  └─ Source available for review
  └─ User reviews and ratings
  
Untrusted (Requires Admin Approval)
  └─ No signature
  └─ Private repository or unknown source
  └─ Manual security review required
```

#### Installation Guard Rails
- **Pre-install Checks**:
  - Verify signature/checksum
  - Scan for known vulnerabilities (npm audit, safety, etc.)
  - Review required permissions
  - Check egress domains against blocklist
  
- **Installation Sandboxing** (Phase 2):
  - Run MCP servers in containers with resource limits
  - Network policies restrict egress to declared domains
  - Filesystem access limited to designated directories
  - No access to platform secrets or user credentials

### 2. Permission Footprint Display

MCP servers declare required permissions in manifest:

```json
{
  "permissions": {
    "network": {
      "egress": ["api.firecrawl.com", "cdn.example.com"],
      "ingress": false
    },
    "filesystem": {
      "read": ["/workspace/**"],
      "write": ["/workspace/output/**"]
    },
    "credentials": {
      "required": ["FIRECRAWL_API_KEY"],
      "optional": ["PROXY_URL"]
    },
    "execution": {
      "spawn_processes": false,
      "shell_access": false
    }
  }
}
```

**UI Display**:
- 🔴 High Risk: Shell access, unrestricted network, credential access
- 🟡 Medium Risk: Write filesystem, spawn processes
- 🟢 Low Risk: Read-only filesystem, declared egress domains

### 3. Egress/Network Policy

#### Default Policy: Deny All
- MCP servers have NO network access by default
- Must explicitly declare egress domains in manifest
- Runtime enforcement via network policy or proxy

#### Declared Egress
- MCP manifest lists allowed domains
- Wildcards supported: `*.anthropic.com`
- IP ranges not allowed (must use domains)
- DNS resolution cached and monitored

#### Undeclared Egress = Error
- Attempts to contact undeclared domains are blocked
- Event logged to audit trail
- MCP marked as unhealthy
- User notified of violation

#### Implementation (Phase 1: Monitoring, Phase 2: Enforcement)
- **Phase 1**: Log all egress calls for analysis
- **Phase 2**: Enforce via:
  - Docker network policies
  - HTTP proxy with allowlist
  - DNS filtering
  - Kubernetes NetworkPolicy

### 4. Secret Handling Rules

#### Storage
- Secrets NEVER stored in plaintext
- Use platform secret store (encrypted SQLite or Vault in Phase 3)
- Reference secrets by key ID, not value
- Encryption at rest: AES-256-GCM

#### Access
- Secrets only available to MCP runtime process
- Injected as environment variables at process start
- Not logged or transmitted over network
- Cleared from memory after MCP shutdown

#### Rotation
- User can update secret values
- Old values invalidated immediately
- Dependent MCP installs re-validated
- Rotation events logged to audit trail

#### Redaction in Logs
- Apply regex patterns: `/(sk-[a-zA-Z0-9]{40,})/`, `/token[=:]\s*[^\s]+/`
- Redact before writing to logs
- Redact in UI display of tool arguments
- Export audit logs pre-redacted

### 5. Threat Model & Mitigations

| Threat | Abuse Case | Impact | Mitigations |
|--------|-----------|--------|-------------|
| **Malicious MCP Server** | Attacker publishes MCP that exfiltrates credentials | HIGH | • Signature verification<br>• Permission review before install<br>• Egress monitoring<br>• Secret redaction in logs |
| **Supply Chain Attack** | Compromised NPM/PyPI package in MCP dependencies | HIGH | • Checksum validation<br>• Dependency scanning (Snyk, npm audit)<br>• Pin exact versions<br>• Offline install option |
| **Credential Theft** | MCP logs or transmits user secrets | HIGH | • Secret injection, not storage<br>• Audit all tool calls<br>• Encrypt logs at rest<br>• Network egress monitoring |
| **Unauthorized MCP Usage** | User enables MCP not in run allowlist | MEDIUM | • Deny-by-default enforcement<br>• Runtime allowlist validation<br>• Audit log of violations<br>• Clear error messages |
| **Data Exfiltration** | MCP sends sensitive data to external API | HIGH | • Egress domain allowlist<br>• Payload inspection (Phase 2)<br>• Rate limiting<br>• User consent for sensitive operations |
| **Privilege Escalation** | MCP gains access to platform internals | CRITICAL | • Process isolation<br>• No shared secrets with platform<br>• Read-only mounts<br>• Least-privilege execution |
| **Denial of Service** | MCP exhausts resources or rate limits | MEDIUM | • Resource limits (CPU, memory, network)<br>• Request throttling<br>• Circuit breaker pattern<br>• Health check auto-disable |
| **Stale Dependencies** | MCP uses outdated libraries with CVEs | MEDIUM | • Automated vulnerability scanning<br>• Update notifications<br>• Auto-update option (opt-in)<br>• Deprecation warnings |
| **Insider Threat** | Authorized user exfiltrates data via allowed MCP | MEDIUM | • Comprehensive audit trail<br>• Anomaly detection (Phase 2)<br>• Export controls<br>• User training |
| **Configuration Error** | User misconfigures MCP, exposes secrets | MEDIUM | • Input validation<br>• Secure defaults<br>• Configuration review UI<br>• Dry-run testing |

---

## D) Non-Goals (Explicit Boundaries)

### ❌ Not in Scope

1. **No Auto-Install Random MCPs**
   - Platform will NOT automatically install MCP servers based on AI suggestions
   - All installations require explicit user action
   - No "try this MCP" prompts without user consent
   - Rationale: Prevent supply chain attacks and credential theft

2. **No Remote Execution Without Explicit Permission**
   - MCPs cannot be invoked unless in run allowlist
   - No dynamic MCP loading during run
   - No "just-in-time" discovery and use
   - Rationale: Maintain control and auditability

3. **No Credential Harvesting**
   - Platform does NOT collect or store MCP API keys centrally (Phase 1)
   - User credentials are user-managed
   - No "sign in with your Firecrawl account" flows
   - Rationale: Reduce attack surface and liability

4. **No MCP Marketplace (Phase 1)**
   - No commercial transactions or paid MCPs
   - No ratings/reviews in Phase 1
   - No publisher revenue sharing
   - Deferred to Phase 3 if needed

5. **No Real-Time Package Scanning**
   - Vulnerability scanning is periodic, not live
   - No inline static analysis during install
   - Pre-scanned registry approach
   - Rationale: Performance and complexity

6. **No Multi-MCP Transactions**
   - No distributed transactions across MCPs
   - Each tool call is independent
   - No rollback/saga patterns
   - Deferred to Phase 2 if workflow orchestration needs emerge

7. **No MCP-to-MCP Communication**
   - MCPs cannot call other MCPs
   - No federation or chaining
   - Platform mediates all interactions
   - Rationale: Simplify security model

8. **No Custom MCP Development in Platform**
   - Platform provides discovery, not development tools
   - Users create MCPs outside platform
   - No in-app MCP editor or IDE
   - Rationale: Focus on curation, not creation

---

## E) Acceptance Criteria

### Security Checks

#### AC-1: Deny-by-Default Enforcement
**Given** an orchestration run with no MCP allowlist  
**When** a tool call attempts to use an MCP server  
**Then** the call is rejected with a clear error  
**And** the rejection is logged to audit trail  
**And** the user sees: "MCP 'firecrawl' not in run allowlist. Add to allowlist to use this tool."

**Test**: Create run without allowlist, attempt tool call, verify rejection.

---

#### AC-2: Secret Redaction in Audit Logs
**Given** a tool call with an API key in arguments  
**When** the call is logged to audit trail  
**Then** the API key is replaced with `[REDACTED:API_KEY]`  
**And** the original value is NOT stored anywhere  
**And** exports (JSONL, CSV) also contain redacted data

**Test Patterns**:
- `sk-proj-abc123` → `[REDACTED:API_KEY]`
- `token=secret123` → `token=[REDACTED:TOKEN]`
- `https://user:pass@api.com` → `https://[REDACTED:CREDS]@api.com`

---

#### AC-3: Signature Verification
**Given** an MCP server in the official registry  
**When** a user attempts to install it  
**Then** the platform verifies the GPG signature  
**And** installation fails if signature is invalid  
**And** a warning is shown for unsigned community MCPs  
**And** admins can require signature for all installs (config)

**Test**: Mock signed package, verify acceptance. Mock unsigned, verify warning/block.

---

#### AC-4: Egress Domain Validation
**Given** an MCP server declares egress to `api.example.com`  
**When** the MCP attempts to call `evil.com`  
**Then** the call is blocked (Phase 2) or logged (Phase 1)  
**And** the MCP is marked unhealthy  
**And** an audit event is created with type `egress_violation`

**Test**: Mock MCP with declared domains, attempt undeclared call, verify logging.

---

#### AC-5: Permission Footprint Display
**Given** an MCP server with high-risk permissions  
**When** a user views server details  
**Then** UI displays:
- 🔴 "High Risk: This MCP can execute shell commands"
- 🟡 "Medium Risk: Write access to filesystem"
- List of egress domains
- List of required secrets

**Test**: Mock MCP with various permissions, verify UI rendering.

---

### UX Checks

#### AC-6: Search & Filter Performance
**Given** 100+ MCP servers in registry  
**When** user searches for "web crawl"  
**Then** results appear in < 500ms  
**And** results are sorted by relevance (name match, then description)  
**And** filters (tags, status) apply instantly  

**Test**: Load 100 mock MCPs, perform search, measure latency.

---

#### AC-7: One-Click Collection Apply
**Given** a collection "Web Research Kit" with 3 MCPs  
**When** user creates a new orchestration run  
**And** selects the collection from dropdown  
**Then** all 3 MCPs are added to run allowlist  
**And** UI shows: "3 MCPs from 'Web Research Kit' added"  
**And** user can still add/remove individual MCPs

**Test**: Create collection, apply to run, verify allowlist.

---

#### AC-8: Installation Validation Feedback
**Given** a user installs an MCP requiring API key  
**When** installation completes  
**Then** platform performs health check (e.g., call test endpoint)  
**And** shows ✅ "Healthy" or ❌ "Failed: Invalid API key"  
**And** failed installs are marked disabled  
**And** user can retry with updated config

**Test**: Mock MCP with health endpoint, test success/failure flows.

---

#### AC-9: Audit Query Interface
**Given** 1000+ audit events in database  
**When** compliance officer queries:
- "Show all Firecrawl tool calls by user:alice in January 2026"  
**Then** results appear in < 2 seconds  
**And** results include: timestamp, tool name, run ID, outcome  
**And** user can export to CSV  
**And** pagination supports 50/100/500 per page

**Test**: Seed 1000 audit events, perform filtered query, verify performance and export.

---

#### AC-10: Clear Error Messages
**Given** various error conditions  
**When** errors occur  
**Then** messages are clear and actionable  

**Examples**:
- ❌ "MCP 'firecrawl' not in run allowlist" → ✅ Add link to "Configure Allowlist"
- ❌ "Invalid API key for Firecrawl" → ✅ Link to "Update Secrets"
- ❌ "MCP server unreachable" → ✅ Show health check logs
- ❌ "Permission denied: filesystem write" → ✅ Show required permissions and current config

**Test**: Trigger each error condition, verify message clarity and actionable links.

---

## F) Phase Rollout Plan

### Phase 1: Foundation (Weeks 1-4)
**Goal**: Core infrastructure and deny-by-default enforcement

#### Deliverables
1. **Database Schema**
   - Create tables: `mcp_servers`, `mcp_installs`, `mcp_collections`, `mcp_run_allowlists`, `mcp_audit_events`
   - Migrations: Alembic scripts
   - Seed data from `/data/mcp/servers.json`

2. **Backend API**
   - `/api/mcp/servers` - List, search, get details
   - `/api/mcp/installs` - CRUD operations
   - `/api/mcp/collections` - CRUD operations
   - `/api/mcp/allowlists` - Bind to runs
   - `/api/mcp/audit` - Query audit events
   - Secret storage integration (encrypted SQLite)

3. **MCP Runtime Loader**
   - Validate run allowlist before loading MCPs
   - Inject secrets as environment variables
   - Audit logger middleware (all tool calls)
   - Secret redaction engine

4. **Web UI - Discovery**
   - MCP server browser with search/filter
   - Server detail view
   - Install wizard with secret input
   - My Installs page (list, enable/disable, health status)

5. **Security Baseline**
   - Deny-by-default enforcement
   - Secret redaction in logs
   - Audit trail for all actions
   - Permission footprint display

**Acceptance**: 
- AC-1 (Deny-by-default), AC-2 (Secret redaction), AC-5 (Permission display), AC-10 (Error messages)
- Can install, configure, and use MCP in orchestration run
- All tool calls audited

---

### Phase 2: Governance & Trust (Weeks 5-8)
**Goal**: Enhanced security, collections, and trust features

#### Deliverables
1. **Signature Verification**
   - GPG signature validation for official MCPs
   - SLSA provenance support
   - Trust level badges in UI

2. **Egress Monitoring & Enforcement**
   - Log all network calls (monitoring mode)
   - Egress domain enforcement (Docker network policies or proxy)
   - Anomaly detection: flag unexpected egress

3. **Collections & Sharing**
   - Create/edit collections in UI
   - Share collections with team members
   - Collection usage analytics
   - Pre-built collections ("Web Research", "GitHub DevOps")

4. **Health Monitoring**
   - Periodic health checks for installed MCPs
   - Auto-disable unhealthy servers
   - Notification system for failures
   - Health dashboard

5. **Audit Enhancements**
   - Advanced query interface (filter by multiple fields)
   - Export to JSONL/CSV
   - Retention policy configuration
   - Audit log archival

**Acceptance**: 
- AC-3 (Signature verification), AC-4 (Egress validation), AC-7 (Collection apply), AC-9 (Audit query)
- Can verify MCP integrity before install
- Egress violations are detected and handled

---

### Phase 3: Scale & Integration (Weeks 9-12)
**Goal**: Multi-tenancy, community registry, advanced features

#### Deliverables
1. **Multi-Tenancy Support**
   - Tenant isolation for MCP installs
   - Per-tenant MCP allowlists
   - Tenant-specific collections
   - Quotas: max installs per tenant

2. **Community Registry**
   - Sync from community registries (GitHub topics, awesome-mcp lists)
   - User-submitted MCPs (moderation workflow)
   - Ratings and reviews
   - Usage statistics (aggregate, anonymized)

3. **Advanced Security**
   - MCP sandboxing (containerized execution)
   - Resource limits (CPU, memory, network)
   - Payload inspection (DLP patterns)
   - SIEM integration (export to Splunk, ELK)

4. **Developer Experience**
   - MCP testing environment (sandbox runs)
   - Dry-run mode (simulate tool calls without execution)
   - MCP development documentation
   - CLI tool for MCP management

5. **Operational Features**
   - Bulk operations (enable/disable, update)
   - Scheduled MCP updates (auto-update with rollback)
   - Dependency management (MCP requires other MCPs)
   - Cost tracking per MCP (API usage, compute)

**Acceptance**: 
- AC-6 (Search performance at scale), AC-8 (Installation validation)
- Multi-tenant isolation verified
- Community MCPs available with review process

---

## G) Implementation Notes

### Technology Choices

#### Backend
- **Language**: Python 3.12 (existing FastAPI backend)
- **Framework**: FastAPI (existing)
- **Database**: SQLite (Phase 1-2), PostgreSQL (Phase 3)
- **Secret Storage**: Encrypted SQLite with `cryptography` library (Phase 1), Vault (Phase 3)
- **Signature Verification**: `gnupg` library for GPG, `sigstore-python` for SLSA

#### Frontend
- **Framework**: React 19 + Next.js 16 (existing)
- **UI Components**: Material-UI (existing)
- **State**: React hooks + local stores (existing)
- **API Client**: OpenAI SDK (existing) + custom fetch for MCP endpoints

#### Security
- **Secret Encryption**: AES-256-GCM via `cryptography.fernet`
- **Redaction**: Regex patterns + `re` module
- **Egress Monitoring**: HTTP proxy (Phase 2), Docker networking (Phase 2)
- **Sandboxing**: Docker containers with `--read-only`, `--network=custom` (Phase 3)

### Migration Path from Current State

**Current**: `/data/mcp/servers.json` (10 servers)

**Phase 1 Migration**:
1. Create database schema
2. Seed `mcp_servers` table from `servers.json`
3. Update orchestration-bridge to use DB instead of JSON file
4. Mark servers as "status=reference" (not installed)
5. Require explicit install step for users

**Backward Compatibility**:
- Keep `servers.json` as read-only reference
- Orchestration code checks `mcp_run_allowlists` before loading MCPs
- Existing runs without allowlists get empty allowlist (deny-all)

### API Endpoint Summary

```
GET    /api/mcp/servers                 # List/search MCP servers
GET    /api/mcp/servers/{mcp_id}        # Get server details
POST   /api/mcp/servers/sync            # Sync from registries (admin)

POST   /api/mcp/installs                # Install MCP
GET    /api/mcp/installs                # List user's installs
GET    /api/mcp/installs/{install_id}   # Get install details
PATCH  /api/mcp/installs/{install_id}   # Update config, enable/disable
DELETE /api/mcp/installs/{install_id}   # Uninstall
POST   /api/mcp/installs/{install_id}/health  # Run health check

POST   /api/mcp/collections             # Create collection
GET    /api/mcp/collections             # List collections
GET    /api/mcp/collections/{coll_id}   # Get collection
PATCH  /api/mcp/collections/{coll_id}   # Update collection
DELETE /api/mcp/collections/{coll_id}   # Delete collection

POST   /api/mcp/allowlists              # Create run allowlist
GET    /api/mcp/allowlists/{run_id}     # Get allowlist for run

GET    /api/mcp/audit                   # Query audit events
POST   /api/mcp/audit/export            # Export audit data

GET    /api/mcp/permissions/{mcp_id}    # Get permission footprint
GET    /api/mcp/trust/{mcp_id}          # Get trust/verification info
```

### UI Component Structure

```
/apps/unifiedtoolbox.webapp/src/
  components/
    mcp/
      MCPBrowser.tsx           # Search & browse MCPs
      MCPDetail.tsx            # Server details view
      MCPInstallWizard.tsx     # Installation flow
      MCPInstallsList.tsx      # User's installed MCPs
      MCPCollectionEditor.tsx  # Create/edit collections
      MCPAllowlistConfig.tsx   # Configure run allowlist
      MCPAuditLog.tsx          # Audit query interface
      MCPPermissionBadge.tsx   # Permission footprint display
      MCPHealthIndicator.tsx   # Health status icon
      MCPSecretInput.tsx       # Secure secret entry
```

---

## H) Success Metrics

### Security Metrics
- **Zero** unauthorized MCP tool invocations (AC-1)
- **100%** of secrets redacted in audit logs (AC-2)
- **100%** of official MCPs signature-verified (AC-3)
- **< 1%** egress violations per 1000 tool calls (AC-4)

### Performance Metrics
- MCP search results: **< 500ms** for 100+ servers (AC-6)
- Audit query: **< 2s** for 1000+ events (AC-9)
- Health check: **< 5s** per MCP
- Installation wizard: **< 30s** end-to-end

### Usage Metrics
- **> 70%** of orchestration runs use at least 1 MCP (Phase 2)
- **> 50%** of users create at least 1 collection (Phase 2)
- **> 90%** of MCP installations marked "healthy" (Phase 2)
- **< 5%** error rate on tool calls (Phase 2)

### Adoption Metrics (Phase 2+)
- Official MCPs installed by **> 80%** of users
- Community MCPs installed by **> 30%** of users
- Average **3-5 MCPs** per orchestration run
- Collections re-used across **> 10 runs** each

---

## I) Open Questions & Risks

### Open Questions
1. **MCP Registry Federation**: Should we support multiple external registries, or curate a single canonical list?
   - **Recommendation**: Start with single curated registry (Phase 1), add federation in Phase 3.

2. **Secret Storage**: Encrypted SQLite sufficient for Phase 1-2, or jump to Vault immediately?
   - **Recommendation**: Encrypted SQLite for simplicity, migrate to Vault in Phase 3 for enterprise.

3. **Egress Enforcement**: HTTP proxy vs. Docker networking vs. DNS filtering?
   - **Recommendation**: Logging-only (Phase 1), HTTP proxy (Phase 2), container networking (Phase 3).

4. **Signature Key Distribution**: How do users obtain and trust GPG public keys?
   - **Recommendation**: Platform ships with official keys, users can add trusted keys via UI (admin).

### Risks & Mitigations
| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **MCP server dependencies break installs** | HIGH | MEDIUM | Pin exact versions, test before registry update |
| **Secret redaction regex misses patterns** | HIGH | MEDIUM | Test suite with known secret formats, user-reported patterns |
| **Performance degradation with 1000+ MCPs** | MEDIUM | LOW | Pagination, search indexes, caching |
| **User confusion on allowlist model** | MEDIUM | MEDIUM | Clear onboarding flow, examples, error messages |
| **Community MCPs with malware** | HIGH | LOW | Signature requirements, periodic scans, user reporting |

---

## J) References

### Architecture Facts (Stage 0)
- [ARCHITECTURE_FACTS.md](/docs/ARCHITECTURE_FACTS.md)
- Current MCP Registry: `/data/mcp/servers.json`
- Orchestration Run Tracking: [ORCHESTRATION_RUN_TRACKING.md](/docs/ORCHESTRATION_RUN_TRACKING.md)

### Existing Patterns
- Multi-Tenancy Spec: [MULTI_TENANCY_SPEC.md](/docs/phase3/specs/MULTI_TENANCY_SPEC.md)
- Audit System: `app.py` functions `audit_log()`, `list_audit()`
- Secret Patterns: `orchestrator_logger.py` → `SECRET_PATTERNS`

### External References
- [Model Context Protocol Specification](https://spec.modelcontextprotocol.io/)
- [SLSA Provenance](https://slsa.dev/)
- [Sigstore](https://www.sigstore.dev/)

---

## K) Approval & Sign-Off

**Created By**: Platform Team  
**Reviewed By**: _Pending_  
**Approved By**: _Pending_  
**Implementation Start**: _Pending Approval_

**Sign-Off Checklist**:
- [ ] Security team review (threat model, mitigations)
- [ ] Architecture team review (data model, integration points)
- [ ] Product team review (user stories, acceptance criteria)
- [ ] Engineering team review (feasibility, effort estimates)
- [ ] Compliance team review (audit requirements, retention policies)

---

**Document Version**: 1.0  
**Last Updated**: 2026-02-03  
**Next Review**: After Phase 1 implementation
