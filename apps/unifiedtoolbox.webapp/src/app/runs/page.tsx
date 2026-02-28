'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  bulkCancelOrchestrationRuns,
  fetchOrchestrationRuns,
  fetchOrchestrationQueueLimits,
  fetchRepoOrchestrationRuns,
  ORCHESTRATOR_API_BASE,
} from '@/lib/services/orchestratorApi'
import { listLocalRuns } from '@/lib/services/orchestratorStore'
import { listProposals } from '@/lib/services/proposalStore'
import { getToolAudit } from '@/lib/services/toolPermissionStore'
import type { OrchestrationQueueLimits } from '@/lib/services/orchestratorApi'
import type { OrchestrationRun, RepoOrchestrationRunSummary } from '@/lib/types/orchestrator'
import type { Proposal } from '@/lib/types/proposal'
import { PAGE_TITLES, ROUTES } from '@/lib/nav/navConfig'
import {
  History,
  ExternalLink,
  RefreshCw,
  Info,
  MessageSquare,
  ArrowRight,
  Wrench,
  Radio,
  XCircle,
} from 'lucide-react'

// ── Status helpers ─────────────────────────────────────────────────────────────

const STATUS_ACTIVE  = new Set(['running', 'in_progress'])
const STATUS_QUEUED  = new Set(['queued', 'pending'])

type FilterTab = 'all' | 'running' | 'queued' | 'gating' | 'complete' | 'failed'

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all',      label: 'All' },
  { id: 'running',  label: 'Running' },
  { id: 'queued',   label: 'Queued' },
  { id: 'gating',   label: 'Gating' },
  { id: 'complete', label: 'Complete' },
  { id: 'failed',   label: 'Failed' },
]

function matchesFilter(status: string | undefined, tab: FilterTab): boolean {
  const s = (status ?? 'unknown').toLowerCase()
  switch (tab) {
    case 'all':      return true
    case 'running':  return STATUS_ACTIVE.has(s)
    case 'queued':   return STATUS_QUEUED.has(s)
    case 'gating':   return s === 'gating' || s === 'awaiting_gate'
    case 'complete': return s === 'completed' || s === 'success' || s === 'succeeded'
    case 'failed':   return s === 'failed' || s === 'error'
    default:         return true
  }
}

function isQueuedStatus(status: string | undefined): boolean {
  return STATUS_QUEUED.has((status ?? 'unknown').toLowerCase())
}

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status?: string }) {
  const s = (status ?? 'unknown').toLowerCase()
  const colorMap: Record<string, string> = {
    completed:     'bg-emerald-900/60 text-emerald-300 border-emerald-700',
    success:       'bg-emerald-900/60 text-emerald-300 border-emerald-700',
    succeeded:     'bg-emerald-900/60 text-emerald-300 border-emerald-700',
    running:       'bg-blue-900/60 text-blue-300 border-blue-700',
    in_progress:   'bg-blue-900/60 text-blue-300 border-blue-700',
    queued:        'bg-amber-900/60 text-amber-300 border-amber-700',
    pending:       'bg-amber-900/60 text-amber-300 border-amber-700',
    gating:        'bg-purple-900/60 text-purple-300 border-purple-700',
    awaiting_gate: 'bg-purple-900/60 text-purple-300 border-purple-700',
    failed:        'bg-rose-900/60 text-rose-300 border-rose-700',
    error:         'bg-rose-900/60 text-rose-300 border-rose-700',
    cancelled:     'bg-gray-800 text-gray-400 border-gray-700',
  }
  const cls = colorMap[s] ?? 'bg-gray-800 text-gray-400 border-gray-700'
  const isLive = STATUS_ACTIVE.has(s)
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {isLive && <Radio size={10} className="animate-pulse" aria-hidden="true" />}
      {status ?? 'unknown'}
    </span>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(ts?: string) {
  if (!ts) return '—'
  const d = new Date(ts)
  return isNaN(d.getTime()) ? ts : d.toLocaleString()
}

function truncate(s?: string, n = 72) {
  if (!s) return '—'
  return s.length > n ? s.slice(0, n) + '…' : s
}

// ── Section card ──────────────────────────────────────────────────────────────
function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">{title}</h2>
      {children}
    </section>
  )
}

// ── Run row (generic) ─────────────────────────────────────────────────────────
function RunRow({
  id,
  goal,
  status,
  startedAt,
  detailHref,
  selectable,
  selected,
  onToggleSelect,
}: {
  id: string
  goal?: string
  status?: string
  startedAt?: string
  detailHref?: string
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (runId: string) => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-gray-800/50 transition-colors">
      {selectable && onToggleSelect && (
        <label className="inline-flex items-center">
          <input
            type="checkbox"
            checked={Boolean(selected)}
            onChange={() => onToggleSelect(id)}
            className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
            aria-label={`Select queued run ${id}`}
          />
        </label>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-100">{truncate(goal, 80) || id}</div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500">
          <span className="font-mono">{id.slice(0, 12)}</span>
          <span>{fmtDate(startedAt)}</span>
        </div>
      </div>
      <StatusBadge status={status} />
      {detailHref && (
        <Link
          href={detailHref}
          className="ml-2 flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs text-gray-300 hover:text-white hover:border-gray-600 transition-colors"
        >
          <ExternalLink size={12} aria-hidden="true" />
          View
        </Link>
      )}
    </div>
  )
}

// ── Draft proposal row ────────────────────────────────────────────────────────
function DraftRow({ proposal }: { proposal: Proposal }) {
  const statusColor =
    proposal.status === 'approved' || proposal.status === 'completed'
      ? 'bg-emerald-900/60 text-emerald-300 border-emerald-700'
      : proposal.status === 'running'
        ? 'bg-blue-900/60 text-blue-300 border-blue-700'
        : 'bg-blue-900/50 text-blue-300 border-blue-700'

  const enabledToolCount = getToolAudit(proposal.id)?.tools.filter((t) => t.enabled).length ?? 0

  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-gray-800/50 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-100">{proposal.goal.summary}</div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500">
          <span className="font-mono">{proposal.id.slice(0, 16)}</span>
          <span>{fmtDate(proposal.createdAt)}</span>
        </div>
      </div>
      {enabledToolCount > 0 && (
        <span className="flex items-center gap-1 rounded-full border border-gray-700 bg-gray-800 px-2 py-0.5 text-[11px] text-gray-400">
          <Wrench size={10} aria-hidden="true" />
          {enabledToolCount}
        </span>
      )}
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusColor}`}>
        {proposal.status}
      </span>
      <Link
        href={`${ROUTES.concierge}?proposal=${proposal.id}`}
        className="ml-2 flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs text-gray-300 hover:text-white hover:border-gray-600 transition-colors"
      >
        <ArrowRight size={12} aria-hidden="true" />
        Open
      </Link>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function RunsPage() {
  const [apiRuns, setApiRuns]     = useState<OrchestrationRun[]>([])
  const [repoRuns, setRepoRuns]   = useState<RepoOrchestrationRunSummary[]>([])
  const [localRuns, setLocalRuns] = useState<OrchestrationRun[]>([])
  const [drafts, setDrafts]       = useState<Proposal[]>([])
  const [queueLimits, setQueueLimits] = useState<OrchestrationQueueLimits | null>(null)
  const [selectedQueuedRunIds, setSelectedQueuedRunIds] = useState<string[]>([])
  const [bulkCancelPending, setBulkCancelPending] = useState(false)
  const [bulkCancelMessage, setBulkCancelMessage] = useState<string | null>(null)
  const [bulkCancelError, setBulkCancelError] = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  // ── Filter + auto-refresh ──────────────────────────────────────────────────
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [autoRefresh, setAutoRefresh]   = useState(false)
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [api, repo, limits] = await Promise.allSettled([
        fetchOrchestrationRuns(),
        fetchRepoOrchestrationRuns(),
        fetchOrchestrationQueueLimits(),
      ])
      const nextApiRuns = api.status === 'fulfilled' ? api.value : []
      setApiRuns(nextApiRuns)
      setRepoRuns(repo.status === 'fulfilled' ? repo.value : [])
      setLocalRuns(listLocalRuns())
      setDrafts(listProposals().filter((p) => ['draft', 'approved', 'running', 'completed'].includes(p.status)))
      setQueueLimits(limits.status === 'fulfilled' ? limits.value : null)

      const queuedIds = new Set(nextApiRuns.filter((r) => isQueuedStatus(r.status)).map((r) => r.id))
      setSelectedQueuedRunIds((prev) => prev.filter((id) => queuedIds.has(id)))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  // Auto-refresh every 10s when enabled
  useEffect(() => {
    if (autoRefreshRef.current) {
      clearInterval(autoRefreshRef.current)
      autoRefreshRef.current = null
    }
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(() => void load(), 10_000)
    }
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current)
    }
  }, [autoRefresh])

  // ── Filtered data ────────────────────────────────────────────────────────

  const filteredApiRuns  = apiRuns.filter((r) => matchesFilter(r.status, activeFilter))
  const filteredRepoRuns = repoRuns.filter((r) => matchesFilter(r.status, activeFilter))
  const filteredLocal    = localRuns.filter((r) => matchesFilter(r.status, activeFilter))

  function countForTab(tab: FilterTab): number {
    if (tab === 'all') return apiRuns.length + repoRuns.length + localRuns.length + drafts.length
    return (
      apiRuns.filter((r) => matchesFilter(r.status, tab)).length +
      repoRuns.filter((r) => matchesFilter(r.status, tab)).length +
      localRuns.filter((r) => matchesFilter(r.status, tab)).length
    )
  }

  const totalCount    = apiRuns.length + repoRuns.length + localRuns.length + drafts.length
  const hasActiveRuns = apiRuns.some((r) => STATUS_ACTIVE.has((r.status ?? '').toLowerCase()))
  const hasQueuedRuns = apiRuns.some((r) => STATUS_QUEUED.has((r.status ?? '').toLowerCase()))
  const queuedApiRuns = apiRuns.filter((r) => isQueuedStatus(r.status))
  const queuedVisibleRuns = filteredApiRuns.filter((r) => isQueuedStatus(r.status))
  const allVisibleQueuedSelected =
    queuedVisibleRuns.length > 0 && queuedVisibleRuns.every((run) => selectedQueuedRunIds.includes(run.id))

  const toggleQueuedRunSelection = (runId: string) => {
    setSelectedQueuedRunIds((prev) =>
      prev.includes(runId) ? prev.filter((id) => id !== runId) : [...prev, runId]
    )
  }

  const selectAllVisibleQueuedRuns = () => {
    const visibleIds = queuedVisibleRuns.map((run) => run.id)
    setSelectedQueuedRunIds((prev) => {
      const set = new Set(prev)
      if (allVisibleQueuedSelected) {
        visibleIds.forEach((id) => set.delete(id))
      } else {
        visibleIds.forEach((id) => set.add(id))
      }
      return Array.from(set)
    })
  }

  const selectAllQueuedRuns = () => {
    setSelectedQueuedRunIds(queuedApiRuns.map((run) => run.id))
  }

  const clearQueuedSelection = () => {
    setSelectedQueuedRunIds([])
  }

  const cancelQueuedRuns = async (cancelAllQueued: boolean) => {
    setBulkCancelPending(true)
    setBulkCancelError(null)
    setBulkCancelMessage(null)
    try {
      const result = await bulkCancelOrchestrationRuns({
        runIds: cancelAllQueued ? [] : selectedQueuedRunIds,
        cancelAllQueued,
      })
      const cancelledNow = result.cancelled
      const requested = result.cancel_requested ?? result.cancelRequested ?? 0
      setBulkCancelMessage(
        cancelAllQueued
          ? `Bulk cancel processed: ${cancelledNow} cancelled, ${requested} cancellation request(s).`
          : `Selected cancel processed: ${cancelledNow} cancelled, ${requested} cancellation request(s).`
      )
      setSelectedQueuedRunIds([])
      await load()
    } catch (e) {
      setBulkCancelError(e instanceof Error ? e.message : String(e))
    } finally {
      setBulkCancelPending(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-800">
            <History size={22} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">{PAGE_TITLES.runs}</h1>
            <p className="mt-0.5 text-sm text-gray-400">
              Evidence trail of every orchestration — click any run to inspect details.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Auto-refresh toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <div
              role="switch"
              aria-checked={autoRefresh}
              onClick={() => setAutoRefresh((v) => !v)}
              className={`relative h-5 w-9 rounded-full transition-colors cursor-pointer ${
                autoRefresh ? 'bg-blue-600' : 'bg-gray-700'
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  autoRefresh ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </div>
            <span className="text-xs text-gray-400 whitespace-nowrap">Auto-refresh</span>
          </label>

          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      {/* Info callout */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-900/50 bg-blue-950/30 px-4 py-3 text-sm text-blue-200">
        <Info size={16} className="mt-0.5 shrink-0 text-blue-400" aria-hidden="true" />
        <span>
          Runs are the evidence trail of orchestration. Each entry records the goal, agents involved,
          token usage, and outcome. Use <strong>Reports</strong> for aggregate analytics.
          {' '}
          <Link href="/concierge" className="underline hover:text-blue-100">Concierge</Link>
          {' '}creates proposals that turn into runs tracked here.
        </span>
      </div>

      {/* Active / queued run callout */}
      {(hasActiveRuns || hasQueuedRuns) && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-900/50 bg-emerald-950/20 px-4 py-3 text-sm">
          <Radio size={15} className="shrink-0 text-emerald-400 animate-pulse" aria-hidden="true" />
          <span className="text-emerald-200">
            {hasActiveRuns
              ? 'An orchestration is currently running — refresh to see latest status.'
              : 'A run is queued and waiting for a worker to pick it up. Agents will show 0 active until a worker starts.'}
          </span>
        </div>
      )}

      {queueLimits && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-900/50 bg-amber-950/20 px-4 py-3 text-sm">
          <Info size={15} className="shrink-0 text-amber-400" aria-hidden="true" />
          <span className="text-amber-200">
            Queue safeguard active: max {queueLimits.max_concurrent} concurrent run(s), currently {queueLimits.running} running and {queueLimits.queued} queued.
          </span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-800 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">
          Could not connect to orchestrator API ({ORCHESTRATOR_API_BASE}). Showing locally-stored runs only.
        </div>
      )}

      {bulkCancelMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-800/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
          <XCircle size={15} className="text-emerald-400" aria-hidden="true" />
          {bulkCancelMessage}
        </div>
      )}

      {bulkCancelError && (
        <div className="rounded-xl border border-rose-800 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">
          {bulkCancelError}
        </div>
      )}

      {/* ── Filter tabs ── */}
      {!loading && totalCount > 0 && (
        <div className="flex flex-wrap gap-1 rounded-xl border border-gray-800 bg-gray-900/60 p-1">
          {FILTER_TABS.map((tab) => {
            const count = countForTab(tab.id)
            const isActive = activeFilter === tab.id
            const isLiveTab    = tab.id === 'running' && hasActiveRuns
            const isQueuedTab  = tab.id === 'queued'  && hasQueuedRuns
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                {(isLiveTab || isQueuedTab) && (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isLiveTab ? 'bg-blue-300 animate-pulse' : 'bg-amber-400'
                    }`}
                    aria-hidden="true"
                  />
                )}
                {tab.label}
                {count > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    isActive ? 'bg-blue-500/60 text-white' : 'bg-gray-800 text-gray-400'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <RefreshCw size={20} className="animate-spin mr-2" />
          Loading runs…
        </div>
      )}

      {!loading && totalCount === 0 && (
        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 px-6 py-14 text-center">
          <History size={32} className="mx-auto mb-3 text-gray-600" />
          <p className="text-gray-400">
            No runs yet. Use <Link href="/concierge" className="text-blue-400 underline">Concierge</Link> to
            plan your first run, or go straight to <Link href="/orchestrator" className="text-blue-400 underline">Playground</Link>.
          </p>
        </div>
      )}

      {/* No results for this filter */}
      {!loading && totalCount > 0 && activeFilter !== 'all' &&
        filteredApiRuns.length === 0 && filteredRepoRuns.length === 0 && filteredLocal.length === 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 px-6 py-8 text-center">
          <p className="text-sm text-gray-500">No runs with status &ldquo;{activeFilter}&rdquo;.</p>
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className="mt-2 text-xs text-blue-400 hover:underline"
          >
            Show all runs →
          </button>
        </div>
      )}

      {!loading && filteredApiRuns.length > 0 && (
        <SectionCard title={`Orchestrator runs (${filteredApiRuns.length})`}>
          {queuedApiRuns.length > 0 && (
            <div className="mb-3 rounded-xl border border-amber-900/50 bg-amber-950/20 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-amber-200">
                  Queued runs: {queuedApiRuns.length} · selected: {selectedQueuedRunIds.length}
                </span>
                <button
                  type="button"
                  onClick={selectAllVisibleQueuedRuns}
                  disabled={queuedVisibleRuns.length === 0}
                  className="rounded-lg border border-gray-700 bg-gray-800 px-2 py-1 text-[11px] text-gray-200 hover:text-white disabled:opacity-40"
                >
                  {allVisibleQueuedSelected ? 'Unselect visible queued' : 'Select visible queued'}
                </button>
                <button
                  type="button"
                  onClick={selectAllQueuedRuns}
                  disabled={queuedApiRuns.length === 0}
                  className="rounded-lg border border-gray-700 bg-gray-800 px-2 py-1 text-[11px] text-gray-200 hover:text-white disabled:opacity-40"
                >
                  Select all queued
                </button>
                <button
                  type="button"
                  onClick={clearQueuedSelection}
                  disabled={selectedQueuedRunIds.length === 0}
                  className="rounded-lg border border-gray-700 bg-gray-800 px-2 py-1 text-[11px] text-gray-300 hover:text-white disabled:opacity-40"
                >
                  Clear selection
                </button>
                <button
                  type="button"
                  onClick={() => void cancelQueuedRuns(false)}
                  disabled={bulkCancelPending || selectedQueuedRunIds.length === 0}
                  className="rounded-lg border border-rose-700/80 bg-rose-900/40 px-2 py-1 text-[11px] text-rose-100 hover:bg-rose-900/60 disabled:opacity-40"
                >
                  {bulkCancelPending ? 'Cancelling…' : `Cancel selected (${selectedQueuedRunIds.length})`}
                </button>
                <button
                  type="button"
                  onClick={() => void cancelQueuedRuns(true)}
                  disabled={bulkCancelPending || queuedApiRuns.length === 0}
                  className="rounded-lg border border-rose-700/80 bg-rose-900/40 px-2 py-1 text-[11px] text-rose-100 hover:bg-rose-900/60 disabled:opacity-40"
                >
                  {bulkCancelPending ? 'Cancelling…' : 'Cancel ALL queued'}
                </button>
              </div>
            </div>
          )}
          <div className="divide-y divide-gray-800">
            {filteredApiRuns.map((run) => (
              <RunRow
                key={run.id}
                id={run.id}
                goal={run.goal}
                status={run.status}
                startedAt={run.startedAt ?? run.requestedAt}
                detailHref={`/runs/${encodeURIComponent(run.id)}`}
                selectable={isQueuedStatus(run.status)}
                selected={selectedQueuedRunIds.includes(run.id)}
                onToggleSelect={toggleQueuedRunSelection}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {!loading && filteredRepoRuns.length > 0 && (
        <SectionCard title={`Repo runs (${filteredRepoRuns.length})`}>
          <div className="divide-y divide-gray-800">
            {filteredRepoRuns.map((run) => (
              <RunRow
                key={run.runId}
                id={run.runId}
                goal={run.repo}
                status={run.status}
                startedAt={run.requestedAt}
                detailHref={`/runs/${encodeURIComponent(run.runId)}`}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {!loading && filteredLocal.length > 0 && (
        <SectionCard title={`Local (offline) runs (${filteredLocal.length})`}>
          <div className="divide-y divide-gray-800">
            {filteredLocal.map((run) => (
              <RunRow
                key={run.id}
                id={run.id}
                goal={run.goal}
                status={run.status}
                startedAt={run.startedAt ?? run.requestedAt}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {/* Drafts from Concierge proposals */}
      {!loading && drafts.length > 0 && (
        <SectionCard title={`Concierge proposals (${drafts.length})`}>
          <p className="mb-3 text-xs text-gray-500 flex items-center gap-1.5">
            <MessageSquare size={12} aria-hidden="true" />
            Proposals generated by the Concierge — approve one to create a runnable config.
          </p>
          <div className="divide-y divide-gray-800">
            {drafts.map((p) => (
              <DraftRow key={p.id} proposal={p} />
            ))}
          </div>
        </SectionCard>
      )}

      {/* Quick links */}
      {!loading && (
        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            href="/concierge"
            className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-2 text-gray-300 hover:text-white transition-colors"
          >
            Plan with Concierge →
          </Link>
          <Link
            href="/orchestrator"
            className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-2 text-gray-300 hover:text-white transition-colors"
          >
            Launch in Playground →
          </Link>
          <Link
            href="/milestones"
            className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-2 text-gray-300 hover:text-white transition-colors"
          >
            View Reports →
          </Link>
        </div>
      )}
    </div>
  )
}
