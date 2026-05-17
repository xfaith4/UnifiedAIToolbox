import 'server-only'
import path from 'path'
import { promises as fs } from 'fs'
import { getRunsRoot, isValidRunId } from './runStatus'
import { runLogger } from './runLogger'

export type FinalOutcome =
  | 'completed'
  | 'completed_with_warnings'
  | 'failed'
  | 'partial'

export type BlockerSeverity =
  | 'hard_blocker'
  | 'soft_blocker'
  | 'clarification_needed'
  | 'non_blocking_gap'

export interface FinalBlocker {
  id?: string
  severity: BlockerSeverity
  summary: string
  agent?: string
  details?: Record<string, unknown>
}

export interface FinalValidationResult {
  name: string
  status: 'passed' | 'failed' | 'deferred' | 'partial'
  detail?: string
  data?: Record<string, unknown>
}

export interface FinalRunSummary {
  /** Schema version for forward-compat. */
  schema_version: 1
  run_id: string
  objective: string
  outcome: FinalOutcome
  completed_work: string[]
  changed_files: string[]
  created_artifacts: string[]
  validation_results: FinalValidationResult[]
  blockers: FinalBlocker[]
  warnings: string[]
  next_steps: string[]
  generated_at: string
}

export type FinalRunSummaryInput = Omit<FinalRunSummary, 'schema_version' | 'generated_at'> & {
  schema_version?: 1
  generated_at?: string
}

export const FINAL_SUMMARY_FILENAME = 'final_summary.json'

function ensureWithin(root: string, candidate: string): string {
  const full = path.resolve(root, candidate)
  const r = path.resolve(root)
  if (!full.startsWith(r + path.sep) && full !== r) {
    throw new Error('path escaped root')
  }
  return full
}

export interface WriteFinalSummaryOptions {
  rootDir?: string
}

/**
 * Persist a durable final-summary record for a run. Writes atomically by
 * staging to a temp file and renaming. Safe to call more than once; the
 * latest call wins.
 */
export async function writeFinalSummary(
  input: FinalRunSummaryInput,
  options: WriteFinalSummaryOptions = {}
): Promise<FinalRunSummary> {
  if (!isValidRunId(input.run_id)) {
    throw new Error(`Invalid run_id for final summary: ${input.run_id}`)
  }
  const summary: FinalRunSummary = {
    schema_version: 1,
    run_id: input.run_id,
    objective: input.objective ?? '',
    outcome: input.outcome ?? 'partial',
    completed_work: Array.isArray(input.completed_work) ? [...input.completed_work] : [],
    changed_files: Array.isArray(input.changed_files) ? [...input.changed_files] : [],
    created_artifacts: Array.isArray(input.created_artifacts) ? [...input.created_artifacts] : [],
    validation_results: Array.isArray(input.validation_results) ? [...input.validation_results] : [],
    blockers: Array.isArray(input.blockers) ? [...input.blockers] : [],
    warnings: Array.isArray(input.warnings) ? [...input.warnings] : [],
    next_steps: Array.isArray(input.next_steps) ? [...input.next_steps] : [],
    generated_at: input.generated_at ?? new Date().toISOString(),
  }

  const rootDir = options.rootDir ?? getRunsRoot()
  const runDir = ensureWithin(rootDir, input.run_id)
  const filePath = path.join(runDir, FINAL_SUMMARY_FILENAME)
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`

  try {
    await fs.mkdir(runDir, { recursive: true })
    await fs.writeFile(tmpPath, JSON.stringify(summary, null, 2), 'utf8')
    await fs.rename(tmpPath, filePath)
  } catch (error) {
    runLogger.error('finalSummary.writeFailed', {
      run_id: input.run_id,
      error: error instanceof Error ? error.message : String(error),
    })
    // Best-effort cleanup of temp file
    fs.unlink(tmpPath).catch(() => undefined)
    throw error
  }

  return summary
}

/** Read the persisted final summary, returning null when absent. */
export async function readFinalSummary(
  runId: string,
  options: WriteFinalSummaryOptions = {}
): Promise<FinalRunSummary | null> {
  if (!isValidRunId(runId)) return null
  const rootDir = options.rootDir ?? getRunsRoot()
  const runDir = ensureWithin(rootDir, runId)
  const filePath = path.join(runDir, FINAL_SUMMARY_FILENAME)
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as FinalRunSummary
    if (!parsed?.run_id) return null
    return parsed
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    runLogger.warn('finalSummary.readFailed', {
      run_id: runId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
