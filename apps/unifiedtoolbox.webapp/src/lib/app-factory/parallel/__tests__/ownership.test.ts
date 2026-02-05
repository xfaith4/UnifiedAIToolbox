import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'

import { planArtifactWrites } from '../../pipeline/ingestArtifacts'
import { checkOwnership } from '../ownership'

describe('parallel ownership enforcement', () => {
  it('blocks writes outside owned paths', async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'uaitoolbox-own-'))
    const planned = planArtifactWrites(repoDir, [
      { name: 'apps/web/app/page.tsx', type: 'CODE', content: 'export default function Page(){}', sourceTeamId: 'ui', sourceTaskId: 't1' },
      { name: 'apps/api/src/server.ts', type: 'CODE', content: 'export {}', sourceTeamId: 'ui', sourceTaskId: 't2' },
    ])

    const result = await checkOwnership(repoDir, planned)
    expect(result.passed).toBe(false)
    expect(result.allowed.map((e) => e.relPath)).toEqual(['apps/web/app/page.tsx'])
    expect(result.violations.length).toBe(1)
    expect(result.violations[0]?.relPath).toBe('apps/api/src/server.ts')
  })

  it('locks Decision Lock artifacts to contracts team', async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'uaitoolbox-own-'))
    const planned = planArtifactWrites(repoDir, [{ name: 'STACK_LOCK.json', type: 'CODE', content: '{}', sourceTeamId: 'api', sourceTaskId: 't1' }])
    const result = await checkOwnership(repoDir, planned)
    expect(result.passed).toBe(false)
    expect(result.violations[0]?.expectedTeamId).toBe('contracts')
  })
})

