import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import path from 'path'
import os from 'os'
import { promises as fsp } from 'fs'
import { runRefinementLoop } from '../refinementLoop'
import type { SandboxReport } from '@/lib/types/orchestrator'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeTempDir(): Promise<string> {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'refinement-loop-test-'))
}

async function readReport(dir: string): Promise<SandboxReport> {
  const raw = await fsp.readFile(path.join(dir, 'sandbox_report.json'), 'utf8')
  return JSON.parse(raw) as SandboxReport
}

async function readEvents(dir: string): Promise<Array<{ type: string; message: string }>> {
  try {
    const raw = await fsp.readFile(path.join(dir, 'events.ndjson'), 'utf8')
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { type: string; message: string })
  } catch {
    return []
  }
}

async function readCanonicalEvents(
  dir: string,
): Promise<Array<{ event_type: string; message: string; data?: Record<string, unknown> }>> {
  try {
    const raw = await fsp.readFile(path.join(dir, 'events.jsonl'), 'utf8')
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(
        (line) =>
          JSON.parse(line) as { event_type: string; message: string; data?: Record<string, unknown> },
      )
  } catch {
    return []
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runRefinementLoop', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await makeTempDir()
  })

  afterEach(async () => {
    await fsp.rm(tempDir, { recursive: true, force: true })
  })

  it('exits immediately with no_checks when acceptance checks are empty', async () => {
    const result = await runRefinementLoop({ runDir: tempDir, acceptanceChecks: [] })

    expect(result.exitReason).toBe('no_checks')
    expect(result.iterations).toBe(0)
    expect(result.finalReport).toBeDefined()
    expect(result.finalReport.verificationStatus).toBe('pending')
  })

  it('exits with all_passed when all abstract checks are deferred (treated as non-failing)', async () => {
    // Abstract/deferred checks don't produce failures, so the loop exits after iteration 1
    // with a "deferred" status (no failures found)
    const result = await runRefinementLoop({
      runDir: tempDir,
      acceptanceChecks: ['Commissioner score >= 4'],
      maxIterations: 3,
    })

    // Loop should have run and exited (deferred checks don't cause failure re-loops)
    expect(result.iterations).toBeGreaterThanOrEqual(1)
    expect(result.finalReport).toBeDefined()
    expect(result.finalReport.checks).toHaveLength(1)
  })

  it('writes sandbox_report.json to runDir after completion', async () => {
    await runRefinementLoop({
      runDir: tempDir,
      acceptanceChecks: ['Some abstract check'],
    })

    const report = await readReport(tempDir)
    expect(report.generatedAt).toBeTruthy()
    expect(Array.isArray(report.checks)).toBe(true)
  })

  it('emits loop:iteration_N events for each iteration', async () => {
    await runRefinementLoop({
      runDir: tempDir,
      acceptanceChecks: ['Commissioner score >= 4'],
      maxIterations: 1,
    })

    const events = await readEvents(tempDir)
    const iterationEvents = events.filter((e) => e.type.startsWith('loop:iteration_'))
    expect(iterationEvents.length).toBeGreaterThanOrEqual(1)
    expect(iterationEvents[0].type).toBe('loop:iteration_1')
  })

  it('respects startIteration parameter', async () => {
    await runRefinementLoop({
      runDir: tempDir,
      acceptanceChecks: ['Commissioner score >= 4'],
      startIteration: 3,
      maxIterations: 1,
    })

    const events = await readEvents(tempDir)
    const iterationEvents = events.filter((e) => e.type.startsWith('loop:iteration_'))
    expect(iterationEvents[0].type).toBe('loop:iteration_3')
  })

  it('exits with max_iterations when all checks keep failing across iterations', async () => {
    // Use a shell command that will always fail in the test environment
    // (npm run build will fail since there's no real project in the tempDir)
    const result = await runRefinementLoop({
      runDir: tempDir,
      acceptanceChecks: ['Build passes with exit code 0'],
      maxIterations: 2,
      cwd: tempDir, // use tempDir as cwd so npm isn't found → command fails
    })

    expect(result.exitReason).toBe('max_iterations')
    expect(result.iterations).toBe(2)
    expect(result.finalReport.failedCount).toBeGreaterThan(0)
  })

  it('includes loop exit event in events.ndjson', async () => {
    await runRefinementLoop({
      runDir: tempDir,
      acceptanceChecks: ['Build passes with exit code 0'],
      maxIterations: 1,
      cwd: tempDir,
    })

    const events = await readEvents(tempDir)
    const maxIterEvent = events.find((e) => e.type === 'loop:max_iterations')
    expect(maxIterEvent).toBeDefined()
  })

  it('emits canonical events for sandbox and loop activity', async () => {
    await runRefinementLoop({
      runDir: tempDir,
      acceptanceChecks: ['Build passes with exit code 0'],
      maxIterations: 1,
      cwd: tempDir,
    })

    const canonical = await readCanonicalEvents(tempDir)
    expect(canonical.some((event) => event.event_type === 'validation_started')).toBe(true)
    expect(canonical.some((event) => event.event_type === 'validation_completed')).toBe(true)
    expect(
      canonical.some((event) => event.event_type === 'artifact_created' && event.data?.path === 'sandbox_report.json'),
    ).toBe(true)
    expect(canonical.some((event) => event.data?.source === 'refinementLoop')).toBe(true)
  })

  it('finalReport loopIteration reflects the last iteration run', async () => {
    const result = await runRefinementLoop({
      runDir: tempDir,
      acceptanceChecks: ['Build passes with exit code 0'],
      maxIterations: 2,
      cwd: tempDir,
    })

    expect(result.finalReport.loopIteration).toBe(2)
  })
})
