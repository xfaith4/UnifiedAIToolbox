import { NextResponse } from 'next/server'
import path from 'path'
import { promises as fsp } from 'fs'
import { isValidRunId, getRunsRoot } from '@/lib/app-factory/runs/runStatus'
import { runSandbox } from '@/lib/app-factory/sandbox/sandboxEngine'

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

type VerifyBody = {
  acceptanceChecks?: string[]
  loopIteration?: number
  cwd?: string
}

/**
 * POST /api/app-factory/runs/[runId]/verify
 *
 * Triggers acceptance-check evaluation for a run.
 * Writes sandbox_report.json to the run directory and emits sandbox:* events.
 *
 * Body:
 *   acceptanceChecks?: string[]  — checks to evaluate; falls back to those
 *                                  stored in request.json when omitted
 *   loopIteration?: number       — loop iteration number (defaults to 1)
 *   cwd?: string                 — working dir for shell commands (defaults to runDir)
 */
export async function POST(
  req: Request,
  { params }: { params: { runId: string } },
) {
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

  let body: VerifyBody = {}
  try {
    body = (await req.json()) as VerifyBody
  } catch {
    // empty body is fine
  }

  // Resolve acceptance checks: prefer explicit body, fall back to request.json
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
      // request.json absent or malformed — proceed with empty checks
    }
  }

  const loopIteration = typeof body.loopIteration === 'number' && body.loopIteration >= 1
    ? body.loopIteration
    : 1

  // cwd is caller-supplied; validate it stays within the repo root (two levels up from cwd)
  let sandboxCwd: string | undefined
  if (typeof body.cwd === 'string' && body.cwd.trim()) {
    const repoRoot = path.resolve(process.cwd(), '..', '..')
    const candidate = path.resolve(body.cwd.trim())
    if (candidate.startsWith(repoRoot + path.sep) || candidate === repoRoot) {
      sandboxCwd = candidate
    }
    // if it doesn't pass the safety check, we silently ignore it and use the default
  }

  try {
    const { report } = await runSandbox({
      runDir,
      acceptanceChecks,
      loopIteration,
      cwd: sandboxCwd,
    })

    return NextResponse.json({ runId, report }, { status: 200 })
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: 'VERIFICATION_FAILED',
          message: 'Sandbox execution failed',
          details: err instanceof Error ? err.message : String(err),
        },
      },
      { status: 500 },
    )
  }
}

/**
 * GET /api/app-factory/runs/[runId]/verify
 *
 * Returns the current sandbox_report.json for a run, or 404 if none exists yet.
 */
export async function GET(
  req: Request,
  { params }: { params: { runId: string } },
) {
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

  const reportPath = path.join(runDir, 'sandbox_report.json')
  try {
    const raw = await fsp.readFile(reportPath, 'utf8')
    const report = JSON.parse(raw) as unknown
    return NextResponse.json({ runId, report }, { status: 200 })
  } catch {
    return NextResponse.json(
      { error: { code: 'REPORT_NOT_FOUND', message: 'No sandbox report found for this run' } },
      { status: 404 },
    )
  }
}
