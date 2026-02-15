import type { AgentInstruction } from './agents'
import type { PromptItem } from './prompts'

/**
 * Event in an orchestration run's timeline
 */
export interface OrchestrationRunEvent {
  timestamp: string
  type: 'status' | 'info' | 'warn' | 'error' | string
  message: string
}

/**
 * Orchestration run representing either a simple single-agent run
 * or a complex multi-agent collaboration
 */
export interface OrchestrationRun {
  id: string
  
  // Goal-based orchestration (multi-agent)
  goal?: string
  agents?: string[]  // Agent names participating
  runMode?: 'default' | 'multi-agent'
  mode?: 'executed' | 'simulated'
  
  // Status and timing
  status?: string
  requestedAt?: string
  startedAt?: string
  completedAt?: string
  events?: OrchestrationRunEvent[]
  
  // Optional prompt binding
  promptId?: string
  version?: string
  reviewPolicy?: string
  
  // Dataset integration
  datasetId?: string
  datasetName?: string
  
  // Execution context
  model?: string
  repoRoot?: string
  notes?: string
  
  // Output
  output?: string
  tokens?: {
    prompt?: number
    completion?: number
    total?: number
  }
  
  // Legacy fields for backward compatibility with simple runs
  agent?: AgentInstruction
  prompt?: PromptItem
  inputs?: Record<string, string>
}

/**
 * Form state for launching a new orchestration
 */
export interface OrchestrationForm {
  goal: string
  promptId?: string
  version?: string
  reviewPolicy: string
  datasetId?: string
  datasetName?: string
  runMode: 'default' | 'multi-agent'
  agents: string[]
  model?: string
}

/**
 * Agent definition for the multi-agent orchestrator
 */
export interface OrchestratorAgent {
  name: string
  role?: string
  prompt?: string
  description?: string
  meta?: Record<string, unknown>
}

export interface RepoOrchestrationOptions {
  branch?: string
  base_branch?: string
  integration_branch?: string
  allowed_paths?: string[]
  max_parallel?: number
  risk_posture?: string
  github_token?: string
  model?: string
  pr_title?: string
  pr_body?: string
}

export interface RepoOrchestrationRequest {
  repo: string
  goal: string
  options?: RepoOrchestrationOptions
}

export interface RepoOrchestrationResult {
  runId?: string
  run_id?: string
  status?: string
  prUrl?: string
  pr_url?: string
  artifacts?: Record<string, unknown>
  artifacts_index?: Array<{
    artifactId?: string
    fileName?: string
    filePath?: string
    mimeType?: string
    size?: number
    createdAt?: string
  }>
  cancelled?: boolean
}

export interface RepoOrchestrationEvent {
  run_id?: string
  type?: string
  message?: string
  progress?: Record<string, unknown>
  task_id?: string
  log_line?: string
  result?: RepoOrchestrationResult
  final?: boolean
  [key: string]: unknown
}

export type RepoReportOutcome = 'changes_applied' | 'no_changes_by_design' | 'blocked' | 'failed'

export interface RepoReportCommand {
  name?: string
  cmd?: string | null
  exit_code?: number | null
  log_artifact?: string | null
}

export interface RepoReportFindingsItem {
  path?: string
  line?: number
  kind?: string
  note?: string
}

export interface RepoOrchestrationReport {
  schema_version: string
  run_id: string
  repo: {
    url?: string
    branch?: string
    commit_before?: string | null
    commit_after?: string | null
  }
  outcome: RepoReportOutcome
  summary: {
    headline?: string
    what_happened?: string[]
    next_actions?: string[]
  }
  verification?: {
    commands?: RepoReportCommand[]
  }
  changes?: {
    files_changed?: string[]
    patch_artifact?: string | null
  }
  findings?: {
    todo_count?: number
    placeholder_count?: number
    high_risk_items?: RepoReportFindingsItem[]
    findings_artifact?: string | null
  }
  blockers?: Array<{
    code?: string
    message?: string
    suggested_fix?: string | null
  }>
  artifacts?: {
    report_md?: string
    verification_md?: string | null
    verification_json?: string | null
  }
}

export interface RepoRunReportSummary {
  outcome?: RepoReportOutcome | string
  headline?: string
  patch?: boolean
  commandsExecuted?: number
}

export interface RepoOrchestrationRunSummary {
  runId: string
  repo?: string
  branch?: string
  status?: string
  requestedAt?: string
  reportSummary?: RepoRunReportSummary | null
}

