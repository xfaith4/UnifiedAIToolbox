import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'

import { planArtifactWrites } from '../../pipeline/ingestArtifacts'
import { resolveDeterministic } from '../assembleDeterministic'

describe('parallel deterministic assembler', () => {
  it('resolves duplicate writes deterministically within an owner team', async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'uaitoolbox-asm-'))
    const planned = planArtifactWrites(repoDir, [
      { name: 'apps/web/app/page.tsx', type: 'CODE', content: 'export const a = 1', sourceTeamId: 'ui', sourceTaskId: 'b_task' },
      { name: 'apps/web/app/page.tsx', type: 'CODE', content: 'export const a = 2', sourceTeamId: 'ui', sourceTaskId: 'a_task' },
    ])

    const result = await resolveDeterministic(repoDir, planned)
    expect(result.passed).toBe(true)
    expect(result.selected).toHaveLength(1)
    expect(result.selected[0]?.artifact.content).toContain('export const a = 2')
    expect(result.conflicts).toHaveLength(1)
  })
})

