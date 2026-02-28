import { NextResponse } from 'next/server'
import { isValidRunId } from '@/lib/app-factory/runs/runStatus'
import { loadAttempts, saveAttempts } from '@/lib/app-factory/runs/attemptStore'
import type { AttemptSummary } from '@/lib/app-factory/runs/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FETCH_TIMEOUT_MS = 8000

function resolveOrchestratorBase(): string {
  const raw = (
    process.env.NEXT_PUBLIC_API_BASE ??
    process.env.NEXT_PUBLIC_PROMPT_API_BASE ??
    ''
  ).trim()
  return (raw || 'http://localhost:8000').replace(/\/$/, '')
}

export async function POST(req: Request, { params }: { params: { runId: string } }) {
  const runId = decodeURIComponent(String(params?.runId || '')).trim()
  if (!runId) {
    return NextResponse.json({ error: { code: 'MISSING_RUN_ID', message: 'Missing runId' } }, { status: 400 })
  }
  if (!isValidRunId(runId)) {
    return NextResponse.json({ error: { code: 'INVALID_RUN_ID', message: 'Invalid runId' } }, { status: 400 })
  }

  let body: { triggerReason?: string } = {}
  try {
    body = (await req.json()) as { triggerReason?: string }
  } catch {
    // no body — use defaults
  }
  const triggerReason: AttemptSummary['triggerReason'] =
    body.triggerReason === 'repair' ? 'repair' : 'requeue'

  // Proxy the requeue to the orchestrator
  const base = resolveOrchestratorBase()
  const orchUrl = `${base}/api/runs/${encodeURIComponent(runId)}/requeue`
  let orchResult: Record<string, unknown> = {}
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(orchUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger_reason: triggerReason }),
      })
    } finally {
      clearTimeout(timer)
    }
    if (res.ok) {
      orchResult = (await res.json()) as Record<string, unknown>
    }
  } catch {
    // orchestrator unreachable — continue with attempt book-keeping only
  }

  // Load existing attempts, close the last one, append a new attempt
  const now = new Date().toISOString()
  let attempts = await loadAttempts(runId)

  if (attempts.length === 0) {
    // Seed with a synthetic completed first attempt
    attempts = [
      {
        attemptId: 'a1',
        attemptNumber: 1,
        endedAt: now,
        status: 'failed',
        triggerReason: 'initial',
      },
    ]
  } else {
    // Close the last attempt if still open
    const last = attempts.at(-1)!
    if (last.status === 'running' || last.status === 'queued') {
      attempts = [
        ...attempts.slice(0, -1),
        { ...last, endedAt: now, status: 'failed' as AttemptSummary['status'] },
      ]
    }
  }

  const nextNumber = attempts.length + 1
  const nextAttemptId = `a${nextNumber}`
  attempts = [
    ...attempts,
    {
      attemptId: nextAttemptId,
      attemptNumber: nextNumber,
      startedAt: now,
      status: 'queued',
      triggerReason,
    },
  ]

  await saveAttempts(runId, attempts)

  return NextResponse.json(
    {
      ...orchResult,
      runId,
      attempt_id: nextAttemptId,
      attempt_number: nextNumber,
    },
    { status: 200 }
  )
}
