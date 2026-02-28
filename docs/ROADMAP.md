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
| RM-004 | MCP governance end-to-end (registry, policy, runtime enforcement) | in_progress | now/next | MCP APIs/UI integrated with runtime enforcement and run-level audit visibility |
| RM-005 | Run observability and reporting | in_progress | next | Runs view provides reliable status, agent visibility, and decision/audit context |
| RM-006 | Export hardening and artifact quality gates | in_progress | next | Export remains accessible with clear risk signaling and contract/gate evidence |
| RM-007 | Web deployment strategy for dynamic Next.js app | planned | next | Target hosting chosen and deployment workflow aligned with API route requirements |

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
