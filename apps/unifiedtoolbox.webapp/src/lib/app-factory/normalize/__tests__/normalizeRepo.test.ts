import { describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { normalizeRepo } from '../normalizeRepo'
import type { RepoContract } from '../../contracts/RepoContract'

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uaitoolbox-norm-'))
  try {
    return await fn(dir)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

const contract: RepoContract = {
  stackId: 'test',
  requiredFilesAll: [],
  requiredFilesAny: [],
  codeFileExtensions: ['.ts'],
  forbiddenPatternsByExtension: {
    '.ts': [
      { id: 'md-fence', description: 'no fences', pattern: '^\\s*```', flags: 'm' },
      { id: 'file-header', description: 'no file header', pattern: '^\\s*#{1,6}\\s*File\\s*:', flags: 'mi' },
      { id: 'frontmatter', description: 'no frontmatter markers', pattern: '^(?:\\uFEFF)?\\s*---\\s*$', flags: 'm' },
    ],
  },
  installCommand: 'true',
  buildCommand: 'true',
}

describe('normalizeRepo', () => {
  it('strips ``` fences correctly', async () => {
    await withTempDir(async (dir) => {
      const file = path.join(dir, 'src', 'index.ts')
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, '```ts\nconsole.log(\"hi\")\n```\n', 'utf8')

      const res = await normalizeRepo(dir, contract)
      const text = await fs.readFile(file, 'utf8')
      expect(text.trim()).toBe('console.log(\"hi\")')
      expect(res.violations.length).toBe(0)
      expect(res.changedFiles.some((c) => c.filePath === 'src/index.ts')).toBe(true)
    })
  })

  it('strips “## File:” headers', async () => {
    await withTempDir(async (dir) => {
      const file = path.join(dir, 'a.ts')
      await fs.writeFile(file, '## File: a.ts\nconsole.log(1)\n', 'utf8')
      const res = await normalizeRepo(dir, contract)
      const text = await fs.readFile(file, 'utf8')
      expect(text.trim()).toBe('console.log(1)')
      expect(res.violations.length).toBe(0)
    })
  })

  it('strips frontmatter', async () => {
    await withTempDir(async (dir) => {
      const file = path.join(dir, 'a.ts')
      await fs.writeFile(file, '---\ntitle: x\n---\nconsole.log(1)\n', 'utf8')
      const res = await normalizeRepo(dir, contract)
      const text = await fs.readFile(file, 'utf8')
      expect(text.trim()).toBe('console.log(1)')
      expect(res.violations.length).toBe(0)
    })
  })

  it('fails when forbidden patterns remain', async () => {
    await withTempDir(async (dir) => {
      const file = path.join(dir, 'a.ts')
      await fs.writeFile(file, 'console.log(1)\n## File: should-not-be-here\n', 'utf8')
      const res = await normalizeRepo(dir, contract)
      expect(res.violations.length).toBeGreaterThan(0)
      expect(res.violations[0]?.filePath).toBe('a.ts')
    })
  })
})

