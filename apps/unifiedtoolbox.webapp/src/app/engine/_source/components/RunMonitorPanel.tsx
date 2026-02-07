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
    const completedAgentSet = new Set<string>()
    const failedAgentSet = new Set<string>()
    const pendingAgentSet = new Set<string>()
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
        completedAgentSet.add(key)
      } else if (t.status === TaskStatus.FAILED) {
        byAgent[key].failed += 1
        failedAgentSet.add(key)
      } else {
        byAgent[key].pending += 1
        pendingAgentSet.add(key)
      }
    }

    const totalAgents = agentSet.size
    const activeAgents = activeAgentSet.size
    const completedAgents = completedAgentSet.size
    const failedAgents = failedAgentSet.size
    const pendingAgents = pendingAgentSet.size
    const done = completed + failed
    const percent = totalTasks > 0 ? Math.round((done / totalTasks) * 100) : 0

    const allAgents = Object.entries(byAgent)
      .map(([agent, s]) => ({ agent, ...s }))
      .sort((a, b) => (b.running > 0 ? 1 : 0) - (a.running > 0 ? 1 : 0) || b.total - a.total || a.agent.localeCompare(b.agent))

    return { 
      totalTasks, completed, failed, running, pending, 
      totalAgents, activeAgents, completedAgents, failedAgents, pendingAgents,
      percent, allAgents 
    }
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

        {/* Agent Status Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-blue-500/40 bg-blue-500/10 p-3">
            <div className="text-xs text-blue-200 uppercase tracking-wide">Active</div>
            <div className="mt-1 text-2xl font-bold text-blue-100">{summary.activeAgents}</div>
            <div className="mt-1 text-[10px] text-blue-200/70">{summary.running} tasks running</div>
          </div>
          <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3">
            <div className="text-xs text-gray-200 uppercase tracking-wide">Pending</div>
            <div className="mt-1 text-2xl font-bold text-gray-100">{summary.pendingAgents}</div>
            <div className="mt-1 text-[10px] text-gray-200/70">{summary.pending} tasks queued</div>
          </div>
          <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-3">
            <div className="text-xs text-green-200 uppercase tracking-wide">Completed</div>
            <div className="mt-1 text-2xl font-bold text-green-100">{summary.completedAgents}</div>
            <div className="mt-1 text-[10px] text-green-200/70">{summary.completed} tasks done</div>
          </div>
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3">
            <div className="text-xs text-red-200 uppercase tracking-wide">Failed</div>
            <div className="mt-1 text-2xl font-bold text-red-100">{summary.failedAgents}</div>
            <div className="mt-1 text-[10px] text-red-200/70">{summary.failed} tasks failed</div>
          </div>
        </div>

        {/* All Agents List */}
        {summary.allAgents.length > 0 && (
          <div>
            <div className="mb-2 text-xs uppercase tracking-wide text-gray-400">
              All Agents ({summary.totalAgents})
            </div>
            <div className="flex flex-wrap gap-2">
              {summary.allAgents.map((a) => (
                <span
                  key={a.agent}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${
                    a.running > 0 
                      ? 'border-blue-500/40 bg-blue-500/10 text-blue-200' 
                      : a.failed > 0
                      ? 'border-red-500/40 bg-red-500/10 text-red-200'
                      : a.completed > 0
                      ? 'border-green-500/40 bg-green-500/10 text-green-200'
                      : 'border-gray-700 bg-gray-900/40 text-gray-200'
                  }`}
                  title={`running:${a.running} pending:${a.pending} completed:${a.completed} failed:${a.failed}`}
                >
                  {a.agent}: {a.running > 0 ? `${a.running} active` : a.failed > 0 ? `${a.failed} failed` : a.completed > 0 ? `${a.completed} done` : `${a.pending} queued`}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

export default RunMonitorPanel

