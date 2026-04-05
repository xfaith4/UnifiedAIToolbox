import { beforeEach, describe, expect, it } from 'vitest'
import type { PromptItem } from '@/lib/types/prompts'
import type { AgentInstruction } from '@/lib/types/agents'
import type { Proposal } from '@/lib/types/proposal'

const storage: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => { storage[key] = value },
  removeItem: (key: string) => { delete storage[key] },
  clear: () => { for (const key in storage) delete storage[key] },
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })

import {
  applyRecipeToProposal,
  buildRecipeContextPrompt,
  createOrUpdateRecipeFromAgent,
  createOrUpdateRecipeFromPrompt,
  getRecipe,
  listRecipes,
} from '@/lib/services/recipeStore'

function makePrompt(overrides: Partial<PromptItem> = {}): PromptItem {
  const now = new Date().toISOString()
  return {
    id: 'prompt_1',
    title: 'API Debug Prompt',
    template: 'Debug the failing API.',
    createdAt: now,
    updatedAt: now,
    category: 'engineering',
    context: 'Backend service',
    description: 'Investigate and fix the API issue',
    tags: ['api'],
    role: 'system',
    style: '',
    variables: [],
    fewShot: [],
    outputFormat: '',
    stop: [],
    temperature: 0.2,
    top_p: 1,
    quality: undefined,
    refine: undefined,
    history: [],
    ...overrides,
  }
}

function makeAgent(overrides: Partial<AgentInstruction> = {}): AgentInstruction {
  const now = new Date().toISOString()
  return {
    id: 'agent_1',
    name: 'Engineer',
    purpose: 'Implement the fix',
    mission: 'Deliver the code change safely',
    status: 'ready',
    tags: ['engineering'],
    triggers: [],
    inputs: [],
    outputs: [],
    tools: ['read_file', 'write_file'],
    playbook: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  const now = new Date().toISOString()
  return {
    proposal_version: '1.0',
    id: 'proposal_1',
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    goal: { summary: 'Fix the API issue' },
    inputs: { repo: 'acme/api', files: [], constraints: [] },
    plan: { steps: [{ id: '1', title: 'Inspect', description: 'Review current state' }] },
    recommended: { prompts: [], agents: [], tools: [] },
    approvals: { required: [] },
    acceptance_checks: [],
    assumptions: [],
    confidence: undefined,
    risks: [],
    estimate: {},
    run_recipe: null,
    conversation: [],
    ...overrides,
  }
}

describe('recipeStore', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  it('creates and persists a prompt recipe with a stable id', () => {
    const recipe = createOrUpdateRecipeFromPrompt(makePrompt())
    expect(recipe.id).toBe('recipe_prompt_prompt_1')
    expect(recipe.promptIds).toEqual(['prompt_1'])
    expect(listRecipes()).toHaveLength(1)
    expect(getRecipe(recipe.id)?.name).toBe(recipe.name)
  })

  it('creates and persists an agent recipe with tools', () => {
    const recipe = createOrUpdateRecipeFromAgent(makeAgent())
    expect(recipe.id).toBe('recipe_agent_agent_1')
    expect(recipe.agentNames).toEqual(['Engineer'])
    expect(recipe.tools).toEqual(['read_file', 'write_file'])
  })

  it('applies recipe defaults into a proposal', () => {
    const promptRecipe = createOrUpdateRecipeFromPrompt(makePrompt())
    const applied = applyRecipeToProposal(makeProposal(), {
      ...promptRecipe,
      agentNames: ['Engineer'],
      tools: ['read_file'],
      acceptanceChecks: ['Build passes'],
      suggestedJobType: 'maintain_existing_app',
    })

    expect(applied.recommended.prompts).toContain('API Debug Prompt')
    expect(applied.recommended.agents).toContain('Engineer')
    expect(applied.acceptance_checks).toContain('Build passes')
    expect(applied.run_recipe?.promptId).toBe('prompt_1')
    expect(applied.run_recipe?.jobType).toBe('maintain_existing_app')
  })

  it('builds a system-prompt context block from a recipe', () => {
    const recipe = createOrUpdateRecipeFromAgent(makeAgent())
    const prompt = buildRecipeContextPrompt(recipe)
    expect(prompt).toContain('recipe_name')
    expect(prompt).toContain('preferred_agents')
    expect(prompt).toContain('preferred_tools')
  })
})
