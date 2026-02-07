import { NextResponse } from 'next/server'
import path from 'path'
import { promises as fs } from 'fs'
import { zipDirectoryToBuffer } from '@/lib/app-factory/pipeline/zipRepo'
import { getRunsRoot, isValidRunId } from '@/lib/app-factory/runs/runStatus'

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
  if (!isValidRunId(runId)) {
    return NextResponse.json({ error: { code: 'INVALID_RUN_ID', message: 'Invalid runId' } }, { status: 400 })
  }

  const runsRoot = getRunsRoot()
  const runDir = ensureWithin(runsRoot, runId)

  if (!(await dirExists(runDir))) {
    return NextResponse.json({ error: { code: 'RUN_NOT_FOUND', message: `Run not found: ${runId}` } }, { status: 404 })
  }

  const hasFiles = await dirHasFiles(runDir)
  if (!hasFiles) {
    return NextResponse.json(
      {
        error: {
          code: 'RUN_EMPTY',
          message: 'Run folder exists but contains no files.',
          details: { path: runDir, hint: 'Ensure the orchestrator wrote run_state.json or artifacts before exporting.' },
        },
      },
      { status: 409 }
    )
  }

  try {
    const zip = await zipDirectoryToBuffer(runDir)
    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="run-${runId}.zip"`,
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
