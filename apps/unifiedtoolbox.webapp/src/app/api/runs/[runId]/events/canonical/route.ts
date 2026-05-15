import { NextResponse } from 'next/server'
import { isValidRunId } from '@/lib/app-factory/runs/runStatus'
import {
  readEvents,
  sliceEventsFromCursor,
  toSseFrame,
} from '@/lib/app-factory/runs/canonicalEvents'
import { runLogger } from '@/lib/app-factory/runs/runLogger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEARTBEAT_MS = 15000

/**
 * GET /api/runs/[runId]/events/canonical
 *
 * Canonical event endpoint with stable schema (see `canonicalEvents.ts`).
 *
 * Supports two modes:
 *
 * 1. **JSON snapshot** (default, or when `Accept: application/json`). Returns
 *    `{ runId, events, cursor }` where `cursor` is the most recent
 *    `event_id`. Query params:
 *      - `after_event_id` — return events strictly after this id.
 *      - `after_timestamp` — ISO; fallback cursor when id is unknown.
 *      - `limit` — cap (default no cap).
 *
 * 2. **SSE replay-aware stream** (when `Accept: text/event-stream` or
 *    `?stream=1`). Honors the standard `Last-Event-ID` header and the
 *    `after_event_id` query param to replay missed events. Emits a
 *    `: heartbeat` comment every 15s and a `stream-end` event after replay.
 */
export async function GET(req: Request, { params: _params }: { params: Promise<{ runId: string }> }) {
  const params = await _params
  const runId = decodeURIComponent(String(params?.runId || '')).trim()
  if (!runId) {
    return NextResponse.json({ error: { code: 'MISSING_RUN_ID', message: 'Missing runId' } }, { status: 400 })
  }
  if (!isValidRunId(runId)) {
    return NextResponse.json({ error: { code: 'INVALID_RUN_ID', message: 'Invalid runId' } }, { status: 400 })
  }

  const url = new URL(req.url)
  const wantsSse =
    (req.headers.get('accept') || '').includes('text/event-stream') ||
    url.searchParams.get('stream') === '1'

  const lastEventIdHeader = req.headers.get('last-event-id') || undefined
  const afterEventId = url.searchParams.get('after_event_id') || lastEventIdHeader || undefined
  const afterTimestamp = url.searchParams.get('after_timestamp') || undefined
  const limitParam = url.searchParams.get('limit')
  const limit = limitParam ? Math.max(1, Number.parseInt(limitParam, 10) || 0) : undefined

  let events
  try {
    events = await readEvents(runId, { afterEventId, afterTimestamp, limit })
  } catch (error) {
    runLogger.error('canonicalEventsRoute.readFailed', {
      run_id: runId,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: { code: 'EVENTS_READ_FAILED', message: 'Failed to read events' } },
      { status: 500 }
    )
  }

  if (!wantsSse) {
    const cursor = events.length ? events[events.length - 1].event_id : null
    return NextResponse.json({ runId, events, cursor }, { status: 200 })
  }

  runLogger.info('canonicalEventsRoute.sseConnected', {
    run_id: runId,
    after_event_id: afterEventId,
    backlog: events.length,
  })

  const encoder = new TextEncoder()
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let aborted = false

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const safeEnqueue = (chunk: Uint8Array) => {
        if (aborted) return
        try {
          controller.enqueue(chunk)
        } catch {
          // controller may already be closed
        }
      }

      safeEnqueue(encoder.encode(': connected\n\n'))
      for (const event of events) {
        safeEnqueue(encoder.encode(toSseFrame(event)))
      }
      // Snapshot tail — clients that want live updates should connect to the
      // legacy stream endpoint, which fans out emitted events. We emit a
      // `stream-end` marker so clients know this is a planned close.
      safeEnqueue(
        encoder.encode(
          `event: stream-end\ndata: {"reason":"snapshot","runId":"${runId}"}\n\n`
        )
      )

      heartbeat = setInterval(() => {
        safeEnqueue(encoder.encode(`: heartbeat ${new Date().toISOString()}\n\n`))
      }, HEARTBEAT_MS)

      req.signal.addEventListener('abort', () => {
        aborted = true
        if (heartbeat) clearInterval(heartbeat)
        runLogger.info('canonicalEventsRoute.sseDisconnected', { run_id: runId })
        try {
          controller.close()
        } catch {
          // ignore
        }
      })
    },
    cancel() {
      aborted = true
      if (heartbeat) clearInterval(heartbeat)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

/**
 * Pure helper exported for unit testing — converts an event list into the SSE
 * frames that would be written for an initial snapshot. The route handler
 * uses this format directly via {@link toSseFrame}.
 */
export function buildSseSnapshot(
  events: Parameters<typeof sliceEventsFromCursor>[0],
  cursor: { afterEventId?: string; afterTimestamp?: string; limit?: number } = {}
): string {
  const sliced = sliceEventsFromCursor(events, cursor)
  let out = ': connected\n\n'
  for (const event of sliced) out += toSseFrame(event)
  out += 'event: stream-end\ndata: {"reason":"snapshot"}\n\n'
  return out
}
