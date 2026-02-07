import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { loadRunStatus } from '../runStatus'

describe('loadRunStatus', () => {
  it('reads status, events, and artifacts', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'uaitoolbox-run-'))
    const runId = 'run-test-1'
    const runDir = path.join(root, 'runs', runId)
    await fs.mkdir(runDir, { recursive: true })

    await fs.writeFile(
      path.join(runDir, 'status.json'),
      JSON.stringify(
        {
          schema_version: '1.0',
          run_id: runId,
          job_type: 'maintain_existing_app',
          state: 'running',
          stages: [{ id: 'RepoContextBuilder', name: 'Repo Context', status: 'running' }],
        },
        null,
        2
      ),
      'utf8'
    )

    await fs.writeFile(
      path.join(runDir, 'events.jsonl'),
      JSON.stringify({ ts: '2026-02-07T00:00:00Z', level: 'info', stage: 'RepoContextBuilder', message: 'started' }) + '\n',
      'utf8'
    )

    const artifactsDir = path.join(runDir, 'artifacts')
    await fs.mkdir(artifactsDir, { recursive: true })
    await fs.writeFile(path.join(artifactsDir, 'pr.json'), JSON.stringify({ status: 'created' }, null, 2), 'utf8')

    const status = await loadRunStatus(runId, { rootDir: root, eventLimit: 10 })
    expect(status?.runId).toBe(runId)
    expect(status?.jobType).toBe('maintain_existing_app')
    expect(status?.events.length).toBe(1)
    expect(status?.artifacts.some((a) => a.path === 'pr.json')).toBe(true)
  })
})
