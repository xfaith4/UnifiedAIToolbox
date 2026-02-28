# Run Events Schema

Unified AI Toolbox runtime events are newline-delimited JSON (`events.ndjson`) and streamed over SSE.

## Event object

```json
{
  "ts": "2026-02-28T19:04:31.125Z",
  "level": "info",
  "run_id": "maint-2026-02-28T19-00-00-111Z-a1b2c3d4",
  "stage": "gates",
  "step": "Running lint",
  "type": "step.progress",
  "msg": "lint in progress",
  "data": {
    "files_scanned": 128,
    "files_excluded": 9,
    "bytes_written": 1048576,
    "pass": 1,
    "total_passes": 3,
    "path": "GATE_REPORT.md"
  }
}
```

## Required fields

- `ts`: ISO-8601 timestamp.
- `level`: `debug | info | warn | error`.
- `run_id`: orchestration run id.
- `stage`: `agents | assemble | normalize | contract | gates | repair | export`.
- `type`: `stage.start | stage.complete | step.start | step.progress | step.complete | artifact.created | warn | error | metric`.
- `msg`: human-readable runtime status line.

## Optional fields

- `step`: current sub-step label.
- `data`: structured metrics for machine parsing.

## Export metrics

Export/zip stages emit these `msg` values with `type=step.progress`:

- `export.enumeration.start`
- `export.enumeration.progress`
- `export.zip.progress`

Expected `data` payloads:

- `export.enumeration.progress`: `{ files_seen, excluded_dirs }`
- `export.zip.progress`: `{ bytes_written, bytes_total_estimate, files_zipped, files_total, percent }`

## Runtime guarantees

- Events are append-only in `<run_dir>/events.ndjson`.
- Long-running stages (`normalize`, `contract`, `gates`, `repair`, `export`) should emit progress at least every 5-10 seconds.
- `stage.start` and `stage.complete` are always emitted for each pipeline stage.
