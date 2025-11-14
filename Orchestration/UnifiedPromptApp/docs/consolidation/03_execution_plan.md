# Unified Prompt Orchestrator – Execution Plan

Living roadmap that operationalizes the consolidation strategy. It sequences delivery across registry, API, UI, orchestration, and CI streams so each handoff has clear prerequisites.

## Timeline Snapshot

| Phase | Target Window | Focus | Key Deliverables | Dependencies | RACI (Owner / Support) |
| --- | --- | --- | --- | --- | --- |
| 0. Baseline | ✅ Complete | Inventory + schema | `project_inventory`, canonical YAML/JSON contract, repo scaffold | None | Architecture / PMO |
| 1. Registry Foundation | Week 1 | Seed canonical registry | Imported YAML + schemas, `PromptSpec` helpers, demos | Phase 0 | Registry Eng / Docs |
| 2. Validation & Tooling | Week 2 | Guardrails & tests | JSON Schema generator, CLI/PowerShell validators, regression tests | Phase 1 | DevEx / Registry Eng |
| 3. Prompt API Promotion | ⚙️ In Progress | 2025-11-13 | `services/prompt-api` fronting registry data, merging synced overrides, exposing refiner/review endpoints. |
| 4. Prompt Hub React Migration | Weeks 3‑4 | UI modernization | API-driven React app, governance panels, diff/export tooling | Phase 3 | Frontend / Services Eng |
| 5. Orchestration Bridge | Weeks 4‑5 | Automation workers | Refiner runner, goal connectors, telemetry writers | Phase 3 | Orchestration / Services Eng |
| 6. CI/CD & Governance | Weeks 5‑6+ | Pipelines + monitoring | Multi-stage CI, nightly critic runs, dashboards | Phase 1‑5 | DevEx / Ops |

> Update the RACI column once specific owners are assigned; default assumption is stream-aligned teams listed above.

## Phase Tracker

| Phase | Status | Last Update | Notes / Links |
| --- | --- | --- | --- |
| 0. Baseline | ✅ Complete | 2025-11-07 | See `docs/consolidation/03_execution_plan.md` (this file) + `project_inventory.md`. |
| 1. Registry Foundation | ✅ Complete | 2025-11-08 | CLI, demos, and round-trip tests landed; see `packages/prompt-registry/README.md` and status `docs/consolidation/status/2025-11-08.md`. |
| 2. Validation & Tooling | 🟡 In Progress | 2025-11-08 | JSON Schema + CI wiring now active backlog; see status log. |
| 3. Prompt API Promotion | ⚙️ In Progress | 2025-11-13 | `services/prompt-api` fronting registry data, merging synced overrides, exposing refiner/review endpoints. |
| 4. Prompt Hub React Migration | ⏳ Not Started | — | Requires API contract + governance metadata exposed. |
| 5. Orchestration Bridge | ⏳ Not Started | — | Waits for API refiner endpoints + telemetry contract. |
| 6. CI/CD & Governance | ⏳ Not Started | — | Needs registry validation + orchestration hooks. |

> Update the tracker after each weekly status entry (`docs/consolidation/status/README.md`).

## Immediate Task List

- [x] Finish prompt-registry schema tooling (JSON Schema generator + validator wiring) and publish the package for downstream consumers.
- [x] Promote `PromptService/app.py` into `services/prompt-api` with CRUD/render/refiner endpoints and documented OpenAPI contracts.
- [x] Rewire Prompt Hub + Prompt Workbench to consume Prompt API responses / registry payloads instead of local JSON or SQLite.
- [ ] Convert the orchestration bridge into a persistent service that feeds AI-Orchestration telemetry back into prompt YAML metadata.
- [ ] Fold satellite automation scripts (Data Exploration Form, Sensor-Reward, Codex swarm, etc.) into unified workflows with shared logging/telemetry.
- [ ] Add prompt/agent runbooks that generate first-glance summaries (references, reasoning, next steps) for every run and expose them across the UI and exports.
- [ ] Capture structured reasoning + references in orchestration telemetry and surface them in Prompt Hub dashboards, workbench history, and downloadable reports.
- [ ] Enhance the Prompt Hub UI with persona-aware themes/onboarding (Analyst vs Executive), guided tours, contextual tooltips, and orchestration health panels (KPIs, queue status, alerts).

## Phase 0 - Baseline (Complete)

- ✅ Inventory prompt/orchestration repos (`project_inventory.md`).
- ✅ Canonicalize the YAML schema & simplified JSON contract (`02_canonical_schema.md`).
- ✅ Scaffold monorepo folders with ownership notes (`README.md`).

## Phase 1 – Prompt Registry Foundation (Week 1)

### Phase 1 Goals

- Import Ideal Prompt Library YAML, schemas, demos, and tooling into `packages/prompt-registry`.
- Provide Python + PowerShell helpers that expose the canonical model + UI payloads.

### Tasks – Phase 1

1. Verify every `prompts/**/*.prompt.yaml` round-trips through `PromptSpec.to_ui_payload` and back.
2. Publish `prompt-registry` locally (editable install) to unblock downstream services.
3. Document registry usage (`README.md`, code samples for Python, PowerShell, Node).

### Exit Criteria – Phase 1

- `pytest` + `./scripts/Test-PromptRegistry.ps1` green.
- Example conversion script checked into `packages/prompt-registry/demos`.

## Phase 2 – Validation & Tooling (Week 2)

### Phase 2 Goals

- Embed schema validation + render tests into automated tooling callable from CLI + CI.

### Tasks – Phase 2

1. Author JSON Schema generator aligned with the canonical YAML spec.
2. Add `uv run validate-prompts` task plus PowerShell wrapper in `tools/`.
3. Extend `tests/` with regression cases (missing blocks, schema drift, validator coverage).

### Exit Criteria – Phase 2

- Git hooks / CI fail fast on invalid YAML or schema mismatch.
- Documented remediation steps in `docs/consolidation/troubleshooting.md` (TBD).

## Phase 3 – Prompt API Promotion (Weeks 2‑3)

### Phase 3 Goals

- Lift FastAPI app from `PromptService` into `services/prompt-api`; rely on registry package for storage of prompt metadata and templates.

### Tasks – Phase 3

1. Port existing render + CRUD endpoints; ensure serialization matches simplified JSON payload.
2. Implement refiner endpoints that call into PowerShell worker contracts.
3. Persist execution + review metadata (SQLite/Postgres placeholder) tied to `telemetry.audit`.

### Exit Criteria – Phase 3

- `pytest` service suite covers CRUD, render, refiner flows.
- OpenAPI spec published under `services/prompt-api/docs`.

## Phase 4 – Prompt Hub React Migration (Weeks 3‑4)

### Phase 4 Goals

- Replace legacy PromptLibrary UI with API-driven React app in `apps/prompt-hub`.

### Tasks – Phase 4

1. Copy `PromptLibrary` source, prune local YAML handling, create API client.
2. Surface governance data (risk tier, review policy, audit state) in detail panels.
3. Add diff + export flows using `PromptSpec.to_ui_payload`.

### Exit Criteria – Phase 4

- Smoke test plan (Vite dev server + mocked API) documented.
- Build output references Prompt API base URL via env config.

## Phase 5 – Orchestration Bridge & Refiner Worker (Weeks 4‑5)

### Phase 5 Goals

- Host PowerShell refiner and multi-agent review jobs in `apps/orchestration-bridge`.

### Tasks – Phase 5

1. Wrap `scripts/OpenAI_Refiner.ps1` as a job runner invocable via REST/queue.
2. Implement connectors that push updated prompts into AI-Orchestration goals.
3. Store reviewer deltas back into `telemetry.audit` fields.

### Exit Criteria – Phase 5

- Bridge exposes health/check endpoints.
- Nightly job definition documented with scheduler instructions.

## Phase 6 – CI/CD & Governance (Weeks 5‑6, then ongoing)

### Phase 6 Goals

- Provide repeatable pipelines that validate registry, run API/UI tests, and enforce orchestration review policy.

### Tasks – Phase 6

1. Author CI workflow (GitHub Actions/Azure DevOps) with stages: Lint → Unit Tests → Contract Tests → Orchestration QA.
2. Hook `integrations.orchestration.review_policy == "critical"` prompts into nightly critic swarm runs.
3. Publish dashboards (Power BI / Streamlit) that visualize prompt health, review backlog, and drift.

### Exit Criteria – Phase 6

- CI badge + documentation.
- Alerting defined for failed critical reviews.

## Workstream Dependencies

- Registry (Phase 1) must finish before API + UI teams start integration testing.
- Validation tooling (Phase 2) feeds both API and UI branches to prevent schema drift.
- Orchestration bridge (Phase 5) depends on API refiner endpoints and registry telemetry hooks.

## Cross-Stream Checklists

- **Registry Readiness**
  - [ ] `prompt-registry` published (editable install or internal feed).
  - [x] Sample scripts for Python, PowerShell, Node committed under `packages/prompt-registry/demos`.
  - [ ] Backfill legacy YAML fields to match canonical schema (owners, telemetry, integrations).
- **API Contract**
  - [x] `GET /prompts`, `GET /prompts/{id}`, `POST /render`, `POST /refiner/run` implemented.
  - [x] Response payloads reference `PromptSpec.to_ui_payload`.
  - [x] Service metrics exported (latency, render errors, refiner queue depth).
- **Frontend Experience**
  - [ ] Configurable API base URL via `.env`.
  - [ ] Governance tab surfaces `risk_tier`, `review_policy`, audit timestamps.
  - [ ] Diff view compares current vs. last validated version using registry data.
- **Orchestration Automation**
  - [ ] PowerShell worker containerized or packaged for remote execution.
  - [x] Bridge logs telemetry deltas back to YAML (`telemetry.audit.last_validated`, reviewer notes).
  - [ ] Nightly schedule + retry policy documented.
- **CI/CD**
  - [ ] Pipeline stages defined: Format/Lint → Tests → Contract → Orchestration QA.
  - [ ] Critical prompts automatically enqueued for review once merged.
  - [ ] Alerting channel + runbooks documented.

## Risks & Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Schema drift between registry and API/React clients | Serialization bugs, broken editors | Lock JSON Schema to canonical spec, add contract tests + shared package versions. |
| Refiner worker latency or failures | Blocks orchestration review SLA | Containerize PowerShell runner, add retries + health probes in bridge. |
| CI instability due to PowerShell tooling on hosted runners | Slower releases, flaky builds | Prefer self-hosted runners with required modules cached; cache Python deps; document prerequisites. |
| Storage decision delay (SQLite vs Postgres) | API persistence redesign later | Start with abstraction layer + feature flags; plan migration scripts early. |

## Reporting Cadence

- **Weekly stand-up sync** – confirm current phase status, blockers, and checklist progress.
- **Friday status note** – attach updated burndown + checklist ticks in `docs/consolidation/status/YYYY-MM-DD.md`.
- **Sprint review** – refresh this execution plan, adjust timeline or owners, record retro items.
- **Metrics dashboard** – publish render success %, refiner throughput, critical review completion by phase 6.

## Launch Procedure (Prompt Orchestrator)

1. **Readiness Gate (T‑14 days)**
   - Complete all Cross-Stream checklists; ensure Phase 5 and 6 exit criteria met.
   - Freeze schema changes and run full CI + orchestration QA suite; archive reports to `/docs/consolidation/status`.
   - Confirm incident contacts, on-call rotation, and monitoring dashboards (render latency, refiner success, API error rate).
2. **Dry Run (T‑10 to T‑7 days)**
   - Execute end-to-end scenario: registry update → API render → UI edit → orchestration review → telemetry write-back.
   - Validate rollback scripts: ability to revert registry package, disable new API routes feature flags, and drain refiner queue.
   - Capture dry-run findings in a dated status note; assign fixes before production launch.
3. **Cutover Prep (T‑3 days)**
   - Communicate launch window, expected downtime (if any), and verification checklist to stakeholders.
   - Tag release candidates (`prompt-registry`, `prompt-api`, `prompt-hub`, `orchestration-bridge`) and publish artifacts.
   - Scale infrastructure (API replicas, worker capacity) and warm caches/datasets.
4. **Launch Day (T‑0)**
   - Implement deployment order: Registry package → Prompt API → Orchestration bridge → Prompt Hub UI → CLI/Workbench updates.
   - Run smoke tests for each surface; confirm telemetry flowing into dashboards and status page indicates green.
   - Announce GA completion with links to documentation, support channel, and known issues list.
5. **Stabilization (T+1 to T+7 days)**
   - Monitor KPIs hourly (render latency, error %, critic throughput). Page on-call for breaches.
   - Hold daily triage stand-up; log incidents + mitigations in `docs/consolidation/status/YYYY-MM-DD.md`.
   - Collect user feedback, prioritize post-launch fixes, and update execution plan with next iteration goals.
6. **Post-Mortem & Handover (T+14 days)**
   - Run a retro covering what went well / improvements; document action items.
   - Transfer ownership to steady-state ops + product teams, ensuring runbooks and dashboards stay current.

## Open Questions / Decisions

1. **Storage backend** – Start with file + SQLite? or provision Postgres early?
2. **Auth model** – Does Prompt API require AAD/B2C integration in MVP?
3. **Deployment target** – Single AKS cluster vs. split App Service + Function Apps?
4. **CI runner** – GitHub Actions self-hosted vs. cloud to run PowerShell-heavy jobs?

Document owners should update this plan after each sprint review so “Next” always maps to the upcoming in-flight phase.
