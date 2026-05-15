'use client'

// ─────────────────────────────────────────────────────────────────────────────
// EmptyState — reusable empty/zero-data presentation, copy varies by reason.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react'

export type EmptyStateReason =
  | 'no-runs'
  | 'no-events'
  | 'no-artifacts'
  | 'legacy-run'
  | 'queued-not-started'
  | 'sse-disconnected'
  | 'generic'

const REASONS: Record<EmptyStateReason, { title: string; body: string }> = {
  'no-runs':            { title: 'No runs yet',                body: 'Kick off a run from Concierge or the orchestrator to see it here.' },
  'no-events':          { title: 'No events recorded yet',     body: 'Once the orchestrator emits canonical events they will stream in here.' },
  'no-artifacts':       { title: 'No artifacts yet',           body: 'Artifacts produced by agents will appear here as they are written.' },
  'legacy-run':         { title: 'Legacy run',                 body: 'This run predates the canonical manifest. Falling back to the summary view below.' },
  'queued-not-started': { title: 'Queued',                     body: 'The run has been accepted but no worker has started it yet.' },
  'sse-disconnected':   { title: 'Live stream disconnected',   body: 'Showing the last-known data while we try to reconnect.' },
  'generic':            { title: 'Nothing to show',            body: '' },
}

export interface EmptyStateProps {
  reason: EmptyStateReason
  title?: string
  body?: string
  action?: ReactNode
  className?: string
}

export default function EmptyState({ reason, title, body, action, className = '' }: EmptyStateProps) {
  const preset = REASONS[reason]
  return (
    <div
      role="status"
      aria-label={title ?? preset.title}
      data-reason={reason}
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-900/30 px-6 py-8 text-center ${className}`}
    >
      <p className="text-sm font-medium text-slate-200">{title ?? preset.title}</p>
      {(body ?? preset.body) && (
        <p className="mt-1 max-w-md text-xs text-slate-500">{body ?? preset.body}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
