import React, { useMemo, useState } from 'react'
import type { Task } from '../types'
import { TaskStatus } from '../types'

type ClusterKey = string

function inferTeamLabel(task: Task): string {
  const spec = (task.agent?.specialization || '').toLowerCase()
  const name = (task.name || '').toLowerCase()
  const hay = `${spec}\n${name}`
  if (hay.includes('shared contracts') || hay.includes('contracts team') || hay.includes('decision lock')) return 'Shared Contracts'
  if (hay.includes('platform team') || hay.includes('infra team') || hay.includes('devops') || hay.includes('platform')) return 'Platform'
  if (hay.includes('api team') || hay.includes('backend') || hay.includes('api')) return 'API'
  if (hay.includes('ui team') || hay.includes('frontend') || hay.includes('web team') || hay.includes('ui')) return 'UI'
  if (hay.includes('data/ml') || hay.includes('data ml') || hay.includes('ml team') || hay.includes('data team')) return 'Data/ML'
  return 'Other'
}

function agentKey(task: Task): string {
  return inferTeamLabel(task)
}

function statusBadgeClasses(status: TaskStatus): string {
  switch (status) {
    case TaskStatus.RUNNING:
      return 'border-blue-500/40 bg-blue-500/10 text-blue-200'
    case TaskStatus.COMPLETED:
      return 'border-green-500/40 bg-green-500/10 text-green-200'
    case TaskStatus.FAILED:
      return 'border-red-500/40 bg-red-500/10 text-red-200'
    case TaskStatus.PENDING:
    default:
      return 'border-gray-600 bg-gray-900/40 text-gray-200'
  }
}

function computeReadyTasks(tasks: Task[]): Task[] {
  const done = new Set(tasks.filter((t) => t.status === TaskStatus.COMPLETED || t.status === TaskStatus.FAILED).map((t) => t.id))
  const running = new Set(tasks.filter((t) => t.status === TaskStatus.RUNNING).map((t) => t.id))
  return tasks.filter(
    (t) =>
      t.status === TaskStatus.PENDING &&
      !running.has(t.id) &&
      (t.dependencies ?? []).every((dep) => done.has(dep))
  )
}

type Cluster = {
  key: ClusterKey
  tasks: Task[]
  counts: Record<TaskStatus, number>
  running: Task[]
  ready: Task[]
  completed: Task[]
  failed: Task[]
}

interface Props {
  tasks: Task[]
  selectedTaskId: string | null
  onSelectTask: (task: Task) => void
}

const TaskClustersView: React.FC<Props> = ({ tasks, selectedTaskId, onSelectTask }) => {
  const [showAllTasks, setShowAllTasks] = useState(false)

  const readyTasks = useMemo(() => computeReadyTasks(tasks), [tasks])

  const clusters = useMemo(() => {
    const byKey = new Map<ClusterKey, Task[]>()
    for (const task of tasks) {
      const key = agentKey(task)
      byKey.set(key, [...(byKey.get(key) ?? []), task])
    }

    const out: Cluster[] = []
    for (const [key, items] of byKey.entries()) {
      const counts = {
        [TaskStatus.PENDING]: 0,
        [TaskStatus.RUNNING]: 0,
        [TaskStatus.COMPLETED]: 0,
        [TaskStatus.FAILED]: 0,
      } as Record<TaskStatus, number>

      for (const t of items) counts[t.status] = (counts[t.status] ?? 0) + 1

      const running = items.filter((t) => t.status === TaskStatus.RUNNING)
      const completed = items.filter((t) => t.status === TaskStatus.COMPLETED)
      const failed = items.filter((t) => t.status === TaskStatus.FAILED)
      const ready = readyTasks.filter((t) => agentKey(t) === key)

      out.push({ key, tasks: items, counts, running, ready, completed, failed })
    }

    out.sort((a, b) => {
      const aActive = a.running.length > 0 ? 1 : 0
      const bActive = b.running.length > 0 ? 1 : 0
      if (aActive !== bActive) return bActive - aActive
      const aDone = a.counts[TaskStatus.COMPLETED]
      const bDone = b.counts[TaskStatus.COMPLETED]
      if (aDone !== bDone) return bDone - aDone
      return a.key.localeCompare(b.key)
    })

    return out
  }, [tasks, readyTasks])

  if (!tasks.length) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 h-full">
        <p>No tasks yet. Start a run to see clustered progress.</p>
      </div>
    )
  }

  return (
    <div className="w-full h-full overflow-y-auto p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="text-sm text-gray-400">
          Clusters: <span className="text-gray-200 font-semibold">{clusters.length}</span> · Tasks:{' '}
          <span className="text-gray-200 font-semibold">{tasks.length}</span>
        </div>
        <button
          type="button"
          onClick={() => setShowAllTasks((v) => !v)}
          className="px-3 py-1.5 text-xs rounded-md bg-gray-800 hover:bg-gray-700 border border-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {showAllTasks ? 'Show highlights' : 'Show all tasks'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {clusters.map((cluster) => {
          const total = cluster.tasks.length
          const done = cluster.counts[TaskStatus.COMPLETED] + cluster.counts[TaskStatus.FAILED]
          const percent = total > 0 ? Math.round((done / total) * 100) : 0

          const highlightTasks = [
            ...cluster.running,
            ...cluster.ready.slice(0, Math.max(0, 3 - cluster.running.length)),
          ]
          const displayTasks = showAllTasks ? cluster.tasks : highlightTasks

          return (
            <div key={cluster.key} className="rounded-xl border border-gray-700 bg-gray-800/30 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-100 truncate" title={cluster.key}>
                    {cluster.key}
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    {done}/{total} done · {percent}% · Running:{' '}
                    <span className="text-gray-200 font-semibold">{cluster.running.length}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 justify-end">
                  {Object.entries(cluster.counts).map(([status, count]) => (
                    <span
                      key={status}
                      className={`rounded-full border px-2 py-0.5 text-[11px] ${statusBadgeClasses(status as TaskStatus)}`}
                      title={`${status}: ${count}`}
                    >
                      {status.toLowerCase()}: {count}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-2 h-1.5 w-full rounded-full bg-gray-900/50 overflow-hidden">
                <div className="h-full bg-indigo-500/70" style={{ width: `${percent}%` }} />
              </div>

              <div className="mt-3 space-y-2">
                {displayTasks.length > 0 ? (
                  displayTasks.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onSelectTask(t)}
                      className={`w-full text-left rounded-lg border px-3 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        t.id === selectedTaskId
                          ? 'border-indigo-500 bg-indigo-500/10'
                          : 'border-gray-700 bg-gray-900/30 hover:bg-gray-900/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm text-gray-100 truncate" title={t.name}>
                            {t.name}
                          </div>
                          <div className="text-[11px] text-gray-400">
                            {(t.dependencies ?? []).length > 0 ? `deps: ${(t.dependencies ?? []).length}` : 'deps: 0'}
                          </div>
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusBadgeClasses(t.status)}`}>
                          {t.status.toLowerCase()}
                        </span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="text-xs text-gray-400">No active work in this cluster yet.</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default TaskClustersView
