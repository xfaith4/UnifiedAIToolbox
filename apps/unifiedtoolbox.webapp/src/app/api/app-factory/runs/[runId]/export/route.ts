import { NextResponse } from 'next/server'
import path from 'path'
import { promises as fs } from 'fs'
import { zipDirectoryToBuffer } from '@/lib/app-factory/pipeline/zipRepo'
import { getAppFactoryRoot } from '@/lib/app-factory/runs/runStatus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function ensureWithin(root: string, candidate: string): string {
  const full = path.resolve(root, candidate)
  const r = path.resolve(root)
  if (!full.startsWith(r + path.sep) && full !== r) {
    throw new Error('path escaped root')
  }
  return full
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath)
    return stat.isDirectory()
  } catch {
    return false
  }
}

async function dirHasFiles(dirPath: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    if (entries.length === 0) return false
    for (const entry of entries) {
      if (entry.isFile()) return true
      if (entry.isDirectory()) {
        if (await dirHasFiles(path.join(dirPath, entry.name))) return true
      }
    }
    return false
  } catch {
    return false
  }
}

export async function GET(req: Request, { params }: { params: { runId: string } }) {
  const runId = params?.runId
  if (!runId) {
    return NextResponse.json({ error: { code: 'MISSING_RUN_ID', message: 'Missing runId' } }, { status: 400 })
  }

  const workRootDir = getAppFactoryRoot()
  const runDir = ensureWithin(workRootDir, path.join('runs', runId))

  if (!(await dirExists(runDir))) {
    return NextResponse.json({ error: { code: 'RUN_NOT_FOUND', message: `Run not found: ${runId}` } }, { status: 404 })
  }

  const url = new URL(req.url)
  const mode = (url.searchParams.get('mode') || '').toLowerCase()
  const useFull = mode === 'full'
  const targetDir = useFull ? runDir : path.join(runDir, 'artifacts')

  if (!useFull) {
    const hasArtifacts = await dirHasFiles(targetDir)
    if (!hasArtifacts) {
      return NextResponse.json(
        { error: { code: 'NO_ARTIFACTS', message: 'No artifacts found for this run.', details: { path: targetDir } } },
        { status: 409 }
      )
    }
  }

  try {
    const zip = await zipDirectoryToBuffer(targetDir)
    const fileLabel = useFull ? 'full' : 'artifacts'
    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="run-${runId}-${fileLabel}.zip"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'EXPORT_FAILED', message: 'Failed to export run artifacts', details: err instanceof Error ? err.message : String(err) } },
      { status: 500 }
    )
  }
}
