# Workflows

This page tracks the *real* workflows currently implemented in **Unified AI Toolbox**, plus the GitHub Actions workflows used to keep the repo healthy.

> Last updated: **2026-02-14**

---

## Product workflows

### App Factory: Build (new app)
The “build” workflow takes a goal + artifacts, then runs a gated pipeline:

1. **Ingest** – collect inputs / artifacts
2. **Normalize** – enforce a predictable repo layout
3. **Contract** – validate against contracts/schemas (and surface violations as structured blockers)
4. **Harden** – apply security + correctness hardening steps
5. **Validate** – determine whether export is allowed
6. **Export** – package outputs *only if validation passes*

**Observability baked in**
- Each run emits **run events** and persists **`events.jsonl`**.
- Run events can be consumed as **JSON history** *or* **SSE** (`text/event-stream`) for live UI progress.

### App Factory: Repair (existing app)
The “repair” workflow reuses the same gated pipeline, but can iterate a **repair loop**:
- detect failure mode
- propose fix
- implement
- validate
- repeat (bounded)

The UI reflects repair-cycle progress via the same run events stream.

---

## Run observability (where runs live)

Runs should be stored under a single “run observatory” root so they can be indexed for dashboards and analytics.

Current configuration options:
- **Environment variable:** `UAITOOLBOX_RUNS_DIR`
- **Config file:** `run-observatory.json` (see `config/run-observatory.example.json`)

Each run stores its event history in **`events.jsonl`** (one JSON event per line).

Security note: event payloads should redact secrets (e.g., tokens / authorization headers) before writing or streaming.

---

## MCP (Model Context Protocol) evaluation workflow

During R&D, MCP servers are treated as **comparators**, not dependencies:
- compare quality / latency / cost / failure modes
- ingest only what is legitimately extractable:
  - tool names
  - input/output schemas
  - documented guarantees
  - observable reliability metrics

If replacing an MCP integration:
- re-implement the same **schemas** over your own pipeline, or
- adopt an open-source equivalent with compatible interfaces.

---

## GitHub Actions workflows

### Available workflows
- **CI — Comprehensive** (`ci-comprehensive.yml`)
- **Repository Analysis — Scheduled** (`repo-analysis-scheduled.yml`)
- **Legacy** (`lint-test-build.yml`)

### Run workflows
From GitHub UI, or via CLI:

```bash
gh workflow run ci-comprehensive.yml
```

---

## Local equivalents (developer loop)

### Web app
```bash
cd apps/unifiedtoolbox.webapp
npm test
npm run build
```

### Orchestration bridge
```bash
cd apps/orchestration-bridge
pytest -q
```

---

## Demo / walkthrough pages
These are marketing-friendly “what it feels like” demos (not live runs):

- `demo-animated.html` — animated overview of the current capabilities
- `demo-orchestration-sim.html` — interactive run simulation

---

## Related docs
- [Telemetry](telemetry.md)
- [Cost analytics](cost-analytics.md)
- [Run events + UI progress](docs/run-events-ui-progress.md)
