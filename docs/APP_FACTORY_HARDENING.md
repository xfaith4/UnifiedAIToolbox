# App Factory Hardening (Repo Contract + Normalizer + Gates)

This repo’s App Factory export path hardens generated artifacts so the resulting repo zip is **runnable by construction**.

Enable enforcement with:
- `HARDENING_PIPELINE=true`

## Pipeline

1. **Assemble**: Create minimal missing build plumbing for the selected stack (only when files are missing).
2. **Normalize**: Strip common markdown/wrapper formats from code files and enforce “raw code only”.
3. **Repo Contract**: Verify required files exist and forbidden patterns are absent. Writes `REPO_CONTRACT.json`.
4. **Acceptance Gates**: Run real commands (install/typecheck/lint/build/boot + health checks). Writes `GATE_REPORT.md` + `gate-logs/`.
5. **Patch-only Repair Loop** (max `MAX_REPAIR_CYCLES`, default 3): If gates fail, call the Fixer model for a unified diff, apply via `git apply`, then re-run normalize + gates. Writes `PATCHLOG.md` + `patches/`.

All reports are written into the exported repo root:
- `ARTIFACT_INGEST_REPORT.md` (where artifacts were stored; unsafe names go under `orphaned/`)
- `ASSEMBLY_REPORT.md`
- `NORMALIZATION_REPORT.md`
- `REPO_CONTRACT.json`
- `GATE_REPORT.md` + `gate-logs/`
- `PATCHLOG.md` + `patches/`
- `RUN_DIAGNOSTICS.md` + `run_state_snapshot.json` + `run_config_snapshot.json` + `artifact_tree.txt`

## Default stack used by the UI

The App Factory UI export currently targets:
- `node-next-app-npm` (single Next.js app using npm)

The repo also includes an example workspace contract:
- `node-next-fastify-pnpm` (pnpm workspace + Next.js web + Fastify API)

## Request sizing note (why sessionId is used)

Export requests can be large if they include full file contents. The UI prefers sending a `sessionId`, and the export endpoint loads artifacts from the persisted history file under `data/orchestrator-history/`.

## Adding a new stack contract

1. Create a new JSON contract under:
   - `apps/unifiedtoolbox.webapp/src/lib/app-factory/contracts/stacks/<stackId>.json`
2. Register it in:
   - `apps/unifiedtoolbox.webapp/src/lib/app-factory/contracts/loadContract.ts`
3. (Optional) Add stack-specific scaffolding in:
   - `apps/unifiedtoolbox.webapp/src/lib/app-factory/assemble/assembleRepo.ts`

Contract tips:
- `requiredFilesAll`: glob patterns that must match at least one file.
- `codeFileExtensions`: treated as “code files” for wrapper stripping + purity checks.
- `forbiddenPatternsByExtension`: regex rules to forbid markdown wrappers (e.g. fences, “## File:” headers).
- `installCommand/buildCommand`: required; others are optional.
- `bootCommands/healthChecks`: if both provided, boot gate runs and health is polled until timeout.

## Interpreting gate reports

- `GATE_REPORT.md`: high-level pass/fail + which step failed + log paths.
- `gate-logs/*.log`: full stdout/stderr for each command and boot process.
- `REPO_CONTRACT.json`: contract evaluation output; inspect `failures[]` for actionable items.
- `NORMALIZATION_REPORT.md`: which files were modified + any remaining purity violations.

## Tuning timeouts / repair cycles

Environment variables (defaults shown):
- `MAX_REPAIR_CYCLES=3`
- `GATE_TIMEOUT_SECONDS=600`
- `BOOT_TIMEOUT_SECONDS=120`
- `HEALTH_POLL_INTERVAL_MS=1000`
- `APP_FACTORY_FIXER_MODEL=gpt-4o-mini`

Fixer API key resolution (server-side):
- Prefer `OPENAI_API_KEY`
- Fallback: `NEXT_PUBLIC_OPENAI_API_KEY` / `NEXT_PUBLIC_API_KEY`
