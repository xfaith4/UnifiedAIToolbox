import { NextResponse } from 'next/server'
import path from 'path'
import { randomUUID, timingSafeEqual } from 'crypto'
import { spawn, type ChildProcess, type StdioOptions } from 'child_process'
import fs from 'fs'
import { promises as fsp } from 'fs'
import { getRunsRoot } from '@/lib/app-factory/runs/runStatus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type StartRunRequest = {
  request?: Record<string, unknown>
  jobType?: string
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false
  return ['1', 'true', 'yes', 'y', 'on'].includes(value.trim().toLowerCase())
}

function allowInsecureLocal(): boolean {
  const raw = process.env.ALLOW_INSECURE_LOCAL
  if (raw == null) {
    return process.env.NODE_ENV !== 'production'
  }
  return isTruthy(raw)
}

function resolveExecutionToken(): string {
  return (
    process.env.UAIT_EXECUTION_TOKEN ||
    process.env.PROMPT_API_EXECUTION_TOKEN ||
    process.env.PROMPT_API_ADMIN_TOKEN ||
    ''
  ).trim()
}

function tokenMatches(provided: string, expected: string): boolean {
  const left = Buffer.from(provided)
  const right = Buffer.from(expected)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function requireExecutionAccess(req: Request): NextResponse | null {
  const expectedToken = resolveExecutionToken()
  if (!expectedToken) {
    if (allowInsecureLocal()) return null
    return NextResponse.json(
      {
        error: {
          code: 'EXECUTION_TOKEN_UNCONFIGURED',
          message:
            'Execution token is not configured. Set UAIT_EXECUTION_TOKEN (or PROMPT_API_EXECUTION_TOKEN / PROMPT_API_ADMIN_TOKEN).',
        },
      },
      { status: 401 }
    )
  }

  const providedToken = (req.headers.get('x-execution-token') || req.headers.get('x-admin-token') || '').trim()
  if (!tokenMatches(providedToken, expectedToken)) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Execution token missing or invalid.' } },
      { status: 401 }
    )
  }
  return null
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

async function validateLocalRepoPath(localPath: string): Promise<string> {
  const resolvedPath = path.resolve(localPath)
  let stat: fs.Stats
  try {
    stat = await fsp.stat(resolvedPath)
  } catch {
    throw new Error(`Local repo path does not exist: ${resolvedPath}`)
  }
  if (!stat.isDirectory()) {
    throw new Error(`Local repo path must be a directory: ${resolvedPath}`)
  }
  return resolvedPath
}

async function markRunLaunchFailure(
  runDir: string,
  runId: string,
  message: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  const statePath = path.join(runDir, 'run_state.json')
  const eventsPath = path.join(runDir, 'events.ndjson')
  const now = new Date().toISOString()

  try {
    const raw = await fsp.readFile(statePath, 'utf8')
    const state = JSON.parse(raw) as Record<string, unknown>
    const existingErrors = Array.isArray(state.errors) ? state.errors.map(String) : []
    const existingWarnings = Array.isArray(state.warnings) ? state.warnings.map(String) : []
    const next = {
      ...state,
      run_id: runId,
      status: 'failed',
      ended_at: now,
      updated_at: now,
      errors: Array.from(new Set([...existingErrors, message])),
      warnings: existingWarnings,
    }
    await fsp.writeFile(statePath, JSON.stringify(next, null, 2) + '\n', 'utf8')
  } catch {
    // If state writing fails, still attempt to append an event for diagnostics.
  }

  const eventRecord = {
    ts: now,
    type: 'error',
    stage: 'run',
    message,
    data: details,
  }
  try {
    await fsp.appendFile(eventsPath, JSON.stringify(eventRecord) + '\n', 'utf8')
  } catch {
    // no-op
  }
}

async function readRunStateStatus(runDir: string): Promise<string | null> {
  const statePath = path.join(runDir, 'run_state.json')
  try {
    const raw = await fsp.readFile(statePath, 'utf8')
    const state = JSON.parse(raw) as Record<string, unknown>
    const status = typeof state.status === 'string' ? state.status.trim().toLowerCase() : ''
    return status || null
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  const authError = requireExecutionAccess(req)
  if (authError) return authError

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
  const SUPPORTED_JOB_TYPES = ['maintain_existing_app', 'build_new_app', 'create_new_app', 'new_app']
  if (!SUPPORTED_JOB_TYPES.includes(jobType)) {
    return NextResponse.json(
      { error: { code: 'UNSUPPORTED_JOB_TYPE', message: `Unsupported job_type: ${jobType}. Supported: ${SUPPORTED_JOB_TYPES.join(', ')}` } },
      { status: 400 }
    )
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
  const scriptPath = path.join(repoRoot, 'Orchestration', 'scripts', 'Unified-Orchestration.ps1')
  if (!fs.existsSync(scriptPath)) {
    const errorPath = path.join(runDir, 'run_error.md')
    await fsp.writeFile(errorPath, '# Run Error\n\nUnified-Orchestration.ps1 not found.\n', 'utf8')
    return NextResponse.json(
      { error: { code: 'SCRIPT_MISSING', message: 'Unified-Orchestration.ps1 not found', details: { path: scriptPath } } },
      { status: 500 }
    )
  }

  const psExe = resolvePowerShell()
  const logPath = path.join(runDir, 'run.log')
  const logFd = fs.openSync(logPath, 'a')

  try {
    const goal = String(request.goal || '').trim()
    const model = typeof request.model === 'string' && request.model.trim()
      ? request.model.trim()
      : null
    const localPathInput = typeof request.local_path === 'string' ? request.local_path.trim() : ''
    const localPath = localPathInput ? await validateLocalRepoPath(localPathInput) : ''
    const instruction = `Job type: ${jobType}\nRun ID: ${runId}`

    const psArgs = [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-JobType',
      jobType,
      '-RequestPath',
      requestPath,
      '-Goal',
      goal,
      '-Instruction',
      instruction,
      '-OutputDir',
      runDir,
      '-RunCodex',
    ]
    if (model) {
      psArgs.push('-Model', model)
    }
    // When the user selects a local repo path, pass it as -RepoRoot so
    // Unified-Orchestration.ps1 uses it as the working directory, and expose
    // it via UAIT_LOCAL_REPO_PATH so MilestoneController can route it to
    // the RepoContextBuilder stage.
    if (localPath) {
      psArgs.push('-RepoRoot', localPath)
    }
    const spawnEnv: NodeJS.ProcessEnv = {
      ...process.env,
      UAIT_JOB_TYPE: jobType,
      UAIT_REQUEST_PATH: requestPath,
    }
    if (localPath) {
      spawnEnv['UAIT_LOCAL_REPO_PATH'] = localPath
    }
    const child: ChildProcess = spawn(psExe, psArgs, {
      cwd: repoRoot,
      env: spawnEnv,
      // Detached pwsh launches on Windows can exit 0 immediately without running the script.
      detached: false,
      // File descriptors (numbers) in the stdio array cause TypeScript overload intersection issues.
      // Casting to StdioOptions selects the intended open-fd overload without losing runtime fidelity.
      stdio: ['ignore', logFd, logFd] as StdioOptions,
    })

    child.on('error', (err) => {
      void markRunLaunchFailure(
        runDir,
        runId,
        `Run worker failed to start: ${err instanceof Error ? err.message : String(err)}`,
        { kind: 'spawn_error' }
      )
    })

    child.on('exit', (code, signal) => {
      void (async () => {
        // Allow final run_state flushes by the orchestration worker before evaluating launcher failure.
        await new Promise((resolve) => setTimeout(resolve, 500))
        const status = await readRunStateStatus(runDir)
        if (status === 'succeeded' || status === 'failed') return

        const reason =
          typeof code === 'number'
            ? `Run worker exited with code ${code} before writing terminal run state.`
            : `Run worker exited due to signal ${String(signal)} before writing terminal run state.`
        await markRunLaunchFailure(runDir, runId, reason, {
          kind: 'missing_terminal_state',
          code,
          signal,
          state: status,
        })
      })()
    })

    child.unref()
    const processInfo = {
      pid: child.pid ?? null,
      startedAt: new Date().toISOString(),
      command: [psExe, ...psArgs],
      runId,
      jobType,
      requestPath,
    }
    await fsp.writeFile(path.join(runDir, 'run_process.json'), JSON.stringify(processInfo, null, 2) + '\n', 'utf8')
    fs.closeSync(logFd)
  } catch (err) {
    try {
      fs.closeSync(logFd)
    } catch {
      // ignore log fd close errors
    }
    const errorPath = path.join(runDir, 'run_error.md')
    await fsp.writeFile(
      errorPath,
      `# Run Error\n\nFailed to launch PowerShell process.\n\n${err instanceof Error ? err.message : String(err)}\n`,
      'utf8'
    )
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('Local repo path') ? 400 : 500
    const code = message.includes('Local repo path') ? 'INVALID_LOCAL_PATH' : 'LAUNCH_FAILED'
    return NextResponse.json(
      { error: { code, message: status === 400 ? message : 'Failed to launch maintenance run', details: message } },
      { status }
    )
  }

  return NextResponse.json({ runId, status: 'queued' }, { status: 202 })
}
