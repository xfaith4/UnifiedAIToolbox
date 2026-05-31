'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity, AlertTriangle, CheckCircle2, Clock, Radio, XCircle } from 'lucide-react'
import {
  getLastRunContext,
  listRecentRunContexts,
  type RunContextEntry,
  type RunContextStatus,
  updateRunContextStatus,
} from '@/lib/services/runContextStore'
import { fetchOrchestrationRun, isOrchestratorApiHttpError } from '@/lib/services/orchestratorApi'
import { TERMINAL_RUN_STATUSES } from '@/lib/services/conciergeRunService'
import { getRunMonitorHref } from '@/lib/services/conciergeKickoff'
import { syncProposalAndDraftFromRun } from '@/lib/services/proposalRunState'

function isAppFactoryRunId(runId: string): boolean {
  return runId.startsWith('maint-')
}

async function fetchAppFactoryStatus(runId: string): Promise<string | null> {
  const res = await fetch(`/api/app-factory/runs/${encodeURIComponent(runId)}/status`, { cache: 'no-store' })
  if (!res.ok) return null
  const json = (await res.json()) as Record<string, unknown>
  const status = String(json.status ?? 'unknown').trim().toLowerCase()
  return status === 'succeeded' ? 'completed' : status
}

function pickActiveEntry(): RunContextEntry | null {
  const recent = listRecentRunContexts()
  const active = recent.find((entry) => !TERMINAL_RUN_STATUSES.has((entry.status ?? '').toLowerCase()))
  return active ?? getLastRunContext() ?? null
}

function statusPresentation(status: string) {
  const normalized = status.toLowerCase()
  if (normalized === 'running' || normalized === 'in_progress' || normalized === 'dispatching') {
    return {
      label: 'Run in progress',
      detail: 'Agents are working',
      cls: 'border-blue-800/70 bg-blue-950/45 text-blue-100',
      icon: <Radio size={12} className="animate-pulse text-blue-300" aria-hidden="true" />,
    }
  }
  if (normalized === 'queued' || normalized === 'pending') {
    return {
      label: 'Run queued',
      detail: 'Waiting for a worker',
      cls: 'border-amber-800/70 bg-amber-950/45 text-amber-100',
      icon: <Clock size={12} className="text-amber-300" aria-hidden="true" />,
    }
  }
  if (normalized === 'gating' || normalized === 'awaiting_gate' || normalized === 'awaiting_input') {
    return {
      label: 'Run needs attention',
      detail: 'Review or input required',
      cls: 'border-purple-800/70 bg-purple-950/45 text-purple-100',
      icon: <AlertTriangle size={12} className="text-purple-300" aria-hidden="true" />,
    }
  }
  if (normalized === 'completed' || normalized === 'success' || normalized === 'succeeded') {
    return {
      label: 'Run completed',
      detail: 'Open results',
      cls: 'border-emerald-800/70 bg-emerald-950/45 text-emerald-100',
      icon: <CheckCircle2 size={12} className="text-emerald-300" aria-hidden="true" />,
    }
  }
  if (normalized === 'failed' || normalized === 'error' || normalized === 'stuck' || normalized === 'cancelled') {
    return {
      label: 'Run stopped',
      detail: 'Open details',
      cls: 'border-rose-800/70 bg-rose-950/45 text-rose-100',
      icon: <XCircle size={12} className="text-rose-300" aria-hidden="true" />,
    }
  }
  return {
    label: 'Run update',
    detail: normalized || 'Status unknown',
    cls: 'border-slate-800/70 bg-slate-950/45 text-slate-100',
    icon: <Activity size={12} className="text-slate-300" aria-hidden="true" />,
  }
}

export default function GlobalRunPill() {
  const pathname = usePathname()
  const [entry, setEntry] = useState<RunContextEntry | null>(null)
  const [liveStatus, setLiveStatus] = useState<RunContextStatus>('queued')

  const refreshEntry = useCallback(() => {
    const next = pickActiveEntry()
    setEntry(next)
    setLiveStatus(next?.status ?? 'queued')
  }, [])

  useEffect(() => {
    const initialRefreshId = window.setTimeout(refreshEntry, 0)
    const pollId = window.setInterval(refreshEntry, 4_000)
    return () => {
      window.clearTimeout(initialRefreshId)
      window.clearInterval(pollId)
    }
  }, [refreshEntry])

  useEffect(() => {
    if (!entry?.runId?.trim()) return
    const safeRunId = entry.runId.trim()
    let cancelled = false

    const poll = async () => {
      try {
        let nextStatus = liveStatus
        let verificationStatus: string | null | undefined

        if (isAppFactoryRunId(safeRunId)) {
          const appFactoryStatus = await fetchAppFactoryStatus(safeRunId)
          if (!appFactoryStatus || cancelled) return
          nextStatus = appFactoryStatus
        } else {
          const run = await fetchOrchestrationRun(safeRunId)
          if (cancelled) return
          nextStatus = run.status || liveStatus
          verificationStatus = run.verificationStatus
          if (entry.proposalId) {
            syncProposalAndDraftFromRun(entry.proposalId, {
              id: run.id,
              status: run.status,
              verificationStatus: run.verificationStatus,
            })
          }
        }

        if (cancelled) return
        if (nextStatus !== liveStatus) {
          updateRunContextStatus(safeRunId, nextStatus)
          setLiveStatus(nextStatus)
        }
        if (TERMINAL_RUN_STATUSES.has(String(nextStatus).toLowerCase())) {
          if (entry.proposalId && verificationStatus === 'needs_requirements') {
            updateRunContextStatus(safeRunId, 'blocked_requirements')
            setLiveStatus('blocked_requirements')
          }
          refreshEntry()
        }
      } catch (error) {
        if (isOrchestratorApiHttpError(error) && error.status === 404) {
          updateRunContextStatus(safeRunId, 'failed')
          refreshEntry()
        }
      }
    }

    void poll()
    const id = window.setInterval(() => void poll(), 5_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [entry?.proposalId, entry?.runId, liveStatus, refreshEntry])

  const isVisible = useMemo(() => {
    if (!entry) return false
    if (pathname.startsWith('/concierge') || pathname.startsWith('/runs/')) return false
    return !TERMINAL_RUN_STATUSES.has(String(liveStatus).toLowerCase())
  }, [entry, liveStatus, pathname])

  if (!entry || !isVisible) return null

  const safeRunId = entry.runId.trim()
  const viewHref = getRunMonitorHref(safeRunId, entry.mode)
  const presentation = statusPresentation(String(liveStatus || entry.status || 'queued'))

  return (
    <Link
      href={viewHref}
      className={`fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full border px-4 py-2 shadow-2xl backdrop-blur-md transition hover:bg-opacity-90 md:max-w-md ${presentation.cls}`}
      aria-label={`${presentation.label}: ${entry.goal}`}
      title={`${presentation.label}: ${entry.goal}`}
    >
      <span className="shrink-0">{presentation.icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-semibold uppercase tracking-wide opacity-85">
          {presentation.label}
        </span>
        <span className="block truncate text-sm text-white/90">
          {entry.goal}
        </span>
      </span>
      <span className="hidden shrink-0 text-[11px] text-white/60 md:block">
        {presentation.detail}
      </span>
    </Link>
  )
}
