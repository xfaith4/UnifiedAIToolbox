'use client'

// ─────────────────────────────────────────────────────────────────────────────
// EventStream — capped list of the most recent canonical events, with a
// "show all" toggle. Not full virtualization (we cap at 100 by default).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import type {
  CanonicalEvent,
  CanonicalEventType,
  CanonicalSeverity,
} from '@/lib/app-factory/runs/canonicalEvents'
import EmptyState from './EmptyState'

const SEVERITY_CLS: Record<CanonicalSeverity, string> = {
  info:  'text-slate-300',
  warn:  'text-amber-300',
  error: 'text-rose-300',
}

const EVENT_ICONS: Partial<Record<CanonicalEventType, string>> = {
  run_created:          '●',
  run_queued:           '◦',
  run_started:          '▶',
  agent_started:        '▶',
  agent_progress:       '·',
  agent_blocked:        '⚠',
  agent_completed:      '✓',
  artifact_created:     '⎘',
  validation_started:   '?',
  validation_completed: '✓',
  run_completed:        '✓',
  run_failed:           '✗',
  run_recovered:        '↻',
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export interface EventStreamProps {
  events: CanonicalEvent[]
  /** Default visible cap; user can click "load more" to expand. */
  initialLimit?: number
  className?: string
}

export default function EventStream({ events, initialLimit = 100, className = '' }: EventStreamProps) {
  const [expanded, setExpanded] = useState(false)

  if (!events.length) {
    return <EmptyState reason="no-events" className={className} />
  }

  const reversed = [...events].reverse()
  const visible = expanded ? reversed : reversed.slice(0, initialLimit)
  const hiddenCount = reversed.length - visible.length

  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-900/40 ${className}`}>
      <div className="border-b border-slate-800 px-3 py-2 flex items-center gap-2">
        <h3 className="text-xs font-semibold text-slate-200">Event Stream</h3>
        <span className="text-[10px] text-slate-500">{events.length} event{events.length === 1 ? '' : 's'}</span>
      </div>
      <ol className="divide-y divide-slate-800/60 max-h-[24rem] overflow-y-auto">
        {visible.map((ev) => {
          const sevCls = SEVERITY_CLS[ev.severity] ?? SEVERITY_CLS.info
          const icon = EVENT_ICONS[ev.event_type] ?? '·'
          return (
            <li key={ev.event_id} className="flex items-start gap-2 px-3 py-1.5 text-xs">
              <span aria-hidden="true" className={`mt-0.5 font-mono text-[10px] ${sevCls}`}>{icon}</span>
              <span className="shrink-0 font-mono text-[10px] text-slate-600 tabular-nums">
                {formatTime(ev.timestamp)}
              </span>
              <span className={`flex-1 leading-snug ${sevCls}`}>
                <span className="mr-1 text-[10px] uppercase tracking-wide text-slate-500">{ev.event_type}</span>
                {ev.agent_name && <span className="mr-1 text-slate-400">[{ev.agent_name}]</span>}
                {ev.message}
              </span>
            </li>
          )
        })}
      </ol>
      {hiddenCount > 0 && (
        <div className="border-t border-slate-800 px-3 py-2 text-center">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-[11px] text-blue-400 hover:underline"
          >
            Show {hiddenCount} earlier event{hiddenCount === 1 ? '' : 's'}
          </button>
        </div>
      )}
    </div>
  )
}
