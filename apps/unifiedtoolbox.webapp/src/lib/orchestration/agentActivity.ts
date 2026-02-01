import type { OrchestrationRunEvent } from '@/lib/types/orchestrator'

export type AgentActivitySnapshot = {
  totalAgents: number
  activeAgents: string[]
  byAgent: Record<string, { status: string; timestamp?: string }>
  countsByStatus: Record<string, number>
}

const ACTIVE_STATUSES = new Set(['working', 'running'])

export function computeAgentActivitySnapshot(
  events: OrchestrationRunEvent[] | undefined,
  roster: string[] | undefined
): AgentActivitySnapshot {
  const byAgent: Record<string, { status: string; timestamp?: string }> = {}

  for (const agent of roster ?? []) {
    if (!agent) continue
    byAgent[agent] = { status: 'pending' }
  }

  for (const ev of events ?? []) {
    if (!ev || typeof ev.type !== 'string') continue
    if (!ev.type.startsWith('agent:')) continue
    const agent = ev.type.slice('agent:'.length).trim()
    if (!agent) continue
    const status = typeof ev.message === 'string' && ev.message.trim() ? ev.message.trim() : 'unknown'
    byAgent[agent] = { status, timestamp: ev.timestamp }
  }

  const countsByStatus: Record<string, number> = {}
  const activeAgents: string[] = []

  for (const [agent, meta] of Object.entries(byAgent)) {
    const status = meta.status || 'unknown'
    countsByStatus[status] = (countsByStatus[status] ?? 0) + 1
    if (ACTIVE_STATUSES.has(status)) activeAgents.push(agent)
  }

  activeAgents.sort((a, b) => a.localeCompare(b))

  return {
    totalAgents: Object.keys(byAgent).length,
    activeAgents,
    byAgent,
    countsByStatus,
  }
}

