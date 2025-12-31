# Journey Map (Top User Flows)

These are the current “money paths” in the Next.js web portal (`apps/unifiedtoolbox.webapp`).

## J1 — First run / orientation
- Goal: Understand what the toolbox is and where to start.
- Entry: `/`.
- Steps: Land → pick a sidebar tool.
- Expected: Clear next action + no dead ends.
- Failure modes: Blank/unclear landing, missing state indicators.

## J2 — Dashboard metrics scan
- Goal: Get a quick operational snapshot.
- Entry: `/dashboard`.
- Steps: View KPIs → scan charts → interpret cost/impact.
- Expected: Metrics load quickly; labels are understandable.
- Failure modes: Loading forever; unclear units; unreadable chart tooltips.

## J3 — Prompt library search & edit
- Goal: Find a prompt, edit, save, and export.
- Entry: `/prompts`.
- Steps: Search → filter → select → edit → save → export JSON.
- Expected: Save is obvious; errors are actionable.
- Failure modes: Confusing edit state; loss of work; import/export confusion.

## J4 — Agent library curation
- Goal: Create/update agent instructions; import/export.
- Entry: `/agents`.
- Steps: Search → select → edit → save → export/import.
- Expected: Clear saving feedback; accessible error messaging.
- Failure modes: “Did it save?” ambiguity; `alert()`-style errors; keyboard traps.

## J5 — Orchestrator: create run
- Goal: Launch a run and monitor its progress.
- Entry: `/orchestrator`.
- Steps: Choose mode → set goal → pick agents/prompts → start → monitor logs.
- Expected: Connection status clear; run states clear; logs readable.
- Failure modes: API disconnected with unclear recovery; unclear required fields; long page with poor hierarchy.

## J6 — Orchestrator: repo orchestration
- Goal: Run orchestration against a repo.
- Entry: `/orchestrator` (repo section).
- Steps: Enter repo + goal → start → watch events → cancel if needed.
- Expected: Safe defaults; clear progress; cancel always works.
- Failure modes: Unclear allowed paths; no progress feedback; cancellation ambiguity.

## J7 — Milestones overview
- Goal: Understand milestone health + gating thresholds.
- Entry: `/milestones`.
- Steps: Pick time window → interpret metrics → see deltas.
- Expected: Definitions visible; deltas make sense.
- Failure modes: Missing explanation for “why did this fail?”

## J8 — GitHub integration
- Goal: Validate configuration and run GitHub workflows.
- Entry: `/github`.
- Steps: Connect/configure → run action → review results.
- Expected: Clear auth status; safe error recovery.
- Failure modes: Token/config errors with unclear remediation.

## J9 — Settings
- Goal: Adjust environment + defaults.
- Entry: `/settings`.
- Steps: View settings → change → confirm.
- Expected: Immediate, visible confirmation; persistence.
- Failure modes: Silent failures; unclear scope (local vs shared).
