# Orchestration Bridge

Glue code that links the AI-Orchestration system (see `AI-Orchestration/README.md`) with the new prompt registry.

Responsibilities:

- Wrap `scripts/OpenAI_Refiner.ps1` as an API worker/queue task so refinements can be triggered from the Prompt Hub or scheduled jobs.
- Convert commissioner feedback and Value Scores into telemetry entries inside each prompt's YAML metadata (`telemetry.audit`).
- Trigger orchestrated reviews (`review_policy: critical`) whenever prompts change or on nightly schedules.
- Provide adapters for both PowerShell automation and future Python workers.
- Cascade into Codex multi-agent swarm reviews (`AI-Orchestration/codex-multiagent-swarm`) for prompts that opt into `integrations.orchestration.cascade = "codex"`, capturing the resulting logs in runbooks.

> To enable Codex cascades for a prompt, add the following to its YAML:
>
> ```yaml
> integrations:
>   orchestration:
>     review_policy: critical
>     cascade: codex
> ```

## Current Assets

- `OpenAI_Refiner.ps1` – copied from `AI-Orchestration/scripts`, ready to be invoked by upcoming worker jobs.
- `bridge.py` – Python CLI that inspects the prompt registry, lists `review_policy: critical` prompts, and generates run manifests (optionally invoking the PowerShell refiner).

## Quickstart

From the repo root:

```bash
cd UnifiedPromptApp/apps/orchestration-bridge

# Run the persistent worker (polls Prompt API + refiner queue)
python bridge.py serve --poll-interval 120

# Enable Codex swarm cascade with a smaller parallel fan-out
python bridge.py serve --enable-codex-swarm --codex-max-parallel 2

# List prompts that require orchestrated reviews
python bridge.py list-critical

# Queue manifests for all critical prompts (writes to apps/orchestration-bridge/runs/)
python bridge.py queue

# Queue and dry-run the PowerShell refiner invocation for a single prompt
python bridge.py queue --prompt-id analytics.divisions.performance.summary --invoke-refiner --dry-run

# Record the outcome of a review back into the prompt's YAML telemetry
python bridge.py record-review analytics.divisions.performance.summary --status approved --reviewers "CriticBot,OpsLead" --notes "All KPIs validated" --manifest runs/analytics_divisions_performance_summary.2.1.0.json

# Submit a supervisor manifest (sends to Prompt API when available, falls back to spool)
python bridge.py ingest-supervisor supervisor_tasks/example.manifest.json

# Run supervisor tasks (pull from API, local spool, or both)
python bridge.py run-supervisor --source both --status-filter queued,running
```

> The CLI auto-loads the prompt registry package from `packages/prompt-registry/src`, so no install step is required. When `--invoke-refiner` is set, it calls `OpenAI_Refiner.ps1`. Use `--dry-run` if PowerShell is unavailable in your shell.

## TODO

- Port the existing PowerShell scripts, Milestone controller hooks, and run logs stored under `AI-Orchestration/runs/*` into structured services.
- Replace the manifest files with a persistent queue + API once `services/prompt-api` exposes orchestration endpoints.
- Capture runbook summaries (references, reasoning, next steps) for every automated review run and surface them in Prompt Hub dashboards.
