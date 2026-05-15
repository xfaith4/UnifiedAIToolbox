# Event Taxonomy

Canonical list of run-level events that Agent 3 will emit through `runEvents.ts` and persist
to `events.ndjson`. All events extend the base shape from
[run-events.schema.md](../run-events.schema.md); this doc adds the agent/run-orchestration
type discriminators and their payload contracts.

> Forward-compatibility rule: payloads are open objects. Consumers MUST ignore unknown
> fields. New fields are additive-only inside an `event_version`.

## 1. Base shape (already established)

```json
{
  "ts": "ISO-8601",
  "level": "debug | info | warn | error",
  "run_id": "string",
  "type": "<see canonical list below>",
  "msg": "human-readable",
  "data": { /* type-specific payload */ }
}
```

Agent 3 should also include where relevant: `stage`, `step`, `agent`, `attempt_id`.

## 2. Canonical event types

| Type | Fires when | Required `data` fields |
| --- | --- | --- |
| `run_created` | Run row persisted, before queueing | `job_type`, `requested_objective` |
| `run_queued` | Run placed on a worker queue | `queue` (string), `position` (int, optional) |
| `run_started` | Worker picks up a run or attempt restarts | `attempt_id`, `attempt_number` |
| `agent_started` | An agent in the chain begins | `agent` (string), `correlation_id` (optional) |
| `agent_progress` | Mid-task progress heartbeat | `agent`, `percent` (0–100, optional), `note` |
| `agent_blocked` | Agent emits a blocker envelope | `agent`, `severity`, `code`, `summary`, `needed_from` |
| `agent_completed` | Agent emits a `final` or `handoff` envelope | `agent`, `intent` (`final`\|`handoff`), `next_agent` (optional) |
| `artifact_created` | Engineer/Synthesizer writes a file | `path`, `kind`, `bytes`, `produced_by` |
| `validation_started` | Run enters `validating` | `criteria_count` (int, optional) |
| `validation_completed` | Validation finished | `validation_status`, `passed`, `failed`, `deferred` |
| `run_completed` | Run reaches terminal `completed` | `validation_status`, `total_attempts` |
| `run_failed` | Run reaches terminal `failed` | `reason` (string), `last_error` (optional), `total_attempts` |
| `run_recovered` | Orchestrator commits a recovery strategy | `strategy`, `rationale`, `from_status`, `to_status` |

## 3. Payload shapes (JSON examples)

### `run_created`
```json
{ "job_type": "build_app", "requested_objective": "Stand up a Next.js+Fastify scaffold." }
```

### `run_queued`
```json
{ "queue": "default", "position": 3 }
```

### `run_started`
```json
{ "attempt_id": "a1", "attempt_number": 1 }
```

### `agent_started`
```json
{ "agent": "Researcher", "correlation_id": "msg_01HXYZ..." }
```

### `agent_progress`
```json
{ "agent": "Engineer", "percent": 42, "note": "Generating tests" }
```

### `agent_blocked`
```json
{
  "agent": "Engineer",
  "severity": "hard_blocker",
  "code": "MISSING_API_KEY",
  "summary": "OPENAI_API_KEY not provided",
  "needed_from": "user"
}
```

### `agent_completed`
```json
{ "agent": "Critic", "intent": "handoff", "next_agent": "Synthesizer" }
```

### `artifact_created`
```json
{ "path": "artifacts/api/openapi.yaml", "kind": "openapi", "bytes": 8421, "produced_by": "Engineer" }
```

### `validation_started`
```json
{ "criteria_count": 7 }
```

### `validation_completed`
```json
{ "validation_status": "passed", "passed": 7, "failed": 0, "deferred": 0 }
```

### `run_completed`
```json
{ "validation_status": "passed", "total_attempts": 1 }
```

### `run_failed`
```json
{ "reason": "blocker_unrecoverable", "last_error": "No models available", "total_attempts": 3 }
```

### `run_recovered`
```json
{ "strategy": "retry_with_changes", "rationale": "Critic rejected; rerun Engineer", "from_status": "blocked", "to_status": "recovering" }
```

## 4. Ordering guarantees

For a healthy run, this is the canonical sequence:

```
run_created → run_queued → run_started
  → agent_started → (agent_progress)* → agent_completed   (repeat per agent)
  → (artifact_created)*
  → validation_started → validation_completed
  → run_completed
```

On blocker:
```
… → agent_blocked → run_recovered → run_started (attempt_id=a2) → …
```

## 5. Level guidance

- `info` for happy-path lifecycle events.
- `warn` for `soft_blocker` / `non_blocking_gap` and `run_recovered`.
- `error` for `hard_blocker`, `run_failed`, and `validation_completed` with status=`failed`.

## 6. Implementation notes for Agent 3

- Reuse `emitRunEvent` from `apps/unifiedtoolbox.webapp/src/lib/app-factory/runs/runEvents.ts`.
- Set `type` to the canonical strings above (exact match).
- Set `level` per §5.
- For `agent_blocked`, mirror the envelope `blocker` payload one-to-one so the UI can
  surface the same shape end-to-end.
- Persist to `events.ndjson` AND publish to subscribers (the existing helper does both).
