# UX Stack Discovery (UnifiedAIToolbox)

## Frontend(s)

### Next.js Web Portal (primary)
- Location: `apps/unifiedtoolbox.webapp/`
- Framework: Next.js (App Router) + React 19
- Language: TypeScript
- Styling: TailwindCSS (plus MUI present in deps)
- Icons: lucide-react
- Data viz: recharts, d3, reactflow
- State: mostly React state + local stores under `src/lib/services/*Store.ts`
- Build/dev: `npm run dev`, `next build`, `next start`
- Lint: ESLint (eslint-config-next)
- Unit tests: Vitest

### "Dashboard" (secondary / currently Docker-only)
- Location: `apps/dashboard/`
- Current state: Dockerfile only; the PowerShell launchers gracefully skip it if `package.json` is missing.

## Backend

### Prompt API (FastAPI)
- Location: `apps/UnifiedPromptApp/services/prompt-api/`
- Runtime: Python + Uvicorn
- Launch: `python -m uvicorn app:app --reload --host 0.0.0.0 --port 8000`

## Launch & Orchestration
- Launcher script: `Start-Toolbox.ps1`
  - Starts Prompt API and Next.js portal
  - Note: In `-Mode` flows with `-NoWait`, the script’s `finally` block stops child processes; for automation use manual launch commands (see runbook).

## Observability & Artifacts
- Repo-level artifacts directory exists: `artifacts/`
  - Telemetry directory exists: `artifacts/telemetry/`
  - This UX work will append web UX events + simulation artifacts under `artifacts/ux-simulations/`.

## Next Steps (this project)
1. Add client-side UX telemetry + dev "black box" overlay in the Next.js portal.
2. Add Playwright-based synthetic journey runner (100+ runs) with traces/screenshots.
3. Use results to rank friction points and implement fixes with proof.
