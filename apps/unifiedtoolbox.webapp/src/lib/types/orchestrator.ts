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
  runMode?: 'default' | 'codex-swarm' | 'multi-agent'
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
  runMode: 'default' | 'codex-swarm' | 'multi-agent'
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

