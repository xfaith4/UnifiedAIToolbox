import 'server-only'
import path from 'path'
import { promises as fs } from 'fs'
import { spawnSync } from 'child_process'
import type { SandboxCheck, SandboxReport, VerificationResult } from '@/lib/types/orchestrator'
import { evaluateAcceptanceChecks, aggregateStatus, type EvaluatedCheck } from './evaluateChecks'

const MAX_COMMAND_OUTPUT_BYTES = 8 * 1024

/** Maximum wall-clock time (ms) for a single acceptance check command */
const COMMAND_TIMEOUT_MS = 30_000

/** Maximum number of refinement loop iterations */
export const MAX_LOOP_ITERATIONS = 3

export interface SandboxRunOptions {
  /** Run directory where sandbox_report.json and events.ndjson are written */
  runDir: string
  /** Raw acceptance check strings from the proposal */
  acceptanceChecks: string[]
  /** Which loop iteration this is (1-based) */
  loopIteration?: number
  /** Working directory to use when executing shell commands (defaults to runDir) */
  cwd?: string
}

export interface SandboxRunResult {
  report: SandboxReport
  /** true if all checks passed */
  allPassed: boolean
}

// ── Event helpers ──────────────────────────────────────────────────────────────

async function appendEvent(
  eventsPath: string,
  type: string,
  message: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const record: Record<string, unknown> = { ts: new Date().toISOString(), type, message }
  if (data) record.data = data
  try {
    await fs.appendFile(eventsPath, JSON.stringify(record) + '\n', 'utf8')
  } catch {
    // non-fatal: event emission should never break the sandbox
  }
}

// ── Command execution ──────────────────────────────────────────────────────────

function truncate(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, 'utf8')
  if (buf.length <= maxBytes) return text
  return buf.subarray(0, maxBytes).toString('utf8') + '\n… (truncated)'
}

function executeCommand(
  command: string,
  cwd: string,
): { exitCode: number; stdout: string; stderr: string; timedOut: boolean } {
  const result = spawnSync('sh', ['-c', command], {
    cwd,
    encoding: 'utf8',
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: MAX_COMMAND_OUTPUT_BYTES * 2,
  })

  const timedOut = result.signal === 'SIGTERM'
  const exitCode = result.status ?? (timedOut ? -1 : -2)
  const stdout = truncate(result.stdout ?? '', MAX_COMMAND_OUTPUT_BYTES)
  const stderr = truncate(result.stderr ?? '', MAX_COMMAND_OUTPUT_BYTES)

  return { exitCode, stdout, stderr, timedOut }
}

// ── Evaluate each check ────────────────────────────────────────────────────────

async function runCheck(
  evaluated: EvaluatedCheck,
  cwd: string,
  eventsPath: string,
  iteration: number,
): Promise<SandboxCheck> {
  const { check, evaluator, command } = evaluated

  if (evaluated.result === 'deferred' && !command) {
    return { check, evaluator, result: 'deferred', details: evaluated.details }
  }

  if (command) {
    await appendEvent(eventsPath, 'sandbox:check_start', `Executing check: ${check}`, {
      evaluator,
      command,
      iteration,
    })

    const { exitCode, stdout, stderr, timedOut } = executeCommand(command, cwd)

    let result: VerificationResult
    let details: string

    if (timedOut) {
      result = 'failed'
      details = `Command timed out after ${COMMAND_TIMEOUT_MS / 1000}s: \`${command}\``
    } else if (exitCode === 0) {
      result = 'passed'
      details = `Command exited 0: \`${command}\``
    } else {
      result = 'failed'
      details = `Command exited ${exitCode}: \`${command}\``
    }

    const data: Record<string, unknown> = { exitCode, command }
    if (stdout) data.stdout = stdout
    if (stderr) data.stderr = stderr

    await appendEvent(
      eventsPath,
      result === 'passed' ? 'sandbox:check_passed' : 'sandbox:check_failed',
      `${result}: ${check}`,
      data,
    )

    return { check, evaluator, result, details, data }
  }

  // Already evaluated without a command (deferred non-command check)
  return { check, evaluator, result: evaluated.result, details: evaluated.details }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Run the sandbox execution engine for a given set of acceptance checks.
 *
 * Writes `sandbox_report.json` to `runDir` and emits `sandbox:*` events to
 * `events.ndjson` in `runDir` (mirroring the overseer pattern).
 */
export async function runSandbox(opts: SandboxRunOptions): Promise<SandboxRunResult> {
  const { runDir, acceptanceChecks, loopIteration = 1, cwd } = opts
  const eventsPath = path.join(runDir, 'events.ndjson')
  const reportPath = path.join(runDir, 'sandbox_report.json')
  const effectiveCwd = cwd ?? runDir

  await appendEvent(eventsPath, 'sandbox:start', 'Sandbox evaluation started', {
    iteration: loopIteration,
    checkCount: acceptanceChecks.length,
  })

  const evaluated = evaluateAcceptanceChecks(acceptanceChecks)
  const checks: SandboxCheck[] = []

  for (const ev of evaluated) {
    const result = await runCheck(ev, effectiveCwd, eventsPath, loopIteration)
    checks.push(result)
  }

  const passedCount = checks.filter((c) => c.result === 'passed').length
  const failedCount = checks.filter((c) => c.result === 'failed').length
  const deferredCount = checks.filter((c) => c.result === 'deferred').length
  const verificationStatus = aggregateStatus(checks)

  const report: SandboxReport = {
    generatedAt: new Date().toISOString(),
    verificationStatus,
    loopIteration,
    checks,
    passedCount,
    failedCount,
    deferredCount,
  }

  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8')

  await appendEvent(eventsPath, 'sandbox:complete', `Sandbox evaluation complete: ${verificationStatus}`, {
    iteration: loopIteration,
    passedCount,
    failedCount,
    deferredCount,
    verificationStatus,
  })

  return { report, allPassed: verificationStatus === 'passed' }
}
