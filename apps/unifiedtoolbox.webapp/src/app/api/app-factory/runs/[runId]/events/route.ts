import { NextResponse } from 'next/server'
import path from 'path'
import { promises as fs } from 'fs'
import { getRunsRoot, isValidRunId } from '@/lib/app-factory/runs/runStatus'
import { getBufferedEvents, subscribeRunEvents, type RunStreamEvent } from '@/lib/app-factory/runs/runEvents'
import { normalizeRuntimeEvent, parseNdjsonChunk } from '@/lib/app-factory/runs/runtimeEventUtils'
import { fetchOrchestratorRunEvents } from '@/lib/app-factory/runs/orchestratorFallback'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_EVENT_BYTES = 512 * 1024
const DEFAULT_LIMIT = 200
const HEARTBEAT_MS = 15000

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const resolveRunId = (paramRunId: unknown, req: Request): string => {
  const direct = safeDecode(String(paramRunId || '')).trim()
  if (direct) return direct
  try {
    const parts = new URL(req.url).pathname.split('/').filter(Boolean)
    const runsIndex = parts.indexOf('runs')
    if (runsIndex >= 0 && parts.length > runsIndex + 1) {
      return safeDecode(parts[runsIndex + 1] || '').trim()
    }
  } catch {
    // ignore
  }
  return ''
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath)
    return stat.isFile()
  } catch {
    return false
  }
}

async function readTailLines(filePath: string, maxLines: number): Promise<string[]> {
  const stat = await fs.stat(filePath)
  const size = stat.size
  const readSize = Math.min(size, MAX_EVENT_BYTES)
  const fd = await fs.open(filePath, 'r')
  const buffer = Buffer.alloc(readSize)
  try {
    await fd.read(buffer, 0, readSize, size - readSize)
  } finally {
    await fd.close()
  }
  const text = buffer.toString('utf8')
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length <= maxLines) return lines
  return lines.slice(-maxLines)
}

async function readFileChunk(filePath: string, offset: number): Promise<{ text: string; nextOffset: number }> {
  const stat = await fs.stat(filePath)
  const safeOffset = Math.max(0, Math.min(offset, stat.size))
  const bytesToRead = stat.size - safeOffset
  if (bytesToRead <= 0) return { text: '', nextOffset: stat.size }
  const fd = await fs.open(filePath, 'r')
  const buffer = Buffer.alloc(bytesToRead)
  try {
    await fd.read(buffer, 0, bytesToRead, safeOffset)
  } finally {
    await fd.close()
  }
  return { text: buffer.toString('utf8'), nextOffset: stat.size }
}

function parseEvent(line: string, runId: string): RunStreamEvent {
  return normalizeRuntimeEvent((() => {
    try {
      return JSON.parse(line)
    } catch {
      return line
    }
  })(), runId) as RunStreamEvent
}

async function loadHistoryEvents(runDir: string, runId: string, limit: number, since?: string | null): Promise<RunStreamEvent[]> {
  const eventsPath = (await fileExists(path.join(runDir, 'events.ndjson')))
    ? path.join(runDir, 'events.ndjson')
    : (await fileExists(path.join(runDir, 'events.jsonl')))
      ? path.join(runDir, 'events.jsonl')
      : (await fileExists(path.join(runDir, 'events.log')))
        ? path.join(runDir, 'events.log')
        : null

  let events: RunStreamEvent[] = []
  if (eventsPath) {
    const lines = await readTailLines(eventsPath, limit)
    events = lines.map((line) => parseEvent(line, runId))
  }

  const buffered = getBufferedEvents(runId, since || undefined)
  if (buffered.length) {
    const seen = new Set(events.map((event) => `${event.ts}:${event.message}`))
    for (const event of buffered) {
      const key = `${event.ts}:${event.message}`
      if (!seen.has(key)) events.push(event)
    }
  }

  if (since) {
    const sinceTime = new Date(since).getTime()
    if (!Number.isNaN(sinceTime)) {
      events = events.filter((event) => {
        const ts = new Date(event.ts || '').getTime()
        return !Number.isNaN(ts) && ts > sinceTime
      })
    }
  }

  if (events.length > limit) {
    events = events.slice(-limit)
  }

  return events.sort((a, b) => a.ts.localeCompare(b.ts))
}

function toSseFrame(event: RunStreamEvent): string {
  return `id: ${event.ts}\nevent: run\ndata: ${JSON.stringify(event)}\n\n`
}

export async function GET(req: Request, { params: _params }: { params: Promise<{ runId: string }> }) {
  const params = await _params
  const runId = resolveRunId(params?.runId, req)
  if (!runId) {
    return NextResponse.json({ error: { code: 'MISSING_RUN_ID', message: 'Missing runId' } }, { status: 400 })
  }
  if (!isValidRunId(runId)) {
    return NextResponse.json({ error: { code: 'INVALID_RUN_ID', message: 'Invalid runId' } }, { status: 400 })
  }

  const url = new URL(req.url)
  const since = url.searchParams.get('since')
  const limitParam = url.searchParams.get('limit')
  const limit = limitParam ? Math.max(1, Number.parseInt(limitParam, 10) || DEFAULT_LIMIT) : DEFAULT_LIMIT
  const accept = req.headers.get('accept') || ''
  const wantsSse = accept.includes('text/event-stream') || url.searchParams.get('stream') === '1'
  const offsetParam = url.searchParams.get('offset')
  const offset = offsetParam != null ? Math.max(0, Number.parseInt(offsetParam, 10) || 0) : null
  const attemptId = url.searchParams.get('attempt_id') || null

  const runsRoot = getRunsRoot()
  const runDir = path.join(runsRoot, runId)
  let runDirExists = false
  try {
    const stat = await fs.stat(runDir)
    runDirExists = stat.isDirectory()
  } catch {
    runDirExists = false
  }

  // Fallback: if no filesystem run directory, proxy events from the orchestrator API
  if (!runDirExists) {
    let orchEvents = await fetchOrchestratorRunEvents(runId, since)
    if (attemptId) {
      orchEvents = orchEvents.filter((ev) => ev.attemptId === attemptId)
    }

    if (process.env.NODE_ENV === 'development') {
      console.debug(`[events] resolved ${runId} from orchestrator fallback (${orchEvents.length} events)`)
    }

    if (!wantsSse) {
      const cursor = orchEvents.length ? orchEvents[orchEvents.length - 1].ts ?? null : null
      return NextResponse.json(
        { runId, events: orchEvents, cursor, source: 'orchestrator' },
        { status: 200, headers: { 'X-Run-Source': 'orchestrator' } }
      )
    }

    // SSE mode with orchestrator fallback: emit buffered events then close.
    // We send a stream-end sentinel so the client knows this is a planned snapshot
    // close (not a connection drop) and can stop reconnecting.
    const encoder = new TextEncoder()
    const orchStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(': connected-orchestrator-fallback\n\n'))
        for (const event of orchEvents) {
          const frame = `id: ${event.ts}\nevent: run\ndata: ${JSON.stringify(event)}\n\n`
          controller.enqueue(encoder.encode(frame))
        }
        controller.enqueue(encoder.encode(`event: heartbeat\ndata: {"ts":"${new Date().toISOString()}","runId":"${runId}","source":"orchestrator"}\n\n`))
        // Signal planned close so the client does not reconnect
        controller.enqueue(encoder.encode(`event: stream-end\ndata: {"reason":"snapshot","source":"orchestrator"}\n\n`))
        controller.close()
      },
    })
    return new Response(orchStream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        'X-Run-Source': 'orchestrator',
      },
    })
  }

  if (!wantsSse && offset != null) {
    const ndjsonPath = path.join(runDir, 'events.ndjson')
    if (!(await fileExists(ndjsonPath))) {
      return NextResponse.json({ runId, events: [], offset, nextOffset: offset }, { status: 200 })
    }
    const { text, nextOffset } = await readFileChunk(ndjsonPath, offset)
    const { events, remainder } = parseNdjsonChunk(text, runId)
    const adjustedOffset = remainder ? nextOffset - Buffer.byteLength(remainder, 'utf8') : nextOffset
    return NextResponse.json({ runId, events, offset, nextOffset: adjustedOffset }, { status: 200 })
  }

  let events = await loadHistoryEvents(runDir, runId, limit, since)
  if (attemptId) {
    events = events.filter((ev) => ev.attemptId === attemptId)
  }

  if (!wantsSse) {
    const cursor = events.length ? events[events.length - 1].ts || null : null
    return NextResponse.json({ runId, events, cursor }, { status: 200 })
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      controller.enqueue(encoder.encode(': connected\n\n'))
      for (const event of events) {
        controller.enqueue(encoder.encode(toSseFrame(event)))
      }

      const unsubscribe = subscribeRunEvents(runId, (event) => {
        if (attemptId && event.attemptId !== attemptId) return
        controller.enqueue(encoder.encode(toSseFrame(event)))
      })

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`event: heartbeat\ndata: {"ts":"${new Date().toISOString()}","runId":"${runId}"}\n\n`))
      }, HEARTBEAT_MS)

      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        unsubscribe()
        controller.close()
      })
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
