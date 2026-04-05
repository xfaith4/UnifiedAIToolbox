import { NextResponse } from 'next/server'
import { isValidRunId } from '@/lib/app-factory/runs/runStatus'

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

export async function POST(req: Request, { params: _params }: { params: Promise<{ runId: string }> }) {
  const params = await _params
  const runId = decodeURIComponent(String(params?.runId || '')).trim()
  if (!runId) {
    return NextResponse.json({ error: { code: 'MISSING_RUN_ID', message: 'Missing runId' } }, { status: 400 })
  }
  if (!isValidRunId(runId)) {
    return NextResponse.json({ error: { code: 'INVALID_RUN_ID', message: 'Invalid runId' } }, { status: 400 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_BODY', message: 'Expected JSON body' } }, { status: 400 })
  }

  const base = resolveOrchestratorBase()
  const orchUrl = `${base}/orchestrate/run/${encodeURIComponent(runId)}/checkpoint`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(orchUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const payload = await res.json().catch(() => ({}))
    return NextResponse.json(payload, { status: res.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Checkpoint request failed'
    return NextResponse.json(
      { error: { code: 'CHECKPOINT_PROXY_FAILED', message } },
      { status: 502 }
    )
  } finally {
    clearTimeout(timer)
  }
}
