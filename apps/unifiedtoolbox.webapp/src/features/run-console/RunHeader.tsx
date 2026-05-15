'use client'

// ─────────────────────────────────────────────────────────────────────────────
// RunHeader — objective, run id, created/elapsed, status badge.
// ─────────────────────────────────────────────────────────────────────────────

import RunStatusBadge from './RunStatusBadge'
import SseConnectionIndicator from './SseConnectionIndicator'
import type { CanonicalRunStatus } from '@/lib/app-factory/runs/manifest'
import { formatDuration, formatRelativeTime, shortRunId } from './formatters'
import type { RunEventStreamStatus } from '@/lib/hooks/useRunEventStream'

export interface RunHeaderProps {
  runId: string
  status: CanonicalRunStatus | string | null | undefined
  objective?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  /** Optional ended timestamp; when present the elapsed clock freezes. */
  endedAt?: string | null
  streamStatus?: RunEventStreamStatus
  className?: string
}

export default function RunHeader({
  runId,
  status,
  objective,
  createdAt,
  updatedAt,
  endedAt,
  streamStatus,
  className = '',
}: RunHeaderProps) {
  return (
    <header className={`rounded-2xl border border-slate-800 bg-slate-900/50 p-4 ${className}`}>
      <div className="flex flex-wrap items-center gap-3">
        <RunStatusBadge status={status} />
        {streamStatus && <SseConnectionIndicator status={streamStatus} />}
        <span className="text-[11px] font-mono text-slate-500" title={runId}>
          {shortRunId(runId)}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          {createdAt && (
            <span title={createdAt}>
              Started {formatRelativeTime(createdAt)}
            </span>
          )}
          {createdAt && (
            <span>
              Elapsed {formatDuration(createdAt, endedAt ?? undefined)}
            </span>
          )}
          {updatedAt && updatedAt !== createdAt && (
            <span title={updatedAt}>
              Last event {formatRelativeTime(updatedAt)}
            </span>
          )}
        </span>
      </div>
      {objective && (
        <p className="mt-3 text-sm leading-relaxed text-slate-200">
          <span className="text-[11px] uppercase tracking-wide text-slate-500 mr-2">Objective</span>
          {objective}
        </p>
      )}
    </header>
  )
}
