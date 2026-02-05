import { describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import type { RepoContract } from '../contracts/RepoContract'
import { normalizeRepo } from '../normalize/normalizeRepo'
import { evaluateRepoContract } from '../contracts/evaluateRepoContract'

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uaitoolbox-int-'))
  try {
    return await fn(dir)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

describe('normalize + contract (integration-ish)', () => {
  it('normalizes a fenced .ts file then passes contract', async () => {
    await withTempDir(async (dir) => {
      const file = path.join(dir, 'src', 'index.ts')
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, '## File: src/index.ts\n```ts\nconsole.log(\"ok\")\n```\n', 'utf8')

      const contract: RepoContract = {
        stackId: 'test',
        requiredFilesAll: ['src/index.ts'],
        requiredFilesAny: [],
        codeFileExtensions: ['.ts'],
        forbiddenPatternsByExtension: {
          '.ts': [
            { id: 'md-fence', description: 'no fences', pattern: '^\\s*```', flags: 'm' },
            { id: 'file-header', description: 'no file header', pattern: '^\\s*#{1,6}\\s*File\\s*:', flags: 'mi' },
          ],
        },
        installCommand: 'true',
        buildCommand: 'true',
      }

      const norm = await normalizeRepo(dir, contract)
      expect(norm.violations.length).toBe(0)

      const evalRes = await evaluateRepoContract(dir, contract)
      expect(evalRes.passed).toBe(true)
    })
  })
})

