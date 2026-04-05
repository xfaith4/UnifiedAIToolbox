'use client'

import type { AgentInstruction } from '@/lib/types/agents'
import type { PromptItem } from '@/lib/types/prompts'
import type { Proposal } from '@/lib/types/proposal'
import type { Recipe } from '@/lib/types/recipes'

const RECIPES_KEY = 'ai-toolbox-recipes.v1'

function nowIso(): string {
  return new Date().toISOString()
}

function load<T>(key: string): T[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

function save<T>(key: string, items: T[]): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, JSON.stringify(items))
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  )
}

export function listRecipes(): Recipe[] {
  return load<Recipe>(RECIPES_KEY)
}

export function getRecipe(id: string): Recipe | undefined {
  return listRecipes().find((recipe) => recipe.id === id)
}

export function saveRecipe(recipe: Recipe): Recipe {
  const existing = listRecipes()
  const idx = existing.findIndex((item) => item.id === recipe.id)
  const updated =
    idx >= 0
      ? existing.map((item) => (item.id === recipe.id ? recipe : item))
      : [recipe, ...existing]
  save(RECIPES_KEY, updated)
  return recipe
}

export function createOrUpdateRecipeFromPrompt(prompt: PromptItem): Recipe {
  const current = getRecipe(`recipe_prompt_${prompt.id}`)
  const createdAt = current?.createdAt ?? nowIso()
  const recipe: Recipe = {
    recipe_version: '1.0',
    id: `recipe_prompt_${prompt.id}`,
    name: `${prompt.title} Recipe`,
    description:
      prompt.description ||
      prompt.context ||
      `Launch work using the prompt "${prompt.title}" as a reusable starting point.`,
    source: current?.source === 'mixed' ? 'mixed' : 'prompt',
    createdAt,
    updatedAt: nowIso(),
    promptIds: uniqueStrings([prompt.id, ...(current?.promptIds ?? [])]),
    promptTitles: uniqueStrings([prompt.title, ...(current?.promptTitles ?? [])]),
    agentIds: current?.agentIds ?? [],
    agentNames: current?.agentNames ?? [],
    tools: current?.tools ?? [],
    acceptanceChecks: current?.acceptanceChecks ?? [],
    suggestedGoal: current?.suggestedGoal || prompt.description || prompt.context || prompt.title,
    suggestedMode: current?.suggestedMode ?? 'multi-agent',
    suggestedJobType: current?.suggestedJobType,
  }
  return saveRecipe(recipe)
}

export function createOrUpdateRecipeFromAgent(agent: AgentInstruction): Recipe {
  const current = getRecipe(`recipe_agent_${agent.id}`)
  const createdAt = current?.createdAt ?? nowIso()
  const recipe: Recipe = {
    recipe_version: '1.0',
    id: `recipe_agent_${agent.id}`,
    name: `${agent.name} Recipe`,
    description:
      agent.mission ||
      agent.purpose ||
      `Launch work using the agent "${agent.name}" as part of a reusable cast.`,
    source: current?.source === 'mixed' ? 'mixed' : 'agent',
    createdAt,
    updatedAt: nowIso(),
    promptIds: current?.promptIds ?? [],
    promptTitles: current?.promptTitles ?? [],
    agentIds: uniqueStrings([agent.id, ...(current?.agentIds ?? [])]),
    agentNames: uniqueStrings([agent.name, ...(current?.agentNames ?? [])]),
    tools: uniqueStrings([...(agent.tools ?? []), ...(current?.tools ?? [])]),
    acceptanceChecks: current?.acceptanceChecks ?? [],
    suggestedGoal: current?.suggestedGoal || agent.mission || agent.purpose || agent.name,
    suggestedMode: current?.suggestedMode ?? 'multi-agent',
    suggestedJobType: current?.suggestedJobType,
  }
  return saveRecipe(recipe)
}

export function buildRecipeContextPrompt(recipe: Recipe): string {
  const lines = [
    '',
    'Recipe context for this proposal:',
    `- recipe_name: ${recipe.name}`,
    `- recipe_description: ${recipe.description}`,
    recipe.promptTitles.length > 0 ? `- preferred_prompts: ${recipe.promptTitles.join(', ')}` : null,
    recipe.agentNames.length > 0 ? `- preferred_agents: ${recipe.agentNames.join(', ')}` : null,
    recipe.tools.length > 0 ? `- preferred_tools: ${recipe.tools.join(', ')}` : null,
    recipe.acceptanceChecks.length > 0
      ? `- preferred_acceptance_checks: ${recipe.acceptanceChecks.join('; ')}`
      : null,
    recipe.suggestedGoal ? `- suggested_goal: ${recipe.suggestedGoal}` : null,
    recipe.suggestedMode ? `- suggested_mode: ${recipe.suggestedMode}` : null,
    recipe.suggestedJobType ? `- suggested_job_type: ${recipe.suggestedJobType}` : null,
    'Use this recipe as a strong default when generating the proposal, recommended assets, and run_recipe.',
  ]

  return lines.filter(Boolean).join('\n')
}

export function applyRecipeToProposal(proposal: Proposal, recipe: Recipe): Proposal {
  const nextPrompts = uniqueStrings([...proposal.recommended.prompts, ...recipe.promptTitles])
  const nextAgents = uniqueStrings([...proposal.recommended.agents, ...recipe.agentNames])
  const nextTools = uniqueStrings([...proposal.recommended.tools, ...recipe.tools])
  const nextAcceptanceChecks = uniqueStrings([
    ...proposal.acceptance_checks,
    ...recipe.acceptanceChecks,
  ])

  return {
    ...proposal,
    updatedAt: nowIso(),
    recommended: {
      ...proposal.recommended,
      prompts: nextPrompts,
      agents: nextAgents,
      tools: nextTools,
    },
    acceptance_checks: nextAcceptanceChecks,
    run_recipe: {
      goal: proposal.run_recipe?.goal ?? recipe.suggestedGoal ?? proposal.goal.summary,
      mode: proposal.run_recipe?.mode ?? recipe.suggestedMode ?? 'multi-agent',
      agents:
        proposal.run_recipe?.agents && proposal.run_recipe.agents.length > 0
          ? proposal.run_recipe.agents
          : nextAgents,
      promptId: proposal.run_recipe?.promptId ?? recipe.promptIds[0],
      jobType: proposal.run_recipe?.jobType ?? recipe.suggestedJobType,
    },
  }
}
