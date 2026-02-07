import { describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import type { RepoContract } from '../contracts/RepoContract'
import { normalizeRepo } from '../normalize/normalizeRepo'
import { evaluateRepoContract } from '../contracts/evaluateRepoContract'

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uaitoolbox-md-fix-'))
  try {
    return await fn(dir)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

describe('markdown contract fix', () => {
  it('allows markdown files with code fences when .md is not in codeFileExtensions', async () => {
    await withTempDir(async (dir) => {
      // Create a README.md with code fences (valid markdown syntax)
      const readme = path.join(dir, 'README.md')
      await fs.writeFile(
        readme,
        '# Test Project\n\n## Installation\n\n```bash\nnpm install\n```\n\n## Usage\n\n```javascript\nconst app = require("./app")\napp.start()\n```\n',
        'utf8'
      )

      // Create package.json
      const pkg = path.join(dir, 'package.json')
      await fs.writeFile(pkg, '{"name":"test","version":"1.0.0","private":true,"scripts":{"build":"echo build"}}', 'utf8')

      // Use contract without .md in codeFileExtensions (the fix)
      const contract: RepoContract = {
        stackId: 'node-next-app-npm',
        requiredFilesAll: ['package.json'],
        requiredFilesAny: [],
        codeFileExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json'], // .md NOT included
        forbiddenPatternsByExtension: {
          '.ts': [{ id: 'md-fence', description: 'no fences', pattern: '^\\s*```', flags: 'm' }],
        },
        installCommand: 'npm install',
        buildCommand: 'npm run build',
      }

      // Run normalization - should not process README.md since it's not a code file
      const norm = await normalizeRepo(dir, contract)
      expect(norm.violations.length).toBe(0)
      expect(norm.changedFiles.length).toBe(0) // README.md should not be modified

      // Run contract evaluation - should pass
      const evalRes = await evaluateRepoContract(dir, contract)
      if (!evalRes.passed) {
        console.log('Contract failures:', JSON.stringify(evalRes.failures, null, 2))
      }
      expect(evalRes.passed).toBe(true)
      expect(evalRes.failures.length).toBe(0)

      // Verify README.md still has code fences (was not stripped)
      const readmeContent = await fs.readFile(readme, 'utf8')
      expect(readmeContent).toContain('```bash')
      expect(readmeContent).toContain('```javascript')
    })
  })

  it('fails when .md is incorrectly included in codeFileExtensions (old behavior)', async () => {
    await withTempDir(async (dir) => {
      // Create a README.md with code fences
      const readme = path.join(dir, 'README.md')
      await fs.writeFile(readme, '# Test\n\n```bash\nnpm install\n```\n', 'utf8')

      // Create package.json
      const pkg = path.join(dir, 'package.json')
      await fs.writeFile(pkg, '{"name":"test","version":"1.0.0"}', 'utf8')

      // Use contract WITH .md in codeFileExtensions (the bug)
      const contract: RepoContract = {
        stackId: 'test',
        requiredFilesAll: ['package.json'],
        requiredFilesAny: [],
        codeFileExtensions: ['.ts', '.tsx', '.js', '.jsx', '.md'], // .md incorrectly included
        forbiddenPatternsByExtension: {
          '.md': [{ id: 'md-fence', description: 'no fences', pattern: '^\\s*```', flags: 'm' }],
        },
        installCommand: 'true',
        buildCommand: 'true',
      }

      // Run normalization - should strip fences from README.md (incorrect)
      const norm = await normalizeRepo(dir, contract)
      expect(norm.changedFiles.length).toBe(1) // README.md was modified
      expect(norm.changedFiles[0]?.filePath).toBe('README.md')

      // After normalization, README.md no longer has fences
      const readmeContent = await fs.readFile(readme, 'utf8')
      expect(readmeContent).not.toContain('```')
    })
  })

  it('allows YAML files with document separators when .yaml is not in codeFileExtensions', async () => {
    await withTempDir(async (dir) => {
      // Create a YAML file with document separators (valid YAML syntax)
      const configYaml = path.join(dir, 'config.yaml')
      await fs.writeFile(
        configYaml,
        '---\nname: test\nversion: 1.0.0\n---\nname: test2\nversion: 2.0.0\n',
        'utf8'
      )

      // Create package.json
      const pkg = path.join(dir, 'package.json')
      await fs.writeFile(pkg, '{"name":"test","version":"1.0.0","private":true,"scripts":{"build":"echo build"}}', 'utf8')

      // Use contract without .yaml in codeFileExtensions (the fix)
      const contract: RepoContract = {
        stackId: 'test',
        requiredFilesAll: ['package.json'],
        requiredFilesAny: [],
        codeFileExtensions: ['.ts', '.tsx', '.js', '.jsx'], // .yaml NOT included
        forbiddenPatternsByExtension: {
          '.ts': [{ id: 'frontmatter-marker', description: 'no frontmatter', pattern: '^(?:\\uFEFF)?\\s*---\\s*$', flags: 'm' }],
        },
        installCommand: 'true',
        buildCommand: 'true',
      }

      // Run normalization - should not process config.yaml
      const norm = await normalizeRepo(dir, contract)
      expect(norm.violations.length).toBe(0)

      // Run contract evaluation - should pass
      const evalRes = await evaluateRepoContract(dir, contract)
      if (!evalRes.passed) {
        console.log('Contract failures:', JSON.stringify(evalRes.failures, null, 2))
      }
      expect(evalRes.passed).toBe(true)

      // Verify config.yaml still has document separators
      const yamlContent = await fs.readFile(configYaml, 'utf8')
      expect(yamlContent).toContain('---')
    })
  })
})
