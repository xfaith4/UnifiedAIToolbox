# Telemetry

Purpose: Document telemetry collection, dashboards, and AI-assisted insights.

## Overview
Telemetry captures usage and operational events for:
- Repository analysis
- Orchestration and dashboard activity
- AI insight generation

Data is stored locally as JSONL under `artifacts/telemetry/`.

## Dashboard
Launch the dashboard:
```bash
cd apps/dashboard
npm run dev
```

Open:
- `http://localhost:3001/telemetry`

## REST API
- `POST /api/telemetry` — submit events
- `GET /api/telemetry/stats?days=7` — summary stats

## PowerShell module
```powershell
Import-Module ./modules/Telemetry/Telemetry.psd1
Get-TelemetryStats -Days 7
```

## UX telemetry (portal)
The Next.js portal emits a lightweight UX event stream:
- Client logs `UX_EVENT` to console for Playwright capture.
- Dev-only POSTs to `POST /api/telemetry` (JSONL: `artifacts/telemetry/web-ux-events.jsonl`).

Event model:
```ts
type UxEvent = {
  name: 'page_view' | 'cta_click' | 'form_submit' | 'validation_error' | 'api_error'
    | 'empty_state_seen' | 'time_to_interactive' | 'rage_click'
    | 'dead_click' | 'scroll_depth' | 'dropoff' | 'exception'
  ts: string
  sessionId: string
  route?: string
  details?: Record<string, unknown>
}
```

## AI insights
Weekly AI summaries are generated when `OPENAI_API_KEY` is configured:
- Repo analysis summaries
- PR activity snapshots

Artifacts are written under `artifacts/reports/`.

## Privacy and security
- No source code is sent by default; only metadata and metrics.
- Telemetry can be disabled via environment variable:
```powershell
$env:TELEMETRY_ENABLED = 'false'
```

## Troubleshooting
- No events showing: verify `artifacts/telemetry/` exists and telemetry is enabled.
- AI insights missing: confirm `OPENAI_API_KEY` is set and workflows ran.

## Related docs
- [Cost analytics](cost-analytics.md)
- [Workflows](workflows.md)
