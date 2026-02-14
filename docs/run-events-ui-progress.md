# Run Events + UI Progress Model

## Event stream

- Endpoint: `GET /api/app-factory/runs/:runId/events`
- Supports JSON history mode and SSE mode (`Accept: text/event-stream`).
- SSE pushes `run` events plus heartbeat frames every ~15s.
- History can be replayed with `?since=<iso>`.

Event payload shape:

```json
{
  "ts": "2026-02-14T09:01:01.495Z",
  "runId": "...",
  "phase": "normalize",
  "agent": "Normalizer",
  "status": "running",
  "message": "Human-readable update",
  "details": { "file": "...", "lines": [3, 33, 90] }
}
```

## UI mapping

The App Lifecycle Maintenance panel derives four truth panels from stream + status:

1. Pipeline timeline (phase status and event drilldown)
2. Agent cards (status + last message)
3. Gates (pass/fail/skipped reason)
4. Artifacts (live report/artifact inventory)

## Export blocked debugging

When export returns `422`, API now returns `blockers[]` plus reports.

- UI shows "Export blocked by validation"
- "Export Blockers" lists file, rule, lines/snippet, and copy-path action.
- Prioritize `reports.normalization`, `reports.repoContract`, and `reports.gate`.

## Run observatory root

Configure run storage root by setting either:

1. `UAITOOLBOX_RUNS_DIR` environment variable, or
2. `config/run-observatory.json` with `runsRoot`.

This keeps `.uaitoolbox/**` and `runs/**` as artifacts while allowing central run observatory storage.
