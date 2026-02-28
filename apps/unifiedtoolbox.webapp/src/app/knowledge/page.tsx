'use client'

import { useEffect, useState } from 'react'
import { Brain, ChevronDown, ChevronUp, Search, Star, AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react'
import { fetchKnowledgeEntries, fetchSimilarKnowledge, type KnowledgeEntry } from '@/lib/services/knowledgeApi'
import { formatRunResultLabel } from '@/lib/knowledge/status'
import { PAGE_TITLES } from '@/lib/nav/navConfig'

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(score: number | null | undefined): string {
  if (score == null) return 'text-gray-500'
  if (score >= 8) return 'text-green-400'
  if (score >= 5) return 'text-yellow-400'
  return 'text-red-400'
}

function statusIcon(status: string) {
  if (status === 'completed') return <CheckCircle size={14} className="text-green-400" />
  if (status === 'completed_with_errors') return <AlertTriangle size={14} className="text-yellow-400" />
  if (status === 'failed' || status === 'error') return <XCircle size={14} className="text-red-400" />
  return <Clock size={14} className="text-gray-400" />
}

function verificationBadge(v: string | null | undefined) {
  if (!v || v === 'pending') return null
  const colors: Record<string, string> = {
    passed: 'bg-green-900/40 text-green-300',
    needs_requirements: 'bg-amber-900/40 text-amber-300',
    blocked_requirements: 'bg-amber-900/40 text-amber-300',
    partial: 'bg-yellow-900/40 text-yellow-300',
    failed: 'bg-red-900/40 text-red-300',
    deferred: 'bg-gray-700/60 text-gray-300',
  }
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${colors[v] ?? 'bg-gray-700/50 text-gray-400'}`}>
      {v}
    </span>
  )
}

function learningBadge(status: KnowledgeEntry['knowledge_status']) {
  const value = status ?? 'needs_info'
  const colors: Record<string, string> = {
    pass: 'bg-emerald-900/40 text-emerald-300',
    needs_info: 'bg-amber-900/40 text-amber-300',
    fail: 'bg-rose-900/40 text-rose-300',
  }
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${colors[value] ?? colors.needs_info}`}>
      Learning: {value.replace('_', ' ')}
    </span>
  )
}

// ── Entry Card ────────────────────────────────────────────────────────────────

function EntryCard({ entry, similarity }: { entry: KnowledgeEntry; similarity?: number }) {
  const [expanded, setExpanded] = useState(false)

  const hasFacts = (entry.researcher_facts?.length ?? 0) > 0
  const hasBlockers = (entry.critic_blockers?.length ?? 0) > 0
  const hasWarnings = (entry.overseer_warnings?.length ?? 0) > 0
  const hasImprovements = (entry.commissioner_improvements?.length ?? 0) > 0
  const preventionPatches = entry.learning?.prevention_patches ?? []
  const regressionChecks = entry.learning?.regression_checks ?? []
  const topPatchSummaries = preventionPatches.slice(0, 2).map((p) => p.change)

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {statusIcon(entry.status)}
            {learningBadge(entry.knowledge_status)}
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
              {formatRunResultLabel(entry.verification_status)}
            </span>
            {verificationBadge(entry.verification_status)}
            {similarity != null && (
              <span className="rounded bg-blue-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300">
                {Math.round(similarity * 100)}% match
              </span>
            )}
            <span className="text-[10px] text-gray-500">{entry.run_id}</span>
          </div>
          <p className="text-sm font-medium text-gray-100 leading-snug">{entry.goal}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {entry.commissioner_score != null && (
            <span className={`text-lg font-bold tabular-nums ${scoreColor(entry.commissioner_score)}`}>
              {entry.commissioner_score}/10
            </span>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-gray-500 hover:text-gray-300"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Collapsed summary row */}
      {!expanded && entry.commissioner_recommendation && (
        <div className="mt-1.5 space-y-1">
          <p className="text-xs text-gray-400 italic">{entry.commissioner_recommendation}</p>
          <p className="text-[11px] text-gray-500">
            What changed: {preventionPatches.length} prevention patch{preventionPatches.length === 1 ? '' : 'es'} · {regressionChecks.length} regression check{regressionChecks.length === 1 ? '' : 's'}
          </p>
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-3 space-y-3 border-t border-gray-800 pt-3 text-xs text-gray-300">
          <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-2 space-y-1">
            <p className="font-semibold text-gray-400">What changed</p>
            <p className="text-gray-300">
              Prevention patches: {preventionPatches.length} · Regression checks: {regressionChecks.length}
            </p>
            {topPatchSummaries.length > 0 && (
              <ul className="list-disc list-inside space-y-0.5 text-gray-300">
                {topPatchSummaries.map((summary, idx) => (
                  <li key={idx}>{summary}</li>
                ))}
              </ul>
            )}
          </div>
          {entry.learning?.questions_needed && entry.learning.questions_needed.length > 0 && (
            <div>
              <p className="font-semibold text-gray-400 mb-1">Questions needed</p>
              <ul className="list-disc list-inside space-y-0.5">
                {entry.learning.questions_needed.map((q, i) => (
                  <li key={i} className="text-amber-300">{q}</li>
                ))}
              </ul>
            </div>
          )}
          {entry.commissioner_rationale && (
            <div>
              <p className="font-semibold text-gray-400 mb-0.5">Commissioner rationale</p>
              <p className="text-gray-300 leading-relaxed">{entry.commissioner_rationale}</p>
            </div>
          )}
          {hasImprovements && (
            <div>
              <p className="font-semibold text-gray-400 mb-1">Required improvements</p>
              <ul className="list-disc list-inside space-y-0.5">
                {entry.commissioner_improvements!.map((imp, i) => (
                  <li key={i} className="text-yellow-300">{imp}</li>
                ))}
              </ul>
            </div>
          )}
          {hasBlockers && (
            <div>
              <p className="font-semibold text-gray-400 mb-1">Critic blockers</p>
              <ul className="list-disc list-inside space-y-0.5">
                {entry.critic_blockers!.map((b, i) => (
                  <li key={i} className="text-red-300">{String(b)}</li>
                ))}
              </ul>
            </div>
          )}
          {hasFacts && (
            <div>
              <p className="font-semibold text-gray-400 mb-1">Researcher facts</p>
              <ul className="list-disc list-inside space-y-0.5">
                {entry.researcher_facts!.map((f, i) => (
                  <li key={i}>{String(f)}</li>
                ))}
              </ul>
            </div>
          )}
          {hasWarnings && (
            <div>
              <p className="font-semibold text-gray-400 mb-1">Overseer warnings</p>
              <ul className="list-disc list-inside space-y-0.5">
                {entry.overseer_warnings!.map((w, i) => (
                  <li key={i} className="text-yellow-300">{w}</li>
                ))}
              </ul>
            </div>
          )}
          {entry.acceptance_checks_summary && (
            <div className="flex gap-4">
              <span className="text-green-300">{entry.acceptance_checks_summary.passed} passed</span>
              <span className="text-red-300">{entry.acceptance_checks_summary.failed} failed</span>
              <span className="text-gray-400">{entry.acceptance_checks_summary.deferred} deferred</span>
            </div>
          )}
          <div className="flex flex-wrap gap-3 text-gray-500">
            {entry.agents.length > 0 && (
              <span>Agents: {entry.agents.join(', ')}</span>
            )}
            {entry.model && <span>Model: {entry.model}</span>}
            <span>{new Date(entry.ingested_at).toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function KnowledgePage() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<KnowledgeEntry[] | null>(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    fetchKnowledgeEntries()
      .then(setEntries)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = searchQuery.trim()
    if (!q) {
      setSearchResults(null)
      return
    }
    setSearching(true)
    try {
      const results = await fetchSimilarKnowledge(q, 10)
      setSearchResults(results)
    } catch (err) {
      setError(String(err))
    } finally {
      setSearching(false)
    }
  }

  // Computed stats
  const totalRuns = entries.length
  const withScore = entries.filter((e) => e.commissioner_score != null)
  const avgScore = withScore.length
    ? (withScore.reduce((s, e) => s + (e.commissioner_score ?? 0), 0) / withScore.length).toFixed(1)
    : null
  const successRate = totalRuns
    ? Math.round((entries.filter((e) => e.status === 'completed' || e.status === 'completed_with_errors').length / totalRuns) * 100)
    : null

  const displayList = (searchResults ?? entries).slice().sort((a, b) => {
    const rank = (status?: string | null) => {
      if (status === 'pass') return 0
      if (status === 'needs_info') return 1
      if (status === 'fail') return 2
      return 1
    }
    const rankDelta = rank(a.knowledge_status) - rank(b.knowledge_status)
    if (rankDelta !== 0) return rankDelta
    return String(b.ingested_at).localeCompare(String(a.ingested_at))
  })

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-900/50">
          <Brain size={22} className="text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-100">{PAGE_TITLES.knowledge ?? 'Knowledge'}</h1>
          <p className="text-sm text-gray-400">Agent learnings from past orchestration runs</p>
        </div>
      </div>

      {/* Stats */}
      {!loading && !error && totalRuns > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-center">
            <div className="text-2xl font-bold text-gray-100">{totalRuns}</div>
            <div className="text-xs text-gray-400 mt-0.5">Runs indexed</div>
          </div>
          {avgScore && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-center">
              <div className={`text-2xl font-bold ${scoreColor(parseFloat(avgScore))}`}>{avgScore}</div>
              <div className="text-xs text-gray-400 mt-0.5">Avg Commissioner score</div>
            </div>
          )}
          {successRate != null && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-center">
              <div className="text-2xl font-bold text-gray-100">{successRate}%</div>
              <div className="text-xs text-gray-400 mt-0.5">Completion rate</div>
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              if (!e.target.value.trim()) setSearchResults(null)
            }}
            placeholder="Search similar goals…"
            className="w-full rounded-xl border border-gray-700 bg-gray-900 py-2 pl-9 pr-4 text-sm text-gray-100 placeholder:text-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
        </div>
        <button
          type="submit"
          disabled={searching || !searchQuery.trim()}
          className="rounded-xl bg-purple-700 px-4 py-2 text-sm font-medium text-white hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
        {searchResults && (
          <button
            type="button"
            onClick={() => { setSearchResults(null); setSearchQuery('') }}
            className="rounded-xl border border-gray-700 px-3 py-2 text-sm text-gray-400 hover:text-gray-200"
          >
            Clear
          </button>
        )}
      </form>

      {/* Content */}
      {loading && (
        <div className="py-12 text-center text-gray-500 text-sm">Loading knowledge base…</div>
      )}
      {error && (
        <div className="rounded-xl border border-red-800 bg-red-950/30 p-4 text-sm text-red-300">
          Failed to load knowledge base: {error}
        </div>
      )}
      {!loading && !error && displayList.length === 0 && (
        <div className="py-16 text-center">
          <Brain size={40} className="mx-auto mb-3 text-gray-700" />
          <p className="text-sm text-gray-500">
            {searchResults != null
              ? 'No similar runs found. Try a different search.'
              : 'No runs indexed yet. Complete an orchestration run to start building the knowledge base.'}
          </p>
        </div>
      )}
      {!loading && !error && displayList.length > 0 && (
        <div className="space-y-3">
          {searchResults != null && (
            <p className="text-xs text-gray-500">
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} matching &ldquo;{searchQuery}&rdquo;
            </p>
          )}
          {displayList.map((entry) => (
            <EntryCard
              key={entry.run_id}
              entry={entry}
              similarity={entry._similarity}
            />
          ))}
        </div>
      )}
    </div>
  )
}
