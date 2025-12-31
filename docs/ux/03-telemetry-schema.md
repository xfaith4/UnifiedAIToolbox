# UX Telemetry Schema

This is a lightweight, dev-friendly UX event stream for the Next.js portal.

## Where events go
- Client emits events via `console.log('UX_EVENT', JSON.stringify(...))` for easy Playwright capture.
- Client also POSTs to `POST /api/telemetry` (dev-only) which appends JSONL to:
  - `artifacts/telemetry/web-ux-events.jsonl`

## Event model

```ts
type UxEventName =
  | 'page_view'
  | 'cta_click'
  | 'form_submit'
  | 'validation_error'
  | 'api_error'
  | 'empty_state_seen'
  | 'time_to_interactive'
  | 'rage_click'
  | 'dead_click'
  | 'scroll_depth'
  | 'dropoff'
  | 'exception'

type UxEvent = {
  name: UxEventName
  ts: string                 // ISO timestamp
  sessionId: string          // per-tab session
  route?: string             // pathname
  details?: Record<string, unknown>
}
```

## Heuristics (current)
- `rage_click`: 4+ clicks on the same button/link signature within ~1s.
- `scroll_depth`: emits at 25/50/75/100% thresholds per route.
- `api_error`: emitted when a fetch fails or returns non-2xx.

## Debug overlay
A dev-only overlay can be enabled by appending `?uxdebug=1` to any portal URL.

It shows:
- current route
- breakpoint (mobile/tablet/desktop)
- inflight fetch count
- last 10 UX events

## Files
- Telemetry core: `apps/unifiedtoolbox.webapp/src/lib/ux/telemetry.ts`
- Overlay: `apps/unifiedtoolbox.webapp/src/components/ux/UxDebugOverlay.tsx`
- Server sink (dev-only): `apps/unifiedtoolbox.webapp/src/app/api/telemetry/route.ts`
