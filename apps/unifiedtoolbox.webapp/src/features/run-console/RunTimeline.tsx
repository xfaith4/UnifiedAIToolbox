'use client'

// ─────────────────────────────────────────────────────────────────────────────
// RunTimeline — phase-by-phase progress derived from canonical events.
// The canonical taxonomy isn't a strict pipeline, so we collapse events into
// 5 operator-facing phases:
//   1. Created    — run_created / run_queued seen
//   2. Started    — run_started seen
//   3. Working    — agent_started / agent_progress / agent_completed seen
//   4. Validating — validation_started or validation_completed seen
//   5. Finalized  — run_completed / run_failed / run_recovered seen
// ─────────────────────────────────────────────────────────────────────────────

import type { CanonicalEvent } from '@/lib/app-factory/runs/canonicalEvents'
import { formatRelativeTime } from './formatters'

export type TimelinePhaseId = 'created' | 'started' | 'working' | 'validating' | 'finalized'

export interface TimelinePhase {
  id: TimelinePhaseId
  label: string
  state: 'pending' | 'active' | 'done' | 'failed'
  startedAt?: string
  endedAt?: string
  description?: string
}

const PHASE_LABELS: Record<TimelinePhaseId, string> = {
  created:    'Created',
  started:    'Started',
  working:    'Working',
  validating: 'Validating',
  finalized:  'Finalized',
}

export function derivePhasesFromEvents(events: CanonicalEvent[]): TimelinePhase[] {
  const phases: Record<TimelinePhaseId, TimelinePhase> = {
    created:    { id: 'created',    label: PHASE_LABELS.created,    state: 'pending' },
    started:    { id: 'started',    label: PHASE_LABELS.started,    state: 'pending' },
    working:    { id: 'working',    label: PHASE_LABELS.working,    state: 'pending' },
    validating: { id: 'validating', label: PHASE_LABELS.validating, state: 'pending' },
    finalized:  { id: 'finalized',  label: PHASE_LABELS.finalized,  state: 'pending' },
  }

  let workingActive = false
  let validatingActive = false
  let finalState: 'done' | 'failed' | null = null

  for (const ev of events) {
    const ts = ev.timestamp
    switch (ev.event_type) {
      case 'run_created':
      case 'run_queued':
        if (!phases.created.startedAt) phases.created.startedAt = ts
        phases.created.state = 'done'
        break
      case 'run_started':
        if (!phases.started.startedAt) phases.started.startedAt = ts
        phases.created.state = 'done'
        phases.started.state = 'done'
        break
      case 'agent_started':
      case 'agent_progress':
        if (!phases.working.startedAt) phases.working.startedAt = ts
        phases.started.state = phases.started.state === 'pending' ? 'done' : phases.started.state
        phases.working.state = 'active'
        workingActive = true
        break
      case 'agent_completed':
        if (!phases.working.startedAt) phases.working.startedAt = ts
        phases.working.state = 'active'
        workingActive = true
        break
      case 'agent_blocked':
        phases.working.state = 'active'
        workingActive = true
        break
      case 'validation_started':
        if (!phases.validating.startedAt) phases.validating.startedAt = ts
        if (workingActive) phases.working.state = 'done'
        workingActive = false
        phases.validating.state = 'active'
        validatingActive = true
        break
      case 'validation_completed': {
        if (!phases.validating.startedAt) phases.validating.startedAt = ts
        phases.validating.endedAt = ts
        validatingActive = false
        const data = ev.data ?? {}
        const failed = Number((data as Record<string, unknown>).failed ?? 0)
        phases.validating.state = failed > 0 ? 'failed' : 'done'
        break
      }
      case 'run_completed':
        if (workingActive) phases.working.state = 'done'
        if (validatingActive && phases.validating.state !== 'failed') phases.validating.state = 'done'
        phases.finalized.startedAt = ts
        phases.finalized.endedAt = ts
        phases.finalized.state = 'done'
        finalState = 'done'
        break
      case 'run_failed':
        if (workingActive) phases.working.state = 'failed'
        if (validatingActive) phases.validating.state = 'failed'
        phases.finalized.startedAt = ts
        phases.finalized.endedAt = ts
        phases.finalized.state = 'failed'
        finalState = 'failed'
        break
      case 'run_recovered':
        phases.finalized.state = 'pending'
        finalState = null
        break
    }
  }

  // If we never saw a finalize event but working is still active, leave it
  // active so the UI shows in-progress.
  if (!finalState && phases.finalized.state === 'pending') {
    if (phases.working.state === 'pending' && phases.started.state === 'done') {
      phases.started.state = 'active'
    }
  }

  return [phases.created, phases.started, phases.working, phases.validating, phases.finalized]
}

const STATE_CLS: Record<TimelinePhase['state'], { dot: string; text: string; ring: string }> = {
  pending: { dot: 'bg-slate-700',     text: 'text-slate-500',  ring: 'ring-slate-800' },
  active:  { dot: 'bg-blue-400 animate-pulse',   text: 'text-blue-200',   ring: 'ring-blue-700' },
  done:    { dot: 'bg-emerald-400',   text: 'text-emerald-200',ring: 'ring-emerald-700' },
  failed:  { dot: 'bg-rose-400',      text: 'text-rose-200',   ring: 'ring-rose-700' },
}

export interface RunTimelineProps {
  events: CanonicalEvent[]
  className?: string
}

export default function RunTimeline({ events, className = '' }: RunTimelineProps) {
  const phases = derivePhasesFromEvents(events)
  return (
    <ol className={`flex flex-wrap items-center gap-x-2 gap-y-3 ${className}`} aria-label="Run progress timeline">
      {phases.map((phase, idx) => {
        const cls = STATE_CLS[phase.state]
        return (
          <li
            key={phase.id}
            data-phase={phase.id}
            data-state={phase.state}
            className="flex items-center"
          >
            <div className={`flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-2.5 py-1.5 ring-1 ${cls.ring}`}>
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${cls.dot}`} />
              <span className={`text-[11px] font-medium ${cls.text}`}>{phase.label}</span>
              {phase.startedAt && phase.state !== 'pending' && (
                <span className="text-[10px] text-slate-500" title={phase.startedAt}>
                  {formatRelativeTime(phase.endedAt ?? phase.startedAt)}
                </span>
              )}
            </div>
            {idx < phases.length - 1 && (
              <span aria-hidden="true" className="mx-1 h-px w-3 bg-slate-700" />
            )}
          </li>
        )
      })}
    </ol>
  )
}
