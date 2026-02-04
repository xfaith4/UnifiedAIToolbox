# MCP Library Implementation Roadmap

**Status**: Phase 1 Complete (85% Done)  
**Last Updated**: 2026-02-04  
**Owner**: Platform Team

---

## Executive Summary

The MCP (Model Context Protocol) Library is a secure, curated discovery and governance system for MCP servers within the Unified AI Toolbox. The core governance logic and API endpoints are now **fully functional**. This document outlines the remaining work to complete the full feature set.

---

## Current Implementation Status

### ✅ Completed Components (Phase 1)

#### 1. Core Governance System
- **Policy Engine** (`policy_engine.py`)
  - ✅ DefaultPolicyEngine with allow/deny logic
  - ✅ Install status checking
  - ✅ Allowlist evaluation (run → job → user → global)
  - ✅ Explicit denial checking
  - ✅ Sensitive field detection and redaction
  - ✅ Risk scoring infrastructure

- **Runtime Enforcer** (`runtime_enforcer.py`)
  - ✅ Tool call enforcement workflow
  - ✅ Policy evaluation integration
  - ✅ Audit logging integration
  - ✅ Response redaction
  - ✅ JsonlAuditLogger implementation
  - ✅ Error handling with fail-secure defaults

#### 2. Data Storage Layer
- **Storage Module** (`storage.py`)
  - ✅ Server catalog operations (get, search, filter)
  - ✅ Collection CRUD operations
  - ✅ Install record management
  - ✅ Allowlist persistence
  - ✅ **NEW**: Audit log JSONL operations
  - ✅ **NEW**: Audit event querying with filters
  - ✅ **NEW**: Audit summary statistics

#### 3. API Endpoints
- **Registry Management** (`api_routes.py`)
  - ✅ POST `/api/mcp/registry/sync` - Basic sync (validates local registry)
  - ✅ GET `/api/mcp/registry/sources` - Returns default sources
  - ✅ POST `/api/mcp/registry/sources` - Validates and accepts new sources

- **Server Browse/Search**
  - ✅ POST `/api/mcp/servers/search` - Full-text search with filters
  - ✅ GET `/api/mcp/servers/{id}` - Server details with install status

- **Collections CRUD**
  - ✅ GET `/api/mcp/collections` - List with pagination and tag filtering
  - ✅ POST `/api/mcp/collections` - Create with user tracking
  - ✅ GET `/api/mcp/collections/{id}` - Get specific collection
  - ✅ PUT `/api/mcp/collections/{id}` - Update collection
  - ✅ DELETE `/api/mcp/collections/{id}` - Remove collection

- **Install Records**
  - ✅ GET `/api/mcp/installs` - List with status filtering
  - ✅ POST `/api/mcp/installs` - Create install record with user tracking
  - ✅ GET `/api/mcp/installs/{id}` - Get specific install
  - ✅ PUT `/api/mcp/installs/{id}` - Update install
  - ✅ POST `/api/mcp/installs/{id}/enable` - Enable server
  - ✅ POST `/api/mcp/installs/{id}/disable` - Disable server

- **Allowlists**
  - ✅ GET `/api/mcp/allowlists` - List with scope filtering
  - ✅ POST `/api/mcp/allowlists` - Create allowlist with user tracking
  - ✅ **NEW**: GET `/api/mcp/allowlists/{id}` - Get specific allowlist
  - ✅ **NEW**: PUT `/api/mcp/allowlists/{id}` - Update allowlist
  - ✅ **NEW**: DELETE `/api/mcp/allowlists/{id}` - Remove allowlist
  - ✅ POST `/api/mcp/allowlists/bind` - Convenience endpoint

- **Audit Logs**
  - ✅ **NEW**: POST `/api/mcp/audit/query` - Query with comprehensive filters
  - ✅ **NEW**: GET `/api/mcp/audit/events/{id}` - Get specific event
  - ✅ **NEW**: GET `/api/mcp/audit/summary` - Statistics dashboard data

#### 4. Authentication Integration
- ✅ Optional auth support with fallback
- ✅ `get_user_id()` helper function
- ✅ User tracking in collections, installs, allowlists
- ✅ Compatible with existing `auth.py` JWT system

#### 5. Data Models
- ✅ All Pydantic schemas complete
- ✅ **NEW**: Added `updated_at` to Allowlist model
- ✅ Enum types for status, scope, event types
- ✅ Validation rules and field constraints

#### 6. Web UI - Browse Functionality
- ✅ Server search with filters (status, tags, capabilities)
- ✅ Server cards with installation status
- ✅ Detail view with capabilities and metadata
- ✅ Refresh functionality

---

## Remaining Work

### Phase 2: UI Implementation (Priority: Medium)

**Estimated Effort**: 2-3 days

#### Collections Tab UI
**Location**: `apps/unifiedtoolbox.webapp/src/app/mcp-library/page.tsx` (line 292)

**Tasks**:
1. Replace "coming soon" placeholder with functional UI
2. Display list of existing collections with:
   - Collection name and description
   - Count of servers in collection
   - Tags for filtering
   - Created by and creation date
3. Add "Create Collection" dialog:
   - Name and description fields
   - Multi-select for servers
   - Tag input
4. Add edit/delete actions per collection
5. Add "Apply to Run" button (quick allowlist binding)

**API Integration**:
- GET `/api/mcp/collections` for listing
- POST `/api/mcp/collections` for creation
- PUT `/api/mcp/collections/{id}` for updates
- DELETE `/api/mcp/collections/{id}` for deletion

#### Installations Tab UI
**Location**: `apps/unifiedtoolbox.webapp/src/app/mcp-library/page.tsx` (line 298)

**Tasks**:
1. Replace "coming soon" placeholder with functional UI
2. Display list of installed servers with:
   - Server name and status (enabled/disabled/pending)
   - Installation date and installed by
   - Configuration summary
   - Enable/disable toggle
3. Add server configuration panel:
   - Edit config JSON
   - Update notes
   - View installation logs
4. Add uninstall functionality with confirmation
5. Show health check status (if available)

**API Integration**:
- GET `/api/mcp/installs` for listing
- POST `/api/mcp/installs/{id}/enable` for enabling
- POST `/api/mcp/installs/{id}/disable` for disabling
- PUT `/api/mcp/installs/{id}` for config updates

#### Install Button Handlers
**Locations**:
- `apps/unifiedtoolbox.webapp/src/app/mcp-library/page.tsx` (line 175)
- `apps/unifiedtoolbox.webapp/src/app/mcp-library/[serverId]/page.tsx` (line 129)

**Tasks**:
1. Implement install workflow:
   - Open installation dialog
   - Collect configuration (if needed)
   - Call POST `/api/mcp/installs`
   - Show progress/success feedback
2. Update UI state after installation
3. Add error handling and validation
4. Support different install methods (npm, docker, manual)

#### Audit Log Viewer (Optional)
**New Component**: `apps/unifiedtoolbox.webapp/src/app/mcp-library/audit.tsx`

**Tasks**:
1. Create audit log viewer page
2. Display events in timeline format
3. Add filtering by:
   - Event type
   - Server/tool
   - Time range
   - User
4. Show redacted fields indicator
5. Link to related servers/runs

**API Integration**:
- POST `/api/mcp/audit/query` with filters
- GET `/api/mcp/audit/summary` for dashboard

---

### Phase 3: Registry Integration (Priority: Medium-Low)

**Estimated Effort**: 3-5 days

#### External Registry Sync
**Location**: `apps/UnifiedPromptApp/services/prompt-api/mcp_governance/api_routes.py` (line 65)

**Current State**: Basic implementation validates local registry

**Enhancement Tasks**:
1. Integrate with existing ingestion service:
   - Import from `apps/orchestration-bridge/src/utils/registry_adapter.py`
   - Use `resolve_servers()` for discovery
2. Implement GitHub discovery:
   - Search for repos with topic `mcp-server`
   - Parse MCP manifest files
   - Extract capabilities and metadata
3. Add deduplication logic:
   - Compare server IDs
   - Merge metadata from multiple sources
   - Handle version conflicts
4. Implement incremental sync:
   - Track last sync time per source
   - Only fetch updates since last sync
   - Respect rate limits
5. Add validation:
   - Verify server manifest format
   - Check for required fields
   - Validate capability declarations

**Files to Modify**:
- `api_routes.py` - Enhance sync endpoint
- `storage.py` - Add `upsert_servers()` for merging
- Create `registry_sync.py` - Dedicated sync service

#### Registry Source Management
**Location**: `apps/UnifiedPromptApp/services/prompt-api/mcp_governance/api_routes.py` (line 90, 101)

**Current State**: Returns hardcoded default sources

**Enhancement Tasks**:
1. Create sources configuration file:
   - Location: `data/mcp/registry_sources.json`
   - Store source ID, type, URL, credentials
2. Implement source persistence:
   - Save new sources to config
   - Load sources at startup
   - Support enable/disable per source
3. Add source validation:
   - Check URL accessibility
   - Validate manifest format
   - Test authentication
4. Add source types:
   - GitHub organization/topic
   - NPM registry search
   - Custom HTTP endpoint
   - Local file path

**New Storage Functions**:
```python
def get_registry_sources() -> List[RegistrySource]
def save_registry_source(source: RegistrySource) -> RegistrySource
def delete_registry_source(source_id: str) -> bool
def test_registry_source(source: RegistrySource) -> Dict[str, Any]
```

---

### Phase 4: Orchestration Integration (Priority: Low)

**Estimated Effort**: 5-7 days

**Goal**: Automatically enforce MCP governance policies during orchestration runs

#### Runtime Enforcement Middleware
**New File**: `apps/UnifiedPromptApp/services/prompt-api/orchestration_mcp_middleware.py`

**Tasks**:
1. Create middleware to intercept MCP calls:
   - Hook into agent tool execution
   - Extract server_id and tool_name
   - Build ToolCallRequest from invocation
2. Integrate RuntimeEnforcer:
   - Call `enforcer.enforce_tool_call()`
   - Block denied calls before execution
   - Log allowed calls to audit trail
3. Handle enforcement errors:
   - Return clear error messages
   - Log failed enforcement attempts
   - Fail-secure on policy engine errors
4. Add response auditing:
   - Call `enforcer.log_tool_execution()` after completion
   - Capture execution time and success/failure

**Integration Points**:
- `agent_library_router.py` - Add enforcement to agent routing
- `orchestrator.py` - Wire up middleware
- Environment config for enforcement toggle

#### Allowlist Auto-Creation
**Location**: Orchestrator run creation workflow

**Tasks**:
1. Add MCP allowlist field to run creation:
   - UI component for server/collection selection
   - API parameter in POST `/api/orchestrator/runs`
2. Automatically create allowlist on run creation:
   - Generate allowlist_id
   - Set scope to "run" with run_id
   - Persist to storage
3. Show allowlist in run details:
   - Display allowed servers/collections
   - Show policy decisions during run
   - Link to audit events

#### Policy Violation Reporting
**New Component**: Policy violation dashboard

**Tasks**:
1. Create `/api/mcp/violations` endpoint:
   - Query audit logs for denied calls
   - Group by server, tool, user, run
   - Calculate violation trends
2. Add UI view for violations:
   - Show most-denied servers/tools
   - Highlight potential policy gaps
   - Suggest allowlist additions
3. Add alerting (optional):
   - Email on repeated denials
   - Slack integration
   - Webhook support

---

## Testing Strategy

### Unit Tests (Existing)
- ✅ `test_policy_engine.py` - Policy evaluation logic
- ✅ `test_storage.py` - Storage operations

### Integration Tests (To Add)
**New File**: `tests/integration/test_mcp_governance_api.py`

**Test Cases**:
1. End-to-end server installation flow
2. Collection creation and allowlist binding
3. Audit log query with various filters
4. Registry sync with mocked external source
5. Policy enforcement with RuntimeEnforcer
6. Auth integration (user tracking)

### UI Tests (To Add)
**New File**: `apps/unifiedtoolbox.webapp/tests/mcp-library.test.tsx`

**Test Cases**:
1. Server search and filtering
2. Collection CRUD operations
3. Install/uninstall workflows
4. Allowlist binding UI
5. Audit log viewer

---

## Deployment Checklist

### Configuration
- [ ] Set `AUTH_AVAILABLE = True` in production
- [ ] Configure registry sources in `data/mcp/registry_sources.json`
- [ ] Set audit log retention policy
- [ ] Configure default global allowlist
- [ ] Enable CORS for frontend

### Data Migration
- [ ] Initialize `data/mcp/` directory structure
- [ ] Seed initial server registry from `servers.json`
- [ ] Create default collections (if any)
- [ ] Set up backup/restore for audit logs

### Monitoring
- [ ] Add metrics for policy decisions (allow/deny ratio)
- [ ] Track audit log growth rate
- [ ] Monitor API endpoint latency
- [ ] Alert on enforcement errors

---

## Security Considerations

### Current Security Posture
- ✅ Deny-by-default policy enforcement
- ✅ Fail-secure on errors (deny if policy evaluation fails)
- ✅ Automatic sensitive field redaction
- ✅ Audit trail for all decisions
- ✅ Scope-based access control

### Remaining Security Tasks
- [ ] Add rate limiting to API endpoints
- [ ] Implement RBAC for admin operations
- [ ] Add cryptographic signing for audit logs
- [ ] Implement log rotation and archiving
- [ ] Add anomaly detection for policy violations
- [ ] Conduct security review of policy engine logic

---

## Performance Optimization (Future)

### Current Performance
- Policy evaluation: < 5ms per call (estimated)
- Audit log write: < 2ms per event (JSONL append)
- Server search: O(n) linear scan (acceptable for < 1000 servers)

### Optimization Opportunities
1. **Audit Log Storage**:
   - Migrate to SQLite for faster queries
   - Add indexes on run_id, server_id, timestamp
   - Implement log rotation to manage file size

2. **Server Search**:
   - Add in-memory index for common filters
   - Implement prefix tree for name search
   - Cache search results for popular queries

3. **Policy Evaluation**:
   - Cache allowlist lookups per run
   - Precompute collection expansions
   - Optimize regex patterns for sensitive fields

---

## Documentation Tasks

### API Documentation
- [x] `MCP_GOVERNANCE_API.md` - Comprehensive endpoint reference (exists)
- [x] `MCP_LIBRARY_WALKTHROUGH.md` - User guide (exists)
- [ ] Add OpenAPI/Swagger spec generation
- [ ] Update with new audit endpoints

### Developer Documentation
- [ ] Create `CONTRIBUTING_MCP_LIBRARY.md`
- [ ] Document policy engine extension points
- [ ] Add examples for custom redaction rules
- [ ] Document storage layer interface

### User Documentation
- [ ] Create video walkthrough for web UI
- [ ] Add screenshots to walkthrough guide
- [ ] Create troubleshooting section
- [ ] Document common policy patterns

---

## Success Metrics

### Phase 1 (Completed)
- ✅ 100% of core API endpoints functional
- ✅ Zero TODO comments in critical paths
- ✅ All storage operations tested
- ✅ Auth integration working

### Phase 2 (UI Implementation)
- [ ] All three tabs functional (Browse, Collections, Installations)
- [ ] Install workflow < 5 clicks end-to-end
- [ ] Zero placeholder alerts visible
- [ ] Audit log viewer operational

### Phase 3 (Registry Integration)
- [ ] Registry sync populates > 50 servers
- [ ] Sync completes in < 30 seconds
- [ ] Zero duplicate servers after sync
- [ ] Multiple source types supported

### Phase 4 (Orchestration Integration)
- [ ] 100% of MCP calls go through enforcement
- [ ] Zero policy bypass incidents
- [ ] Audit log captures all invocations
- [ ] Policy violations detected and reported

---

## Contact & Support

**Technical Lead**: Platform Team  
**Repository**: https://github.com/xfaith4/UnifiedAIToolbox  
**Issues**: https://github.com/xfaith4/UnifiedAIToolbox/issues  
**Discussions**: https://github.com/xfaith4/UnifiedAIToolbox/discussions

For questions or contributions related to MCP governance, please:
1. Check existing documentation in `/docs/MCP_*.md`
2. Search for related issues
3. Open a new discussion or issue with `[MCP Library]` prefix
