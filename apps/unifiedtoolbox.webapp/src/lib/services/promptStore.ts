'use client'

import type {
  PromptHistoryEntry,
  PromptItem,
  PromptQuality,
  PromptRefine,
  PromptQualitySubscores,
} from '@/lib/types/prompts'
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
  const defaultSubscores: PromptQualitySubscores = {
    clarity: 0,
    constraints: 0,
    outputFormat: 0,
    examples: 0,
    safety: 0,
    reusability: 0,
  }

  const base: PromptItem = {
    id: prompt.id || uid(),
    title: prompt.title || 'New Prompt',
    template: prompt.template || '',
    createdAt: prompt.createdAt || now,
    updatedAt: prompt.updatedAt || now,
    version: prompt.version,
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
    quality: undefined,
    refine: undefined,
    history: [],
  }

  const normalizedQuality: PromptQuality = {
    overallScore: prompt.quality?.overallScore ?? 0,
    subscores: {
      ...defaultSubscores,
      ...prompt.quality?.subscores,
    },
    findings: prompt.quality?.findings ?? [],
    suggestions: prompt.quality?.suggestions ?? [],
    lastRatedAt: prompt.quality?.lastRatedAt ?? '',
    raterVersion: prompt.quality?.raterVersion ?? '',
  }

  const normalizedRefine: PromptRefine = {
    draftText: prompt.refine?.draftText ?? base.template,
    notes: prompt.refine?.notes ?? '',
    lastRefinedAt: prompt.refine?.lastRefinedAt ?? null,
  }

  const normalizedHistory: PromptHistoryEntry[] = Array.isArray(prompt.history)
    ? prompt.history
    : []

  return {
    ...base,
    quality: normalizedQuality,
    refine: normalizedRefine,
    history: normalizedHistory,
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
