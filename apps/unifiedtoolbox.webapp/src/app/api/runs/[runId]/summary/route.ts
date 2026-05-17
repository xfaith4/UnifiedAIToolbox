import { NextResponse } from 'next/server'
import { isValidRunId, loadRunStatus } from '@/lib/app-factory/runs/runStatus'
import { fetchOrchestratorRunStatus } from '@/lib/app-factory/runs/orchestratorFallback'
import { buildRunManifest } from '@/lib/app-factory/runs/manifest'
import { readFinalSummary } from '@/lib/app-factory/runs/finalSummary'
import { runLogger } from '@/lib/app-factory/runs/runLogger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/runs/[runId]/summary
 *
 * Returns the legacy summary shape (runId/status/stage/step/last_heartbeat_at/
 * last_event_at/currentAttemptId/attemptNumber/attempts) plus, when available,
 * three additive fields populated from the canonical run files:
 *
 *  - `manifest`: full {@link RunManifest} derived from `events.jsonl`,
 *    `artifacts.index.jsonl`, and `final_summary.json`.
 *  - `final_summary`: durable terminal record written at run completion.
 *  - `canonical_status`: the canonical run status enum value (queued |
 *    running | waiting_on_input | recovering | blocked | validating |
 *    completed | failed).
 *
 * Existing fields are never renamed or removed.
 */
export async function GET(_req: Request, { params: _params }: { params: Promise<{ runId: string }> }) {
  const params = await _params
  const runId = decodeURIComponent(String(params?.runId || '')).trim()
  if (!runId) {
    return NextResponse.json({ error: { code: 'MISSING_RUN_ID', message: 'Missing runId' } }, { status: 400 })
  }
  if (!isValidRunId(runId)) {
    return NextResponse.json({ error: { code: 'INVALID_RUN_ID', message: 'Invalid runId' } }, { status: 400 })
  }

  // Primary: filesystem (App Factory runs)
  let status = await loadRunStatus(runId)
  let source = 'app-factory'

  // Fallback: orchestrator API (Concierge runs) — fixes M-7
  if (!status) {
    status = await fetchOrchestratorRunStatus(runId)
    source = 'orchestrator'
  }

  if (!status) {
    return NextResponse.json({ error: { code: 'RUN_NOT_FOUND', message: `Run not found: ${runId}` } }, { status: 404 })
  }

  const latest = status.events.at(-1)
  const baseSummary = {
    runId: status.runId,
    status: status.status,
    stage: status.currentStage || latest?.stage || latest?.phase || null,
    step: latest?.step || null,
    last_heartbeat_at: status.updatedAt || null,
    last_event_at: latest?.ts || null,
    currentAttemptId: status.currentAttemptId ?? null,
    attemptNumber: status.attemptNumber ?? null,
    attempts: status.attempts ?? [],
  }

  // Best-effort canonical enrichment. Failures must NOT break the legacy shape.
  let manifest: Awaited<ReturnType<typeof buildRunManifest>> = null
  let final_summary: Awaited<ReturnType<typeof readFinalSummary>> = null
  try {
    manifest = await buildRunManifest(runId)
  } catch (error) {
    runLogger.warn('summaryRoute.manifestFailed', {
      run_id: runId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
  try {
    final_summary = await readFinalSummary(runId)
  } catch (error) {
    runLogger.warn('summaryRoute.finalSummaryFailed', {
      run_id: runId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return NextResponse.json(
    {
      ...baseSummary,
      // Additive — Agent 2 may rely on these once Agent 1's contract lands.
      canonical_status: manifest?.status ?? null,
      manifest,
      final_summary,
    },
    {
      status: 200,
      headers: { 'X-Run-Source': source },
    }
  )
}
