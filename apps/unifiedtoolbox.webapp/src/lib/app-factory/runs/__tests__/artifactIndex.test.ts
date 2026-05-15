import path from 'path'
import os from 'os'
import { promises as fs } from 'fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { indexArtifact, listArtifactIndex, findArtifact, ARTIFACTS_INDEX_FILENAME } from '../artifactIndex'

async function makeTmpRoot(prefix = 'artifact-index-'): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

describe('artifactIndex', () => {
  let rootDir: string

  beforeEach(async () => {
    rootDir = await makeTmpRoot()
  })
  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true })
  })

  it('writes JSONL with assigned id and timestamp', async () => {
    const entry = await indexArtifact(
      {
        run_id: 'run-1',
        type: 'doc',
        title: 'Plan',
        path: 'artifacts\\plan.md',
        producing_agent: 'planner',
        summary: 'initial plan',
      },
      { rootDir }
    )
    expect(entry.artifact_id).toMatch(/[0-9a-f-]{8,}/)
    expect(entry.path).toBe('artifacts/plan.md') // normalised
    const raw = await fs.readFile(path.join(rootDir, 'run-1', ARTIFACTS_INDEX_FILENAME), 'utf8')
    expect(raw.trim().split('\n')).toHaveLength(1)
  })

  it('rejects empty path', async () => {
    await expect(
      indexArtifact({ run_id: 'run-1', type: 'doc', title: 't', path: '' }, { rootDir })
    ).rejects.toThrow()
  })

  it('lists and finds entries in insertion order', async () => {
    const runId = 'run-2'
    const a = await indexArtifact(
      { run_id: runId, type: 'doc', title: 'A', path: 'a.md' },
      { rootDir }
    )
    const b = await indexArtifact(
      { run_id: runId, type: 'doc', title: 'B', path: 'b.md' },
      { rootDir }
    )
    const all = await listArtifactIndex(runId, { rootDir })
    expect(all.map((e) => e.artifact_id)).toEqual([a.artifact_id, b.artifact_id])

    const found = await findArtifact(runId, b.artifact_id, { rootDir })
    expect(found?.title).toBe('B')
  })

  it('returns empty array when index is missing', async () => {
    const out = await listArtifactIndex('no-such-run', { rootDir })
    expect(out).toEqual([])
  })
})
