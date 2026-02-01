import React, { useMemo } from 'react'
import type { OrchestrationRun } from '@/lib/types/orchestrator'
import { computeAgentActivitySnapshot } from '@/lib/orchestration/agentActivity'

type Props = {
  run: OrchestrationRun
  title?: string
  className?: string
}

function badgeStyle(status: string): string {
  switch (status) {
    case 'working':
    case 'running':
      return 'border-sky-500/40 bg-sky-500/10 text-sky-100'
    case 'complete':
    case 'completed':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
    case 'error':
    case 'failed':
      return 'border-rose-500/40 bg-rose-500/10 text-rose-100'
    case 'pending':
      return 'border-slate-700 bg-slate-900/40 text-slate-200'
    default:
      return 'border-slate-700 bg-slate-900/40 text-slate-200'
  }
}

export default function AgentActivityTally({ run, title = 'Agent Tally', className = '' }: Props) {
  const snapshot = useMemo(
    () => computeAgentActivitySnapshot(run.events ?? [], run.agents ?? []),
    [run.events, run.agents]
  )

  const activeCount = snapshot.activeAgents.length
  const total = snapshot.totalAgents

  const statusRows = useMemo(() => {
    const rows = Object.entries(snapshot.countsByStatus)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status))
    return rows
  }, [snapshot.countsByStatus])

  return (
    <section className={`rounded-2xl border border-slate-800 bg-slate-900/60 p-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
            <span className="rounded-full border border-slate-700 bg-slate-950/60 px-2 py-0.5 text-[11px] text-slate-200">
              Active: {activeCount}/{total}
            </span>
          </div>
          {run.goal ? (
            <div className="mt-1 truncate text-xs text-slate-400" title={run.goal}>
              {run.goal}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {statusRows.map((row) => (
            <span
              key={row.status}
              className={`rounded-full border px-2 py-0.5 text-[11px] ${badgeStyle(row.status)}`}
              title={`Agents with status: ${row.status}`}
            >
              {row.status}: {row.count}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <div className="text-[11px] uppercase tracking-wide text-slate-500">Currently in use</div>
        {snapshot.activeAgents.length ? (
          <div className="mt-1 flex flex-wrap gap-2">
            {snapshot.activeAgents.map((agent) => (
              <span
                key={agent}
                className="rounded bg-sky-900/30 px-2 py-1 text-xs text-sky-100 border border-sky-800/40"
              >
                {agent}
              </span>
            ))}
          </div>
        ) : (
          <div className="mt-1 text-xs text-slate-400">No agents currently running.</div>
        )}
      </div>
    </section>
  )
}

