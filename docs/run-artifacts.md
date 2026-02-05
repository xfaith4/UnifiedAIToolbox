# Run Artifacts

This repo produces “run artifacts” in two main places:

## Orchestration sessions (UI history)

- Persisted sessions file (server-side): `data/orchestrator-history/sessions.json`
- In-browser cache (client-side): `localStorage["orchestrator-session-history"]` (compact; not authoritative)

### Project brief artifacts (wizard)

When `REQUIREMENT_WIZARD=true`, each run is seeded with:
- `project_brief.json`
- `PRD.md`
- `ACCEPTANCE.md`
- `MVP_PROMISE.md`

## App Factory export runs (repo hardening)

When exporting a repo ZIP via App Factory, the server creates a working directory:
- `.uaitoolbox/app-factory/runs/<runId>/repo/`

When `HARDENING_PIPELINE=true`, the exported repo root includes:
- `ARTIFACT_INGEST_REPORT.md`
- `ASSEMBLY_REPORT.md`
- `NORMALIZATION_REPORT.md`
- `REPO_CONTRACT.json`
- `GATE_REPORT.md` and `gate-logs/`
- `PATCHLOG.md` and `patches/`

### Diagnostics bundle

Every export run also writes a small diagnostics bundle:
- `run_state_snapshot.json`
- `run_config_snapshot.json`
- `artifact_tree.txt`
- `RUN_DIAGNOSTICS.md`
