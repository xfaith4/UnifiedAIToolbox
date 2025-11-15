'use client'

import type { AgentInstruction } from '@/lib/types/agents'
import { nowIso, uid } from '@/lib/utils'

const AGENT_STORAGE_KEY = 'ai-toolbox-agent-library'

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
    createdAt: agent.createdAt || now,
    updatedAt: agent.updatedAt || now,
    ...agent,
  }
}

export async function fetchAgentLibrary(): Promise<AgentInstruction[]> {
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
  localStorage.setItem(AGENT_STORAGE_KEY, JSON.stringify(agents))
}
