# Validation Pack

## Commands

### Web portal lint + unit tests

```powershell
cd apps\unifiedtoolbox.webapp
npm run lint
npm run test
npm run typecheck
```

### Synthetic UX simulations (100+)

```powershell
cd apps\unifiedtoolbox.webapp
$env:UX_RUNS = '120'
npm run ux:simulate
```

### Prompt API health

```powershell
Invoke-WebRequest http://localhost:8000/health | Select-Object -ExpandProperty StatusCode
```

## Artifacts

- UX simulation outputs: `artifacts/ux-simulations/`
- Web UX telemetry JSONL: `artifacts/telemetry/web-ux-events.jsonl`

## Notes

- If the portal is not running, start it first (see `docs/ux/01-local-runbook.md`).
