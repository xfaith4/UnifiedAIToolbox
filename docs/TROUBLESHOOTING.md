# Troubleshooting

Common failure modes after the 2026-05 modernization pass, with verification steps
and fixes. Pair this with [EVALUATING_A_RUN.md](EVALUATING_A_RUN.md) when triaging a
specific run, and with [contracts/](contracts/) when verifying schema compliance.

---

## Run stuck in `queued`

**Symptom.** `GET /api/runs/<runId>/manifest` shows `status=queued` indefinitely;
nothing appears in the Run Console.

**Likely cause.** The orchestrator (or agent runner) never called
`appendEvent('run_started', …)`. This is a **known migration gap** from the
modernization pass: Agent 3 added the canonical event helpers in
[`apps/unifiedtoolbox.webapp/src/lib/app-factory/runs/canonicalEvents.ts`](../apps/unifiedtoolbox.webapp/src/lib/app-factory/runs/canonicalEvents.ts),
but producers (orchestrator + agent runners) are not yet wired to them.

**Verify.**

```bash
# Look at the per-run events file. It should be non-empty.
type <runs_dir>\<runId>\events.jsonl    # Windows
cat  <runs_dir>/<runId>/events.jsonl    # bash
```

If `events.jsonl` is missing or has zero `run_started` lines, the producer didn't
emit.

**Fix.** Until producers are migrated (see [ROADMAP.md](ROADMAP.md) →
"Post-Modernization → Now"), legacy run flows continue to use `run_state.json`
and `events.ndjson`. New runs created through the canonical path should call
`appendEvent` at queue, start, agent boundaries, validation, and terminal
transitions per [contracts/EVENT_TAXONOMY.md](contracts/EVENT_TAXONOMY.md).

---

## Empty manifest or no canonical events

**Symptom.** `GET /api/runs/<runId>/manifest` returns mostly-empty fields, or
`GET /api/runs/<runId>/events/canonical` returns `events: []` for a run you can
see in the UI.

**Likely cause.** The run was created **before** the modernization pass producers
were wired, or by a code path that still writes only the legacy `events.ndjson`.

**Verify.**

```bash
ls <runs_dir>/<runId>/
# Modern: events.jsonl, artifacts.index.jsonl, final_summary.json
# Legacy: events.ndjson, run_state.json, agent_status.json
```

**Fix.** This is expected for legacy runs. New runs will populate the canonical
files once producers are migrated. Do not back-fill legacy runs — they are
read-only.

---

## SSE disconnects from `/events/canonical`

**Symptom.** The Run Console event stream drops every few seconds, or the UI
reports "stream lost" without recovery.

**Likely cause 1 (heartbeat misread).** The canonical SSE stream emits a
`: heartbeat` comment every 15 s. Some clients log that as a disconnect.

**Verify.**

```bash
curl -N -H "Accept: text/event-stream" http://localhost:3000/api/runs/<runId>/events/canonical
```

You should see `event: ...`/`data: ...` frames interleaved with
`: heartbeat` comment lines. The latter are not disconnects.

**Likely cause 2 (no Last-Event-ID on reconnect).** A client that reconnects
without the `Last-Event-ID` header will miss replay and look like it lost
events.

**Fix.** The browser `EventSource` API sets `Last-Event-ID` automatically.
Custom clients must echo the most recent event id back on reconnect. The server
returns events strictly after that id; a `stream-end` sentinel is emitted when
the run terminates.

---

## Validation errors on A2A envelope

**Symptom.** An agent's message is rejected by the orchestrator with
`INVALID_ENVELOPE` or a similar error.

**Likely cause.** Required field missing, or `intent`/`status` not one of the
canonical enum values.

**Verify.** Call the validator directly:

```ts
import { validateA2AEnvelope } from '@/lib/contracts/a2aEnvelope'

const result = validateA2AEnvelope(rawMessage)
if (!result.ok) {
  console.error(result.errors)  // structured list of failures
}
```

`errors[]` items include the field path and the failing rule. See
[contracts/A2A_CONTRACT.md](contracts/A2A_CONTRACT.md) for the full required-field
list and enum values.

**Fix.** Patch the agent's output template. Common offenders:

- Missing `envelope_version` (must match `^\d+\.\d+\.\d+$`).
- `intent` set to a free-form string instead of one of
  `request | response | progress | blocker | final | handoff | recovery`.
- `status` using a legacy value (`succeeded`, `dispatching`, `stuck`) instead of
  the canonical 8 from [contracts/RUN_LIFECYCLE.md §1](contracts/RUN_LIFECYCLE.md).

---

## Tests fail with rollup native binary missing

**Symptom.**

```
Cannot find module @rollup/rollup-win32-x64-msvc
```

when running `npx vitest run` on Windows.

**Likely cause.** An npm bug intermittently skips installing optional native
binaries. Hit during Phase 1 work.

**Fix.**

```bash
cd apps/unifiedtoolbox.webapp
npm install @rollup/rollup-win32-x64-msvc --no-save
# or, more aggressively:
rm -rf node_modules package-lock.json && npm install
```

---

## `pnpm` vs `npm`

**Symptom.** Documentation or a generated script tells you to run `pnpm install`,
but the lockfile is `package-lock.json`.

**Cause.** The repository root has a `pnpm-workspace.yaml` for legacy reasons,
but the canonical package manager for `apps/unifiedtoolbox.webapp/` is **npm**.
The committed lockfile is `package-lock.json`.

**Fix.** Use `npm` for the webapp:

```bash
cd apps/unifiedtoolbox.webapp
npm install
npm run dev
npm run build
npx vitest run
```

If you genuinely need pnpm for the workspace, regenerate
`pnpm-lock.yaml` consistently with `package-lock.json` — but prefer not mixing
the two.

---

## Final summary missing for a `completed` run

**Symptom.** Run shows `status=completed`, but `GET /api/runs/<runId>/summary`
returns 404 or `final_summary.json` is absent.

**Likely cause.** The orchestrator transitioned to `completed` without calling
`writeFinalSummary` from
[`apps/unifiedtoolbox.webapp/src/lib/app-factory/runs/finalSummary.ts`](../apps/unifiedtoolbox.webapp/src/lib/app-factory/runs/finalSummary.ts).

**Verify.**

```bash
ls <runs_dir>/<runId>/final_summary.json
```

**Fix.** Producer migration item (see roadmap). The write is atomic
(`temp + rename`); if the file exists, trust it.

---

## Cross-process file lock contention on Windows

**Symptom.** Rare interleaved/truncated lines in `events.jsonl` when two
processes append simultaneously.

**Cause.** POSIX `O_APPEND` semantics are weaker on Windows; Node's `fs.appendFile`
relies on the OS. Flagged by Agent 3 as a follow-up.

**Mitigation.** Currently single-writer-per-run is assumed. Multi-writer support
is a roadmap item (see [ROADMAP.md](ROADMAP.md) → "Post-Modernization → Later").
For now, do not run two workers against the same `runId`.
