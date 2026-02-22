# Unified AI Toolbox Architecture

Components • Ports • Data flow • Run lifecycle • Hardening


### How to read this document

This is the “developer” companion to the Repository Guide. It explains system boundaries, the run lifecycle, storage formats, and the hardening/export pipeline.

It is intentionally practical: the goal is to help you change the system without breaking the story.

## System overview

Unified AI Toolbox is a local-first orchestration platform with these major capabilities:

- Run multi-agent workflows with an append-only event stream and durable artifacts.

- Keep prompts and agents under version control (YAML/JSON), and index them for discovery.

- Provide multiple UX entry points (web portal, API, and automation scripts).

- Support repo orchestration (clone → analyze → plan → execute → PR) with optional quality/safety gates.

## Major components

### Web portal (Next.js)

- Primary UX for runs, artifacts, and dashboards.

- Subscribes to run updates (poll and/or SSE) and renders the “run narrative.”

### Prompt API (FastAPI)

- Executes prompt calls and returns normalized responses.

- Supports health checks and local development workflow.

### Orchestration bridge / run tracking service

- Creates run IDs, stores event logs, and indexes artifacts.

- Exposes run history endpoints and (where enabled) SSE streaming.

### Prompt & agent libraries

- `data/prompts` — prompt library (YAML), intended to be searchable and reusable.

- `data/agents` — agent definitions (YAML/JSON) including role constraints and IO contracts (when used).

## Ports and local URLs

Typical dev defaults (adjust as needed):

- Prompt API: `http://localhost:8000`

- Web portal: `http://localhost:3000`

- Run tracking / orchestration bridge: `http://localhost:8001` (if enabled in your layout)

## Run lifecycle

A run is the unit of work. A healthy run has:

- A run ID and a root run directory.

- Append-only event logs (JSONL).

- A manifest of artifacts produced by steps.

Common phases (varies by orchestration type):

- Intake / context build

- Planning (agents propose step plan + decisions)

- Execution (steps produce artifacts)

- Hardening (normalize → validate → repair loop)

- Export / PR publish (optional)

## Storage formats

### Runs and artifacts

Prefer a single root for all runs, with per-run subfolders.

- Run folder: `artifacts/runs/<runId>/` (example)

- Artifact manifest: `artifacts.json` or `manifest.json`

- Event logs: `events.jsonl` / `steps.jsonl` / `decisions.jsonl`

### Why JSONL

- Append-only

- Easy to stream and replay

- Simple to index later (SQLite/FTS5, Elastic, etc.)

## Hardening and export pipeline

Hardening exists to turn:

“AI wrote stuff” → “repo is contract-valid and reviewable”

Typical stages:

- Normalize: enforce repository layout conventions and file boundaries.

- Validate: schema checks and policy checks (forbidden patterns, missing sections, etc.).

- Repair loop: one or more targeted repair passes (when configured).

- Export: write outputs into a destination repo or export bundle.

- Publish: optionally open a PR with a clear run narrative.

## Security model

- Treat API keys and GitHub tokens as secrets: environment variables only.

- Redact secrets from logs and event payloads.

- Avoid writing secrets into run artifacts.

- Prefer allowlists for “what files may be written” in repo orchestration flows.

## Build plan (practical roadmap)

- Stabilize the run store location and naming conventions.

- Make SSE event streaming reliable (replay, heartbeat, disconnect cleanup).

- Ensure artifacts have a stable manifest and MIME typing.

- Expand hardening rules into a contract library that can run in CI.

- Add cost/telemetry recording per run and aggregate longitudinal metrics.

# Appendix — Glossary

- Run: A single orchestration execution with an ID, events, and artifacts.

- Agent: A role-specific prompt + constraints that produces step outputs.

- Artifact: A file produced by a run (reports, code, manifests, summaries).

- Gate: A safety/quality check that can block export/PR creation.

- JSONL: JSON Lines; append-only log format where each line is a JSON object.
