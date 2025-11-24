import agentsA from '../data/agents.json'
import agentsB from '../data/agents2.json'

export interface AgentDefinition {
  name: string
  role?: string
  prompt?: string
  description?: string
  meta?: Record<string, unknown>
}

type AgentSource = { Agents?: AgentDefinition[] }

const STORAGE_KEY = 'agent.library.v1'

const normalize = (agent: AgentDefinition, index: number): AgentDefinition => ({
  name: agent.name || `Agent ${index + 1}`,
  role: agent.role || 'system',
  prompt: agent.prompt || agent.description || '',
  description: agent.description || '',
  meta: agent.meta || {},
})

const baseAgents = (() => {
  const fromA = (agentsA as AgentSource).Agents || []
  const fromB = (agentsB as AgentSource).Agents || []
  return [...fromA, ...fromB].map((a, i) => normalize(a, i))
})()

function loadSaved(): AgentDefinition[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.map((a, i) => normalize(a as AgentDefinition, i))
      : []
  } catch {
    return []
  }
}

function saveAgents(agents: AgentDefinition[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(agents))
}

function mergeAgents(): AgentDefinition[] {
  const saved = loadSaved()
  const byName = new Map<string, AgentDefinition>()
  const put = (a: AgentDefinition) => {
    if (!a.name) return
    byName.set(a.name.toLowerCase(), a)
  }
  baseAgents.forEach(put)
  saved.forEach(put)
  return Array.from(byName.values())
}

export function listAgents(): AgentDefinition[] {
  return mergeAgents()
}

export function upsertAgent(agent: AgentDefinition): AgentDefinition[] {
  const normalized = normalize(agent, 0)
  const agents = mergeAgents()
  const idx = agents.findIndex((a) => a.name.toLowerCase() === normalized.name.toLowerCase())
  if (idx >= 0) {
    agents[idx] = { ...agents[idx], ...normalized }
  } else {
    agents.unshift(normalized)
  }
  // Only persist user modifications (not bundled). Save full list minus base duplicates.
  const baseNames = new Set(baseAgents.map((a) => a.name.toLowerCase()))
  const custom = agents.filter((a) => !baseNames.has(a.name.toLowerCase()))
  saveAgents(custom)
  return mergeAgents()
}

export function deleteAgent(name: string): AgentDefinition[] {
  const agents = mergeAgents().filter((a) => a.name.toLowerCase() !== name.toLowerCase())
  const baseNames = new Set(baseAgents.map((a) => a.name.toLowerCase()))
  const custom = agents.filter((a) => !baseNames.has(a.name.toLowerCase()))
  saveAgents(custom)
  return mergeAgents()
}
