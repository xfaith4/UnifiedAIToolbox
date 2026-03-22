# Consolidated Implementation Summary

Last updated: 2026-02-28

This is the concise implementation ledger for active development.
Detailed narratives remain in focused docs; this file tracks what shipped and why.

## Current snapshot

- All 9 RM-### roadmap items are now **done** (RM-001 through RM-009).
- Canonical planning and traceability docs are defined in `docs/README.md` and `docs/ROADMAP.md`.
- MCP governance is fully delivered through Phase 4 (runtime enforcement, audit viewer, violations dashboard).
- Concierge Stages 0–5 are implemented: IA/nav, proposal chat, run recipe, live narration, tool audit, and modes.
- Export hardening is complete: blockers surfaced in UI, gate evidence included in run artifact zips.
- Web deployment strategy documented in `docs/web-deployment-strategy.md`; dynamic Node.js target confirmed.
- App Factory Phase 1 (Closed Feedback Loop) is complete: sandbox engine, acceptance-check evaluator, refinement loop controller, verify/refine API endpoints, and Run Detail Verification tab delivered; 297 unit tests passing.

## Delivery log (main track)

| Date | RM ID | Change | Outcome | Reference |
| --- | --- | --- | --- | --- |
| 2026-03-22 | RM-009 | App Factory Phase 1 (Closed Feedback Loop): sandbox engine, acceptance-check evaluator, refinement loop controller, verify/refine API endpoints, Run Detail Verification tab, and 8 refinement loop unit tests | done | `docs/ROADMAP.md` RM-009 worklist |
| 2026-03-22 | RM-001, RM-003, RM-006, RM-007 | Platform reliability (TS fix + CI typecheck), Concierge stages 0-5 documented, export quality-evidence in run zip, web deployment strategy doc | done | `docs/ROADMAP.md` worklists |
| 2026-03-21 | RM-004 | MCP Phase 4 complete: runtime enforcement middleware wired, allowlist auto-creation in run flow, Audit Log Viewer UI, violations dashboard endpoint, Pydantic v2 deprecation fixes, 8 new integration tests | done | `docs/ROADMAP.md` RM-004 worklist |
| 2026-02-28 | RM-002 | Consolidated docs structure (hub + roadmap + concise ledger + side-track method) | done | `docs/README.md`, `docs/ROADMAP.md`, this file |
| 2026-02-21 | RM-004 | MCP governance hardening updates (rate limiting, RBAC, log integrity/rotation, anomaly detection) | done | `docs/MCP_LIBRARY_STATUS.md`, `docs/MCP_REMAINING_TASKS.md` |
| 2026-02-07 | RM-001 | Workflow reliability pass across TS typing and CI guards | done | `../WORKFLOW_AUDIT_SUMMARY.md` |
| 2026-02-07 | RM-005, RM-006 | Export behavior and run monitor visibility improvements | done | previous version of this file + UI component changes |
| 2026-02-04 | RM-004 | MCP Library UI + registry integration phases delivered | done | `docs/MCP_IMPLEMENTATION_SUMMARY.md` |

## Side-track register

Use this section for work that diverts from the planned feature roadmap.

| ST ID | Opened | Closed | Impacted RM | Side-track reason | Outcome | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| ST-001 | 2026-02-07 | 2026-02-07 | RM-006 | Export flow blocked by runnability checks; users could not obtain artifacts for debugging | Resolved by warning-and-confirm export path | DEC-001 |
| ST-002 | 2026-02-07 | 2026-02-07 | RM-005 | Run monitor showed only limited agent visibility (top-10) | Resolved with full roster + status cards | DEC-002 |
| ST-003 | 2026-02-07 | 2026-02-07 | RM-001 | CI/workflow failures from typing and brittle workflow assumptions | Resolved with typing fixes and workflow guards | DEC-003 |
| ST-004 | 2026-02-07 | 2026-02-07 | RM-007 | Static export expectation conflicted with server-side API route needs | Resolved by removing static export path and converting workflow to build artifact flow | DEC-004 |

## Decision log

| DEC ID | Date | Related RM | Related ST | Decision | Tradeoff |
| --- | --- | --- | --- | --- | --- |
| DEC-001 | 2026-02-07 | RM-006 | ST-001 | Allow export when validation fails, gated by explicit user confirmation and warning UI | Users can export unusable artifacts; mitigated by clear warning state |
| DEC-002 | 2026-02-07 | RM-005 | ST-002 | Prioritize full agent status visibility over truncated monitor output | Slightly denser UI; significantly better run observability |
| DEC-003 | 2026-02-07 | RM-001 | ST-003 | Harden workflows with explicit checks/fallbacks instead of optimistic assumptions | More workflow logic to maintain; fewer fragile CI failures |
| DEC-004 | 2026-02-07 | RM-007 | ST-004 | Treat web app as dynamic Next.js deployment (Node-capable host), not static Pages export | Requires runtime hosting; preserves API route behavior |

## How to use this file

1. Add one row to `Delivery log` for each completed roadmap item.
2. If the work is an interruption, add it to `Side-track register` with impacted `RM-###`.
3. Add/update a `Decision log` row when tradeoffs change roadmap direction.
4. Keep detailed implementation analysis in specialized docs; keep this file concise.

## Detailed references

- Workflow details: `../WORKFLOW_AUDIT_SUMMARY.md`
- MCP details: `MCP_IMPLEMENTATION_SUMMARY.md`, `MCP_LIBRARY_STATUS.md`, `MCP_REMAINING_TASKS.md`
- Concierge phase plan: `Concierge_MajorVersion_UpgradePromptChain.md`
