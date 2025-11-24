'use client'

import type { AgentInstruction } from '@/lib/types/agents'

const AGENT_STORAGE_KEY = 'ai-toolbox-agent-library'

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

export async function fetchAgentLibrary(): Promise<AgentInstruction[]> {
  if (typeof localStorage === 'undefined') return []
  const raw = localStorage.getItem(AGENT_STORAGE_KEY)
  if (!raw) return []
  try {
    const data = JSON.parse(raw) as Partial<AgentInstruction>[]
    return Array.isArray(data) ? data.map(normalizeAgent) : []
  } catch {
    return []
  }
}

export async function persistAgentLibrary(agents: AgentInstruction[]): Promise<void> {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(AGENT_STORAGE_KEY, JSON.stringify(agents))
}
