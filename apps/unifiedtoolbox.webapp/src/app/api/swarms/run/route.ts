import { randomUUID } from 'crypto'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SwarmRequest = {
  goal?: string
  agents?: string[]
  model?: string
}

type ParsedRunnerPayload = {
  status?: string
  runId?: string
  result?: unknown
  error?: string
  completedAt?: number
}

const TIMEOUT_MS = 120_000

function resolvePaths() {
  const repoRoot = path.resolve(process.cwd(), '..', '..')
  const swarmsRoot = path.join(repoRoot, 'scripts', 'swarms')
  const runnerPath = path.join(swarmsRoot, 'dashboard_runner.py')
  const requirementsPath = path.join(swarmsRoot, 'requirements.txt')
  return { repoRoot, swarmsRoot, runnerPath, requirementsPath }
}

async function runPythonSwarm(goal: string, agents: string[], model: string | undefined, swarmsRoot: string, runnerPath: string) {
  const pythonBin =
    process.env.SWARMS_PYTHON_BIN ||
    process.env.PYTHON_BIN ||
    (process.platform === 'win32' ? 'python' : 'python3')
  const args = ['-u', runnerPath, '--goal', goal]
  if (agents.length) args.push('--agents', agents.join(','))
  if (model) args.push('--model', model)

  const env = {
    ...process.env,
    PYTHONPATH: [swarmsRoot, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
  }

  return await new Promise<{
    code: number | null
    stdout: string
    stderr: string
  }>((resolve, reject) => {
    const proc = spawn(pythonBin, args, { cwd: swarmsRoot, env })
    let stdout = ''
    let stderr = ''
    let killTimer: NodeJS.Timeout | null = null
    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
      killTimer = setTimeout(() => {
        proc.kill('SIGKILL')
        reject(new Error(`Swarm runner timed out after ${TIMEOUT_MS / 1000}s`))
      }, 5000)
    }, TIMEOUT_MS)

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    proc.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (killTimer) clearTimeout(killTimer)
      resolve({ code, stdout, stderr })
    })
  })
}

function coerceGoal(body: SwarmRequest): string {
  const goal = typeof body.goal === 'string' ? body.goal.trim() : ''
  return goal
}

export async function POST(req: Request) {
  let payload: SwarmRequest = {}
  try {
    payload = await req.json()
  } catch {
    // Ignore JSON parse errors; handled below
  }

  const goal = coerceGoal(payload)
  if (!goal) {
    return NextResponse.json({ error: 'A goal is required to run a swarm.' }, { status: 400 })
  }
  const agents = Array.isArray(payload.agents) ? payload.agents.map(String) : []
  const model = typeof payload.model === 'string' ? payload.model.trim() || undefined : undefined

  const resolved = resolvePaths()
  const requirementsPathDisplay = path.relative(resolved.repoRoot, resolved.requirementsPath)
  if (!fs.existsSync(resolved.runnerPath)) {
    return NextResponse.json(
      {
        error: 'Swarm runner script is missing. Expected at scripts/swarms/dashboard_runner.py',
      },
      { status: 500 }
    )
  }

  const startedAt = new Date().toISOString()
  try {
    const { code, stdout, stderr } = await runPythonSwarm(goal, agents, model, resolved.swarmsRoot, resolved.runnerPath)
    const stdoutLines = stdout.trim().split('\n').filter(Boolean).reverse()
    let parsed: ParsedRunnerPayload | null = null
    for (const line of stdoutLines) {
      try {
        parsed = JSON.parse(line) as ParsedRunnerPayload
        break
      } catch {
        continue
      }
    }

    const completedAtSeconds =
      typeof parsed?.completedAt === 'number' ? parsed.completedAt : undefined
    const completedAt =
      completedAtSeconds !== undefined
        ? new Date(completedAtSeconds * 1000).toISOString()
        : new Date().toISOString()

    const status =
      typeof parsed?.status === 'string'
        ? parsed.status
        : code === 0
          ? 'completed'
          : 'failed'
    const baseError =
      (parsed?.error as string | undefined) ||
      (stderr ? `Swarm runner reported stderr: ${stderr}` : undefined)
    const dependencyHint =
      status === 'failed'
        ? `Ensure the Swarms engine is installed (pwsh ./scripts/Setup-Swarms.ps1 or pip install -r ${requirementsPathDisplay}) and required model API keys are set.`
        : undefined
    const errorMessage =
      baseError && dependencyHint ? `${baseError} | ${dependencyHint}` : baseError || dependencyHint

    const response = {
      ok: status !== 'failed',
      status,
      runId: (parsed?.runId as string) || randomUUID(),
      goal,
      agents,
      model,
      output: parsed?.result ?? parsed,
      stderr,
      raw: { stdout, stderr, exitCode: code },
      startedAt,
      completedAt,
      error: errorMessage,
    }

    return NextResponse.json(response, { status: response.ok ? 200 : 500 })
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === 'string'
          ? err
          : 'Unknown error running swarm'
    return NextResponse.json(
      {
        ok: false,
        status: 'failed',
        error: message,
        startedAt,
        completedAt: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
