import { NextResponse } from 'next/server'
import { isValidRunId, loadRunStatus } from '@/lib/app-factory/runs/runStatus'
import { fetchOrchestratorRunStatus } from '@/lib/app-factory/runs/orchestratorFallback'

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

export async function GET(
  req: Request,
  { params }: { params: { runId: string } }
) {
  const runId = resolveRunId(params?.runId, req)
  if (!runId) {
    return NextResponse.json({ error: { code: 'MISSING_RUN_ID', message: 'Missing runId' } }, { status: 400 })
  }
  if (!isValidRunId(runId)) {
    return NextResponse.json({ error: { code: 'INVALID_RUN_ID', message: 'Invalid runId' } }, { status: 400 })
  }

  try {
    // Primary lookup: filesystem (App Factory runs)
    const status = await loadRunStatus(runId)
    if (status) {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`[status] resolved ${runId} from filesystem`)
      }
      return NextResponse.json(status, {
        status: 200,
        headers: { 'X-Run-Source': 'app-factory' },
      })
    }

    // Fallback: orchestrator API (Concierge runs)
    const orchStatus = await fetchOrchestratorRunStatus(runId)
    if (orchStatus) {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`[status] resolved ${runId} from orchestrator fallback`)
      }
      return NextResponse.json(orchStatus, {
        status: 200,
        headers: { 'X-Run-Source': 'orchestrator' },
      })
    }

    return NextResponse.json(
      { error: { code: 'RUN_NOT_FOUND', message: `Run not found: ${runId}` } },
      { status: 404 }
    )
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'STATUS_READ_FAILED', message: 'Failed to read run status', details: err instanceof Error ? err.message : String(err) } },
      { status: 500 }
    )
  }
}
