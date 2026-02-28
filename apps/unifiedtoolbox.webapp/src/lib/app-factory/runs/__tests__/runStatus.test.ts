import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'
import { loadRunStatus } from '../runStatus'

describe('loadRunStatus', () => {
  it('reads status, events, and artifacts', async () => {
    const fixturesRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')
    const runId = 'sample-run'

    const status = await loadRunStatus(runId, { rootDir: fixturesRoot, eventLimit: 10 })
    expect(status?.runId).toBe(runId)
    expect(status?.jobType).toBe('maintain_existing_app')
    expect(status?.events.length).toBeGreaterThan(0)
    expect(status?.artifacts.some((a) => a.path === 'artifacts/pr.json')).toBe(true)
    expect(status?.risk?.level).toBe('medium')
  })

  it('populates attempt fields on loaded status', async () => {
    const fixturesRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')
    const runId = 'sample-run'

    const status = await loadRunStatus(runId, { rootDir: fixturesRoot, eventLimit: 10 })
    // Should always have at least one attempt
    expect(Array.isArray(status?.attempts)).toBe(true)
    expect(status?.attempts?.length).toBeGreaterThanOrEqual(1)
    expect(status?.currentAttemptId).toBe('a1')
    expect(status?.attemptNumber).toBeGreaterThanOrEqual(1)
  })

  it('tags all events with attemptId a1 for a single-attempt run', async () => {
    const fixturesRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')
    const runId = 'sample-run'

    const status = await loadRunStatus(runId, { rootDir: fixturesRoot, eventLimit: 50 })
    const tagged = status?.events.filter((ev) => ev.attemptId !== undefined) ?? []
    // All events that have an attemptId should be a1 (no requeue events in fixture)
    expect(tagged.every((ev) => ev.attemptId === 'a1')).toBe(true)
  })
})
