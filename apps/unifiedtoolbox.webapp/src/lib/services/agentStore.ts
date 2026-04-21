'use client'

import type { AgentInstruction } from '@/lib/types/agents'

const AGENT_STORAGE_KEY = 'ai-toolbox-agent-library'
const LEGACY_AGENT_PROMPT_OVERRIDES_KEY = 'agentPromptOverrides'

function nowIso(): string {
  return new Date().toISOString()
}

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
}

function deriveAgentId(agent: Partial<AgentInstruction>): string {
  if (typeof agent.id === 'string' && agent.id.trim()) return agent.id.trim()
  const normalizedName = typeof agent.name === 'string' ? agent.name.trim().toLowerCase() : ''
  if (normalizedName) {
    const slug = normalizedName.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    if (slug) return `local-agent-${slug}`
  }
  return uid()
}

export function normalizeAgent(agent: Partial<AgentInstruction>): AgentInstruction {
  const now = nowIso()
  return {
    ...agent,
    id: deriveAgentId(agent),
    name: normalizeString(agent.name) || 'New Agent',
    purpose: normalizeString(agent.purpose) || '',
    mission: normalizeString(agent.mission) || '',
    status: agent.status || 'draft',
    role: normalizeString(agent.role),
    prompt: typeof agent.prompt === 'string' ? agent.prompt : undefined,
    promptOverride:
      agent.promptOverride == null
        ? null
        : typeof agent.promptOverride === 'string'
          ? agent.promptOverride
          : null,
    tags: normalizeStringList(agent.tags),
    triggers: normalizeStringList(agent.triggers),
    inputs: normalizeStringList(agent.inputs),
    outputs: normalizeStringList(agent.outputs),
    tools: normalizeStringList(agent.tools),
    playbook: normalizeStringList(agent.playbook),
    owner: normalizeString(agent.owner),
    handoff: typeof agent.handoff === 'string' ? agent.handoff : undefined,
    notes: typeof agent.notes === 'string' ? agent.notes : undefined,
    createdAt: agent.createdAt || now,
    updatedAt: agent.updatedAt || now,
  }
}

function loadLegacyPromptOverrides(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(LEGACY_AGENT_PROMPT_OVERRIDES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, string>
    return parsed ?? {}
  } catch {
    return {}
  }
}

function migrateLegacyPromptOverrides(agents: AgentInstruction[]): AgentInstruction[] {
  if (typeof localStorage === 'undefined') return agents
  const overrides = loadLegacyPromptOverrides()
  const entries = Object.entries(overrides).filter(([, prompt]) => typeof prompt === 'string' && prompt.length > 0)
  if (entries.length === 0) return agents

  const migrated = agents.map((agent) => {
    const promptOverride = overrides[agent.id]
    if (!promptOverride || agent.promptOverride) return agent
    return {
      ...agent,
      promptOverride,
      updatedAt: agent.updatedAt || nowIso(),
    }
  })
  localStorage.removeItem(LEGACY_AGENT_PROMPT_OVERRIDES_KEY)
  return migrated
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
  const defaults = migrateLegacyPromptOverrides(await fetchDefaultAgents(options?.signal))

  if (local && local.length > 0) {
    if (defaults.length === 0) {
      const migratedLocal = migrateLegacyPromptOverrides(local)
      saveToLocalStorage(migratedLocal)
      return migratedLocal
    }
    const merged = migrateLegacyPromptOverrides(mergeAgentLibraries(local, defaults))
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
