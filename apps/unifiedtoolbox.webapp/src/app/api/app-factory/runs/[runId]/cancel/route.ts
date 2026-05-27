import { NextResponse } from 'next/server'
import path from 'path'
import { promises as fs } from 'fs'
import { getRunsRoot, isValidRunId } from '@/lib/app-factory/runs/runStatus'
import { appendEvent } from '@/lib/app-factory/runs/canonicalEvents'
import { writeFinalSummary } from '@/lib/app-factory/runs/finalSummary'

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

function ensureWithin(root: string, candidate: string): string {
  const full = path.resolve(root, candidate)
  const r = path.resolve(root)
  if (!full.startsWith(r + path.sep) && full !== r) {
    throw new Error('path escaped root')
  }
  return full
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath)
    return stat.isFile() || stat.isDirectory()
  } catch {
    return false
  }
}

async function readJsonIfExists(filePath: string): Promise<Record<string, unknown> | null> {
  if (!(await fileExists(filePath))) return null
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function POST(req: Request, { params: _params }: { params: Promise<{ runId: string }> }) {
  const params = await _params
  const runId = resolveRunId(params?.runId, req)
  if (!runId) {
    return NextResponse.json({ error: { code: 'MISSING_RUN_ID', message: 'Missing runId' } }, { status: 400 })
  }
  if (!isValidRunId(runId)) {
    return NextResponse.json({ error: { code: 'INVALID_RUN_ID', message: 'Invalid runId' } }, { status: 400 })
  }

  const runsRoot = getRunsRoot()
  const runDir = ensureWithin(runsRoot, runId)
  if (!(await fileExists(runDir))) {
    return NextResponse.json({ error: { code: 'RUN_NOT_FOUND', message: `Run not found: ${runId}` } }, { status: 404 })
  }

  const runStatePath = path.join(runDir, 'run_state.json')
  const runState = (await readJsonIfExists(runStatePath)) || {}
  const processInfo = (await readJsonIfExists(path.join(runDir, 'run_process.json'))) || {}
  const requestInfo = (await readJsonIfExists(path.join(runDir, 'request.json'))) || {}

  const pid =
    typeof processInfo.pid === 'number'
      ? processInfo.pid
      : typeof runState.pid === 'number'
        ? (runState.pid as number)
        : null

  let killed = false
  let killError: string | null = null
  if (pid && pid > 0) {
    try {
      process.kill(pid)
      killed = true
    } catch (err) {
      killError = err instanceof Error ? err.message : String(err)
    }
  }

  const now = new Date().toISOString()
  const errors = Array.isArray(runState.errors) ? [...(runState.errors as string[])] : []
  errors.push('Cancelled by user.')
  const warnings = Array.isArray(runState.warnings) ? [...(runState.warnings as string[])] : []
  if (killError) warnings.push(`Cancel requested; process kill failed: ${killError}`)

  const nextState = {
    ...runState,
    run_id: runState.run_id || runId,
    status: 'failed',
    updated_at: now,
    ended_at: now,
    errors,
    warnings,
  }

  await fs.writeFile(runStatePath, JSON.stringify(nextState, null, 2) + '\n', 'utf8')
  await appendEvent({
    run_id: runId,
    timestamp: now,
    event_type: 'run_failed',
    severity: 'warn',
    message: 'Cancelled by user.',
    data: { pid, killed, killError, reason: 'user_cancel' },
  })

  await writeFinalSummary({
    run_id: runId,
    objective: String((requestInfo as Record<string, unknown>).goal || (requestInfo as Record<string, unknown>).objective || ''),
    outcome: 'failed',
    completed_work: [],
    changed_files: [],
    created_artifacts: [],
    validation_results: [],
    blockers: [
      {
        severity: 'hard_blocker',
        summary: 'Run was cancelled by user.',
        agent: 'run_control',
        details: { pid, killed, killError },
      },
    ],
    warnings: killError ? [`Cancel requested but process kill failed: ${killError}`] : [],
    next_steps: ['Rerun the orchestration after resolving the cancellation cause.'],
  })

  return NextResponse.json({ runId, status: nextState.status, pid, killed, killError }, { status: 200 })
}
