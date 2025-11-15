import starterAgents from '../../agent-library.starter.json'
import type { AgentInstruction, AgentStatus } from '../types/agents'
import { nowIso } from './promptStore'

const DB_KEY = 'agentlib.v1'
const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

const cleanList = (items?: string[]) =>
  Array.isArray(items)
    ? items
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    : []

const STARTER_AGENTS: AgentInstruction[] = Array.isArray(starterAgents)
  ? (starterAgents as AgentInstruction[]).map((agent) => normalizeAgent(agent))
  : []

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function normalizeAgent(raw: Partial<AgentInstruction>): AgentInstruction {
  const createdAt = raw.createdAt || nowIso()
  const updatedAt = raw.updatedAt || createdAt
  return {
    id: raw.id || uid(),
    name: raw.name?.trim() || 'New Agent',
    purpose: raw.purpose?.trim() || '',
    mission: raw.mission?.trim() || '',
    owner: raw.owner?.trim() || undefined,
    status: (raw.status as AgentStatus) || 'draft',
    triggers: cleanList(raw.triggers),
    inputs: cleanList(raw.inputs),
    outputs: cleanList(raw.outputs),
    tools: cleanList(raw.tools),
    playbook: cleanList(raw.playbook),
    handoff: raw.handoff?.trim() || undefined,
    notes: raw.notes?.trim() || undefined,
    tags: cleanList(raw.tags),
    createdAt,
    updatedAt,
  }
}

export function createAgentTemplate(): AgentInstruction {
  return normalizeAgent({
    name: 'New Agent',
    purpose: '',
    mission: '',
    status: 'draft',
    tags: [],
  })
}

function loadLocal(): AgentInstruction[] {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as AgentInstruction[]
    return Array.isArray(parsed)
      ? parsed.map((agent) => normalizeAgent(agent))
      : []
  } catch {
    return []
  }
}

function saveLocal(items: AgentInstruction[]) {
  localStorage.setItem(DB_KEY, JSON.stringify(items))
}

function ensureSeededLocal(): AgentInstruction[] {
  const existing = loadLocal()
  if (existing.length === 0 && STARTER_AGENTS.length > 0) {
    saveLocal(STARTER_AGENTS)
    return STARTER_AGENTS
  }
  return existing
}

export async function fetchAgentLibrary(): Promise<AgentInstruction[]> {
  if (!API_BASE) {
    return ensureSeededLocal()
  }

  try {
    const res = await fetch(`${API_BASE}/agents`, {
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) {
      throw new Error(`API responded with ${res.status}`)
    }
    const payload = await res.json()
    if (Array.isArray(payload)) {
      return payload.map((agent) => normalizeAgent(agent))
    }
    return ensureSeededLocal()
  } catch (error) {
    console.warn('[agentStore] Falling back to local cache:', error)
    return ensureSeededLocal()
  }
}

export async function persistAgentLibrary(items: AgentInstruction[]): Promise<void> {
  if (!API_BASE) {
    saveLocal(items)
    return
  }

  try {
    const res = await fetch(`${API_BASE}/agents:sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agents: items }),
    })
    if (!res.ok) {
      throw new Error(`Failed to sync agents (${res.status})`)
    }
  } catch (error) {
    console.warn('[agentStore] Sync failed; writing to local cache instead.', error)
    saveLocal(items)
  }
}
