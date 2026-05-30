# Unified AI Toolbox Roadmap

Last updated: 2026-05-26

## Purpose

This file is the canonical roadmap and implementation ledger for active Unified AI Toolbox delivery.

Use this roadmap to keep coding agents focused on a coherent product path:

`Intent -> Proposal -> Cast -> Run -> Observe -> Decide -> Resume or Reframe -> Learn -> Improve the next run`

The project is no longer proving that orchestration is possible. The next goal is to make orchestration durable, observable, and capable of producing verified application outputs.

## Product north star

Unified AI Toolbox is a local-first orchestration platform for repeatable, auditable AI workflows. It combines prompt libraries, agent rosters, governed tools, run tracking, artifact evidence, and learning capture into a coherent application-production studio.

The product should help an operator:

1. describe an idea or repository task clearly,
2. convert that intent into a proposal and executable run plan,
3. supervise an agent collective with visible gates and evidence,
4. recover from blockers without losing run context,
5. produce runnable, reviewable deliverables,
6. preserve lessons so future runs improve.

## Roadmap rules for coding agents

### Single source of truth

- Update this file for active roadmap work.
- Do not create parallel roadmap, remaining-task, or implementation-summary files.
- Completed checklist items must stay near the feature track they complete.
- Historical or supporting docs may exist, but this file decides active delivery order.

### Implementation discipline

- Prefer small, reversible PRs or change sets.
- Preserve existing routes and behavior unless a roadmap item explicitly changes them.
- Do not start broad refactors while a higher-priority gate is failing.
- Every completed item must include:
  - completion date,
  - touched files or run reference,
  - brief implementation note,
  - verification evidence when applicable.

### Run evidence standard

A run is not credible because agents produced text. A run is credible when the system can show:

- canonical events,
- indexed artifacts,
- terminal summary,
- gate results,
- blocker or decision state,
- repair history when repairs occurred,
- final readiness state.

## Status key

| Status | Meaning |
| --- | --- |
| `planned` | Scoped, not started |
| `in_progress` | Active delivery |
| `at_risk` | Blocked, ambiguous, or dependent on unresolved architecture |
| `done` | Delivered and logged with evidence |
| `deferred` | Intentionally postponed; do not implement without reopening |

## Current delivery focus

### Now — next sprint

1. **Wire all run producers to canonical event, artifact, and summary helpers.**
   - Replace legacy-only writes with canonical helpers.
   - Keep compatibility fallbacks until canonical output is proven.
   - This is the top priority because Run Console, manifest APIs, acceptance gates, and future arena evaluation depend on canonical run evidence.

2. **Make terminal run state authoritative.**
   - Ensure `run_state.json`, final summary, overseer/advisory state, agent cards, and manifest outcome agree at completion, failure, cancellation, or pause.
   - A completed run must not leave stale `running`, `working`, or partial agent states in terminal artifacts.

3. **Harden generated-app verification.**
   - Fail verification when runtime logs or route probes show post-startup errors.
   - Compare declared artifacts against materialized files.
   - Require a final delivery/readiness state backed by evidence.

### Soon — after canonical producer wiring

1. **Reconcile agent-library drift.**
   - Resolve divergence between `prompts/agent-library.active.json` and `Orchestration/agents/agent-library.json`.
   - Choose one checksum/export policy.
   - Re-run `Check-AgentExports.ps1`.
   - Fix the stale Researcher checksum value.

2. **Complete A2A envelope adoption.**
   - Extend envelope contract usage to Researcher, Supervisor, and Historian.
   - Validate with `apps/unifiedtoolbox.webapp/src/lib/contracts/a2aEnvelope.ts`.

3. **Add browser-level frontend evidence.**
   - Route checks, section-presence checks, primary interaction checks, responsive screenshots or equivalent proof.
   - This applies to App Factory and future arena lanes.

### Later — after evidence is reliable

1. Add live-tail mode for `/api/runs/[runId]/events/canonical`.
2. Add E2E HTTP route tests for manifest, artifacts, canonical events, and summary APIs.
3. Add Windows-safe cross-process file locking for `events.jsonl` append paths if multi-writer runs become supported.
4. Add optional frontier provider lanes behind the canonical lane contract.
5. Feed arena outcomes into Knowledge and recipe recommendations.

---

## Main roadmap

| ID | Feature track | Status | Horizon | Definition of done |
| --- | --- | --- | --- | --- |
| RM-001 | Platform reliability | done | complete | CI, build, launch, and high-impact typing blockers are stable enough for continued development |
| RM-002 | Documentation governance | done | complete | Docs hub, roadmap discipline, and traceability rules are established |
| RM-003 | Concierge staged evolution | done | complete | Concierge supports IA, proposal generation, recipe handoff, narration, tool audit, and modes |
| RM-004 | MCP governance | done | complete | Registry, installs, collections, allowlists, runtime enforcement, audit viewer, and violations dashboard are delivered |
| RM-005 | Run observability and reporting | done | complete | Runs and Run Detail expose status, heartbeat, stuck state, event visibility, blockers, and runtime activity |
| RM-006 | Export hardening and artifact quality gates | done | complete | Exports include quality evidence and risk signaling |
| RM-007 | Web deployment strategy | done | complete | Dynamic Next.js deployment target and workflow constraints are documented |
| RM-008 | Run lifecycle control and lease safety | done | complete | Canonical run state, leases, heartbeat, cancel, force-cancel, requeue, and stuck recovery are implemented |
| RM-009 | App Factory Phase 1 — Closed Feedback Loop | done | complete | Sandbox engine, acceptance evaluator, refinement controller, verify/refine endpoints, and verification UI are delivered |
| RM-010 | Orchestration experience unification | in_progress | next | Product narrative is unified from intake through run review; prompts, agents, and tools are reusable in context |
| RM-011 | App production loop | in_progress | next | `build_new_app` produces materialized applications with executable gate evidence, repair routing, browser proof, and final readiness state |
| RM-012 | Frontier software factory | in_progress | next | Multiple isolated candidate lanes can be evaluated, adjudicated with evidence, and promoted based on verified outcomes |
| RM-013 | Canonical producer migration and run-evidence hardening | in_progress | now | Every run producer emits canonical events, artifact indexes, and final summaries without relying on legacy fallbacks |

---

## RM-013 — Canonical producer migration and run-evidence hardening

**Status:** `in_progress`
**Horizon:** `now`
**Owner:** orchestration/runtime

### Goal

Populate the canonical run infrastructure consistently so Run Console and API consumers can trust one event stream, one artifact index, and one terminal summary.

### Scope

- Orchestrator run producers
- Prompt API run producers
- App Factory run producers
- Agent runner outputs
- Manifest, artifact, event, and summary APIs
- Terminal state reconciliation

### Out of scope

- New UX redesigns
- New provider lanes
- New repair strategies
- Broad run-store replacement

### Worklist

- [ ] Wire orchestrator and agent runners to canonical event helpers.
  - Replace legacy-only `events.ndjson` and ad-hoc `run_state.json` writes with calls to:
    - `appendEvent`
    - `indexArtifact`
    - `writeFinalSummary`
  - Preserve legacy fallbacks until the acceptance checklist passes against new runs.
  - Contracts:
    - `docs/contracts/EVENT_TAXONOMY.md`
    - `docs/contracts/RUN_LIFECYCLE.md`

- [x] Complete prompt-api producer migration.
  - Ensure prompt-api run creation, stage transitions, checkpoint pauses, failure paths, and terminal paths emit canonical events.
  - Ensure prompt-api artifacts are indexed as they are created, not retroactively guessed by the UI.
  - Additional progress (2026-05-27): prompt-api run creation/execution/cancel paths now append canonical `events.jsonl`; run hydration prefers canonical events and now loads `final_summary.json` when present.
  - Additional progress (2026-05-27): terminal summary enforcement added for success/failure/cancel via `final_summary.json`; failure visibility artifact (`run_failure.md`) is written for non-successful runs.
  - Additional progress (2026-05-27): minimum Run Evidence Viewer MVP success profile added (concierge acceptance + materialized output + smoke/dev-server proof) and enforced as a terminal failure when unmet.
  - Additional progress (2026-05-27): runtime event writes now route through shared helper paths in prompt-api (run creation, lease/status transitions, cancel/force-cancel/requeue/stale-lease, checkpoint resume, and executor debug/checkpoint events), with canonical append centralized.
  - Touched files: `apps/UnifiedPromptApp/services/prompt-api/app.py`, `apps/UnifiedPromptApp/services/prompt-api/tests/test_orchestration.py`.
  - Verification: `pytest apps/UnifiedPromptApp/services/prompt-api/tests/test_orchestration.py` (33 passed).

- [ ] Complete App Factory producer migration.
  - Partial progress already exists for run start/cancel routes and launcher error artifact indexing.
  - Additional progress (2026-05-26): shared runtime emitter now writes canonical `events.jsonl` via `appendEvent`; runtime event normalization now maps canonical fields (`event_type`, `severity`, `agent_name`), and offset-based event reads now fall back to `events.jsonl` when `events.ndjson` is absent.
  - Additional progress (2026-05-27): App Factory run consumers now prioritize canonical `events.jsonl` before legacy `events.ndjson` in run status loading and `/api/app-factory/runs/[runId]/events` history/offset paths.
  - Additional progress (2026-05-30): sandbox/refinement producers now dual-write legacy `events.ndjson` plus canonical `events.jsonl`; sandbox report creation now indexes `sandbox_report.json` and emits canonical `artifact_created` linkage for report evidence.
  - Touched files: `apps/unifiedtoolbox.webapp/src/lib/app-factory/runs/runEvents.ts`, `apps/unifiedtoolbox.webapp/src/lib/app-factory/runs/runtimeEventUtils.ts`, `apps/unifiedtoolbox.webapp/src/app/api/app-factory/runs/[runId]/events/route.ts`, `apps/unifiedtoolbox.webapp/src/lib/app-factory/runs/runStatus.ts`.
  - Touched files (2026-05-30): `apps/unifiedtoolbox.webapp/src/lib/app-factory/sandbox/sandboxEngine.ts`, `apps/unifiedtoolbox.webapp/src/lib/app-factory/sandbox/refinementLoop.ts`, `apps/unifiedtoolbox.webapp/src/lib/app-factory/sandbox/__tests__/refinementLoop.test.ts`.
  - Verification (2026-05-30): `npm --prefix apps/unifiedtoolbox.webapp run test -- src/lib/app-factory/sandbox/__tests__/refinementLoop.test.ts` passed (9 tests); `npm --prefix apps/unifiedtoolbox.webapp run test` passed (63 files, 434 tests); targeted eslint on touched sandbox files passed; `npm --prefix apps/unifiedtoolbox.webapp run typecheck` and `npm --prefix apps/unifiedtoolbox.webapp run build` still fail on pre-existing missing module `@/lib/runs/runFailureSummary`.
  - Finish remaining App Factory paths that still depend on legacy fallback state.

- [ ] Add canonical terminal summary enforcement.
  - Every terminal run must have exactly one final summary.
  - Summary must include:
    - final status,
    - quality outcome,
    - blocker state,
    - generated-app readiness if applicable,
    - artifact index pointer,
    - verification evidence pointer.
  - Additional progress (2026-05-30): prompt-api terminal evidence healing now refreshes stale `final_summary.json` whenever terminal manifest truth changes (instead of only writing when missing), and explicitly re-reconciles `run_state.json` to terminal outcome even when summary content is already current.
  - Additional progress (2026-05-30): generated-app gate outcomes now deterministically constrain `verification_status` before terminal completion/healing (`repair_needed` or failed gates force `failed`; `insufficient_evidence` downgrades optimistic `passed/pending` to `partial`) so runs cannot be marked clean success when build/runtime proof failed.
  - Touched files (2026-05-30): `apps/UnifiedPromptApp/services/prompt-api/app.py`, `apps/UnifiedPromptApp/services/prompt-api/tests/test_orchestration.py`.
  - Verification (2026-05-30): `pytest apps/UnifiedPromptApp/services/prompt-api/tests/test_orchestration.py -k "terminal_summary or run_state_reconcile"` passed (4 tests).
  - Verification (2026-05-30): `pytest apps/UnifiedPromptApp/services/prompt-api/tests/test_orchestration.py -k "generated_app_guard or terminal_summary or run_state_reconcile"` passed (6 tests).

- [ ] Reconcile terminal run-state artifacts.
  - `run_state.json`, manifest, final summary, overseer/advisory artifacts, and agent status display must agree.
  - Stale `running`, `working`, or partial agent values must be corrected during finalization.

- [x] Add E2E route coverage for canonical run APIs.
  - Cover:
    - `/api/runs/[runId]/manifest`
    - `/api/runs/[runId]/artifacts`
    - `/api/runs/[runId]/events/canonical`
    - `/api/runs/[runId]/summary`
  - Include 200, 404, invalid-runId, empty-run, and terminal-run cases.
  - Date: 2026-05-30
  - Touched files: `apps/unifiedtoolbox.webapp/src/lib/app-factory/runs/__tests__/runsApiRoutes.test.ts`
  - Verification: `npm --prefix apps/unifiedtoolbox.webapp run test -- src/lib/app-factory/runs/__tests__/runsApiRoutes.test.ts` (5 passed)

- [ ] Add SSE reconnect and replay tests.
  - Validate `Last-Event-ID` behavior.
  - Validate replay consistency between file-backed canonical events and SSE output.

### Acceptance criteria

- A newly created run emits canonical lifecycle bookends.
- Run Console does not need legacy fallbacks for new runs.
- Manifest, artifacts, canonical events, and summary APIs agree on run identity and final state.
- The modernization acceptance checklist passes for new runs.
- Legacy runs degrade clearly without corrupting new-run behavior.

---

## RM-011 — App production loop

**Status:** `in_progress`
**Horizon:** `next`
**Owner:** app-production/runtime

### Goal

Make `build_new_app` converge on a functioning application rather than a plausible artifact set.

The canonical path is:

`Intent -> Contract -> Requirements checkpoint if needed -> Plan -> Generate files -> Install dependencies -> Build -> Test -> Smoke -> Repair targeted failures -> Re-test -> Package deliverables -> Learn -> Improve next run`

### Scope

- Generated app materialization
- Dependency install
- Build proof
- Test and smoke proof
- Browser/UX evidence for frontend apps
- Targeted repair routing
- Delivery readiness state
- Generated-app packaging evidence

### Out of scope

- Unlimited autonomous repair loops
- Provider-specific arena lanes
- Full production hosting deployment
- Replacing the existing verifier without cause

### Completed

- [x] Document optimal application-production path and future-agent continuation plan.
  - Date: 2026-04-05
  - Ref: `docs/application-production-path.md`, `docs/future-agent-handoff-app-production.md`
  - Notes: Established the target path from intent to functioning app and the continuation order for future agents.

- [x] Persist generated-app production gate summaries and surface them in Run Detail.
  - Date: 2026-04-05
  - Ref: `apps/UnifiedPromptApp/services/prompt-api/app.py`, `apps/unifiedtoolbox.webapp/src/app/runs/[runId]/page.tsx`
  - Notes: Generated app verification is stored in the manifest and visible to operators.

- [x] Add deterministic install/build/dev-start gate execution for generated web apps.
  - Date: 2026-04-05
  - Ref: `apps/UnifiedPromptApp/services/prompt-api/orchestrator_verifier.py`, `apps/UnifiedPromptApp/services/prompt-api/app.py`
  - Notes: Package-manager-aware dependency installation and bounded dev-server proof are implemented.

- [x] Route failing generated-app gates into targeted repair loops.
  - Date: 2026-04-21
  - Ref: `apps/UnifiedPromptApp/services/prompt-api/app.py`, `apps/unifiedtoolbox.webapp/src/app/runs/[runId]/page.tsx`
  - Notes: Actionable failed gates trigger bounded repair when credentials are present, persist repair artifacts, and rerun verification.

### Worklist

- [ ] Add browser-level UX smoke verification for frontend app briefs.
  - Verify expected sections from the brief.
  - Probe primary routes.
  - Exercise one or more declared interactions.
  - Capture responsive evidence or an equivalent machine-readable report.

- [ ] Fail generated-app verification on post-startup runtime errors.
  - Dev-server startup alone is not sufficient.
  - Inspect runtime logs and perform actual page probes before marking `dev_server` or `runtime` as passed.

- [ ] Add declared-vs-materialized artifact completeness checks.
  - Compare Engineer-declared deliverables against files written to `generated_app/`.
  - Missing required files must block readiness.

- [ ] Enforce one final machine-readable agent artifact per stage output.
  - Agent retry output must resolve to one final object.
  - Concatenated JSON payloads must fail validation or be normalized before downstream gates run.

- [ ] Freeze conceptual-model contract IDs across retries.
  - Object, interaction, and dynamic IDs must remain stable across repair attempts.
  - Engineer traceability must cover every contract ID before completion.

- [ ] Package delivery readiness as a first-class run outcome.
  - Add readiness states:
    - `not_generated`
    - `generated_unverified`
    - `repair_needed`
    - `verified`
    - `ready_for_delivery`
  - Readiness must be backed by gate evidence and artifact completeness.

- [ ] Add generated-app delivery package manifest.
  - Include generated files, build evidence, smoke evidence, repair history, known limitations, and operator review instructions.

### Acceptance criteria

- A generated frontend app cannot be marked ready based only on files existing.
- Runtime errors after server startup fail the verification gate.
- Missing declared deliverables are visible and block readiness.
- Final delivery state is explicit and machine-readable.
- Run Detail shows exactly why an app is ready, repairable, or blocked.

---

## RM-010 — Orchestration experience unification

**Status:** `in_progress`
**Horizon:** `next`
**Owner:** product/web

### Goal

Make the product feel like one guided orchestration studio instead of unrelated screens.

The user story is:

`Intent -> Proposal -> Cast -> Run -> Review -> Learn -> Next chapter`

### Completed

- [x] Make `/` the canonical Home route and replace the placeholder screen with a story-led front door.
  - Date: 2026-04-05
  - Ref: `apps/unifiedtoolbox.webapp/src/app/page.tsx`, `apps/unifiedtoolbox.webapp/src/lib/nav/navConfig.ts`

- [x] Add shared route-aware workflow guidance across main product surfaces.
  - Date: 2026-04-05
  - Ref: `apps/unifiedtoolbox.webapp/src/components/navigation/RouteStoryBanner.tsx`, `apps/unifiedtoolbox.webapp/src/app/layout.tsx`

- [x] Align tour, docs hub, and fallback navigation with the story-led workflow.
  - Date: 2026-04-05
  - Ref: `apps/unifiedtoolbox.webapp/src/components/tour/FirstLaunchTour.tsx`, `apps/unifiedtoolbox.webapp/src/components/docs/DocsHub.tsx`, `apps/unifiedtoolbox.webapp/src/app/error.tsx`

- [x] Restore information architecture documentation.
  - Date: 2026-04-05
  - Ref: `docs/information-architecture.md`

- [x] Introduce lightweight recipe model for prompt- and agent-led reuse.
  - Date: 2026-04-05
  - Ref: `apps/unifiedtoolbox.webapp/src/lib/types/recipes.ts`, `apps/unifiedtoolbox.webapp/src/lib/services/recipeStore.ts`

- [x] Add recipe actions to Prompt Library and Agent Library.
  - Date: 2026-04-05
  - Ref: `apps/unifiedtoolbox.webapp/src/app/prompts/page.tsx`, `apps/unifiedtoolbox.webapp/src/app/agents/page.tsx`

- [x] Make Concierge recipe-aware.
  - Date: 2026-04-05
  - Ref: `apps/unifiedtoolbox.webapp/src/app/concierge/page.tsx`

- [x] Support recipe-based prefills in Playground and App Lifecycle.
  - Date: 2026-04-05
  - Ref: `apps/unifiedtoolbox.webapp/src/app/orchestrator/page.tsx`, `apps/unifiedtoolbox.webapp/src/app/engine/_source/App.tsx`

- [x] Surface corrective actions and learning-agent instruction adjustments.
  - Date: 2026-04-05
  - Ref: `apps/UnifiedPromptApp/services/prompt-api/app.py`, `apps/unifiedtoolbox.webapp/src/app/runs/[runId]/page.tsx`, `apps/unifiedtoolbox.webapp/src/app/knowledge/page.tsx`

### Worklist

- [ ] Clarify Run Detail versus Concierge recovery paths.
  - Run Detail handles current-run recovery.
  - Concierge handles reinterpretation, scope change, and new proposal creation.
  - UI should always resolve a stopped run into:
    - resume this run, or
    - reframe outside this run.

- [ ] Add proposal history and branch-from-run affordances.
  - Successful or failed runs should be usable as a starting point for a revised proposal.
  - Preserve the distinction between resuming a blocked run and starting a reframed run.

- [ ] Make recipe selection visible during run setup.
  - Show which prompt kits, agent roles, tool scopes, and acceptance checks came from a recipe.
  - Allow operator removal before launch.

- [ ] Add story-centric initiative view.
  - Home should eventually show active initiatives and application stories, not only route guidance or telemetry.

### Acceptance criteria

- A user can infer where to start, where to watch work, and where to recover from failure.
- Run recovery does not bounce users unnecessarily back to Concierge.
- Recipes feel reusable in context, not trapped in library pages.
- The product narrative remains stable across Home, Ideas, Build, Runs, Memory, and Admin.

---

## RM-012 — Frontier software factory

**Status:** `in_progress`
**Horizon:** `later` until canonical evidence is reliable
**Owner:** arena/evaluation

### Goal

Allow a single run to evaluate multiple isolated implementation candidates and promote the best verified outcome based on explicit evidence.

### Guardrail

Do not add external frontier provider lanes until canonical run evidence, generated-app readiness, and browser-level verification are reliable for the internal lane.

### Completed

- [x] Define canonical multi-lane candidate manifest and event schema.
  - Date: 2026-04-21
  - Ref: `docs/frontier-software-factory-strategy.md`, `apps/UnifiedPromptApp/services/prompt-api/arena.py`, `apps/unifiedtoolbox.webapp/src/lib/types/orchestrator.ts`
  - Notes: Schema version `1` wraps the current internal run as `internal-default` without breaking the single-lane contract.

- [x] Add arena adjudication artifact.
  - Date: 2026-04-21
  - Ref: `apps/UnifiedPromptApp/services/prompt-api/arena.py`, `apps/UnifiedPromptApp/services/prompt-api/app.py`, `apps/unifiedtoolbox.webapp/src/app/runs/[runId]/page.tsx`
  - Notes: `arena.json` and `arena.md` compare lanes using gate pass rate, delivery readiness, repair efficiency, patch-size penalty, and verification status.

### Worklist

- [ ] Add frontend browser-evidence verification as a first-class evaluation lane.
  - Depends on RM-011 browser-level UX smoke verification.

- [ ] Introduce optional frontier provider lanes behind the canonical lane contract.
  - Provider-specific logic must remain outside the core run model.
  - Each lane must produce comparable evidence.

- [ ] Feed arena outcomes back into Knowledge and recipe recommendations.
  - Capture which lane, model, repair strategy, and recipe worked best for a goal archetype.

### Acceptance criteria

- Arena comparison is evidence-based, not preference-based.
- Candidate lanes are isolated and comparable.
- The promoted winner has stronger verification evidence than the alternatives.
- Arena outcomes improve future run planning.

---

## RM-004 — MCP governance

**Status:** `done`

### Delivered scope

- MCP policy engine
- Runtime enforcer
- Storage models
- JSONL audit logger
- Server search and detail APIs
- Collections CRUD
- Install management
- Allowlist CRUD and binding
- Registry sync and source management
- Runtime middleware integration
- Run-scoped allowlist creation
- Audit Log Viewer UI
- Policy violations backend
- Integration tests
- Pydantic v2 hardening

### Maintenance rules

- MCP execution must remain deny-by-default.
- Runtime enforcement must fail secure.
- Audit records must redact tokens and secrets.
- Tool enablement must be least-privilege and run-scoped when possible.

---

## RM-005 — Run observability and reporting

**Status:** `done`, with follow-on work moved to RM-013

### Delivered scope

- Backend run-state derivation
- STUCK detection
- Runs UI state clarity
- Run Detail heartbeat and stage visibility
- Swarm View graceful degradation
- Runtime event schema
- SSE-primary and file-tail fallback endpoints
- Runtime Activity drawer
- Long-stage progress pulses
- Runtime activity tests
- Local runtime-event simulator
- Dual state display: execution state plus quality outcome
- Explicit blocker panel

### Maintenance rules

- Execution state and quality outcome must remain separate.
- Missing event streams should degrade clearly.
- Stuck and blocked states must be operator-actionable.

---

## RM-008 — Run lifecycle control and lease safety

**Status:** `done`, with follow-on work moved to RM-013

### Delivered scope

- Canonical run lease model
- Queued -> dispatching -> running transitions
- Worker heartbeat renewal
- Stuck detection
- Cancel, force-cancel, requeue, and stale-lease recovery
- UI support for transitional and stuck states

### Maintenance rules

- Lease state must not conflict with terminal state.
- A terminal run cannot continue heartbeating.
- Requeue must preserve enough prior evidence for review.

---

## RM-009 — App Factory Phase 1: Closed Feedback Loop

**Status:** `done`

### Delivered scope

- Sandbox execution engine
- Acceptance-check evaluator
- Refinement loop controller
- Verify/refine API endpoints
- Run Detail Verification tab
- Unit and integration coverage for loop behavior

### Maintenance rules

- Refinement loops must stay bounded.
- Verification must distinguish failed prerequisites from downstream skipped checks.
- Operator-visible evidence is required for every pass/fail claim.

---

## Completed foundation tracks

### RM-001 — Platform reliability

**Status:** `done`

Platform reliability work stabilized build, CI, launch behavior, and core typing enough for the current roadmap to proceed.

### RM-002 — Documentation governance

**Status:** `done`

Documentation governance established the canonical docs hub, roadmap IDs, implementation traceability, and the rule that active roadmap work belongs in this file.

### RM-003 — Concierge staged evolution

**Status:** `done`

Concierge stages 0-5 delivered workflow IA, proposal generation, proposal-to-run mapping, live narration, tool enablement/audit, and modes/personalization.

### RM-006 — Export hardening and artifact quality gates

**Status:** `done`

Export behavior now surfaces blockers and includes gate evidence in run artifact packages.

### RM-007 — Web deployment strategy

**Status:** `done`

Dynamic Next.js hosting requirements and deployment strategy are documented.

---

## Side-track policy

Use side tracks when urgent bugs or support tasks pull effort away from roadmap work.

Each side track must include:

| Field | Required content |
| --- | --- |
| ST ID | `ST-###` |
| Date opened | `YYYY-MM-DD` |
| Date closed | `YYYY-MM-DD` or blank |
| Roadmap impact | One or more `RM-###` IDs |
| Reason for diversion | What forced the detour |
| Decision link | `DEC-###` |
| Outcome | `shipped`, `deferred`, or `dropped` |

### Side-track log

_No active side tracks recorded in this rewrite._

---

## Decision linkage policy

Every roadmap-impacting tradeoff requires a `DEC-###` record.

Each decision must include:

- date,
- triggering roadmap item,
- related side track if any,
- options considered,
- accepted tradeoff,
- expected effect,
- reversal condition.

### Decision log

_No new decisions recorded in this rewrite._

---

## Acceptance checklist for roadmap completion

Before marking any active roadmap item complete, verify:

- [ ] The implementation is linked to a run, PR, or changed file list.
- [ ] Tests or manual verification are documented.
- [ ] New run behavior emits canonical evidence when applicable.
- [ ] UI changes preserve old routes or include redirects.
- [ ] Failure states are explicit and operator-actionable.
- [ ] The roadmap checkbox includes completion date and notes.
- [ ] No new parallel planning document was created for active work.

## Do-not-start list

Do not start these until their dependencies are complete:

- External frontier provider lanes before RM-013 and RM-011 evidence gates are reliable.
- Major navigation redesign before Run Detail versus Concierge recovery paths are clarified.
- Automatic unlimited repair loops.
- Replacement of the existing verifier without a documented failure mode and migration path.
- Broad agent-library restructuring before drift policy is decided.
- New implementation-summary files for active work.
