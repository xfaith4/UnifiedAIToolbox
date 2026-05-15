# A2A (Agent-to-Agent) Contract

Canonical message envelope that every agent in the Unified AI Toolbox orchestration must produce
and consume. Versioned, additive, machine-validated.

> Owner: Orchestration Contracts (Agent 1 lane). Consumers: Agents 2 (UI), 3 (runs API),
> 4 (docs/manifests).

## 1. Versioning policy

- Each envelope carries `envelope_version` (semver-like string).
- Current version: **`1.0.0`**.
- Additive changes (new optional fields) bump the **minor** version.
- Breaking changes ship a new schema at `contracts/a2a_envelope.v2.json` rather than
  mutating the v1 schema; v1 must continue to validate until a deprecation window closes.
- The TS validator (`a2aEnvelope.ts`) is the source of truth for runtime behavior; this doc
  is the source of truth for human readers and downstream agents.

## 2. Envelope shape (JSON Schema fragment)

```json
{
  "$id": "https://uaitoolbox.local/contracts/a2a_envelope.v1.json",
  "type": "object",
  "required": [
    "envelope_version",
    "message_id",
    "run_id",
    "from_agent",
    "to_agent",
    "intent",
    "status",
    "ts",
    "payload"
  ],
  "properties": {
    "envelope_version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "message_id":       { "type": "string", "minLength": 1 },
    "correlation_id":   { "type": "string" },
    "run_id":           { "type": "string", "minLength": 1 },
    "attempt_id":       { "type": "string" },
    "from_agent":       { "type": "string", "minLength": 1 },
    "to_agent":         { "type": "string", "minLength": 1 },
    "intent": {
      "type": "string",
      "enum": ["request", "response", "progress", "blocker", "final", "handoff", "recovery"]
    },
    "status": {
      "type": "string",
      "enum": [
        "queued", "running", "waiting_on_input", "recovering",
        "blocked", "validating", "completed", "failed"
      ]
    },
    "ts":               { "type": "string", "format": "date-time" },
    "evidence_refs":    { "type": "array", "items": { "$ref": "#/$defs/EvidenceRef" } },
    "artifact_refs":    { "type": "array", "items": { "$ref": "#/$defs/ArtifactRef" } },
    "blocker":          { "$ref": "#/$defs/Blocker" },
    "recovery":         { "$ref": "#/$defs/Recovery" },
    "final":            { "$ref": "#/$defs/FinalAnswer" },
    "payload":          { "type": "object" }
  },
  "$defs": {
    "EvidenceRef": {
      "type": "object",
      "required": ["kind", "uri"],
      "properties": {
        "kind": { "type": "string", "enum": ["url", "doc", "file", "tool_output", "search_result"] },
        "uri":  { "type": "string" },
        "title": { "type": "string" },
        "captured_at": { "type": "string", "format": "date-time" }
      }
    },
    "ArtifactRef": {
      "type": "object",
      "required": ["path"],
      "properties": {
        "path": { "type": "string" },
        "kind": { "type": "string" },
        "bytes": { "type": "integer", "minimum": 0 },
        "sha256": { "type": "string" },
        "produced_by": { "type": "string" }
      }
    },
    "Blocker": {
      "type": "object",
      "required": ["severity", "code", "summary"],
      "properties": {
        "severity": { "type": "string", "enum": ["hard_blocker", "soft_blocker", "clarification_needed", "non_blocking_gap"] },
        "code":     { "type": "string" },
        "summary":  { "type": "string" },
        "details":  { "type": "string" },
        "needed_from": { "type": "string", "description": "Agent or 'user' that must resolve" },
        "options":  { "type": "array", "items": { "type": "string" } }
      }
    },
    "Recovery": {
      "type": "object",
      "required": ["strategy"],
      "properties": {
        "strategy": { "type": "string", "enum": ["retry", "retry_with_changes", "skip", "escalate", "abort"] },
        "rationale": { "type": "string" },
        "changes":   { "type": "array", "items": { "type": "string" } },
        "attempt_budget_remaining": { "type": "integer", "minimum": 0 }
      }
    },
    "FinalAnswer": {
      "type": "object",
      "required": [
        "requested_objective",
        "completed_deliverables",
        "incomplete_items",
        "assumptions_used",
        "blockers_encountered",
        "artifacts_created",
        "validation_status",
        "recommended_next_step"
      ],
      "properties": {
        "requested_objective": { "type": "string" },
        "completed_deliverables": { "type": "array", "items": { "type": "string" } },
        "incomplete_items":      { "type": "array", "items": { "type": "string" } },
        "assumptions_used":      { "type": "array", "items": { "type": "string" } },
        "blockers_encountered":  { "type": "array", "items": { "$ref": "#/$defs/Blocker" } },
        "artifacts_created":     { "type": "array", "items": { "$ref": "#/$defs/ArtifactRef" } },
        "validation_status":     { "type": "string", "enum": ["passed", "failed", "partial", "deferred", "pending"] },
        "recommended_next_step": { "type": "string" }
      }
    }
  }
}
```

## 3. Field reference

| Field | Required | Notes |
| --- | --- | --- |
| `envelope_version` | yes | Semver of the envelope schema. |
| `message_id` | yes | Globally unique. ULID or UUIDv4 preferred. |
| `correlation_id` | no | Ties replies to a request. Defaults to `message_id` when starting a thread. |
| `run_id` | yes | Orchestration run id. Must match the active run. |
| `attempt_id` | no | When the orchestrator is retrying, the attempt id (e.g. `a2`). |
| `from_agent` / `to_agent` | yes | Canonical agent names (e.g. `Commissioner`, `Engineer`, `User`, `Orchestrator`). |
| `intent` | yes | Discriminator for what this message *does*. |
| `status` | yes | The lifecycle status of the sender at emit time. See [RUN_LIFECYCLE.md](./RUN_LIFECYCLE.md). |
| `ts` | yes | ISO-8601 UTC. |
| `evidence_refs` | no | Citations / tool outputs used to justify the payload. |
| `artifact_refs` | no | Files produced or referenced by this message. |
| `blocker` | required when `intent="blocker"` | See [DECISION_LOCK.md](./DECISION_LOCK.md). |
| `recovery` | required when `intent="recovery"` | The strategy the sender will take or recommends. |
| `final` | required when `intent="final"` | The Run Success Contract for the consumer. |
| `payload` | yes (may be `{}`) | Agent-specific body. Validators only ensure it is an object. |

## 4. Intent semantics

- `request` — sender is asking the recipient to do work.
- `response` — sender is replying to a prior `request` (use `correlation_id`).
- `progress` — heartbeat / partial output during a long task.
- `blocker` — sender cannot proceed without help. MUST populate `blocker`.
- `recovery` — sender (typically Orchestrator or Supervisor) is changing course. MUST populate `recovery`.
- `handoff` — clean baton-pass to next agent in the chain; `payload` carries everything the next agent needs.
- `final` — terminal message for a run/sub-task. MUST populate `final`.

## 5. Error and blocker shape

All blockers use the same shape regardless of severity. The orchestration layer classifies severity
via [DECISION_LOCK.md](./DECISION_LOCK.md). The four canonical severities:

| Severity | Meaning | Auto-recovery? |
| --- | --- | --- |
| `hard_blocker` | Run cannot continue without external resolution. | No — pause run, surface to user. |
| `soft_blocker` | Run is degraded but can continue if the orchestrator chooses to. | Yes — orchestrator may try retry/skip. |
| `clarification_needed` | Sender needs a small input from user/upstream agent. | No — wait on input, do not fail. |
| `non_blocking_gap` | Logged for observability but does not affect progress. | N/A — informational. |

## 6. Evidence and artifact refs

- `evidence_refs` is for *inputs/citations* used to derive a payload. Researcher and Critic
  should always populate this when issuing facts or judgments.
- `artifact_refs` is for *outputs* — files written to the run dir, PRs created, etc.
  Engineer and Synthesizer must populate this when they produce files.

## 7. Final answer / Run Success Contract

The `final` object is the canonical Run Success Contract. Every terminal message
(intent=`final`) MUST contain all eight required fields. The TS helper `buildRunSuccessContract`
asserts this. The validation_status enum aligns with `sandbox_report.json`.

## 8. Recovery contract

When the orchestrator decides to retry or change course, it emits an `intent="recovery"` message
to all relevant agents with the chosen `strategy` and a human-readable `rationale`. Agents must not
self-recover silently — they emit a blocker, the orchestrator emits the recovery.

## 9. Validation

- Server-side runtime validation: `apps/unifiedtoolbox.webapp/src/lib/contracts/a2aEnvelope.ts`
  exports `validateA2AEnvelope(input: unknown)` returning `{ valid, errors, envelope? }`.
- See [EVENT_TAXONOMY.md](./EVENT_TAXONOMY.md) for the event types that carry these envelopes
  on the wire.
