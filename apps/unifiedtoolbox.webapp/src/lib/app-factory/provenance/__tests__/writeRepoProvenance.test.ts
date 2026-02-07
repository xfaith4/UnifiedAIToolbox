import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import { writeAppFactoryMetadata } from '../writeRepoProvenance'
import type { RepoContract } from '../../contracts/RepoContract'

describe('writeRepoProvenance', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = path.join('/tmp', `test-provenance-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await fs.mkdir(tmpDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('creates metadata.json with correct structure', async () => {
    const contract: RepoContract = {
      stackId: 'node-next-app-npm',
      installCommand: 'npm install',
      buildCommand: 'npm run build',
    }

    const result = await writeAppFactoryMetadata({
      repoDir: tmpDir,
      runId: 'test-run-123',
      contract,
    })

    expect(result.path).toContain('.appfactory/metadata.json')
    expect(result.metadata.schema_version).toBe('1.0')
    expect(result.metadata.run_id).toBe('test-run-123')
    expect(result.metadata.classification.topic_tag).toContain('appfactory-topic')
    expect(result.metadata.classification.topics).toContain('appfactory')
    expect(result.metadata.classification.topics).toContain('appfactory-managed')
  })

  it('writes metadata file to disk', async () => {
    const contract: RepoContract = {
      stackId: 'node-next-app-npm',
      installCommand: 'npm install',
      buildCommand: 'npm run build',
    }

    await writeAppFactoryMetadata({
      repoDir: tmpDir,
      runId: 'test-run-456',
      contract,
    })

    const metadataPath = path.join(tmpDir, '.appfactory', 'metadata.json')
    const exists = await fs.access(metadataPath).then(() => true).catch(() => false)
    expect(exists).toBe(true)

    const content = await fs.readFile(metadataPath, 'utf8')
    const metadata = JSON.parse(content)
    expect(metadata.run_id).toBe('test-run-456')
  })

  it('includes custom job type and contract parameters', async () => {
    const contract: RepoContract = {
      stackId: 'custom-stack',
      installCommand: 'pnpm install',
      buildCommand: 'pnpm build',
    }

    const result = await writeAppFactoryMetadata({
      repoDir: tmpDir,
      runId: 'test-run-789',
      contract,
      jobType: 'maintain_existing_app',
      contractUniverse: 'maintenance',
      contractVersion: 'v2.0',
      pipelineId: 'pipeline_maintain.v2',
    })

    expect(result.metadata.classification.job_type).toBe('maintain_existing_app')
    expect(result.metadata.classification.contract_universe).toBe('maintenance')
    expect(result.metadata.classification.contract_version).toBe('v2.0')
    expect(result.metadata.classification.pipeline_id).toBe('pipeline_maintain.v2')
  })

  it('preserves existing events when updating', async () => {
    const contract: RepoContract = {
      stackId: 'node-next-app-npm',
      installCommand: 'npm install',
      buildCommand: 'npm run build',
    }

    // Write initial metadata
    await writeAppFactoryMetadata({
      repoDir: tmpDir,
      runId: 'run-1',
      contract,
    })

    // Write updated metadata
    const result = await writeAppFactoryMetadata({
      repoDir: tmpDir,
      runId: 'run-2',
      contract,
    })

    // Should still have the initial repo_created event
    const createdEvents = result.metadata.events.filter(e => e.type === 'repo_created')
    expect(createdEvents.length).toBe(1)
  })

  it('generates topic tags based on stackId', async () => {
    const contract: RepoContract = {
      stackId: 'python-fastapi-postgres',
      installCommand: 'pip install',
      buildCommand: 'python -m build',
    }

    const result = await writeAppFactoryMetadata({
      repoDir: tmpDir,
      runId: 'test-run',
      contract,
    })

    expect(result.metadata.classification.topic_tag).toContain('python-fastapi-postgres')
    expect(result.metadata.classification.topics).toContain('appfactory-topic-python-fastapi-postgres')
  })

  it('includes contract references', async () => {
    const contract: RepoContract = {
      stackId: 'node-next-app-npm',
      installCommand: 'npm install',
      buildCommand: 'npm run build',
    }

    const result = await writeAppFactoryMetadata({
      repoDir: tmpDir,
      runId: 'test-run',
      contract,
      contractVersion: 'build_app_contract.v1',
      pipelineId: 'pipeline_build_app.v1',
    })

    expect(result.metadata.contracts.common).toBe('contracts/common_run_contract.v1.json')
    expect(result.metadata.contracts.job).toContain('build_app_contract.v1')
    expect(result.metadata.contracts.pipeline).toContain('pipeline_build_app.v1')
  })
})
