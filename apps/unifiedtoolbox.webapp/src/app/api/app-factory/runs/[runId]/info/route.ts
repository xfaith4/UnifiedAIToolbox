import { NextResponse } from 'next/server'
import path from 'path'
import { promises as fs } from 'fs'
import { getRunsRoot, isValidRunId } from '@/lib/app-factory/runs/runStatus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

function ensureWithin(root: string, candidate: string): string {
  const full = path.resolve(root, candidate)
  const r = path.resolve(root)
  if (!full.startsWith(r + path.sep) && full !== r) {
    throw new Error('path escaped root')
  }
  return full
}

async function readTextIfExists(filePath: string, maxChars = 6000): Promise<string | null> {
  try {
    const text = await fs.readFile(filePath, 'utf8')
    return text.length <= maxChars ? text : text.slice(0, maxChars) + '\n…(truncated)'
  } catch {
    return null
  }
}

async function listFilesRelative(dir: string, baseDir: string): Promise<string[]> {
  const out: string[] = []
  const stack = [dir]
  while (stack.length) {
    const current = stack.pop()!
    try {
      const entries = await fs.readdir(current, { withFileTypes: true })
      for (const entry of entries) {
        const full = path.join(current, entry.name)
        if (entry.isDirectory()) {
          stack.push(full)
        } else if (entry.isFile()) {
          out.push(path.relative(baseDir, full).replace(/\\/g, '/'))
        }
      }
    } catch {
      // skip unreadable dirs
    }
  }
  return out.sort()
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

  const runsRoot = getRunsRoot()
  let runDir: string
  try {
    runDir = ensureWithin(runsRoot, runId)
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_RUN_ID', message: 'Invalid runId' } }, { status: 400 })
  }

  try {
    await fs.stat(runDir)
  } catch {
    return NextResponse.json({ error: { code: 'RUN_NOT_FOUND', message: `Run not found: ${runId}` } }, { status: 404 })
  }

  const artifactsDir = path.join(runDir, 'artifacts')
  let artifactsDirExists = false
  try {
    const stat = await fs.stat(artifactsDir)
    artifactsDirExists = stat.isDirectory()
  } catch {
    // no artifacts dir yet
  }

  // Prefer README.md from artifacts dir; fall back to run dir
  const readme =
    (await readTextIfExists(path.join(artifactsDir, 'README.md'))) ??
    (await readTextIfExists(path.join(runDir, 'README.md')))

  const files = artifactsDirExists ? await listFilesRelative(artifactsDir, artifactsDir) : []

  return NextResponse.json({
    runId,
    runDir,
    artifactsDir,
    artifactsDirExists,
    readme,
    fileCount: files.length,
    files,
  })
}
