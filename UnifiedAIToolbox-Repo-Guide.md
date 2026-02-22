# Unified AI Toolbox Repository Guide

What it solves • How to run it • How to use it over time

### How to read this document

This repo has both “consumer” docs (get the toolbox running and productive quickly) and “developer” docs (architecture, schemas, hardening details, historical planning). This guide is intentionally linear and task-oriented.

Sections 1–4 are the fast path. Sections 5–7 are deeper reference.

### What this repository solves

Unified AI Toolbox is a local-first orchestration platform that brings together prompt libraries, agent definitions, run tracking, and multiple UX entry points (web portal, API, CLI/automation). It’s designed to make AI workflows repeatable, auditable, and improvable over time.

### Core Outcomes

- Run multi-step, multi-agent workflows with saved artifacts and event logs.

- Keep prompts and agents under version control, searchable and reusable.

- Track cost/telemetry per run and accumulate longitudinal metrics.

- Safely orchestrate “repo work” (clone → analyze → plan → execute → PR) with optional gates.

- Support demo mode so the experience is testable without API keys.

### Who it’s for

- Developers building agentic workflows and wanting durable run history.

- Teams that need “run narratives” for review, debugging, and governance.

- Builders who want a single toolbox to evolve from experiments into an operational system.

### 2. Get it up and running

The fastest path is the launch portal. Manual start is best for dev/debug.

## Prerequisites

- Node.js 18+

- Python 3.12+

- PowerShell 7+ (recommended on Windows)

- Docker (optional)

### Fastest start (launch portal)

- Open `launch-portal.html` in a browser.

- Choose a launch mode and run the generated command.

## One-command launch

Linux/Mac/WSL/Git Bash:

```bash
./launch.sh
```

Windows PowerShell:

```powershell
.\Start-Toolbox.ps1
```

## Manual dev start

Prompt API (FastAPI):

```powershell
cd apps\UnifiedPromptApp\services\prompt-api
.\.venv\Scripts\python.exe -m uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

Health check:

```powershell
Invoke-WebRequest http://localhost:8000/health | Select-Object -ExpandProperty StatusCode
```

Web portal (Next.js):

```powershell
cd apps\unifiedtoolbox.webapp
npm run dev -- --hostname 0.0.0.0 --port 3000
```

## Demo mode (no keys)

Use these when you want to evaluate the UX or share the idea quickly.

- `demo-orchestration-sim.html` — full orchestration simulation

- `demo-animated.html` — animated overview

# 3. Optimal first use (first hour)

## Step 1 — Run a demo

Open `demo-orchestration-sim.html`. Your goal is to understand the run narrative: agents produce step events; steps produce artifacts; artifacts and events form the audit trail.

## Step 2 — Run a real orchestration

Start the API and web portal, then run a small workflow. Keep the run ID handy; you’ll use it to find artifacts and events.

## Step 3 — Inspect artifacts and events

- Locate the run directory and open `steps.jsonl` / `decisions.jsonl` to see what happened.

- Review the artifact manifest to understand what the run produced.

- If using repo orchestration, check the run’s clone/planning/execution outputs.

## Step 4 — Make one improvement

Pick one of: tweak a prompt, add a safety gate, refine an agent role, or improve an export template. Run again and compare artifacts. The toolbox shines when iteration is easy and recorded.

# 4. Optimal ongoing use

## Run hygiene and retention

- Keep all runs under a single root directory (example: `artifacts/runs/` or `apps/orchestration-bridge/runs/`).

- Rotate or prune runs by age/size; keep summaries and telemetry long-term.

- Prefer JSONL event logs for append-only history; generate human summaries from them.

## Cost and telemetry

- Enable cost configuration (see `config/costs.example.json`) to attach $/token estimates.

- Store telemetry as JSONL so it can be indexed later (SQLite/FTS5, Elastic, etc.).

- Use trends (daily/weekly) to detect prompt drift, rising cost, or lower success rates.

## GitHub and repo orchestration

- Repo orchestration uses an SSE-style run lifecycle (clone → intake → planning → execution → PR).

- Use gates when you need to protect repos from unsafe or malformed outputs.

- Treat GitHub tokens like radioactive isotopes: env vars only; never commit; redact in logs.

## Hardening and App Factory exports

The hardening pipeline exists to turn “AI wrote stuff” into “repo is contract-valid and reviewable.” Use it when exporting artifacts into real repositories or when running automated PR flows.

# 5. Repository map (where things live)

- `apps/unifiedtoolbox.webapp` — Next.js web portal

- `apps/UnifiedPromptApp/services/prompt-api` — FastAPI backend

- `apps/orchestration-bridge` — run tracking service + API (port 8001)

- `data/prompts` — YAML prompt library (indexed into SQLite)

- `data/agents` — YAML agent definitions and registry metadata

- `docs/` — documentation (consider splitting into `guide/`, `dev/`, `archive/`)

- `artifacts/` — run artifacts, telemetry, exports (location may vary by orchestration type)

# 6. Troubleshooting

- Port already in use: start services on different ports.

- Dependencies fail: delete `node_modules` and reinstall; recreate Python venv if needed.

- API not reachable: confirm `http://localhost:8000/health` returns `200`.

- Windows launcher cleanup issue: prefer manual start for automation/simulations.

# 7. Developer reference (deep dives)

These repo docs are valuable, but not needed on day one. Read as required.

- `docs/getting-started.md` — Setup and launch details.

- `docs/project-brief.md` — How `project_brief.json` seeds orchestration runs.

- `docs/architecture.md` — System boundaries, ports, components, and risks.

- `docs/orchestration.md` — Run types, artifact layout, tracking service.

- `docs/hardening.md` — Normalization, contracts, and safety gates.

- `docs/integrations.md` — GitHub/webhooks and integration patterns.

- `docs/telemetry.md` — Telemetry formats and sinks.

- `docs/cost-analytics.md` — How cost tracking is computed and reported.

- `docs/contributing.md` — Dev workflow, tests, and contribution norms.

- `docs/mcp/*` — MCP registry/governance/library docs.

- `docs/archive/*` — Historical planning, reports, and prompt-chain rebuild history.

# Appendix A — Glossary

- Run: A single orchestration execution with an ID, events, and artifacts.

- Agent: A role-specific prompt + constraints that produces step outputs.

- Artifact: A file produced by a run (reports, code, manifests, summaries).

- Gate: A safety/quality check that can block export/PR creation.

- JSONL: JSON Lines; append-only log format where each line is a JSON object.

- Demo mode: A no-credentials experience with realistic sample data and simulations.
