import path from 'path'
import os from 'os'
import { promises as fs } from 'fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFinalSummary, writeFinalSummary, FINAL_SUMMARY_FILENAME } from '../finalSummary'

async function makeTmpRoot(prefix = 'final-summary-'): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

describe('finalSummary', () => {
  let rootDir: string

  beforeEach(async () => {
    rootDir = await makeTmpRoot()
  })
  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true })
  })

  it('persists and re-reads a summary', async () => {
    const runId = 'run-1'
    await fs.mkdir(path.join(rootDir, runId), { recursive: true })
    const summary = await writeFinalSummary(
      {
        run_id: runId,
        objective: 'build a thing',
        outcome: 'completed_with_warnings',
        completed_work: ['step 1', 'step 2'],
        changed_files: ['src/foo.ts'],
        created_artifacts: ['artifacts/plan.md'],
        validation_results: [{ name: 'lint', status: 'passed' }],
        blockers: [],
        warnings: ['minor formatting'],
        next_steps: ['ship'],
      },
      { rootDir }
    )
    expect(summary.schema_version).toBe(1)
    expect(summary.generated_at).toMatch(/T/)

    const round = await readFinalSummary(runId, { rootDir })
    expect(round?.objective).toBe('build a thing')
    expect(round?.outcome).toBe('completed_with_warnings')
    expect(round?.completed_work).toEqual(['step 1', 'step 2'])
  })

  it('writes atomically and overwrites on second call', async () => {
    const runId = 'run-2'
    await fs.mkdir(path.join(rootDir, runId), { recursive: true })
    await writeFinalSummary(
      {
        run_id: runId,
        objective: 'first',
        outcome: 'partial',
        completed_work: [],
        changed_files: [],
        created_artifacts: [],
        validation_results: [],
        blockers: [],
        warnings: [],
        next_steps: [],
      },
      { rootDir }
    )
    await writeFinalSummary(
      {
        run_id: runId,
        objective: 'second',
        outcome: 'completed',
        completed_work: ['done'],
        changed_files: [],
        created_artifacts: [],
        validation_results: [],
        blockers: [],
        warnings: [],
        next_steps: [],
      },
      { rootDir }
    )
    const round = await readFinalSummary(runId, { rootDir })
    expect(round?.objective).toBe('second')
    expect(round?.outcome).toBe('completed')
    // Ensure no leftover tmp files
    const entries = await fs.readdir(path.join(rootDir, runId))
    expect(entries.filter((e) => e.startsWith(`${FINAL_SUMMARY_FILENAME}.tmp-`))).toEqual([])
  })

  it('returns null for missing summary', async () => {
    const r = await readFinalSummary('nope', { rootDir })
    expect(r).toBeNull()
  })
})
