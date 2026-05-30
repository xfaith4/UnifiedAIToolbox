import 'server-only'
import path from 'path'
import { promises as fs } from 'fs'
import type { SandboxReport } from '@/lib/types/orchestrator'
import { runSandbox, MAX_LOOP_ITERATIONS } from './sandboxEngine'
import { appendEvent as appendCanonicalEvent } from '@/lib/app-factory/runs/canonicalEvents'
import { resolveRunContext } from './runContext'

export interface RefinementLoopOptions {
  runDir: string
  acceptanceChecks: string[]
  /** Starting loop iteration (defaults to 1) */
  startIteration?: number
  /** Override maximum iterations (defaults to MAX_LOOP_ITERATIONS) */
  maxIterations?: number
  /** Working directory for shell commands */
  cwd?: string
}

export type LoopExitReason = 'all_passed' | 'max_iterations' | 'no_checks'

export interface RefinementLoopResult {
  finalReport: SandboxReport
  iterations: number
  exitReason: LoopExitReason
}

function mapLoopEventType(type: string): {
  eventType: 'agent_progress' | 'agent_completed' | 'agent_blocked'
  severity: 'info' | 'warn' | 'error'
} {
  if (type === 'loop:passed') {
    return { eventType: 'agent_completed', severity: 'info' }
  }
  if (type === 'loop:iteration_failed') {
    return { eventType: 'agent_blocked', severity: 'warn' }
  }
  if (type === 'loop:max_iterations') {
    return { eventType: 'agent_blocked', severity: 'error' }
  }
  return { eventType: 'agent_progress', severity: 'info' }
}

async function appendEvent(
  runDir: string,
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
    // non-fatal
  }

  const runContext = resolveRunContext(runDir)
  if (!runContext) return

  const mapped = mapLoopEventType(type)
  const canonicalData: Record<string, unknown> = {
    source: 'refinementLoop',
    source_event_type: type,
    ...(data ?? {}),
  }

  try {
    await appendCanonicalEvent(
      {
        run_id: runContext.runId,
        event_type: mapped.eventType,
        severity: mapped.severity,
        agent_name: 'RefinementLoop',
        message,
        data: canonicalData,
      },
      { rootDir: runContext.rootDir },
    )
  } catch {
    // non-fatal
  }
}

/**
 * Run the closed feedback loop:
 *   1. Execute acceptance checks via the sandbox engine
 *   2. If all pass → exit with `all_passed`
 *   3. If checks fail, emit a `loop:iteration_N` event and continue
 *   4. Exit when max iterations reached
 *
 * Note: this controller evaluates acceptance checks; actual code refinement
 * (re-running the Engineer / Critic agents) is triggered externally via the
 * `/api/app-factory/runs/[runId]/refine` endpoint after this loop reports
 * failures.
 */
export async function runRefinementLoop(opts: RefinementLoopOptions): Promise<RefinementLoopResult> {
  const { runDir, acceptanceChecks, startIteration = 1, maxIterations = MAX_LOOP_ITERATIONS, cwd } = opts
  const eventsPath = path.join(runDir, 'events.ndjson')

  if (acceptanceChecks.length === 0) {
    // No checks to run — emit a single sandbox evaluation and exit
    const { report } = await runSandbox({ runDir, acceptanceChecks: [], loopIteration: startIteration, cwd })
    return { finalReport: report, iterations: 0, exitReason: 'no_checks' }
  }

  let currentIteration = startIteration
  let lastReport: SandboxReport | null = null

  while (currentIteration <= startIteration + maxIterations - 1) {
    await appendEvent(runDir, eventsPath, `loop:iteration_${currentIteration}`, `Starting loop iteration ${currentIteration}`, {
      iteration: currentIteration,
      maxIterations,
    })

    const { report, allPassed } = await runSandbox({
      runDir,
      acceptanceChecks,
      loopIteration: currentIteration,
      cwd,
    })
    lastReport = report

    if (allPassed) {
      await appendEvent(runDir, eventsPath, 'loop:passed', `All acceptance checks passed on iteration ${currentIteration}`, {
        iteration: currentIteration,
      })
      return { finalReport: report, iterations: currentIteration - startIteration + 1, exitReason: 'all_passed' }
    }

    const failedChecks = report.checks.filter((c) => c.result === 'failed').map((c) => c.check)
    await appendEvent(
      runDir,
      eventsPath,
      'loop:iteration_failed',
      `${report.failedCount} check(s) failed on iteration ${currentIteration}`,
      { iteration: currentIteration, failedChecks, verificationStatus: report.verificationStatus },
    )

    currentIteration++
  }

  await appendEvent(
    runDir,
    eventsPath,
    'loop:max_iterations',
    `Reached maximum loop iterations (${maxIterations})`,
    { maxIterations },
  )

  if (!lastReport) {
    throw new Error('Refinement loop completed without producing a sandbox report')
  }

  return {
    finalReport: lastReport,
    iterations: maxIterations,
    exitReason: 'max_iterations',
  }
}
