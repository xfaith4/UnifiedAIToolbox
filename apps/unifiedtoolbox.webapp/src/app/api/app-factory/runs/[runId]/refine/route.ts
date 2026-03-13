import { NextResponse } from 'next/server'
import path from 'path'
import { promises as fsp } from 'fs'
import { isValidRunId, getRunsRoot } from '@/lib/app-factory/runs/runStatus'
import { runRefinementLoop } from '@/lib/app-factory/sandbox/refinementLoop'
import { MAX_LOOP_ITERATIONS } from '@/lib/app-factory/sandbox/sandboxEngine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function resolveRunId(paramRunId: unknown, req: Request): string {
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

function ensureWithin(root: string, candidate: string): string {
  const full = path.resolve(root, candidate)
  const r = path.resolve(root)
  if (!full.startsWith(r + path.sep) && full !== r) {
    throw new Error('path escaped root')
  }
  return full
}

type RefineBody = {
  acceptanceChecks?: string[]
  maxIterations?: number
  startIteration?: number
  cwd?: string
}

/**
 * POST /api/app-factory/runs/[runId]/refine
 *
 * Runs the closed refinement loop for a completed run:
 *   1. Evaluates acceptance checks via the sandbox engine
 *   2. If checks fail, repeats (up to maxIterations)
 *   3. Writes sandbox_report.json and emits loop:* events after each iteration
 *
 * Body:
 *   acceptanceChecks?: string[]  — checks to evaluate; falls back to request.json
 *   maxIterations?: number       — max refinement iterations (default: MAX_LOOP_ITERATIONS)
 *   startIteration?: number      — first iteration number (default: 1)
 *   cwd?: string                 — working dir for shell commands
 */
export async function POST(
  req: Request,
  { params: _params }: { params: Promise<{ runId: string }> },
) {
  const params = await _params
  const runId = resolveRunId(params?.runId, req)
  if (!runId) {
    return NextResponse.json({ error: { code: 'MISSING_RUN_ID', message: 'Missing runId' } }, { status: 400 })
  }
  if (!isValidRunId(runId)) {
    return NextResponse.json({ error: { code: 'INVALID_RUN_ID', message: 'Invalid runId' } }, { status: 400 })
  }

  const runsRoot = getRunsRoot()
  let runDir: string
  try {
    runDir = ensureWithin(runsRoot, runId)
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_RUN_ID', message: 'Invalid runId' } }, { status: 400 })
  }

  try {
    const stat = await fsp.stat(runDir)
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: { code: 'RUN_NOT_FOUND', message: `Run not found: ${runId}` } }, { status: 404 })
    }
  } catch {
    return NextResponse.json({ error: { code: 'RUN_NOT_FOUND', message: `Run not found: ${runId}` } }, { status: 404 })
  }

  let body: RefineBody = {}
  try {
    body = (await req.json()) as RefineBody
  } catch {
    // empty body is fine
  }

  // Resolve acceptance checks
  let acceptanceChecks: string[] = []
  if (Array.isArray(body.acceptanceChecks) && body.acceptanceChecks.length > 0) {
    acceptanceChecks = body.acceptanceChecks.map(String)
  } else {
    try {
      const requestPath = path.join(runDir, 'request.json')
      const raw = await fsp.readFile(requestPath, 'utf8')
      const requestData = JSON.parse(raw) as Record<string, unknown>
      if (Array.isArray(requestData.acceptance_checks)) {
        acceptanceChecks = requestData.acceptance_checks.map(String)
      }
    } catch {
      // proceed with empty checks
    }
  }

  const maxIterations =
    typeof body.maxIterations === 'number' && body.maxIterations >= 1 && body.maxIterations <= MAX_LOOP_ITERATIONS * 2
      ? body.maxIterations
      : MAX_LOOP_ITERATIONS

  const startIteration =
    typeof body.startIteration === 'number' && body.startIteration >= 1 ? body.startIteration : 1

  let sandboxCwd: string | undefined
  if (typeof body.cwd === 'string' && body.cwd.trim()) {
    const repoRoot = path.resolve(process.cwd(), '..', '..')
    const candidate = path.resolve(body.cwd.trim())
    if (candidate.startsWith(repoRoot + path.sep) || candidate === repoRoot) {
      sandboxCwd = candidate
    }
  }

  try {
    const result = await runRefinementLoop({
      runDir,
      acceptanceChecks,
      startIteration,
      maxIterations,
      cwd: sandboxCwd,
    })

    return NextResponse.json(
      {
        runId,
        exitReason: result.exitReason,
        iterations: result.iterations,
        report: result.finalReport,
      },
      { status: 200 },
    )
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: 'REFINEMENT_FAILED',
          message: 'Refinement loop failed',
          details: err instanceof Error ? err.message : String(err),
        },
      },
      { status: 500 },
    )
  }
}
