'use client'

import type { AgentInstruction } from '@/lib/types/agents'

const AGENT_STORAGE_KEY = 'ai-toolbox-agent-library'
const AGENT_PROMPT_OVERRIDES_KEY = 'agentPromptOverrides'

function nowIso(): string {
  return new Date().toISOString()
}

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function normalizeAgent(agent: Partial<AgentInstruction>): AgentInstruction {
  const now = nowIso()
  return {
    id: agent.id || uid(),
    name: agent.name || 'New Agent',
    purpose: agent.purpose || '',
    mission: agent.mission || '',
    status: agent.status || 'draft',
    tags: agent.tags || [],
    triggers: agent.triggers || [],
    inputs: agent.inputs || [],
    outputs: agent.outputs || [],
    tools: agent.tools || [],
    playbook: agent.playbook || [],
    owner: agent.owner,
    handoff: agent.handoff,
    notes: agent.notes,
    createdAt: agent.createdAt || now,
    updatedAt: agent.updatedAt || now,
    ...agent,
  }
}

async function fetchDefaultAgents(signal?: AbortSignal): Promise<AgentInstruction[]> {
  if (typeof fetch === 'undefined') return []
  try {
    const resp = await fetch('/api/agents', { signal })
    if (!resp.ok) return []
    const payload = (await resp.json()) as Partial<AgentInstruction>[]
    if (!Array.isArray(payload)) return []
    return payload.map(normalizeAgent)
  } catch {
    return []
  }
}

function saveToLocalStorage(agents: AgentInstruction[]) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(AGENT_STORAGE_KEY, JSON.stringify(agents))
}

async function loadFromLocalStorage(): Promise<AgentInstruction[] | null> {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(AGENT_STORAGE_KEY)
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as Partial<AgentInstruction>[]
    if (!Array.isArray(data)) return null
    return data.map(normalizeAgent)
  } catch {
    return null
  }
}

function mergeAgentLibraries(local: AgentInstruction[], defaults: AgentInstruction[]): AgentInstruction[] {
  const byId = new Map<string, AgentInstruction>()

  for (const agent of defaults) {
    byId.set(agent.id, agent)
  }

  // Keep local edits authoritative for matching IDs while still appending newly introduced defaults.
  for (const agent of local) {
    byId.set(agent.id, agent)
  }

  return Array.from(byId.values())
}

export async function fetchAgentLibrary(options?: { signal?: AbortSignal }): Promise<AgentInstruction[]> {
  const local = await loadFromLocalStorage()
  const defaults = await fetchDefaultAgents(options?.signal)

  if (local && local.length > 0) {
    if (defaults.length === 0) {
      return local
    }
    const merged = mergeAgentLibraries(local, defaults)
    saveToLocalStorage(merged)
    return merged
  }

  if (defaults.length > 0) {
    saveToLocalStorage(defaults)
  }
  return defaults
}

export async function persistAgentLibrary(agents: AgentInstruction[]): Promise<void> {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(AGENT_STORAGE_KEY, JSON.stringify(agents))
}

export function loadPromptOverrides(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(AGENT_PROMPT_OVERRIDES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, string>
    return parsed ?? {}
  } catch {
    return {}
  }
}

export function persistPromptOverride(agentId: string, prompt: string | null): void {
  if (typeof localStorage === 'undefined') return
  const existing = loadPromptOverrides()
  if (!prompt) {
    delete existing[agentId]
  } else {
    existing[agentId] = prompt
  }
  localStorage.setItem(AGENT_PROMPT_OVERRIDES_KEY, JSON.stringify(existing))
}
