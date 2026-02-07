import { NextResponse } from 'next/server'
import path from 'path'
import { promises as fs } from 'fs'
import { getRunsRoot, isValidRunId } from '@/lib/app-factory/runs/runStatus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_EVENT_BYTES = 512 * 1024
const DEFAULT_LIMIT = 200

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

function parseEvent(line: string) {
  try {
    return JSON.parse(line)
  } catch {
    return { ts: new Date().toISOString(), type: 'info', message: line }
  }
}

export async function GET(req: Request, { params }: { params: { runId: string } }) {
  const runId = params?.runId
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

  const eventsPath = (await fileExists(path.join(runDir, 'events.ndjson')))
    ? path.join(runDir, 'events.ndjson')
    : (await fileExists(path.join(runDir, 'events.jsonl')))
      ? path.join(runDir, 'events.jsonl')
      : (await fileExists(path.join(runDir, 'events.log')))
        ? path.join(runDir, 'events.log')
        : null

  if (!eventsPath) {
    return NextResponse.json({ runId, events: [], cursor: null }, { status: 200 })
  }

  const lines = await readTailLines(eventsPath, limit)
  let events = lines.map(parseEvent)

  if (since) {
    const sinceTime = new Date(since).getTime()
    if (!Number.isNaN(sinceTime)) {
      events = events.filter((event) => {
        const ts = new Date(event.ts || event.timestamp || event.time || '').getTime()
        return !Number.isNaN(ts) && ts > sinceTime
      })
    }
  }

  const cursor = events.length ? events[events.length - 1].ts || null : null
  return NextResponse.json({ runId, events, cursor }, { status: 200 })
}
