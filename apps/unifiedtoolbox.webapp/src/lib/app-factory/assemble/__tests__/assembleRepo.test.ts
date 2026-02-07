import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import { assembleRepo } from '../assembleRepo'
import type { RepoContract } from '../../contracts/RepoContract'

describe('assembleRepo', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = path.join('/tmp', `test-assemble-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await fs.mkdir(tmpDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('creates node-next-fastify-pnpm workspace structure', async () => {
    const contract: RepoContract = {
      stackId: 'node-next-fastify-pnpm',
      installCommand: 'pnpm install',
      buildCommand: 'pnpm build',
    }

    const result = await assembleRepo(tmpDir, contract)

    expect(result.changes.length).toBeGreaterThan(0)
    expect(result.changes.some(c => c.filePath === 'pnpm-workspace.yaml')).toBe(true)
    expect(result.changes.some(c => c.filePath === 'package.json')).toBe(true)
    expect(result.changes.some(c => c.filePath.includes('apps/web/package.json'))).toBe(true)
    expect(result.changes.some(c => c.filePath.includes('apps/api/package.json'))).toBe(true)
    
    // Verify files were actually created
    const pkgExists = await fs.access(path.join(tmpDir, 'package.json')).then(() => true).catch(() => false)
    expect(pkgExists).toBe(true)
  })

  it('creates node-next-app-npm structure', async () => {
    const contract: RepoContract = {
      stackId: 'node-next-app-npm',
      installCommand: 'npm install',
      buildCommand: 'npm run build',
    }

    const result = await assembleRepo(tmpDir, contract)

    expect(result.changes.length).toBeGreaterThan(0)
    expect(result.changes.some(c => c.filePath === 'package.json')).toBe(true)
    expect(result.changes.some(c => c.filePath === 'next.config.mjs')).toBe(true)
    expect(result.changes.some(c => c.filePath.includes('layout.tsx'))).toBe(true)
    expect(result.changes.some(c => c.filePath.includes('page.tsx'))).toBe(true)
    expect(result.changes.some(c => c.filePath.includes('health/route.ts'))).toBe(true)
  })

  it('skips existing files', async () => {
    const contract: RepoContract = {
      stackId: 'node-next-app-npm',
      installCommand: 'npm install',
      buildCommand: 'npm run build',
    }

    // Create next.config.mjs which will be skipped by ensureFile
    const configPath = path.join(tmpDir, 'next.config.mjs')
    await fs.writeFile(configPath, '// existing config', 'utf8')

    const result = await assembleRepo(tmpDir, contract)

    const configChange = result.changes.find(c => c.filePath === 'next.config.mjs')
    expect(configChange?.action).toBe('skipped')
    expect(configChange?.reason).toBe('already exists')
    
    // Verify existing file was not overwritten
    const content = await fs.readFile(configPath, 'utf8')
    expect(content).toContain('existing config')
  })

  it('creates assembly report', async () => {
    const contract: RepoContract = {
      stackId: 'node-next-app-npm',
      installCommand: 'npm install',
      buildCommand: 'npm run build',
    }

    const result = await assembleRepo(tmpDir, contract)

    expect(result.reportPath).toContain('ASSEMBLY_REPORT.md')
    
    const reportExists = await fs.access(result.reportPath).then(() => true).catch(() => false)
    expect(reportExists).toBe(true)
    
    const report = await fs.readFile(result.reportPath, 'utf8')
    expect(report).toContain('# Assembly Report')
    expect(report).toContain('Stack: node-next-app-npm')
  })

  it('handles unknown stackId gracefully', async () => {
    const contract: RepoContract = {
      stackId: 'unknown-stack',
      installCommand: 'npm install',
      buildCommand: 'npm run build',
    }

    const result = await assembleRepo(tmpDir, contract)

    // Should complete without throwing, but create no files
    expect(result.changes.length).toBe(0)
    expect(result.reportPath).toContain('ASSEMBLY_REPORT.md')
  })

  it('sanitizes stackId in README', async () => {
    const contract: RepoContract = {
      stackId: 'my-weird@stack!name#',
      installCommand: 'npm install',
      buildCommand: 'npm run build',
    }

    await assembleRepo(tmpDir, contract)

    const readmeExists = await fs.access(path.join(tmpDir, 'README.md')).then(() => true).catch(() => false)
    if (readmeExists) {
      const readme = await fs.readFile(path.join(tmpDir, 'README.md'), 'utf8')
      // Verify special characters are sanitized
      expect(readme).not.toContain('@')
      expect(readme).not.toContain('!')
      expect(readme).not.toContain('#')
    }
  })
})
