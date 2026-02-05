import { NextResponse } from 'next/server'
import path from 'path'
import { promises as fs } from 'fs'
import { zipDirectoryToBuffer } from '@/lib/app-factory/pipeline/zipRepo'

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

    const workRootDir = path.resolve(process.cwd(), '..', '..', '.uaitoolbox', 'app-factory')
    const repoDir = ensureWithin(workRootDir, path.join('runs', payload.runId, 'repo'))

    try {
      const stat = await fs.stat(repoDir)
      if (!stat.isDirectory()) throw new Error('repoDir not a directory')
    } catch {
      return NextResponse.json({ error: `Run not found: ${payload.runId}` }, { status: 404 })
    }

    const zip = await zipDirectoryToBuffer(repoDir)
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

