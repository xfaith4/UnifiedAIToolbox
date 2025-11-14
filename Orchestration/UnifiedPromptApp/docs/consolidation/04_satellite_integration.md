# Satellite Automation Integration Plan

Brings the remaining standalone tools (data exploration UI, sensor/reward scoring, Codex swarm reviews) into the unified Prompt API + Orchestration experience so their functionality becomes part of a single toolbox rather than independent projects.

## Goals

1. __Data Exploration__ – Make the HTMX-powered form (`DataExtraction/Start-DataExplorationForm.v3-HTMX.ps1`) a first-class service so analysts can upload datasets, run prompt-driven exploration via Prompt API render/generate calls, and store the resulting summaries alongside prompts/runs.
2. __Sensor/Reward Framework__ – Wrap the PowerShell sensor scripts (`Sensor-Reward-Framework/Sensor-Reward-Framework.ps1`) as reusable monitoring profiles that feed telemetry into the Prompt API metrics endpoints and power the orchestration dashboards.
3. __Codex Swarm Reviews__ – Embed the Codex multi-agent review workflow (`AI-Orchestration/codex-multiagent-swarm`) as an optional reviewer inside the orchestration bridge service so prompt updates can trigger automated code/policy reviews without leaving the unified app.
4. __Unified Runbooks__ – Every tool should emit the same runbook format introduced by the bridge service (summary, references, reasoning, next steps) so Prompt Hub and Prompt Workbench can display consistent first-glance cards.
5. __Single Launch Experience__ – Update `LaunchUnifiedToolbox.ps1` so spinning up the toolbox also brings these helpers online (or provides toggles), with health checks exposed via the Prompt API metrics endpoint.

## Target Architecture

### Data Exploration Service
- Convert the PowerShell/HTMX form into a lightweight FastAPI or Node worker hosted under `apps/data-exploration` that:
  - Accepts file uploads or sample text, stores payloads in `services/prompt-api/data/uploads`, and registers a metadata record (dataset name, columns, owner).
  - Calls `POST /prompts/render` to build exploration/refinement prompts (e.g., analytics summarizer, SQL generator) before optionally requesting `/api/generate` for a full LLM response.
  - Emits runbook entries with dataset references (`/uploads/<id>`), SQL snippets, recommended next steps, and attaches them to the selected prompt/agent via `/prompts/{id}/reviews`.
- UI Hook: add a “Data Exploration” tab inside Prompt Hub that embeds the HTMX experience inside the React shell (or rewrites it in React) so users stay in one app.
- Telemetry: push dataset IDs + summary metrics into Prompt API metrics (`/metrics`) and allow orchestration bridge to schedule follow-up reviews when new datasets arrive.

### Sensor / Reward Integration
- Extract the sensor definitions (`New-Sensor`, `Measure-Reward`, etc.) into a Python/PowerShell hybrid module under `apps/sensor-monitor`.
- Create a service entry that:
  - Schedules sensor runs (e.g., router health, cost budget, prompt adoption) via Windows Task Scheduler or a background thread.
  - Writes reward snapshots to `services/prompt-api` using a new `/telemetry/sensors` endpoint (to be added), with fields: sensor name, raw value, normalized reward, threshold, timestamp.
  - Generates runbooks when thresholds are breached, referencing the relevant sensor profile and linking to corrective prompts/agents in Prompt Hub.
- UI: surface sensor cards in the orchestration dashboard (Prompt Hub, Workbench) with sparklines and “Investigate” buttons that jump to the recommended prompt or agent workflow.

### Codex Multi-Agent Swarm
- Bundle `AI-Orchestration/codex-multiagent-swarm` as a managed reviewer within the bridge service:
  - Extend `BridgeService` to enqueue Codex swarm runs for prompts flagged with `integrations.orchestration.review_policy == "critical"` and `integrations.orchestration.cascade == "codex"`.
  - Capture swarm findings (`Findings.md`, patches) and attach them to the runbook plus a Prompt API review entry (`runbook` field) so the React UI can show inline diffs.
  - Allow manual triggering from Prompt Hub via a “Run Codex Review” button that POSTs to `/orchestrator/tasks` with `agents: ['codex_swarm']`.
- Provide CLI wrappers for developers who still want to run the swarm locally, but ensure outputs flow through the unified telemetry/export paths.

## Implementation Checklist

### Data Exploration
1. [ ] Scaffold `apps/data-exploration` (FastAPI/Node) with upload endpoints and Prompt API client.
2. [ ] Embed exploration UI inside Prompt Hub (React page + hooks to API).
3. [ ] Implement `/datasets` endpoints in Prompt API for storing metadata and linking to prompts/agents.
4. [ ] Emit runbooks + reviews after each exploration run.
5. [ ] Add health checks + launcher hooks so the service starts with the toolbox.

### Sensor/Reward
1. [ ] Port sensor definitions into a reusable module, expose config files (`sensor-profiles/*.json`).
2. [ ] Add a background runner (Python service or PowerShell scheduled task) that reports sensor data to Prompt API.
3. [ ] Extend Prompt API with `/telemetry/sensors` and `/metrics` aggregation for dashboard consumption.
4. [ ] Show sensor cards + alerts inside Prompt Hub + Workbench dashboards.

### Codex Swarm
1. [ ] Package Codex swarm dependencies in `apps/orchestration-bridge` (or a dedicated worker) with configuration (model, shards, prompts) externalized.
2. [ ] Add bridge service hooks to call the swarm, capture output artifacts, and store them in runbooks/reviews.
3. [ ] Add Prompt Hub actions (buttons, status badges) to trigger and view swarm runs.
4. [ ] Provide documentation + toggles in `LaunchUnifiedToolbox.ps1` to enable/disable swarm reviewers per environment.

## Deliverables

- Unified telemetry/runbook schema adopted by bridge service, data exploration service, sensor monitor, and Codex swarm.
- Prompt Hub & Prompt Workbench dashboards updated to show:
  - Latest runbook summary per prompt/agent.
  - Sensor KPIs + alerts.
  - Data exploration datasets + generated recommendations.
  - Codex swarm findings/diffs.
- Launcher scripts + docs updated so the entire toolbox (Prompt API, Prompt Hub, Prompt Workbench, data exploration worker, sensor monitor, bridge service, optional Codex swarm) can be started/stopped as a single orchestrated experience.
