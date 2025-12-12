'use client'

import type { PromptItem } from '@/lib/types/prompts'
import { getStarterPromptsWithTimestamps } from '@/lib/data/starterPrompts'

const PROMPT_STORAGE_KEY = 'ai-toolbox-prompt-library'

function nowIso(): string {
  return new Date().toISOString()
}

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function normalizePrompt(prompt: Partial<PromptItem>): PromptItem {
  const now = nowIso()
  return {
    id: prompt.id || uid(),
    title: prompt.title || 'New Prompt',
    template: prompt.template || '',
    createdAt: prompt.createdAt || now,
    updatedAt: prompt.updatedAt || now,
    category: prompt.category || '',
    context: prompt.context || '',
    description: prompt.description || '',
    tags: prompt.tags || [],
    role: prompt.role || 'system',
    style: prompt.style || '',
    variables: prompt.variables || [],
    fewShot: prompt.fewShot || [],
    outputFormat: prompt.outputFormat || '',
    stop: prompt.stop || [],
    temperature: prompt.temperature ?? 0.2,
    top_p: prompt.top_p ?? 1.0,
    ...prompt,
  }
}

export async function fetchPromptLibrary(): Promise<PromptItem[]> {
  if (typeof localStorage === 'undefined') return []

  const raw = localStorage.getItem(PROMPT_STORAGE_KEY)

  // If no prompts exist, initialize with starter prompts
  if (!raw) {
    const starterPrompts = getStarterPromptsWithTimestamps()
    await persistPromptLibrary(starterPrompts)
    return starterPrompts
  }

  try {
    const data = JSON.parse(raw) as Partial<PromptItem>[]
    const prompts = Array.isArray(data) ? data.map(normalizePrompt) : []

    // If library is empty, add starter prompts
    if (prompts.length === 0) {
      const starterPrompts = getStarterPromptsWithTimestamps()
      await persistPromptLibrary(starterPrompts)
      return starterPrompts
    }

    return prompts
  } catch {
    // On error, return starter prompts
    const starterPrompts = getStarterPromptsWithTimestamps()
    await persistPromptLibrary(starterPrompts)
    return starterPrompts
  }
}

export async function persistPromptLibrary(prompts: PromptItem[]): Promise<void> {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(PROMPT_STORAGE_KEY, JSON.stringify(prompts))
}
