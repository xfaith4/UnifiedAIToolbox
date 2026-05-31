import { promises as fs } from 'fs'
import path from 'path'
import type { RepoContract } from '../contracts/RepoContract'
import { getGitHubConfigFromEnv, setRepositoryTopics, type GitHubTopicConfig } from './githubTopicService'

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
  /** Optional GitHub configuration for setting repository topics via API */
  githubConfig?: GitHubTopicConfig | null
  /** If true, automatically detect GitHub config from environment variables */
  autoDetectGitHub?: boolean
}): Promise<{ path: string; metadata: AppFactoryMetadata; githubTopicsSet?: boolean }> {
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
  
  // GitHub API Integration: Set repository topics via GitHub API when credentials available
  // 
  // This implements the TODO from the audit (lines 77-78 in original code).
  // The integration is OPTIONAL and gracefully degrades when:
  // - No GitHub configuration is provided
  // - Environment variables are not set
  // - GitHub API call fails
  //
  // Behavior:
  // 1. If githubConfig is explicitly provided, use it
  // 2. If autoDetectGitHub is true, try to load config from environment
  // 3. If config available, attempt to set topics via GitHub API
  // 4. Always write local metadata regardless of GitHub API success
  //
  // Environment variables (optional):
  // - GITHUB_TOKEN or GITHUB_PAT: Personal access token with repo scope
  // - GITHUB_REPO_OWNER or APP_FACTORY_REPO_OWNER: Repository owner
  // - GITHUB_REPO_NAME or APP_FACTORY_REPO_NAME: Repository name
  let githubTopicsSet = false
  const githubConfig = options.githubConfig ?? (options.autoDetectGitHub ? getGitHubConfigFromEnv() : null)
  
  if (githubConfig) {
    const result = await setRepositoryTopics(githubConfig, topics)
    if (result.success) {
      githubTopicsSet = true
      // Note: Topics might be normalized by GitHub API
      console.log(`[AppFactory] GitHub topics set for ${githubConfig.owner}/${githubConfig.repo}:`, result.topics)
    } else if (!result.skipped) {
      // Log warning but continue - local metadata writing is more important
      console.warn(`[AppFactory] Failed to set GitHub topics: ${result.error}`)
    }
  }

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
  // Report a POSIX-style path so provenance output is stable across platforms.
  // Filesystem access above uses the native metadataPath; the returned path is
  // informational (logging/metadata), so normalizing separators is safe.
  return { path: metadataPath.replace(/\\/g, '/'), metadata, githubTopicsSet }
}
