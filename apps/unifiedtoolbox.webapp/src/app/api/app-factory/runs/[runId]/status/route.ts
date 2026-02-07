import { NextResponse } from 'next/server'
import { loadRunStatus } from '@/lib/app-factory/runs/runStatus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: { runId: string } }
) {
  const runId = params?.runId
  if (!runId) {
    return NextResponse.json({ error: { code: 'MISSING_RUN_ID', message: 'Missing runId' } }, { status: 400 })
  }

  try {
    const status = await loadRunStatus(runId)
    if (!status) {
      return NextResponse.json({ error: { code: 'RUN_NOT_FOUND', message: `Run not found: ${runId}` } }, { status: 404 })
    }
    return NextResponse.json(status, { status: 200 })
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'STATUS_READ_FAILED', message: 'Failed to read run status', details: err instanceof Error ? err.message : String(err) } },
      { status: 500 }
    )
  }
}
