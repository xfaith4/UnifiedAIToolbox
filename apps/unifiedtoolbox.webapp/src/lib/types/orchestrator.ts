import type { AgentInstruction } from './agents'
import type { PromptItem } from './prompts'

export interface OrchestrationRun {
  id: string
  agent: AgentInstruction
  prompt: PromptItem
  inputs: Record<string, string>
  output: string
  tokens?: {
    prompt?: number
    completion?: number
    total?: number
  }
  startedAt: string
  completedAt: string
}
