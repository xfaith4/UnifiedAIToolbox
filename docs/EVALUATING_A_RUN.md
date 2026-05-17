# How to Evaluate a Run

A practical guide for engineers and operators who need to decide whether an
orchestration run did what it was supposed to do. Every section names the UI
panel **and** the underlying file or endpoint so you can verify either way.

Reference contracts:
- [contracts/A2A_CONTRACT.md](contracts/A2A_CONTRACT.md) — envelope and blocker shape
- [contracts/RUN_LIFECYCLE.md](contracts/RUN_LIFECYCLE.md) — 8 canonical statuses
- [contracts/EVENT_TAXONOMY.md](contracts/EVENT_TAXONOMY.md) — 13 canonical event types
- [contracts/DECISION_LOCK.md](contracts/DECISION_LOCK.md) — blocker severities

---

## 1. Did the run objective remain visible?

A run that drifts from its objective is the most common silent failure.

**UI.** Run Detail header. The objective (and the proposal it came from, if any)
should be visible at the top of `/runs/<runId>`.

**Backend.** `GET /api/runs/<runId>/manifest` — look at
`manifest.requested_objective`. The same string should also appear in the
`run_created` event payload (`data.requested_objective`) in `events.jsonl`.

**Verdict.**
- **Pass:** the objective matches the user's intent and is still present at the
  end of the run.
- **Fail:** the objective is missing, mutated mid-run, or replaced by an unrelated
  task. Suspect a planning agent reformulated it without recording the change.

---

## 2. Did each agent report progress?

You should be able to trace what each agent did, in order, with at least a start
event and a completion event per agent invocation.

**UI.** Run Console agent cards (Run Detail → "Active cast" / "Agent activity" panel).
Each card shows agent name, current status, and timing.

**Backend.** Filter `events.jsonl` (or
`GET /api/runs/<runId>/events/canonical`) for `agent_started`, `agent_progress`,
and `agent_completed`. Group by `data.agent`.

**Verdict.**
- **Pass:** every agent that contributed has at least an `agent_started` paired
  with a terminal `agent_completed` (or `agent_blocked`); the timestamps make
  sense.
- **Fail:** an agent appears in the chain but never emits a completion event, or
  emits a final envelope without `agent_completed`. That's an orchestration bug,
  not a model failure.

---

## 3. Were blockers classified properly?

A blocker without severity is a blocker the orchestrator cannot act on.

**UI.** Run Detail → "Blockers" panel (or "What failed" if terminal).

**Backend.** `agent_blocked` events in `events.jsonl`. Each must include
`severity`, `code`, `summary`, and `needed_from` per
[contracts/EVENT_TAXONOMY.md](contracts/EVENT_TAXONOMY.md). Severity must be one of
the four values in [contracts/DECISION_LOCK.md](contracts/DECISION_LOCK.md).

**Verdict.**
- **Pass:** every blocker has a canonical severity; the run status matches
  (`hard_blocker`/`soft_blocker` → `blocked`, `clarification_needed` →
  `waiting_on_input`, `non_blocking_gap` → run continues with a warn-level
  event).
- **Fail:** severity missing or set to a non-canonical value, OR run status does
  not match the severity. The `classifyBlocker` helper at
  [`apps/unifiedtoolbox.webapp/src/lib/contracts/decisionLock.ts`](../apps/unifiedtoolbox.webapp/src/lib/contracts/decisionLock.ts)
  is the deterministic classifier.

---

## 4. Did the run produce artifacts?

A run that finished `completed` without artifacts is suspicious for a build job.

**UI.** Run Detail → "Artifacts" panel. Lists files with kind, byte count, and
producer.

**Backend.**
- Disk: `<runs_dir>/<runId>/artifacts.index.jsonl` — one JSON record per file.
- API: `GET /api/runs/<runId>/artifacts`.
- Events: every artifact should have a matching `artifact_created` event.

**Verdict.**
- **Pass:** the artifact index lists the expected files; every file referenced by
  the final summary is present on disk.
- **Fail:** the index is empty for a build job, or it references files that
  don't exist, or files exist on disk but aren't indexed. Indexing happens via
  `indexArtifact` in
  [`apps/unifiedtoolbox.webapp/src/lib/app-factory/runs/artifactIndex.ts`](../apps/unifiedtoolbox.webapp/src/lib/app-factory/runs/artifactIndex.ts).

---

## 5. Was the final answer validated?

`completed` is not the same as `validated`. Validation is its own gate.

**UI.** Run Detail → "Validation" or "Final Result" panel. Should show
`validation_status` (`passed` / `failed` / `partial`) and per-criterion results.

**Backend.**
- `validation_started` and `validation_completed` events in `events.jsonl`.
  `validation_completed` must include `validation_status`, `passed`, `failed`,
  `deferred`.
- `final_summary.json` on disk should include the same validation block.
- API: `GET /api/runs/<runId>/summary`.

**Verdict.**
- **Pass:** `validation_completed` exists with `validation_status=passed` and
  zero unexpected `failed` items; final summary cites concrete evidence (gate
  outputs, Commissioner score, sandbox report).
- **Fail:** the run reached `completed` without ever entering `validating`,
  validation passed with zero criteria checked, or validation deferred all
  criteria. Investigate by reading
  [`finalSummary.ts`](../apps/unifiedtoolbox.webapp/src/lib/app-factory/runs/finalSummary.ts).

---

## 6. Are next steps clear?

A finished run should leave a human able to act without re-reading every event.

**UI.** Run Detail → "Final Result" / "Lessons" panel. Should include a short
recap, validation outcome, and an explicit "next steps" or "follow-ups" list.

**Backend.** `final_summary.json` is the source of truth. Look for
`next_steps` (or `follow_ups`) plus the run's terminal status from
[contracts/RUN_LIFECYCLE.md](contracts/RUN_LIFECYCLE.md):

- `completed` + `validation_status=passed` → ship / merge / hand off
- `completed` + `validation_status=failed` or `partial` → triage the failed
  criteria
- `failed` → read `run_failed.data.reason` and the last `agent_blocked` event
- `blocked` / `waiting_on_input` → the run isn't done; resolve the blocker

**Verdict.**
- **Pass:** the reader can answer "what now?" from the final summary alone.
- **Fail:** the summary recaps activity without a recommendation, or the
  recommendation contradicts the terminal status.

---

## Quick triage table

| Symptom | First place to look | Likely cause |
| --- | --- | --- |
| Run stuck in `queued` | `events.jsonl` (empty?) | Producer never called `appendEvent('run_started', …)` — see [TROUBLESHOOTING.md](TROUBLESHOOTING.md) |
| `completed` but no artifacts | `artifacts.index.jsonl` | Producer didn't call `indexArtifact` after writing the file |
| Validation never ran | `events.jsonl` for `validation_started` | Orchestrator didn't transition `running → validating` |
| Blocker without severity | `agent_blocked` event payload | Agent prompt didn't include the Decision Lock contract |
| UI badge says "Succeeded" not "Completed" | Legacy normalizer in `runStatus.ts` | New code must emit canonical `completed` — see [RUN_LIFECYCLE.md §1](contracts/RUN_LIFECYCLE.md) |
