import { NextResponse } from 'next/server'
import path from 'path'
import { promises as fs } from 'fs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type FileRequest = { runId: string; relPath: string }

const MAX_CHARS = 12000

function safeRel(relPath: string): string {
  const raw = String(relPath || '').replace(/\\/g, '/').trim()
  const noDrive = raw.replace(/^[a-zA-Z]:\//, '')
  const stripped = noDrive.replace(/^\/+/, '')
  const parts = stripped
    .split('/')
    .map((p) => p.trim())
    .filter((p) => p && p !== '.' && p !== '..')
  return parts.join('/')
}

function ensureWithin(root: string, rel: string): string {
  const full = path.resolve(root, rel)
  const r = path.resolve(root)
  if (!full.startsWith(r + path.sep) && full !== r) throw new Error('path escaped root')
  return full
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as FileRequest
    if (!payload?.runId) return NextResponse.json({ error: 'Missing runId' }, { status: 400 })
    if (!payload?.relPath) return NextResponse.json({ error: 'Missing relPath' }, { status: 400 })

    const workRootDir = path.resolve(process.cwd(), '..', '..', '.uaitoolbox', 'app-factory')
    const repoRoot = ensureWithin(workRootDir, path.join('runs', payload.runId, 'repo'))
    const rel = safeRel(payload.relPath)
    const full = ensureWithin(repoRoot, rel)

    const text = await fs.readFile(full, 'utf8')
    const body = text.length <= MAX_CHARS ? text : text.slice(0, MAX_CHARS) + '\n... (truncated)\n'
    return NextResponse.json({ runId: payload.runId, relPath: rel, content: body })
  } catch (err) {
    return NextResponse.json({ error: 'Unhandled file read error', detail: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

