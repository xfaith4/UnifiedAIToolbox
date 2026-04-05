export type RecipeSource = 'prompt' | 'agent' | 'mixed' | 'manual' | 'run'

export interface Recipe {
  recipe_version: '1.0'
  id: string
  name: string
  description: string
  source: RecipeSource
  createdAt: string
  updatedAt: string
  promptIds: string[]
  promptTitles: string[]
  agentIds: string[]
  agentNames: string[]
  tools: string[]
  acceptanceChecks: string[]
  suggestedGoal?: string
  suggestedMode?: 'multi-agent' | 'codex-swarm'
  suggestedJobType?: 'build_new_app' | 'maintain_existing_app'
}
