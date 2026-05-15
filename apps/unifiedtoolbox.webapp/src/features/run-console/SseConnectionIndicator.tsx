'use client'

// ─────────────────────────────────────────────────────────────────────────────
// SseConnectionIndicator — small dot/label conveying SSE stream health.
// ─────────────────────────────────────────────────────────────────────────────

import type { RunEventStreamStatus } from '@/lib/hooks/useRunEventStream'

const CONFIG: Record<RunEventStreamStatus, { label: string; dot: string; text: string; pulse: boolean }> = {
  idle:               { label: 'Idle',               dot: 'bg-slate-500',    text: 'text-slate-500',   pulse: false },
  connecting:         { label: 'Connecting…',        dot: 'bg-slate-400',    text: 'text-slate-400',   pulse: true  },
  live:               { label: 'Live',               dot: 'bg-emerald-400',  text: 'text-emerald-300', pulse: true  },
  replaying:          { label: 'Replaying backlog…', dot: 'bg-blue-400',     text: 'text-blue-300',    pulse: true  },
  snapshot_complete:  { label: 'Snapshot complete',  dot: 'bg-emerald-500',  text: 'text-emerald-300', pulse: false },
  disconnected:      { label: 'Disconnected',       dot: 'bg-rose-400',     text: 'text-rose-300',    pulse: false },
}

export interface SseConnectionIndicatorProps {
  status: RunEventStreamStatus
  className?: string
}

export default function SseConnectionIndicator({ status, className = '' }: SseConnectionIndicatorProps) {
  const cfg = CONFIG[status]
  return (
    <span
      role="status"
      aria-label={`Event stream: ${cfg.label}`}
      className={`inline-flex items-center gap-1.5 text-[11px] ${cfg.text} ${className}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${cfg.dot} ${cfg.pulse ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  )
}
