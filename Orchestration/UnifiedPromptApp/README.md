# Unified Prompt Application

A monorepo scaffold that brings every prompt-centric project in `Prompt Library Projects` together with the Prompt Workbench FastAPI app and the AI-Orchestration automation stack. The goal is to make `UnifiedPromptApp` the single source of truth for prompts, refiners, UIs, and orchestration workflows.

## Contents

| Path | Purpose | Source Lineage |
| --- | --- | --- |
| `apps/prompt-hub/` | React/Vite UI that replaces `PromptLibrary` and consumes the Prompt API instead of local storage. | `Prompt Library Projects/PromptLibrary` |
| `apps/prompt-workbench/` | Streamlit experience + Power BI connector backed by API calls, evolved from `PromptService`. | `Prompt Library Projects/PromptService` |
| `apps/orchestration-bridge/` | Jobs + scripts that connect AI-Orchestration goals, refiner prompts, and registry telemetry. | `AI-Orchestration`, `AI-Orcheestration-New`, `scripts/OpenAI_Refiner.ps1` |
| `services/prompt-api/` | FastAPI/Node hybrid service that exposes CRUD, render, refiner, and orchestration hooks. | `PromptService/app.py`, `Invoke-SavedPrompt.ps1` |
| `packages/prompt-registry/` | YAML schema + validation + render helpers (Python + PowerShell facades) from Ideal Prompt Library. | `Ideal-Prompt-Library` |
| `packages/prompt-cli/` | PowerShell/Node CLIs for local scripting (Invoke/QuickStart) routed through the API. | `QuickStart.ps1`, `Invoke-SavedPrompt.ps1` |
| `docs/consolidation/` | Living design docs (inventory, canonical schema, migration plan). | Newly created |
| `tools/` | Shared dev tooling (formatters, schema generators, CI scripts). | TBD |

## Immediate Assets

- `docs/consolidation/project_inventory.md` - snapshot of every prompt-related repo and its tech stack.
- `docs/consolidation/02_canonical_schema.md` - authoritative schema + architecture decisions for the unified system.

## Launching the toolbox

Use `LaunchUnifiedDashboard.bat` (or run `pwsh ./LaunchUnifiedToolbox.ps1`) to bring up the entire stack:

- FastAPI Prompt API (default `http://localhost:8000`)
- Streamlit Prompt Workbench UI (default `http://localhost:8501`)
- React/Vite Prompt Hub dashboard (default `http://localhost:5173`)

Flags match the historical batch script: `--port` overrides the dashboard port, `--skip-install` skips dependency bootstrapping, and arguments after `--` are forwarded to `npm run dev`. Additional options are available in `LaunchUnifiedToolbox.ps1` for backend-only/frontend-only runs or port customization.

Advanced launcher switches:

- `-RunBridgeWorker` starts `apps/orchestration-bridge/bridge.py run-supervisor` alongside the API. Use `-BridgeSource local|api|both` and `-BridgeWorkerPassthru "--status-filter queued"` to tune its queue behavior.
- Automatic health probes hit `/health`, the Streamlit root, and the Vite dev server; disable them with `-SkipHealthChecks` or adjust with `-HealthTimeoutSeconds` / `-HealthRetrySeconds`.
- `-SkipStreamlit`, `-FrontendOnly`, `-BackendOnly`, and `-FrontendPassthru` keep legacy workflows working while still letting the launcher orchestrate everything else.
- The Prompt Hub UI reads the Prompt API base URL from `apps/prompt-hub/.env` (`VITE_API_BASE`, defaults to `http://localhost:8000`). Keep this pointed at the FastAPI server exposed by `LaunchUnifiedToolbox.ps1` so the dashboard can fetch prompts, render examples, and sync edits.

## Migrating legacy prompt data

Run `python packages/prompt-registry/scripts/import_legacy_prompts.py <source>` to pull specs from `Prompt Library Projects/*` into `packages/prompt-registry/prompts/catalog`. Supported sources:

- `ideal` – mirror the Ideal Prompt Library YAML as-is while validating schema compliance.
- `prompt-library` – convert `PromptLibrary/prompt-library.json` exports (React UI) into canonical `.prompt.yaml` files, normalizing IDs/variables/metadata.
- `prompt-service` – ingest FastAPI `templates/*.yaml`, splitting version suffixes, embedding dataset/output contracts as instructions, and assigning orchestration metadata.

Each run validates against `schemas/prompt.schema.json` automatically; follow up with `pwsh packages/prompt-registry/scripts/Test-PromptRegistry.ps1` for full linting.

## Next Steps

1. Import the Ideal Prompt Library YAML into `packages/prompt-registry` and expose JSON conversion utilities.
2. Copy the React source from `Prompt Library Projects/PromptLibrary` into `apps/prompt-hub` and rewire the data layer to call `services/prompt-api`.
3. Promote the FastAPI app from `PromptService/app.py` into `services/prompt-api`, layering on refiner/orchestration endpoints.
4. Wrap the existing PowerShell refiner (see `AI-Orchestration/scripts/OpenAI_Refiner.ps1`) as an API worker hosted under `apps/orchestration-bridge`.
5. Stand up CI pipelines that validate YAML, run render tests, and execute orchestrated reviews for `critical` prompts.

This scaffold intentionally contains documentation and empty directories only. Future commits will migrate real source files into their respective modules while preserving history via `git subtree`/`filter-repo` where practical.
