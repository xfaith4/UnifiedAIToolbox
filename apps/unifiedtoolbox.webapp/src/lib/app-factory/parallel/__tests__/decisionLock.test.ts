import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'

import { runDecisionLock } from '../decisionLock'

describe('decision lock', () => {
  it('creates lock artifacts and produces a stable contract hash', async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'uaitoolbox-lock-'))
    const contract = {
      stackId: 'node-next-fastify-pnpm',
      requiredFilesAll: [],
      codeFileExtensions: ['.ts'],
      forbiddenPatternsByExtension: {},
      installCommand: 'pnpm i',
      buildCommand: 'pnpm build',
    }

    const first = await runDecisionLock(repoDir, contract)
    const second = await runDecisionLock(repoDir, contract)
    expect(first.contractHash).toBe(second.contractHash)

    const hashText = await fs.readFile(path.join(repoDir, 'CONTRACT_HASH.txt'), 'utf8')
    expect(hashText.trim()).toBe(first.contractHash)
    const report = await fs.readFile(path.join(repoDir, 'DECISION_LOCK_REPORT.md'), 'utf8')
    expect(report).toContain('Decision Lock')
  })
})

