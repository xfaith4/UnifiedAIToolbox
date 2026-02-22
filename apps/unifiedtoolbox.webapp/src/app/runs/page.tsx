'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  fetchOrchestrationRuns,
  fetchRepoOrchestrationRuns,
  ORCHESTRATOR_API_BASE,
} from '@/lib/services/orchestratorApi'
import { listLocalRuns } from '@/lib/services/orchestratorStore'
import { listProposals } from '@/lib/services/proposalStore'
import type { OrchestrationRun, RepoOrchestrationRunSummary } from '@/lib/types/orchestrator'
import type { Proposal } from '@/lib/types/proposal'
import { PAGE_TITLES, ROUTES } from '@/lib/nav/navConfig'
import { History, ExternalLink, RefreshCw, Info, MessageSquare, ArrowRight } from 'lucide-react'

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status?: string }) {
  const s = (status ?? 'unknown').toLowerCase()
  const colorMap: Record<string, string> = {
    completed: 'bg-emerald-900/60 text-emerald-300 border-emerald-700',
    success: 'bg-emerald-900/60 text-emerald-300 border-emerald-700',
    running: 'bg-blue-900/60 text-blue-300 border-blue-700',
    in_progress: 'bg-blue-900/60 text-blue-300 border-blue-700',
    failed: 'bg-rose-900/60 text-rose-300 border-rose-700',
    error: 'bg-rose-900/60 text-rose-300 border-rose-700',
    cancelled: 'bg-gray-800 text-gray-400 border-gray-700',
  }
  const cls = colorMap[s] ?? 'bg-gray-800 text-gray-400 border-gray-700'
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
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
}: {
  id: string
  goal?: string
  status?: string
  startedAt?: string
  detailHref?: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-gray-800/50 transition-colors">
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

// ── Page ──────────────────────────────────────────────────────────────────────
// ── Draft proposal row ────────────────────────────────────────────────────────
function DraftRow({ proposal }: { proposal: Proposal }) {
  const statusColor =
    proposal.status === 'approved'
      ? 'bg-emerald-900/60 text-emerald-300 border-emerald-700'
      : 'bg-blue-900/50 text-blue-300 border-blue-700'

  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-gray-800/50 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-100">{proposal.goal.summary}</div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500">
          <span className="font-mono">{proposal.id.slice(0, 16)}</span>
          <span>{fmtDate(proposal.createdAt)}</span>
        </div>
      </div>
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
  const [apiRuns, setApiRuns] = useState<OrchestrationRun[]>([])
  const [repoRuns, setRepoRuns] = useState<RepoOrchestrationRunSummary[]>([])
  const [localRuns, setLocalRuns] = useState<OrchestrationRun[]>([])
  const [drafts, setDrafts] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [api, repo] = await Promise.allSettled([
        fetchOrchestrationRuns(),
        fetchRepoOrchestrationRuns(),
      ])
      setApiRuns(api.status === 'fulfilled' ? api.value : [])
      setRepoRuns(repo.status === 'fulfilled' ? repo.value : [])
      setLocalRuns(listLocalRuns())
      setDrafts(listProposals().filter((p) => p.status === 'draft' || p.status === 'approved'))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const totalCount = apiRuns.length + repoRuns.length + localRuns.length + drafts.length

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
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {/* Info callout */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-900/50 bg-blue-950/30 px-4 py-3 text-sm text-blue-200">
        <Info size={16} className="mt-0.5 shrink-0 text-blue-400" aria-hidden="true" />
        <span>
          Runs are the evidence trail of orchestration. Each entry records the goal, agents involved,
          token usage, and outcome. Use <strong>Reports</strong> for aggregate analytics.
        </span>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-800 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">
          Could not connect to orchestrator API ({ORCHESTRATOR_API_BASE}). Showing locally-stored runs only.
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
          <p className="text-gray-400">No runs yet. Use <Link href="/concierge" className="text-blue-400 underline">Concierge</Link> to plan your first run, or go straight to <Link href="/orchestrator" className="text-blue-400 underline">Playground</Link>.</p>
        </div>
      )}

      {!loading && apiRuns.length > 0 && (
        <SectionCard title={`Orchestrator runs (${apiRuns.length})`}>
          <div className="divide-y divide-gray-800">
            {apiRuns.map((run) => (
              <RunRow
                key={run.id}
                id={run.id}
                goal={run.goal}
                status={run.status}
                startedAt={run.startedAt ?? run.requestedAt}
                detailHref={`/runs/${encodeURIComponent(run.id)}`}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {!loading && repoRuns.length > 0 && (
        <SectionCard title={`Repo runs (${repoRuns.length})`}>
          <div className="divide-y divide-gray-800">
            {repoRuns.map((run) => (
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

      {!loading && localRuns.length > 0 && (
        <SectionCard title={`Local (offline) runs (${localRuns.length})`}>
          <div className="divide-y divide-gray-800">
            {localRuns.map((run) => (
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
        <SectionCard title={`Concierge drafts (${drafts.length})`}>
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
