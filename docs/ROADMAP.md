# Unified AI Toolbox Roadmap

Last updated: 2026-02-28

## Purpose

This file is the single roadmap source for active feature delivery.

## Status key

- `planned`: scoped but not started
- `in_progress`: active delivery
- `at_risk`: blocked or uncertain path
- `done`: delivered and logged in `IMPLEMENTATION_SUMMARY.md`

## Main roadmap

| ID | Feature track | Status | Horizon | Definition of done |
| --- | --- | --- | --- | --- |
| RM-001 | Platform reliability (build, CI, launch, core typing) | in_progress | now | CI stable, local launch reproducible, high-impact type/build blockers closed |
| RM-002 | Documentation governance and concise project traceability | done | now | Canonical docs hub, roadmap IDs, implementation ledger, side-track method in use |
| RM-003 | Concierge staged evolution (IA -> proposal -> execution narration) | in_progress | now/next | Stage-based PR flow complete with stable UX and run handoff |
| RM-004 | MCP governance end-to-end (registry, policy, runtime enforcement) | done | now/next | MCP APIs/UI integrated with runtime enforcement and run-level audit visibility |
| RM-005 | Run observability and reporting | done | next | Runs view provides reliable status, agent visibility, and decision/audit context |
| RM-006 | Export hardening and artifact quality gates | in_progress | next | Export remains accessible with clear risk signaling and contract/gate evidence |
| RM-007 | Web deployment strategy for dynamic Next.js app | planned | next | Target hosting chosen and deployment workflow aligned with API route requirements |
| RM-008 | Run lifecycle control + lease/heartbeat safety | done | now/next | Canonical run state/lease model with cancel/force-cancel/requeue/stale-lease recovery and STUCK visibility |

## Side-track policy

When urgent bugs/tasks pull effort from the roadmap, track them as side tracks.

Required fields for each side track entry:

- `ST ID` (`ST-###`)
- `Date opened` and `date closed` (if resolved)
- `Roadmap impact` (one or more `RM-###` IDs)
- `Reason for diversion` (what forced the detour)
- `Decision link` (`DEC-###`)
- `Outcome` (shipped, deferred, or dropped)

## Decision linkage policy

Every roadmap-impacting tradeoff gets a `DEC-###` record in `IMPLEMENTATION_SUMMARY.md` and must cite:

- triggering roadmap item(s)
- related side track(s), if any
- accepted tradeoff and expected effect

## Implementation trace policy (Roadmap-as-ledger)

- `ROADMAP.md` is the canonical checklist and implementation ledger for active work.
- Each completed checklist line must include:
  - completion date (`YYYY-MM-DD`)
  - PR link or local run id
  - 1-2 line implementation note
- Do not create parallel "implementation summary" docs for active roadmap items.
- If work is partial, leave the box unchecked and add a blocker/note inline.

## RM-005 Worklist (Run observability and reporting)

- [x] Normalize run state derivation in backend responses (`status`, `raw_status`, heartbeat metadata).  
  Date: 2026-02-28  
  Ref: run `local-2026-02-28-roadmap-rm005-derive-status`  
  Notes: `/orchestrate/runs` and `/orchestrate/run/{id}` now use shared derivation logic and expose heartbeat + event timing metadata.

- [x] Add STUCK detection from lease heartbeat expiry and surface in run payloads.  
  Date: 2026-02-28  
  Ref: run `local-2026-02-28-roadmap-rm005-stuck`  
  Notes: stale lease now maps to derived `status=stuck`; payload includes `heartbeat_stale`, `last_heartbeat_at`, `last_event_at`.

- [x] Runs UI: show STUCK state and prevent queued/running ambiguity by honoring dispatching state.  
  Date: 2026-02-28  
  Ref: run `local-2026-02-28-roadmap-rm005-runs-ui`  
  Notes: status badges support `dispatching` and `stuck`; queue safeguard callout includes running/dispatching/queued/stuck counts.

- [x] Run detail UI: show heartbeat/event timing and current agent/stage with STUCK banner.  
  Date: 2026-02-28  
  Ref: run `local-2026-02-28-roadmap-rm005-run-detail`  
  Notes: run detail now surfaces last heartbeat, last event, current agent/stage, and explicit STUCK warning.

- [x] Swarm View graceful degradation when event stream/status endpoints are missing.  
  Date: 2026-02-28  
  Ref: run `local-2026-02-28-roadmap-rm005-swarm-fallback`  
  Notes: Swarm view falls back to orchestration run summary and shows "events unavailable" instead of hard run-not-found failure.

- [x] Define structured runtime event schema for App Factory run lifecycle telemetry.  
  Date: 2026-02-28  
  Ref: run `local-2026-02-28-roadmap-rm005-runtime-schema`  
  Notes: Added `docs/run-events.schema.md` with stage/type/metric contracts and export-specific progress event conventions.

- [x] Add SSE-primary + file-tail fallback endpoints for runtime event transport.  
  Date: 2026-02-28  
  Ref: run `local-2026-02-28-roadmap-rm005-runtime-transport`  
  Notes: Added `/api/runs/{run_id}/events/stream`, `/api/runs/{run_id}/events/file`, and `/api/runs/{run_id}/summary` aliases over App Factory run observability APIs.

- [x] App Factory: bottom Runtime Log/Activity drawer with tabs, filters, copy, and stuck heuristics.  
  Date: 2026-02-28  
  Ref: run `local-2026-02-28-roadmap-rm005-runtime-drawer`  
  Notes: Added collapsible drawer (Live/Steps/Errors/Artifacts), auto-open on warn/error/long stage, and fallback-mode banner when SSE is unavailable.

- [x] Emit periodic progress signals during validate/repair/export long-running stages.  
  Date: 2026-02-28  
  Ref: run `local-2026-02-28-roadmap-rm005-progress-pulse`  
  Notes: Added 5s pulse events in hardening/repair loops plus export enumeration/zip metric events (files, exclusions, bytes, pass counters).

- [x] Add runtime activity tests (event parsing/filtering + panel smoke render).  
  Date: 2026-02-28  
  Ref: run `local-2026-02-28-roadmap-rm005-runtime-tests`  
  Notes: Added `runtimeEventUtils` unit coverage and a `RuntimeActivityDrawer` integration smoke test with sample fallback/live indicators.

- [x] Add local dev simulator for events.ndjson playback without full orchestration run.  
  Date: 2026-02-28  
  Ref: run `local-2026-02-28-roadmap-rm005-runtime-sim`  
  Notes: Added `npm run dev:runtime-sim` script to generate staged runtime telemetry and status snapshots in a local run folder.

- [x] Run Detail UX: separate execution state from quality outcome and surface explicit blocker panel.  
  Date: 2026-02-28  
  Ref: run `local-2026-02-28-roadmap-rm005-run-detail-dual-state`  
  Notes: Run detail now shows dual badges (`Run State` + `Outcome`), a persistent "What failed" panel, and JSON-native traceability expectation wording.

## RM-008 Worklist (Run lifecycle control + lease/heartbeat safety)

- [x] Add run lease model (TTL + heartbeat metadata) to canonical run manifest.  
  Date: 2026-02-28  
  Ref: run `local-2026-02-28-roadmap-rm008-lease-model`  
  Notes: manifest now records `lease` payload (`worker_id`, `heartbeat_at`, `expires_at`, release metadata).

- [x] Worker pickup acquires lease and transitions queued -> dispatching -> running.  
  Date: 2026-02-28  
  Ref: run `local-2026-02-28-roadmap-rm008-dispatch`  
  Notes: execution thread acquires lease at pickup and marks transitional dispatching state before running.

- [x] Worker heartbeat renewal every 10s while run is active.  
  Date: 2026-02-28  
  Ref: run `local-2026-02-28-roadmap-rm008-heartbeat`  
  Notes: background heartbeat thread updates lease expiry continuously until terminal state.

- [x] Cancel endpoint supports queued and running runs without hard-kill by default.  
  Date: 2026-02-28  
  Ref: run `local-2026-02-28-roadmap-rm008-cancel`  
  Notes: normal cancel now sets `cancel_requested`; queued runs cancel immediately, active runs stop cleanly through cancel event.

- [x] Force-cancel endpoint kills worker process, releases lease, and clears active worker state.  
  Date: 2026-02-28  
  Ref: run `local-2026-02-28-roadmap-rm008-force-cancel`  
  Notes: `/api/runs/{id}/cancel?force=1` performs terminate/kill fallback, marks cancelled, and releases lease.

- [x] Add lifecycle API aliases for run control and stale lease recovery.  
  Date: 2026-02-28  
  Ref: run `local-2026-02-28-roadmap-rm008-api-aliases`  
  Notes: added `/api/runs/{id}/cancel`, `/api/runs/{id}/requeue`, `/api/runs/release-stale-leases`.

- [x] Add stale lease release operation and STUCK transition.  
  Date: 2026-02-28  
  Ref: run `local-2026-02-28-roadmap-rm008-stale-release`  
  Notes: stale leases are releasable via API; released runs are marked `stuck` and surfaced in UI.

- [x] RepoContextBuilder hard exclusions, budget guards, progress pulse, and subprocess timeout safety.  
  Date: 2026-02-28  
  Ref: run `local-2026-02-28-roadmap-rm008-repo-context`  
  Notes: excludes now include `.git/.next/runs/artifacts`; intake supports file/time budgets, >=5s progress callbacks, and timeout-protected git probes.

- [x] Add tests for transitions/cancel/force-cancel/stale-lease behavior.  
  Date: 2026-02-28  
  Ref: run `local-2026-02-28-roadmap-rm008-tests`  
  Notes: prompt-api orchestration tests now cover API alias cancel force-mode, stale lease -> stuck, stale lease release endpoint, and requeue.

- [x] Add local simulation script for queue/cancel and stale heartbeat recovery scenarios.  
  Date: 2026-02-28  
  Ref: run `local-2026-02-28-roadmap-rm008-sim-script`  
  Notes: `scripts/Simulate-RunLifecycle.ps1` now exercises queued->cancel and stale-lease recovery flow.

## RM-003 Worklist (Concierge staged evolution)

- [x] Commissioner incomplete-input outcomes route to Concierge as `needs_requirements` (blocked, not failed).  
  Date: 2026-02-28  
  Ref: run `local-2026-02-28-roadmap-rm003-needs-requirements-loop`  
  Notes: verification now emits `needs_requirements` + structured `requirements_request` packet; Concierge and Run Detail surface follow-up questions instead of marking the run failed.

- [x] Knowledge loop decouples learning outcome from run outcome and preserves blocked-requirements routing.  
  Date: 2026-02-28  
  Ref: run `local-2026-02-28-roadmap-rm003-knowledge-loop-refactor`  
  Notes: added `knowledge_status` rubric + migration, updated Knowledge UI to show Learning badge as primary and Run result as secondary, and documented Concierge requirements loop contract.

## RM-004 Worklist (MCP governance end-to-end)

- [x] Phase 1 backend core: policy engine, storage, allowlist/collection/install/audit APIs (26 endpoints).  
  Date: 2026-02-04  
  Ref: `docs/MCP_IMPLEMENTATION_SUMMARY.md`  
  Notes: all core API endpoints functional with deny-by-default policy and JSONL audit trail.

- [x] Phase 2 Web UI: Collections tab, Installations tab, install workflow.  
  Date: 2026-02-04  
  Ref: `docs/MCP_IMPLEMENTATION_SUMMARY.md`  
  Notes: all three MCP Library tabs functional; install flow < 5 clicks end-to-end.

- [x] Phase 3 registry integration: external registry sync, source config persistence.  
  Date: 2026-02-04  
  Ref: `docs/MCP_IMPLEMENTATION_SUMMARY.md`  
  Notes: `registry_sync.py` integrates with orchestration-bridge adapters; sync returns add/update counts.

- [x] Security hardening: rate limiting, RBAC, HMAC log signing, log rotation, anomaly detection.  
  Date: 2026-02-21  
  Ref: `docs/MCP_LIBRARY_STATUS.md`  
  Notes: production-grade security posture; anomaly detection API added (`/api/mcp/audit/anomalies`).

- [x] Phase 4.1 runtime enforcement middleware: `orchestration_mcp_middleware.py` + tests.  
  Date: 2026-03-21  
  Ref: `apps/UnifiedPromptApp/services/prompt-api/orchestration_mcp_middleware.py`  
  Notes: `OrchestrationMCPMiddleware` enforces policy before tool execution and logs audit events after; wired into `/orchestrate/run`.

- [x] Phase 4.2 allowlist auto-creation on run creation.  
  Date: 2026-03-21  
  Ref: `apps/UnifiedPromptApp/services/prompt-api/app.py` (`_create_run_allowlist_if_requested`)  
  Notes: `OrchestrationRequest` accepts `mcp_allowed_servers` / `mcp_allowed_collections`; run-scoped allowlist created automatically and referenced in run manifest.

- [x] Phase 4.3 Audit Log Viewer UI: timeline + filters + event detail + anomaly view.  
  Date: 2026-03-21  
  Ref: `apps/unifiedtoolbox.webapp/src/app/mcp-library/audit/page.tsx`  
  Notes: new `/mcp-library/audit` page with summary cards, filterable events table, anomaly detection view, and violations dashboard; linked from MCP Library header.

- [x] Phase 4.4 policy violations dashboard backend (`/api/mcp/violations`).  
  Date: 2026-03-21  
  Ref: `apps/UnifiedPromptApp/services/prompt-api/mcp_governance/api_routes.py`  
  Notes: `GET /api/mcp/violations` aggregates denied events by server, tool, and user with top-N configurable grouping.

- [x] Fix Pydantic v2 deprecation warnings (`.dict()` → `.model_dump()`, `datetime.utcnow()` → `datetime.now(timezone.utc)`).  
  Date: 2026-03-21  
  Ref: `mcp_governance/storage.py`, `orchestration_mcp_middleware.py`, `policy_engine.py`, `api_routes.py`  
  Notes: 246 tests pass with `-W error::DeprecationWarning`; zero deprecation warnings remain in MCP governance stack.

- [x] Phase 4 integration tests: violations summary, middleware allow/deny/disabled paths, token sanitization.  
  Date: 2026-03-21  
  Ref: `tests/test_mcp_governance_api.py`  
  Notes: 8 new integration tests covering violations endpoint and middleware enforce-then-log contract.

