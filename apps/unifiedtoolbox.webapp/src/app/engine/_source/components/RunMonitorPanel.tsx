import React, { useMemo } from 'react'
import type { Task } from '../types'
import { TaskStatus } from '../types'

type ViewMode = 'clusters' | 'graph'

interface Props {
  tasks: Task[]
  isOrchestrating: boolean
  viewMode: ViewMode
  onChangeViewMode: (mode: ViewMode) => void
}

function agentKey(task: Task): string {
  const role = task.agent?.role || 'Unknown Agent'
  const spec = task.agent?.specialization?.trim()
  return spec ? `${role} — ${spec}` : role
}

function statusPill(status: string): string {
  switch (status) {
    case 'running':
      return 'border-blue-500/40 bg-blue-500/10 text-blue-200'
    case 'completed':
      return 'border-green-500/40 bg-green-500/10 text-green-200'
    case 'failed':
      return 'border-red-500/40 bg-red-500/10 text-red-200'
    default:
      return 'border-gray-600 bg-gray-900/40 text-gray-200'
  }
}

const RunMonitorPanel: React.FC<Props> = ({ tasks, isOrchestrating, viewMode, onChangeViewMode }) => {
  const summary = useMemo(() => {
    const totalTasks = tasks.length
    const completed = tasks.filter((t) => t.status === TaskStatus.COMPLETED).length
    const failed = tasks.filter((t) => t.status === TaskStatus.FAILED).length
    const running = tasks.filter((t) => t.status === TaskStatus.RUNNING).length
    const pending = tasks.filter((t) => t.status === TaskStatus.PENDING).length

    const agentSet = new Set<string>()
    const activeAgentSet = new Set<string>()
    const byAgent: Record<string, { total: number; running: number; completed: number; failed: number; pending: number }> = {}

    for (const t of tasks) {
      const key = agentKey(t)
      agentSet.add(key)
      byAgent[key] = byAgent[key] || { total: 0, running: 0, completed: 0, failed: 0, pending: 0 }
      byAgent[key].total += 1
      if (t.status === TaskStatus.RUNNING) {
        byAgent[key].running += 1
        activeAgentSet.add(key)
      } else if (t.status === TaskStatus.COMPLETED) {
        byAgent[key].completed += 1
      } else if (t.status === TaskStatus.FAILED) {
        byAgent[key].failed += 1
      } else {
        byAgent[key].pending += 1
      }
    }

    const totalAgents = agentSet.size
    const activeAgents = activeAgentSet.size
    const done = completed + failed
    const percent = totalTasks > 0 ? Math.round((done / totalTasks) * 100) : 0

    const topAgents = Object.entries(byAgent)
      .map(([agent, s]) => ({ agent, ...s }))
      .sort((a, b) => (b.running > 0 ? 1 : 0) - (a.running > 0 ? 1 : 0) || b.total - a.total || a.agent.localeCompare(b.agent))
      .slice(0, 10)

    return { totalTasks, completed, failed, running, pending, totalAgents, activeAgents, percent, topAgents }
  }, [tasks])

  const statusLabel = isOrchestrating ? 'running' : tasks.length ? 'completed' : 'idle'

  return (
    <section className="p-4 border-b border-gray-700 bg-gray-900/20">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-200">Run Monitor</h2>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusPill(statusLabel)}`}>
              status: {statusLabel}
            </span>
            <span className="rounded-full border border-gray-700 bg-gray-900/40 px-2 py-0.5 text-[11px] text-gray-200">
              agents active: {summary.activeAgents}/{summary.totalAgents}
            </span>
            <span className="rounded-full border border-gray-700 bg-gray-900/40 px-2 py-0.5 text-[11px] text-gray-200">
              tasks: {summary.totalTasks} · done: {summary.completed + summary.failed}/{summary.totalTasks} ({summary.percent}%)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChangeViewMode('clusters')}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                viewMode === 'clusters'
                  ? 'bg-indigo-600/30 border-indigo-500 text-indigo-100'
                  : 'bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700'
              }`}
            >
              Clusters
            </button>
            <button
              type="button"
              onClick={() => onChangeViewMode('graph')}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                viewMode === 'graph'
                  ? 'bg-indigo-600/30 border-indigo-500 text-indigo-100'
                  : 'bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700'
              }`}
            >
              Graph
            </button>
          </div>
        </div>

        <div className="h-2 w-full rounded-full bg-gray-900/40 overflow-hidden">
          <div className="h-full bg-indigo-500/70" style={{ width: `${summary.percent}%` }} />
        </div>

        {summary.topAgents.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {summary.topAgents.map((a) => (
              <span
                key={a.agent}
                className={`rounded-full border px-2 py-0.5 text-[11px] ${
                  a.running > 0 ? 'border-blue-500/40 bg-blue-500/10 text-blue-200' : 'border-gray-700 bg-gray-900/40 text-gray-200'
                }`}
                title={`running:${a.running} pending:${a.pending} completed:${a.completed} failed:${a.failed}`}
              >
                {a.agent}: {a.running > 0 ? `${a.running} running` : `${a.total} tasks`}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

export default RunMonitorPanel

