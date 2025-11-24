'use client'

import type { PromptItem } from '@/lib/types/prompts'

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
  if (!raw) return []
  try {
    const data = JSON.parse(raw) as Partial<PromptItem>[]
    return Array.isArray(data) ? data.map(normalizePrompt) : []
  } catch {
    return []
  }
}

export async function persistPromptLibrary(prompts: PromptItem[]): Promise<void> {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(PROMPT_STORAGE_KEY, JSON.stringify(prompts))
}
