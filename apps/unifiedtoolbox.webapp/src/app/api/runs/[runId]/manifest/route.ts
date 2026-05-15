import { NextResponse } from 'next/server'
import { isValidRunId } from '@/lib/app-factory/runs/runStatus'
import { buildRunManifest } from '@/lib/app-factory/runs/manifest'
import { runLogger } from '@/lib/app-factory/runs/runLogger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/runs/[runId]/manifest
 *
 * Returns the canonical {@link RunManifest} derived from `events.jsonl`,
 * `artifacts.index.jsonl`, and `final_summary.json`. Agent 2 (UI) consumes
 * this as the single source of truth for the run-view header.
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

  try {
    const manifest = await buildRunManifest(runId)
    if (!manifest) {
      return NextResponse.json(
        { error: { code: 'RUN_NOT_FOUND', message: `Run not found: ${runId}` } },
        { status: 404 }
      )
    }
    return NextResponse.json(manifest, { status: 200 })
  } catch (error) {
    runLogger.error('manifestRoute.failed', {
      run_id: runId,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: { code: 'MANIFEST_FAILED', message: 'Failed to build manifest' } },
      { status: 500 }
    )
  }
}
