'use client'

// ─────────────────────────────────────────────────────────────────────────────
// AgentCards — grid of one card per agent showing name, role, status, last
// event time, current task, output summary, blocker indicator.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AgentLifecycleStatus,
  ManifestAgent,
  ManifestBlocker,
} from '@/lib/app-factory/runs/manifest'
import { formatRelativeTime } from './formatters'
import EmptyState from './EmptyState'

const AGENT_STATUS_CONFIG: Record<AgentLifecycleStatus, { label: string; cls: string; dot: string }> = {
  pending:   { label: 'Pending',   cls: 'border-slate-700 bg-slate-900/40 text-slate-400', dot: 'bg-slate-500' },
  running:   { label: 'Running',   cls: 'border-blue-800 bg-blue-950/30 text-blue-200',    dot: 'bg-blue-400 animate-pulse' },
  blocked:   { label: 'Blocked',   cls: 'border-amber-800 bg-amber-950/30 text-amber-200', dot: 'bg-amber-400' },
  completed: { label: 'Completed', cls: 'border-emerald-800 bg-emerald-950/30 text-emerald-200', dot: 'bg-emerald-400' },
  failed:    { label: 'Failed',    cls: 'border-rose-800 bg-rose-950/30 text-rose-200',    dot: 'bg-rose-400' },
}

function statusLabel(s: AgentLifecycleStatus | undefined): { label: string; cls: string; dot: string } {
  if (!s) return AGENT_STATUS_CONFIG.pending
  return AGENT_STATUS_CONFIG[s] ?? AGENT_STATUS_CONFIG.pending
}

export interface AgentCardProps {
  agent: ManifestAgent
  activeAgent?: string | null
  blocker?: ManifestBlocker
  currentTask?: string | null
  outputSummary?: string | null
}

export function AgentCard({ agent, activeAgent, blocker, currentTask, outputSummary }: AgentCardProps) {
  const cfg = statusLabel(agent.status)
  const isActive = activeAgent === agent.name
  return (
    <div
      data-agent-name={agent.name}
      data-agent-status={agent.status}
      className={`rounded-xl border p-3 transition-colors ${isActive ? 'border-blue-700 bg-blue-950/20' : 'border-slate-800 bg-slate-900/40'}`}
    >
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dot}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="text-sm font-semibold text-slate-100 truncate">{agent.name}</h3>
            {agent.role && (
              <span className="text-[11px] text-slate-500 truncate">{agent.role}</span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${cfg.cls}`}>
              {cfg.label}
            </span>
            {agent.lastEventAt && (
              <span className="text-[10px] text-slate-500" title={agent.lastEventAt}>
                {formatRelativeTime(agent.lastEventAt)}
              </span>
            )}
            {blocker && (
              <span
                role="img"
                aria-label="Agent reported a blocker"
                title={blocker.summary}
                className="inline-flex items-center rounded-full border border-amber-700 bg-amber-950/30 px-1.5 py-0.5 text-[10px] text-amber-200"
              >
                Blocker
              </span>
            )}
          </div>
          {currentTask && (
            <p className="mt-2 text-xs text-slate-300 line-clamp-2">{currentTask}</p>
          )}
          {outputSummary && (
            <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">{outputSummary}</p>
          )}
        </div>
      </div>
    </div>
  )
}

export interface AgentCardsProps {
  agents: ManifestAgent[]
  activeAgent?: string | null
  /** Blockers keyed by agent name (last one wins). */
  blockersByAgent?: Record<string, ManifestBlocker>
  className?: string
}

export default function AgentCards({ agents, activeAgent, blockersByAgent, className = '' }: AgentCardsProps) {
  if (!agents.length) {
    return <EmptyState reason="no-events" title="No agents yet" body="Agent activity will appear as events are recorded." className={className} />
  }
  return (
    <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>
      {agents.map((agent) => (
        <AgentCard
          key={agent.name}
          agent={agent}
          activeAgent={activeAgent ?? null}
          blocker={blockersByAgent?.[agent.name]}
        />
      ))}
    </div>
  )
}
