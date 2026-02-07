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
})
