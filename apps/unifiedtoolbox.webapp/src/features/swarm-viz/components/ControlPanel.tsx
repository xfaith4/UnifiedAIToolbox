import type { SwarmConnectionStatus } from '../types'

type ControlPanelProps = {
  connectionStatus: SwarmConnectionStatus
  loading: boolean
  error: string | null
  reconnectCount: number
  lastEventTs: string | null
  showCompleted: boolean
  groupByPhase: boolean
  followLive: boolean
  availableAgents: string[]
  availablePhases: string[]
  selectedAgents: string[]
  selectedPhases: string[]
  onToggleShowCompleted: () => void
  onToggleGroupByPhase: () => void
  onToggleFollowLive: () => void
  onToggleAgent: (agent: string) => void
  onTogglePhase: (phase: string) => void
  onSelectAllAgents: () => void
  onSelectAllPhases: () => void
  onResetView: () => void
  onRefresh: () => void
}

function statusClass(status: SwarmConnectionStatus): string {
  if (status === 'open') return 'border-emerald-700 bg-emerald-950/50 text-emerald-300'
  if (status === 'reconnecting') return 'border-amber-700 bg-amber-950/50 text-amber-300'
  if (status === 'error') return 'border-rose-700 bg-rose-950/50 text-rose-300'
  if (status === 'closed') return 'border-slate-700 bg-slate-900/80 text-slate-300'
  return 'border-blue-700 bg-blue-950/50 text-blue-300'
}

type ToggleProps = {
  label: string
  active: boolean
  onToggle: () => void
}

function Toggle({ label, active, onToggle }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
        active
          ? 'border-blue-600 bg-blue-900/50 text-blue-100'
          : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-600'
      }`}
    >
      {label}
    </button>
  )
}

export default function ControlPanel({
  connectionStatus,
  loading,
  error,
  reconnectCount,
  lastEventTs,
  showCompleted,
  groupByPhase,
  followLive,
  availableAgents,
  availablePhases,
  selectedAgents,
  selectedPhases,
  onToggleShowCompleted,
  onToggleGroupByPhase,
  onToggleFollowLive,
  onToggleAgent,
  onTogglePhase,
  onSelectAllAgents,
  onSelectAllPhases,
  onResetView,
  onRefresh,
}: ControlPanelProps) {
  return (
    <aside className="flex h-full flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/55 p-4">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Connection</div>
        <div className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs capitalize ${statusClass(connectionStatus)}`}>
          {connectionStatus}
        </div>
        {reconnectCount > 0 && (
          <div className="mt-1 text-[11px] text-amber-300">Reconnect attempts: {reconnectCount}</div>
        )}
        <div className="mt-1 text-[11px] text-slate-500">
          Last event: {lastEventTs ? new Date(lastEventTs).toLocaleTimeString() : '—'}
        </div>
        {error && <div className="mt-2 rounded-md border border-rose-800 bg-rose-950/40 px-2 py-1 text-[11px] text-rose-300">{error}</div>}
      </div>

      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">View</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Toggle label="Show Completed" active={showCompleted} onToggle={onToggleShowCompleted} />
          <Toggle label="Group by Phase" active={groupByPhase} onToggle={onToggleGroupByPhase} />
          <Toggle label="Follow Live" active={followLive} onToggle={onToggleFollowLive} />
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onResetView}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 hover:border-slate-600"
          >
            Reset View
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 hover:border-slate-600 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto pr-1">
        <div>
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Agents</div>
            <button
              type="button"
              onClick={onSelectAllAgents}
              className="text-[11px] text-slate-400 underline hover:text-slate-200"
            >
              All
            </button>
          </div>
          <div className="mt-2 space-y-1">
            {availableAgents.length === 0 && <div className="text-[11px] text-slate-500">No agents yet</div>}
            {availableAgents.map((agent) => {
              const active = selectedAgents.length === 0 || selectedAgents.includes(agent)
              return (
                <label key={agent} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-xs text-slate-300 hover:bg-slate-800/60">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900"
                    checked={active}
                    onChange={() => onToggleAgent(agent)}
                  />
                  <span>{agent}</span>
                </label>
              )
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Phases</div>
            <button
              type="button"
              onClick={onSelectAllPhases}
              className="text-[11px] text-slate-400 underline hover:text-slate-200"
            >
              All
            </button>
          </div>
          <div className="mt-2 space-y-1">
            {availablePhases.length === 0 && <div className="text-[11px] text-slate-500">No phases yet</div>}
            {availablePhases.map((phase) => {
              const active = selectedPhases.length === 0 || selectedPhases.includes(phase)
              return (
                <label key={phase} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-xs text-slate-300 hover:bg-slate-800/60">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900"
                    checked={active}
                    onChange={() => onTogglePhase(phase)}
                  />
                  <span>{phase}</span>
                </label>
              )
            })}
          </div>
        </div>
      </div>
    </aside>
  )
}
