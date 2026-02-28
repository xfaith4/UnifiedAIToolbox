import { NextResponse } from 'next/server'
import path from 'path'
import { promises as fs } from 'fs'
import { zipDirectoryToBuffer } from '@/lib/app-factory/pipeline/zipRepo'
import { getRunsRoot, isValidRunId } from '@/lib/app-factory/runs/runStatus'
import { emitRunEvent } from '@/lib/app-factory/runs/runEvents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ExportRunRequest = { runId: string }

function ensureWithin(root: string, candidate: string): string {
  const full = path.resolve(root, candidate)
  const r = path.resolve(root)
  if (!full.startsWith(r + path.sep) && full !== r) throw new Error('path escaped root')
  return full
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as ExportRunRequest
    if (!payload?.runId) return NextResponse.json({ error: 'Missing runId' }, { status: 400 })
    if (!isValidRunId(payload.runId)) return NextResponse.json({ error: 'Invalid runId' }, { status: 400 })

    const runsRoot = getRunsRoot()
    const repoDir = ensureWithin(runsRoot, path.join(payload.runId, 'repo'))

    try {
      const stat = await fs.stat(repoDir)
      if (!stat.isDirectory()) throw new Error('repoDir not a directory')
    } catch {
      return NextResponse.json({ error: `Run not found: ${payload.runId}` }, { status: 404 })
    }

    await emitRunEvent({ runId: payload.runId, stage: 'export', phase: 'export', type: 'stage.start', message: 'Export stage started' })
    const zip = await zipDirectoryToBuffer(repoDir, {
      onProgress: async (event) => {
        await emitRunEvent({ runId: payload.runId, stage: 'export', phase: 'export', type: 'step.progress', message: event.type, data: event.data })
      },
    })
    await emitRunEvent({ runId: payload.runId, stage: 'export', phase: 'export', type: 'stage.complete', message: 'Export stage completed' })
    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="app-factory-repo.zip"',
      },
    })
  } catch (err) {
    return NextResponse.json({ error: 'Unhandled export-run error', detail: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
