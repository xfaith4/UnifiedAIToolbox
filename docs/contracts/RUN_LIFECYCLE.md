# Run Lifecycle

Canonical state machine for an orchestration run. Drives both the UI status badge
(Agent 2) and the runs API state file (Agent 3).

## 1. Status enum (exact strings)

These are the only allowed values for `status` in the A2A envelope and in `run_state.json`.
Agents 2 and 3 MUST use these exact strings:

- `queued`
- `running`
- `waiting_on_input`
- `recovering`
- `blocked`
- `validating`
- `completed`
- `failed`

> Note: the legacy `runStatus.ts` normalizer maps several historical values (`succeeded`,
> `dispatching`, `stuck`, etc.) into a smaller set. New code MUST emit the canonical
> values above. Legacy normalization remains for read-side backward compatibility.

## 2. Transition diagram

```
                 +---------+
                 | queued  |
                 +----+----+
                      |
                      v
                 +---------+    needs user/agent input    +-------------------+
                 | running |----------------------------->| waiting_on_input  |
                 +----+----+                              +---------+---------+
                  ^   |  \                                          |
                  |   |   \ hard/soft blocker raised                |
                  |   |    \                                        |
                  |   |     v                                       |
                  |   |   +---------+                               |
                  |   |   | blocked |<------------------------------+
                  |   |   +----+----+
                  |   |        | orchestrator decides
                  |   |        v
                  |   |   +-------------+
                  |   |   | recovering  |
                  |   |   +-----+-------+
                  |   |         |
                  |   |  recovery applied
                  |   +---------+
                  |             v
                  |        +------------+
                  +--------+ validating |
                           +------+-----+
                                  |
                            +-----+------+
                            |            |
                            v            v
                       +---------+   +--------+
                       |completed|   | failed |
                       +---------+   +--------+
```

## 3. Allowed transitions

| From | To | Trigger | Driver |
| --- | --- | --- | --- |
| `queued` | `running` | Worker picks up run | Orchestrator |
| `running` | `waiting_on_input` | `clarification_needed` blocker emitted | Any agent (via blocker) → Orchestrator |
| `running` | `blocked` | `hard_blocker` or `soft_blocker` emitted | Any agent → Orchestrator |
| `waiting_on_input` | `running` | User/upstream provides input | Orchestrator |
| `blocked` | `recovering` | Orchestrator decides on recovery strategy | Orchestrator |
| `recovering` | `running` | Recovery applied (retry/skip/etc.) | Orchestrator |
| `recovering` | `failed` | Recovery `strategy=abort` | Orchestrator |
| `running` | `validating` | All agents in chain reported `final` | Orchestrator |
| `validating` | `completed` | `validation_status=passed` | Orchestrator (with Critic input) |
| `validating` | `failed` | `validation_status=failed` and no retries left | Orchestrator |
| `validating` | `recovering` | `validation_status=failed` and retries remain | Orchestrator |
| any non-terminal | `failed` | Fatal error, attempt budget exhausted | Orchestrator |

Terminal states: `completed`, `failed`.

## 4. Events fired on each transition

Each transition emits exactly one of the canonical events in [EVENT_TAXONOMY.md](./EVENT_TAXONOMY.md).
Required event per transition:

| Transition | Event(s) |
| --- | --- |
| → `queued` | `run_queued` |
| `queued` → `running` | `run_started` |
| any → `waiting_on_input` | `agent_blocked` (severity=`clarification_needed`) |
| any → `blocked` | `agent_blocked` (severity=`hard_blocker` or `soft_blocker`) |
| `blocked` → `recovering` | `run_recovered` (precedes recovery action) |
| `recovering` → `running` | `run_started` (with `attempt_id` bumped) |
| `running` → `validating` | `validation_started` |
| `validating` → `completed` | `validation_completed`, then `run_completed` |
| `validating` → `failed` | `validation_completed`, then `run_failed` |
| any → `failed` | `run_failed` |

## 5. Driver authority

Only the **Orchestrator** is allowed to write `status` to `run_state.json`. Agents emit envelopes
with their per-message `status`; the Orchestrator aggregates and decides the run-level status.
This prevents two agents from concurrently claiming `completed`/`failed`.

The exception: Supervisor may *recommend* a state change via a `recovery`-intent envelope.
The Orchestrator decides whether to apply it.

## 6. Attempt accounting

- Each entry to `running` from `recovering` or from `validating` (on retry) increments
  `attemptNumber` and produces a new `attemptId` (`a1`, `a2`, …).
- The attempt store at `apps/unifiedtoolbox.webapp/src/lib/app-factory/runs/attemptStore.ts`
  is the system of record; do not duplicate this in the contracts lib.

## 7. UI consumption (Agent 2 contract)

Agent 2 should render badges using these mappings:

| status | badge label | color hint |
| --- | --- | --- |
| `queued` | Queued | slate |
| `running` | Running | blue |
| `waiting_on_input` | Needs Input | amber |
| `recovering` | Recovering | violet |
| `blocked` | Blocked | red |
| `validating` | Validating | indigo |
| `completed` | Completed | green |
| `failed` | Failed | red |

(Color hints are advisory; Agent 2 owns the actual palette.)
