'use client'

// ─────────────────────────────────────────────────────────────────────────────
// CurrentRunCard — reusable card showing status, goal, timing, and quick
// actions for the most recent run started from Concierge.
// Used in: Concierge page, Reports page (Live Agent Tally area).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Radio,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Activity,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import type { RunContextEntry, RunContextStatus } from '@/lib/services/runContextStore'
import { updateRunContextStatus } from '@/lib/services/runContextStore'
import { fetchOrchestrationRun, isOrchestratorApiHttpError } from '@/lib/services/orchestratorApi'
import { TERMINAL_RUN_STATUSES } from '@/lib/services/conciergeRunService'

// ── Status display config ─────────────────────────────────────────────────────

type StatusConfig = { label: string; cls: string; icon: React.ReactNode }

const STATUS_CONFIG: Record<string, StatusConfig> = {
  initializing: {
    label: 'Initializing',
    cls: 'bg-gray-800 text-gray-300 border-gray-700',
    icon: <Loader2 size={11} className="animate-spin" aria-hidden="true" />,
  },
  queued: {
    label: 'Queued',
    cls: 'bg-amber-950/40 text-amber-300 border-amber-800',
    icon: <Clock size={11} aria-hidden="true" />,
  },
  running: {
    label: 'Running',
    cls: 'bg-blue-950/40 text-blue-300 border-blue-800',
    icon: <Radio size={11} className="animate-pulse" aria-hidden="true" />,
  },
  in_progress: {
    label: 'Running',
    cls: 'bg-blue-950/40 text-blue-300 border-blue-800',
    icon: <Radio size={11} className="animate-pulse" aria-hidden="true" />,
  },
  gating: {
    label: 'Gating — Review Required',
    cls: 'bg-purple-950/40 text-purple-300 border-purple-800',
    icon: <AlertTriangle size={11} aria-hidden="true" />,
  },
  completed: {
    label: 'Completed',
    cls: 'bg-emerald-950/40 text-emerald-300 border-emerald-700',
    icon: <CheckCircle2 size={11} aria-hidden="true" />,
  },
  success: {
    label: 'Completed',
    cls: 'bg-emerald-950/40 text-emerald-300 border-emerald-700',
    icon: <CheckCircle2 size={11} aria-hidden="true" />,
  },
  succeeded: {
    label: 'Completed',
    cls: 'bg-emerald-950/40 text-emerald-300 border-emerald-700',
    icon: <CheckCircle2 size={11} aria-hidden="true" />,
  },
  failed: {
    label: 'Failed',
    cls: 'bg-rose-950/40 text-rose-300 border-rose-800',
    icon: <XCircle size={11} aria-hidden="true" />,
  },
  error: {
    label: 'Failed',
    cls: 'bg-rose-950/40 text-rose-300 border-rose-800',
    icon: <XCircle size={11} aria-hidden="true" />,
  },
  cancelled: {
    label: 'Cancelled',
    cls: 'bg-gray-800 text-gray-400 border-gray-700',
    icon: <XCircle size={11} aria-hidden="true" />,
  },
}

function getStatusConfig(status: string): StatusConfig {
  return (
    STATUS_CONFIG[status.toLowerCase()] ?? {
      label: status,
      cls: 'bg-gray-800 text-gray-400 border-gray-700',
      icon: <Clock size={11} aria-hidden="true" />,
    }
  )
}

// ── Time formatting ───────────────────────────────────────────────────────────

function formatDuration(startedAt: string, endedAt?: string): string {
  const start = new Date(startedAt).getTime()
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  const totalSecs = Math.max(0, Math.floor((end - start) / 1000))
  if (totalSecs < 60) return `${totalSecs}s`
  const m = Math.floor(totalSecs / 60)
  if (m < 60) return `${m}m ${totalSecs % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function formatRelativeTime(isoTs: string): string {
  const ms = Date.now() - new Date(isoTs).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  entry: RunContextEntry
  /** Called when "View Live Events" button is clicked */
  onViewEvents?: () => void
  /** Optional callback when polled status changes */
  onStatusChange?: (newStatus: RunContextStatus) => void
  className?: string
}

export default function CurrentRunCard({
  entry,
  onViewEvents,
  onStatusChange,
  className = '',
}: Props) {
  const safeRunId = entry.runId?.trim() ?? ''
  const runIdLabel = safeRunId ? safeRunId.slice(0, 16) : 'unknown-run'
  const runHref = safeRunId ? `/runs/${encodeURIComponent(safeRunId)}` : '/runs'
  const [liveStatus, setLiveStatus] = useState<string>(entry.status)
  const [endedAt, setEndedAt] = useState<string | undefined>()
  const [currentPhase, setCurrentPhase] = useState<string | undefined>()
  // Tick state forces re-render for live duration counter while running
  const [, setTick] = useState(0)

  const isTerminal = TERMINAL_RUN_STATUSES.has(liveStatus)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Live duration counter — re-renders every 10s while non-terminal
  useEffect(() => {
    if (isTerminal) return
    const id = setInterval(() => setTick((t) => t + 1), 10_000)
    return () => clearInterval(id)
  }, [isTerminal])

  // Sync local state if entry prop updates (e.g. parent re-renders with store)
  useEffect(() => {
    setLiveStatus(entry.status)
  }, [entry.status])

  const doFetch = useCallback(async () => {
    if (!safeRunId) return

    try {
      const run = await fetchOrchestrationRun(safeRunId)
      if (!run.status) return

      const next = run.status
      if (next !== liveStatus) {
        setLiveStatus(next)
        updateRunContextStatus(safeRunId, next)
        onStatusChange?.(next)
      }

      if (run.completedAt) setEndedAt(run.completedAt)

      // Extract current phase from the latest status/phase event
      const events = run.events ?? []
      const lastPhaseEv = [...events]
        .reverse()
        .find(
          (e) =>
            e.message?.toLowerCase().includes('phase') ||
            e.type === 'status'
        )
      if (lastPhaseEv) {
        const m = lastPhaseEv.message.match(/(?:phase|Phase)[:\s]+(\w+)/i)
        if (m?.[1]) setCurrentPhase(m[1])
      }

      if (TERMINAL_RUN_STATUSES.has(next)) {
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      }
    } catch (error) {
      // Stop polling if the run no longer exists.
      if (isOrchestratorApiHttpError(error) && error.status === 404) {
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      }
      // Graceful degradation — keep showing last known status
    }
  }, [liveStatus, onStatusChange, safeRunId])

  useEffect(() => {
    if (isTerminal || !safeRunId) return
    void doFetch()
    pollRef.current = setInterval(() => void doFetch(), 5_000)
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeRunId])

  const statusCfg = getStatusConfig(liveStatus)

  return (
    <div
      className={`rounded-xl border border-gray-700 bg-gray-900/80 overflow-hidden ${className}`}
      aria-label={`Run ${safeRunId || 'unknown-run'}: ${liveStatus}`}
    >
      {/* ── Header: status badge + timing ── */}
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-gray-800">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusCfg.cls}`}
        >
          {statusCfg.icon}
          {statusCfg.label}
        </span>

        {!isTerminal && (
          <span className="text-[11px] text-gray-500">
            {formatDuration(entry.startedAt)} elapsed
          </span>
        )}
        {isTerminal && endedAt && (
          <span className="text-[11px] text-gray-500">
            Finished in {formatDuration(entry.startedAt, endedAt)}
          </span>
        )}

        <span className="ml-auto text-[10px] font-mono text-gray-600">
          {formatRelativeTime(entry.startedAt)}
        </span>
      </div>

      {/* ── Goal / run metadata ── */}
      <div className="px-3.5 py-2">
        <p
          className="text-xs font-medium text-gray-200 truncate"
          title={entry.goal}
        >
          {entry.goal}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-gray-600">
          <span className="font-mono">{runIdLabel}…</span>
          {entry.mode && <span>· {entry.mode}</span>}
          {currentPhase && (
            <span className="text-blue-400">· Phase: {currentPhase}</span>
          )}
        </div>
      </div>

      {/* ── Gating callout ── */}
      {liveStatus === 'gating' && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-purple-800 bg-purple-950/30 px-2.5 py-2">
          <AlertTriangle size={13} className="shrink-0 text-purple-400" aria-hidden="true" />
          <span className="flex-1 text-xs text-purple-200">
            Gate reached — human review required before the run can proceed.
          </span>
          <Link
            href={runHref}
            className="shrink-0 rounded-lg bg-purple-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-purple-600 transition-colors"
          >
            Review &amp; Approve
          </Link>
        </div>
      )}

      {/* ── Queued — no worker callout ── */}
      {(liveStatus === 'queued' || liveStatus === 'initializing') && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-amber-800/60 bg-amber-950/20 px-2.5 py-2">
          <Clock size={12} className="shrink-0 text-amber-500" aria-hidden="true" />
          <span className="text-xs text-amber-200/80">
            Run is queued — waiting for an available worker. Agents show&nbsp;0 active until a worker picks this up.
          </span>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex flex-wrap items-center gap-2 border-t border-gray-800 px-3.5 py-2">
        <Link
          href={runHref}
          className="flex items-center gap-1.5 rounded-lg border border-blue-800/60 bg-blue-950/30 px-2.5 py-1.5 text-xs font-medium text-blue-200 hover:bg-blue-950/60 hover:text-white transition-colors"
        >
          <ExternalLink size={12} aria-hidden="true" />
          Open Run Details
        </Link>

        {onViewEvents && (
          <button
            type="button"
            onClick={onViewEvents}
            disabled={!safeRunId}
            className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-gray-300 hover:text-white hover:border-gray-600 transition-colors"
          >
            <Activity size={12} aria-hidden="true" />
            View Live Events
          </button>
        )}

        {entry.proposalId && (
          <Link
            href={`/concierge?proposal=${entry.proposalId}`}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-gray-800 px-2.5 py-1.5 text-[11px] text-gray-500 hover:text-gray-300 hover:border-gray-700 transition-colors"
          >
            ← Back to Concierge
          </Link>
        )}
      </div>
    </div>
  )
}
