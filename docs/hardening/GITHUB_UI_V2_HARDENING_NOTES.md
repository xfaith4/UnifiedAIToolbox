# GitHub UI V2 Hardening Notes

Purpose: Inventory recent GitHub Integration UI V2 + artifact contract + preflight error changes and track remaining gaps.

## Inventory (recent changes)

From `git diff --stat` and untracked additions:
- `.gitignore`
- `apps/UnifiedPromptApp/services/prompt-api/app.py`
- `apps/orchestration-bridge/github_integration/clone_service.py`
- `apps/orchestration-bridge/tests/test_github_services.py`
- `apps/unifiedtoolbox.webapp/src/app/github/page.tsx`
- `apps/unifiedtoolbox.webapp/src/app/runs/[runId]/artifacts/[artifactId]/page.tsx`
- `apps/unifiedtoolbox.webapp/src/lib/types/orchestrator.ts`
- `docs/github-orchestration-ui.md`
- `docs/assets/github-orchestration-ui-screenshot.svg`
- `docs/examples/REPORT.sample.json`

## Placeholder/TODO Scan (within scope)

Global repo scan includes placeholder text in templates, demos, and archived docs. No production-path TODO/FIXME found in:
- GitHub Integration UI (`apps/unifiedtoolbox.webapp/src/app/github/`)
- Artifact viewer (`apps/unifiedtoolbox.webapp/src/app/runs/`)
- Preflight/clone service (`apps/orchestration-bridge/github_integration/clone_service.py`)
- Prompt API repo orchestration pipeline (`apps/UnifiedPromptApp/services/prompt-api/app.py`)

## Behavior Checklist

### Intended vs Implemented

- Artifact contract always emits `REPORT.md` + `REPORT.json`: **Implemented**
- Artifacts indexed with metadata in manifest/result: **Implemented**
- Preflight errors classified with friendly payloads: **Implemented**
- Artifact viewer renders Markdown/JSON/HTML: **Implemented**
- GitHub UI uses dashboard width + timeline + action bar: **Implemented (behind flag)**

### Issues Found → Resolution

- Preflight error codes mismatched requirements (`NETWORK`/`AUTH`): **Fixed**
- No long-path detection on Windows: **Fixed**
- Missing report generation when only JSON exists: **Fixed**
- Gate reports not included in artifact index: **Fixed**
- Viewer lacked text search for logs: **Fixed**
- Viewer route was ignored by `.gitignore` (`runs/`, `artifacts/`): **Fixed with explicit unignore**

## Manual Repro Status

Not executed in this environment (UI requires a running web app + API). Use checklist below.

### How to Reproduce (local)

1. Start API:
   - `cd apps/UnifiedPromptApp/services/prompt-api`
   - `python app.py`
2. Start UI:
   - `cd apps/unifiedtoolbox.webapp`
   - `NEXT_PUBLIC_GITHUB_UI_V2=true pnpm dev`
3. Visit `/github` and run:
   - Success path: select a public repo and run orchestration.
   - Fail path: set branch to a non-existent branch to trigger `BRANCH_NOT_FOUND`.
4. Verify artifact viewer:
   - Open `REPORT.md` and `REPORT.json`.
5. Simulate `DEST_NOT_EMPTY`:
   - Create a repo folder inside the run dir before cloning and retry the orchestration.

## Punch List (Remaining)

- Run full UI + API validation per checklist above.
- Capture a real screenshot/GIF (current asset is a static SVG mock).

## Automated Checks Run

- `python -m pytest apps/orchestration-bridge/tests/test_github_services.py -k "clone_repository or preflight or classify"` (passed)
- `pnpm -v` (failed: `pnpm` not available in PATH)
