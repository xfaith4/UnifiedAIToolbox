# Architecture

Purpose: Summarize the current Unified AI Toolbox stack, system boundaries, and key data flows.

## Snapshot (as of 2026-02-03)

### Frontend
- Next.js 16 (React 19, TypeScript) at `apps/unifiedtoolbox.webapp/`
- Primary port: `3000`
- Key UI libs: MUI, ReactFlow, Recharts

### Backend
- FastAPI (Python 3.12+) at `apps/UnifiedPromptApp/services/prompt-api/`
- Primary port: `8000`
- REST + SSE, OpenAPI docs at `/docs`

### Data
- SQLite (multiple DB files), direct `sqlite3` usage (no ORM)
- Prompt library: YAML files under `data/prompts/` + SQLite FTS5 index
- Agents: YAML definitions in `data/agents/`

### Authentication
- JWT-based auth with HMAC-SHA256 in `apps/UnifiedPromptApp/services/prompt-api/auth.py`
- Roles: `admin`, `user`, `readonly`

## Integration patterns

### MCP registry
- Local registry: `data/mcp/servers.json`
- Accessed via `apps/orchestration-bridge/src/utils/mcp_registry.py`

### Prompt library
- YAML prompt files in `data/prompts/`
- Indexed into SQLite (FTS5) for search

### Agent library
- YAML agent definitions in `data/agents/`
- Registry metadata in `data/agents/Agents.json`

## Runs, artifacts, and tracking

### Orchestration runs
- Run metadata: `RunMetadata` in `apps/UnifiedPromptApp/services/prompt-api/orchestrator_schemas.py`
- Step events: JSONL at `{run_dir}/steps.jsonl`
- Decisions: JSONL at `{run_dir}/decisions.jsonl`
- Artifact manifest: `{run_dir}/artifact_manifest.json`

### Run tracking service
- Orchestration-bridge runs: `apps/orchestration-bridge/runs/`
- API server: `apps/orchestration-bridge/lib/api-server.js` (port `8001`)

## Logging and telemetry
- App logging via Python `logging`
- Orchestrator JSONL logging in `apps/UnifiedPromptApp/services/prompt-api/orchestrator_logger.py`
- Telemetry JSONL under `artifacts/telemetry/`

## MCP integration context
- Current MCP registry exists and is file-backed (`data/mcp/servers.json`)
- Governance and enforcement design lives in `docs/mcp/` (see related docs)

## Risks and unknowns (short list)
- Auth user store is in-memory in some flows; persistence work remains.
- SQLite scaling for audit/telemetry may require retention and indexing.
- Registry sync sources and validation rules need continuous upkeep.
- No WebSocket streaming for real-time UI updates (polling used).
- Multiple registries (catalog vs installed) can drift without sync.

## Rollback notes (documentation-only)
- Remove archived architecture files under `docs/archive/architecture/`.
- Revert any README or docs index changes referencing those files.

## Related docs
- [Orchestration](orchestration.md)
- [Telemetry](telemetry.md)
- [MCP overview](mcp/README.md)
