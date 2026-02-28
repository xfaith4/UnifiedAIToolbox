import { NextResponse } from 'next/server'
import { isValidRunId, loadRunStatus } from '@/lib/app-factory/runs/runStatus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { runId: string } }) {
  const runId = decodeURIComponent(String(params?.runId || '')).trim()
  if (!runId) {
    return NextResponse.json({ error: { code: 'MISSING_RUN_ID', message: 'Missing runId' } }, { status: 400 })
  }
  if (!isValidRunId(runId)) {
    return NextResponse.json({ error: { code: 'INVALID_RUN_ID', message: 'Invalid runId' } }, { status: 400 })
  }

  const status = await loadRunStatus(runId)
  if (!status) {
    return NextResponse.json({ error: { code: 'RUN_NOT_FOUND', message: `Run not found: ${runId}` } }, { status: 404 })
  }

  const latest = status.events.at(-1)
  const summary = {
    runId: status.runId,
    status: status.status,
    stage: status.currentStage || latest?.stage || latest?.phase || null,
    step: latest?.step || null,
    last_heartbeat_at: status.updatedAt || null,
    last_event_at: latest?.ts || null,
  }
  return NextResponse.json(summary, { status: 200 })
}
