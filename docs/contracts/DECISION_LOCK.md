# Decision Lock (Blocker Severity Model)

The Decision Lock is the orchestrator's policy for what to do when an agent says
"I can't proceed." It maps a raw `blocker` payload to one of four canonical
severities and a recommended orchestration response.

> Naming clash note: there is an unrelated, pre-existing module at
> `apps/unifiedtoolbox.webapp/src/lib/app-factory/parallel/decisionLock.ts` that handles
> *repo-contract* locking (STACK_LOCK.json / API_CONTRACT.json / hash) for the parallel-teams
> workflow. It is a different concept. This document describes the **blocker-severity** model,
> implemented at `apps/unifiedtoolbox.webapp/src/lib/contracts/decisionLock.ts`. Both can coexist;
> when in doubt, qualify as "repo-contract decision lock" vs "blocker decision lock".

## 1. Severity levels

| Severity | Definition | Default orchestrator action |
| --- | --- | --- |
| `hard_blocker` | Run cannot continue. Needs an external decision or resource. | Transition to `blocked`, surface to user, do **not** retry automatically. |
| `soft_blocker` | Run can continue if the orchestrator chooses to retry or skip. | Transition to `blocked` then `recovering` with strategy=`retry_with_changes` or `skip`. |
| `clarification_needed` | A small input is missing; agent will resume when provided. | Transition to `waiting_on_input`. |
| `non_blocking_gap` | Observed gap but does not affect this run. | Keep `running`; log warning. |

## 2. Classification inputs

The classifier (`classifyBlocker` in `decisionLock.ts`) accepts a partial Blocker object and
returns the severity using this precedence:

1. **Explicit `severity` field** if it matches one of the four canonical values, return it.
2. **`code` heuristics**:
   - codes starting with `FATAL_`, `MISSING_CREDENTIAL`, `UNAUTHORIZED`, `BUDGET_EXCEEDED` → `hard_blocker`
   - codes starting with `CLARIFY_`, ending in `_AMBIGUOUS`, or equal to `NEEDS_INPUT` → `clarification_needed`
   - codes ending in `_FLAKY`, `_TIMEOUT`, `_RATE_LIMIT` → `soft_blocker`
3. **`needed_from` field**: if `needed_from === "user"` and not classified, default `clarification_needed`.
4. **Fallback**: `non_blocking_gap` (forces orchestrator to keep going while still emitting a warn event).

The classifier is pure (no IO), deterministic, and safe to call repeatedly.

## 3. Recovery strategies

Mapping from severity to default recovery strategy (orchestrator may override):

| Severity | Default strategy | Retries allowed |
| --- | --- | --- |
| `hard_blocker` | `escalate` | 0 |
| `soft_blocker` | `retry_with_changes` | up to attempt budget |
| `clarification_needed` | `escalate` (wait on input) | 0 (counted as paused, not retried) |
| `non_blocking_gap` | `skip` | n/a |

The strategy enum is defined in [A2A_CONTRACT.md §2](./A2A_CONTRACT.md#2-envelope-shape-json-schema-fragment).

## 4. Event emission

When a blocker is classified, Agent 3 emits `agent_blocked` (see
[EVENT_TAXONOMY.md](./EVENT_TAXONOMY.md)) and, if a strategy is selected, follows with
`run_recovered`. The orchestrator MUST NOT skip the `run_recovered` event even for
`non_blocking_gap` — emit it with `strategy=skip` to keep the audit trail complete.

## 5. Test contract

See `apps/unifiedtoolbox.webapp/src/lib/contracts/__tests__/decisionLock.test.ts`. Required
coverage:

- explicit-severity passthrough for all four levels
- code-prefix heuristic (`FATAL_*`, `CLARIFY_*`, `*_TIMEOUT`)
- `needed_from=user` defaulting to `clarification_needed`
- final fallback to `non_blocking_gap`
