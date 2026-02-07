import { NextResponse } from 'next/server'
import path from 'path'
import { randomUUID } from 'crypto'
import { spawn } from 'child_process'
import fs from 'fs'
import { promises as fsp } from 'fs'
import { getRunsRoot } from '@/lib/app-factory/runs/runStatus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type StartRunRequest = {
  request?: Record<string, unknown>
  jobType?: string
}

function ensureWithin(root: string, candidate: string): string {
  const full = path.resolve(root, candidate)
  const r = path.resolve(root)
  if (!full.startsWith(r + path.sep) && full !== r) {
    throw new Error('path escaped root')
  }
  return full
}

function buildRunId(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `maint-${stamp}-${randomUUID().slice(0, 8)}`
}

function resolvePowerShell(): string {
  return (
    process.env.PWSH_BIN ||
    process.env.POWERSHELL_BIN ||
    (process.platform === 'win32' ? 'pwsh' : 'pwsh')
  )
}

export async function POST(req: Request) {
  let payload: StartRunRequest = {}
  try {
    payload = (await req.json()) as StartRunRequest
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON payload' } }, { status: 400 })
  }

  const request = (payload.request || {}) as Record<string, unknown>
  const jobType = String(request.job_type || payload.jobType || '').trim()
  if (!jobType) {
    return NextResponse.json({ error: { code: 'MISSING_JOB_TYPE', message: 'job_type is required' } }, { status: 400 })
  }
  if (jobType !== 'maintain_existing_app') {
    return NextResponse.json({ error: { code: 'UNSUPPORTED_JOB_TYPE', message: `Unsupported job_type: ${jobType}` } }, { status: 400 })
  }

  if (typeof request.goal !== 'string' || !request.goal.trim()) {
    return NextResponse.json({ error: { code: 'MISSING_GOAL', message: 'goal is required' } }, { status: 400 })
  }

  const runId = buildRunId()
  request.run_id = runId
  request.job_type = jobType

  const runsRoot = getRunsRoot()
  const runDir = ensureWithin(runsRoot, runId)
  await fsp.mkdir(runDir, { recursive: true })

  const requestPath = path.join(runDir, 'request.json')
  await fsp.writeFile(requestPath, JSON.stringify(request, null, 2) + '\n', 'utf8')

  const statePath = path.join(runDir, 'run_state.json')
  const now = new Date().toISOString()
  const runState = {
    run_id: runId,
    job_type: jobType,
    status: 'queued',
    current_stage: null,
    stage_index: 0,
    stage_count: 0,
    progress: 0,
    started_at: now,
    updated_at: now,
    ended_at: null,
    risk: { level: 'low', reasons: [] },
    artifacts: [],
    links: {},
    errors: [],
    warnings: [],
  }
  await fsp.writeFile(statePath, JSON.stringify(runState, null, 2) + '\n', 'utf8')

  const eventsPath = path.join(runDir, 'events.ndjson')
  await fsp.appendFile(eventsPath, JSON.stringify({ ts: now, type: 'info', message: 'queued' }) + '\n', 'utf8')

  const repoRoot = path.resolve(process.cwd(), '..', '..')
  const scriptPath = path.join(repoRoot, 'Orchestration', 'scripts', 'MilestoneController.ps1')
  if (!fs.existsSync(scriptPath)) {
    const errorPath = path.join(runDir, 'run_error.md')
    await fsp.writeFile(errorPath, '# Run Error\n\nMilestoneController.ps1 not found.\n', 'utf8')
    return NextResponse.json(
      { error: { code: 'SCRIPT_MISSING', message: 'MilestoneController.ps1 not found', details: { path: scriptPath } } },
      { status: 500 }
    )
  }

  const psExe = resolvePowerShell()
  const logPath = path.join(runDir, 'run.log')
  const logStream = fs.createWriteStream(logPath, { flags: 'a' })

  try {
    const child = spawn(psExe, ['-NoLogo', '-File', scriptPath, '-RequestPath', requestPath, '-JobType', jobType, '-OutputDir', runDir], {
      cwd: repoRoot,
      env: { ...process.env, UAIT_JOB_TYPE: jobType },
      detached: true,
      stdio: ['ignore', logStream, logStream],
    })
    child.unref()
  } catch (err) {
    const errorPath = path.join(runDir, 'run_error.md')
    await fsp.writeFile(
      errorPath,
      `# Run Error\n\nFailed to launch PowerShell process.\n\n${err instanceof Error ? err.message : String(err)}\n`,
      'utf8'
    )
    return NextResponse.json(
      { error: { code: 'LAUNCH_FAILED', message: 'Failed to launch maintenance run', details: err instanceof Error ? err.message : String(err) } },
      { status: 500 }
    )
  }

  return NextResponse.json({ runId, status: 'queued' }, { status: 202 })
}
