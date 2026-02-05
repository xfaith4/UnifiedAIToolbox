import { describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { evaluateRepoContract } from '../evaluateRepoContract'
import type { RepoContract } from '../RepoContract'

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uaitoolbox-contract-'))
  try {
    return await fn(dir)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

describe('evaluateRepoContract', () => {
  it('missing required file fails with clear message', async () => {
    await withTempDir(async (dir) => {
      const contract: RepoContract = {
        stackId: 'test',
        requiredFilesAll: ['package.json'],
        requiredFilesAny: [],
        codeFileExtensions: ['.ts'],
        forbiddenPatternsByExtension: {},
        installCommand: 'true',
        buildCommand: 'true',
      }
      const res = await evaluateRepoContract(dir, contract)
      expect(res.passed).toBe(false)
      expect(res.failures.some((f) => f.kind === 'missing_required_file')).toBe(true)
    })
  })

  it('forbidden pattern detection by extension works', async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, 'a.ts'), '```ts\nconsole.log(1)\n', 'utf8')
      const contract: RepoContract = {
        stackId: 'test',
        requiredFilesAll: [],
        requiredFilesAny: [],
        codeFileExtensions: ['.ts'],
        forbiddenPatternsByExtension: {
          '.ts': [{ id: 'md-fence', description: 'no fences', pattern: '^\\s*```', flags: 'm' }],
        },
        installCommand: 'true',
        buildCommand: 'true',
      }
      const res = await evaluateRepoContract(dir, contract)
      expect(res.passed).toBe(false)
      expect(res.failures.some((f) => f.kind === 'forbidden_pattern')).toBe(true)
    })
  })
})

