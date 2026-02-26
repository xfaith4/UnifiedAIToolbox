import React, { useMemo } from 'react'
import Link from 'next/link'
import type { OrchestrationRun } from '@/lib/types/orchestrator'
import { computeAgentActivitySnapshot } from '@/lib/orchestration/agentActivity'

type Props = {
  run: OrchestrationRun
  title?: string
  className?: string
  /**
   * Optional full run list so we can surface queued/pending context
   * in the "no active agents" state.
   */
  allRuns?: OrchestrationRun[]
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

export default function AgentActivityTally({
  run,
  title = 'Agent Tally',
  className = '',
  allRuns,
}: Props) {
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

  // Find queued / pending runs to surface in the "no active agents" state
  const queuedRuns = useMemo(() => {
    if (!allRuns) return []
    return allRuns.filter((r) => {
      const s = (r.status ?? '').toLowerCase()
      return s === 'queued' || s === 'pending'
    })
  }, [allRuns])

  // Find the active live run (besides the tally run itself)
  const activeRun = useMemo(() => {
    if (!allRuns) return null
    return allRuns.find((r) => {
      const s = (r.status ?? '').toLowerCase()
      return (s === 'running' || s === 'in_progress') && r.id !== run.id
    }) ?? null
  }, [allRuns, run.id])

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
            {snapshot.activeAgents.map((agent, index) => (
              <span
                key={`${agent}-${index}`}
                className="rounded bg-sky-900/30 px-2 py-1 text-xs text-sky-100 border border-sky-800/40"
              >
                {agent}
              </span>
            ))}
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <div className="text-xs text-slate-400">No agents currently running.</div>

            {/* Queued run callout — explains the 0 active count */}
            {queuedRuns.length > 0 && (
              <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 px-3 py-2 text-xs space-y-1">
                <p className="font-medium text-amber-300">
                  {queuedRuns.length === 1
                    ? 'Run is queued (waiting for worker)'
                    : `${queuedRuns.length} runs are queued (waiting for workers)`}
                </p>
                <p className="text-amber-200/70">
                  This explains the 0 active agent count — agents will become active once a worker picks up the run.
                </p>
                {queuedRuns.slice(0, 2).map((r) => (
                  <Link
                    key={r.id}
                    href={`/runs/${encodeURIComponent(r.id)}`}
                    className="flex items-center justify-between rounded border border-amber-900/40 bg-amber-950/30 px-2 py-1 hover:bg-amber-950/50 transition-colors"
                  >
                    <span className="truncate text-amber-200/80" title={r.goal}>
                      {r.goal ? r.goal.slice(0, 60) + (r.goal.length > 60 ? '…' : '') : r.id.slice(0, 18)}
                    </span>
                    <span className="ml-2 shrink-0 text-amber-400/60 text-[10px]">View →</span>
                  </Link>
                ))}
              </div>
            )}

            {/* Active run elsewhere callout */}
            {activeRun && (
              <div className="rounded-lg border border-sky-800/50 bg-sky-950/20 px-3 py-2 text-xs">
                <p className="text-sky-300 font-medium mb-1">A run is currently active</p>
                <Link
                  href={`/runs/${encodeURIComponent(activeRun.id)}`}
                  className="flex items-center justify-between rounded border border-sky-900/40 bg-sky-950/30 px-2 py-1 hover:bg-sky-950/50 transition-colors text-sky-200/80"
                >
                  <span className="truncate" title={activeRun.goal}>
                    {activeRun.goal
                      ? activeRun.goal.slice(0, 60) + (activeRun.goal.length > 60 ? '…' : '')
                      : activeRun.id.slice(0, 18)}
                  </span>
                  <span className="ml-2 shrink-0 text-sky-400/60 text-[10px]">View live events →</span>
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
