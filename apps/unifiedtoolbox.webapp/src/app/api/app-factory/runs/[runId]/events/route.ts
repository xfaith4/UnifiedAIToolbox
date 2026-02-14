import { NextResponse } from 'next/server'
import path from 'path'
import { promises as fs } from 'fs'
import { getRunsRoot, isValidRunId } from '@/lib/app-factory/runs/runStatus'
import { getBufferedEvents, subscribeRunEvents, type RunStreamEvent } from '@/lib/app-factory/runs/runEvents'

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

function parseEvent(line: string, runId: string): RunStreamEvent {
  try {
    const parsed = JSON.parse(line) as RunStreamEvent
    return {
      ...parsed,
      runId: parsed.runId || runId,
      ts: parsed.ts || new Date().toISOString(),
      message: parsed.message || 'event',
    }
  } catch {
    return { ts: new Date().toISOString(), runId, type: 'info', message: line }
  }
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

export async function GET(req: Request, { params }: { params: { runId: string } }) {
  const runId = resolveRunId(params?.runId, req)
  if (!runId) {
    return NextResponse.json({ error: { code: 'MISSING_RUN_ID', message: 'Missing runId' } }, { status: 400 })
  }
  if (!isValidRunId(runId)) {
    return NextResponse.json({ error: { code: 'INVALID_RUN_ID', message: 'Invalid runId' } }, { status: 400 })
  }

  const runsRoot = getRunsRoot()
  const runDir = path.join(runsRoot, runId)
  try {
    const stat = await fs.stat(runDir)
    if (!stat.isDirectory()) throw new Error('not a directory')
  } catch {
    return NextResponse.json({ error: { code: 'RUN_NOT_FOUND', message: `Run not found: ${runId}` } }, { status: 404 })
  }

  const url = new URL(req.url)
  const since = url.searchParams.get('since')
  const limitParam = url.searchParams.get('limit')
  const limit = limitParam ? Math.max(1, Number.parseInt(limitParam, 10) || DEFAULT_LIMIT) : DEFAULT_LIMIT
  const accept = req.headers.get('accept') || ''
  const wantsSse = accept.includes('text/event-stream') || url.searchParams.get('stream') === '1'

  const events = await loadHistoryEvents(runDir, runId, limit, since)

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
