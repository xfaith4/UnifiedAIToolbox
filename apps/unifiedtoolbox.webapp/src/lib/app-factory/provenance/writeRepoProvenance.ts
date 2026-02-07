import { promises as fs } from 'fs'
import path from 'path'
import type { RepoContract } from '../contracts/RepoContract'

type AppFactoryMetadata = {
  schema_version: string
  factory: { name: string; version: string }
  created_at: string
  created_by: string
  run_id: string
  repo: { full_name: string; default_branch: string }
  classification: {
    topic_tag: string
    job_type: string
    contract_universe: string
    contract_version: string
    pipeline_id: string
    topics: string[]
  }
  contracts: {
    common: string
    job: string
    pipeline: string
  }
  artifact_policy_id: string
  events: Array<{ type: string; timestamp: string; actor: string; note: string }>
}

const DEFAULT_FACTORY_NAME = 'AppFactory'

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getEnv(name: string): string | undefined {
  const value = process.env[name]
  return value && value.trim() ? value.trim() : undefined
}

function getFactoryVersion(): string {
  return getEnv('APP_FACTORY_VERSION') || getEnv('NEXT_PUBLIC_APP_FACTORY_VERSION') || 'unknown'
}

function getCreatedBy(): string {
  return getEnv('APP_FACTORY_CREATED_BY') || getEnv('USERNAME') || getEnv('USER') || 'unknown'
}

export async function writeAppFactoryMetadata(options: {
  repoDir: string
  runId: string
  contract: RepoContract
  jobType?: string
  contractUniverse?: string
  contractVersion?: string
  pipelineId?: string
}): Promise<{ path: string; metadata: AppFactoryMetadata }> {
  const now = new Date().toISOString()
  const stackSlug = slugify(options.contract.stackId || 'app') || 'app'
  const topicTag = `appfactory-topic-${stackSlug}`

  const contractUniverse = options.contractUniverse || 'build_app'
  const contractVersion = options.contractVersion || 'build_app_contract.v1'
  const pipelineId = options.pipelineId || 'pipeline_build_app.v1'
  const jobType = options.jobType || 'build_app'

  const topics = [
    'appfactory',
    'appfactory-managed',
    topicTag,
    `appfactory-contract-universe-${contractUniverse}`,
    `appfactory-contract-${contractVersion}`,
    `appfactory-pipeline-${pipelineId}`,
  ]
  // TODO: App Factory GitHub repo creation flow should call the GitHub API to set these topics.
  // This pipeline only writes metadata because it does not create/publish the repo.

  const repoFullName = getEnv('APP_FACTORY_REPO_FULL_NAME') || `local/${stackSlug}`
  const defaultBranch = getEnv('APP_FACTORY_DEFAULT_BRANCH') || 'main'

  const metadataPath = path.join(options.repoDir, '.appfactory', 'metadata.json')
  let existingEvents: AppFactoryMetadata['events'] = []
  try {
    const existingRaw = await fs.readFile(metadataPath, 'utf8')
    const existing = JSON.parse(existingRaw) as Partial<AppFactoryMetadata>
    if (Array.isArray(existing.events)) {
      existingEvents = existing.events.filter(Boolean) as AppFactoryMetadata['events']
    }
  } catch {
    // no existing metadata
  }

  const events = [...existingEvents]
  if (!events.some((event) => event && event.type === 'repo_created')) {
    events.push({
      type: 'repo_created',
      timestamp: now,
      actor: getCreatedBy(),
      note: 'App Factory scaffolded this repository.',
    })
  }

  const metadata: AppFactoryMetadata = {
    schema_version: '1.0',
    factory: { name: DEFAULT_FACTORY_NAME, version: getFactoryVersion() },
    created_at: now,
    created_by: getCreatedBy(),
    run_id: options.runId,
    repo: { full_name: repoFullName, default_branch: defaultBranch },
    classification: {
      topic_tag: topicTag,
      job_type: jobType,
      contract_universe: contractUniverse,
      contract_version: contractVersion,
      pipeline_id: pipelineId,
      topics,
    },
    contracts: {
      common: 'contracts/common_run_contract.v1.json',
      job: `contracts/${contractVersion}.json`.replace('.json.json', '.json'),
      pipeline: `pipelines/${pipelineId}.json`.replace('.json.json', '.json'),
    },
    artifact_policy_id: 'build_new_app.standard',
    events,
  }

  await fs.mkdir(path.dirname(metadataPath), { recursive: true })
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2) + '\n', 'utf8')
  return { path: metadataPath, metadata }
}
