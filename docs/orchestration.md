# Orchestration

Purpose: Describe orchestration run types, artifacts, and tracking in the Unified AI Toolbox.

## Orchestration surfaces

### UI orchestration (engine + history)
- Runtime snapshot in the web portal (`apps/unifiedtoolbox.webapp/src/app/engine/_source/`)
- Persisted history at `data/orchestrator-history/sessions.json`

### Repository orchestration (SSE)
- Endpoint: `POST /orchestrate/repo`
- Artifacts: `apps/orchestration-bridge/runs/<run_id>/`
- Requires a GitHub token with `repo` scope

### App Factory export (hardening pipeline)
- Working dir: `.uaitoolbox/app-factory/runs/<runId>/repo/`
- Reports: `ARTIFACT_INGEST_REPORT.md`, `NORMALIZATION_REPORT.md`, `REPO_CONTRACT.json`, `GATE_REPORT.md`, `PATCHLOG.md`

## Run artifact layout (JSON/JSONL)
Artifacts commonly found under `artifacts/runs/<run_id>/`:
- `run.json` — run metadata and context
- `steps.jsonl` — step-level agent events (JSON Lines)
- `decisions.jsonl` — decision ledger entries
- `conflicts.jsonl` — conflict resolution log
- `artifacts.json` — artifact manifest (paths, hashes)
- `verification.json` — lint/build/test/boot results (when enabled)

## Run tracking service
- Service: `apps/orchestration-bridge/lib/api-server.js`
- Storage: `apps/orchestration-bridge/runs/` with `index.json`
- API: `http://localhost:8001/api/runs`
- Cost configuration: `config/costs.example.json`

## Run lifecycle (repo orchestration)
1. Clone
2. Intake
3. Planning
4. Execution
5. PR creation

## Frontend/backend connection
- The web portal reads `NEXT_PUBLIC_API_BASE` (default `http://localhost:8000`).
- Docker compose sets this for local browser access.

## Related docs
- [Engine status schema](engine-status-schema.md)
- [Hardening](hardening.md)
- [Integrations](integrations.md)
