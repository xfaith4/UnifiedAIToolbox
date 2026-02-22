'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import { ORCHESTRATOR_API_BASE } from '@/lib/services/orchestratorApi'
import { renderMarkdown } from '@/lib/artifacts/viewerUtils'
import type { GitHubRepo } from '@/lib/types/github'
import type { RepoOrchestrationEvent, RepoOrchestrationResult } from '@/lib/types/orchestrator'

interface GitHubRepoPanelProps {
  envReady: boolean
  repos: GitHubRepo[]
  reposLoading: boolean
  selectedRepo: GitHubRepo | null
  onSelectRepo: (repo: GitHubRepo | null) => void
  branch: string
  onBranchChange: (v: string) => void
  integrationBranch: string
  onIntegrationBranchChange: (v: string) => void
  events: RepoOrchestrationEvent[]
  running: boolean
  result: RepoOrchestrationResult | null
  reportMd: string
  cancelFn: (() => void) | null
  error: string | null
  runId: string | null
  runDir: string | null
  logsDir: string | null
}

// ── Event type styles (for raw log fallback) ─────────────────────────────────
const EVENT_TYPE_STYLES: Record<string, string> = {
  error:          'bg-rose-900/60 text-rose-200 border-rose-700',
  complete:       'bg-emerald-900/60 text-emerald-200 border-emerald-700',
  task_progress:  'bg-blue-900/60 text-blue-200 border-blue-800',
  clone_progress: 'bg-slate-800/80 text-slate-300 border-slate-700',
  codex_summary:  'bg-violet-900/60 text-violet-200 border-violet-700',
  merged:         'bg-emerald-900/60 text-emerald-200 border-emerald-700',
  tasks_complete: 'bg-emerald-900/40 text-emerald-300 border-emerald-800',
}

const OUTCOME_STYLES: Record<string, string> = {
  changes_applied:      'border-emerald-600 text-emerald-300 bg-emerald-900/30',
  no_changes:           'border-slate-600 text-slate-300 bg-slate-800/40',
  no_changes_by_design: 'border-slate-600 text-slate-300 bg-slate-800/40',
  blocked:              'border-amber-600 text-amber-300 bg-amber-900/30',
  failed:               'border-rose-600 text-rose-300 bg-rose-900/30',
}

// ── Run Cards ─────────────────────────────────────────────────────────────────
type Phase = 'setup' | 'plan' | 'implement' | 'review' | 'ship'
type CardStatus = 'queued' | 'running' | 'done' | 'error'

const PHASE_ORDER: Phase[] = ['setup', 'plan', 'implement', 'review', 'ship']

interface PhaseMeta {
  label: string
  accent: string
  dimText: string
  borderColor: string
}

const PHASE_META: Record<Phase, PhaseMeta> = {
  setup:     { label: 'Setup & Clone',  accent: 'text-blue-300',    dimText: 'text-blue-500',    borderColor: 'border-blue-900' },
  plan:      { label: 'Planning',       accent: 'text-violet-300',  dimText: 'text-violet-500',  borderColor: 'border-violet-900' },
  implement: { label: 'Implement',      accent: 'text-amber-300',   dimText: 'text-amber-600',   borderColor: 'border-amber-900' },
  review:    { label: 'Review',         accent: 'text-purple-300',  dimText: 'text-purple-500',  borderColor: 'border-purple-900' },
  ship:      { label: 'Ship',           accent: 'text-emerald-300', dimText: 'text-emerald-600', borderColor: 'border-emerald-900' },
}

// Map event.type → Phase
const EVENT_PHASE_MAP: Partial<Record<string, Phase>> = {
  clone_progress: 'setup',
  start:          'setup',
  cloning:        'setup',
  plan:           'plan',
  planning:       'plan',
  plan_progress:  'plan',
  task_progress:  'implement',
  codex_run:      'implement',
  agent_work:     'implement',
  codex_summary:  'review',
  tasks_complete: 'review',
  merged:         'ship',
  complete:       'ship',
  pr_created:     'ship',
}

function classifyPhase(event: RepoOrchestrationEvent): Phase {
  return EVENT_PHASE_MAP[event.type ?? ''] ?? 'implement'
}

function buildCards(
  events: RepoOrchestrationEvent[],
  running: boolean
): Array<{ phase: Phase; status: CardStatus; events: RepoOrchestrationEvent[] }> {
  const grouped: Record<Phase, RepoOrchestrationEvent[]> = {
    setup: [], plan: [], implement: [], review: [], ship: [],
  }
  for (const ev of events) {
    if (ev.type === 'error') continue
    grouped[classifyPhase(ev)].push(ev)
  }

  const isFinal = events.some(e => e.final || e.type === 'complete' || e.type === 'merged')
  const hasError = events.some(e => e.type === 'error')

  // Last phase index that has any events
  let activeIdx = -1
  for (let i = PHASE_ORDER.length - 1; i >= 0; i--) {
    if (grouped[PHASE_ORDER[i]].length > 0) { activeIdx = i; break }
  }

  return PHASE_ORDER.map((phase, idx) => {
    const phaseEvts = grouped[phase]
    let status: CardStatus
    if (phaseEvts.length === 0) {
      status = 'queued'
    } else if (idx === activeIdx && running && !isFinal) {
      status = 'running'
    } else if (idx === activeIdx && hasError && !isFinal) {
      // Error cut the run short — mark the last active phase as errored
      status = 'error'
    } else {
      status = 'done'
    }
    return { phase, status, events: phaseEvts }
  })
}

function formatEventTs(ev: RepoOrchestrationEvent): string | null {
  const raw = (ev as Record<string, unknown>)['ts'] ?? (ev as Record<string, unknown>)['timestamp']
  if (!raw || typeof raw !== 'string') return null
  try {
    const d = new Date(raw)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return null
  }
}

function StatusDot({ status }: { status: CardStatus }) {
  if (status === 'queued') {
    return <span className="h-3 w-3 rounded-full border-2 border-slate-600 bg-transparent flex-shrink-0" />
  }
  if (status === 'running') {
    return (
      <span className="relative flex h-3 w-3 flex-shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
        <span className="relative h-3 w-3 rounded-full bg-blue-400" />
      </span>
    )
  }
  if (status === 'done') {
    return (
      <span className="flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[8px] font-bold text-white">
        ✓
      </span>
    )
  }
  return (
    <span className="flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-full bg-rose-500 text-[8px] font-bold text-white">
      ✕
    </span>
  )
}

function RunCards({
  events,
  running,
  cancelFn,
  prUrl,
}: {
  events: RepoOrchestrationEvent[]
  running: boolean
  cancelFn: (() => void) | null
  prUrl?: string
}) {
  const cards = useMemo(() => buildCards(events, running), [events, running])
  const [expanded, setExpanded] = useState<Set<Phase>>(new Set())
  const [showRaw, setShowRaw] = useState(false)
  const rawEndRef = useRef<HTMLDivElement>(null)
  const activePhaseRef = useRef<HTMLDivElement>(null)
  const prevRunningRef = useRef(running)
  const prevActivePhasRef = useRef<Phase | null>(null)

  // Auto-expand running phase (only when the active phase changes)
  useEffect(() => {
    const runningCard = cards.find(c => c.status === 'running')
    const activePhase = runningCard?.phase ?? null
    if (activePhase && activePhase !== prevActivePhasRef.current) {
      prevActivePhasRef.current = activePhase
      setExpanded(prev => new Set([...prev, activePhase]))
      // Scroll the newly-active card into view
      requestAnimationFrame(() => {
        activePhaseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
    }
  }, [cards])

  // When run transitions from running → done, auto-expand the last card with events
  useEffect(() => {
    if (prevRunningRef.current && !running) {
      const lastWithEvents = [...cards].reverse().find(c => c.events.length > 0)
      if (lastWithEvents) {
        setExpanded(prev => new Set([...prev, lastWithEvents.phase]))
      }
    }
    prevRunningRef.current = running
  }, [running, cards])

  // Auto-scroll raw log to bottom as new events arrive
  useEffect(() => {
    if (showRaw) rawEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length, showRaw])

  const errorEvents = events.filter(e => e.type === 'error')
  const hasAnyEvents = events.length > 0

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Run Progress {running && <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400" />}
        </div>
        {running && cancelFn && (
          <button
            className="text-xs text-slate-500 underline hover:text-slate-300"
            onClick={cancelFn}
          >
            Cancel run
          </button>
        )}
      </div>

      {/* Waiting placeholder — shown only before first event arrives */}
      {running && !hasAnyEvents && (
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-400 border-t-transparent flex-shrink-0" />
          <span className="text-sm text-slate-400">Waiting for agent response…</span>
        </div>
      )}

      {/* Phase cards */}
      {hasAnyEvents && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/40">
          {cards.map((card, idx) => {
            const meta = PHASE_META[card.phase]
            const isLast = idx === cards.length - 1
            const isExpanded = expanded.has(card.phase) || card.status === 'running'
            const hasEvents = card.events.length > 0
            const canToggle = hasEvents && card.status !== 'running'
            const isActive = card.status === 'running'
            const lastEvMsg = hasEvents && !isExpanded
              ? (card.events[card.events.length - 1].message ?? card.events[card.events.length - 1].log_line ?? null)
              : null

            return (
              <div
                key={card.phase}
                ref={isActive ? activePhaseRef : undefined}
                className={`relative ${!isLast ? 'border-b border-slate-800/60' : ''}`}
              >
                {/* Vertical connector line through dot column */}
                {!isLast && (
                  <div className="absolute left-[1.3rem] top-8 bottom-0 w-px bg-slate-800" />
                )}

                {/* Card header */}
                <button
                  className={`relative flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors
                    ${canToggle ? 'cursor-pointer hover:bg-slate-800/25' : 'cursor-default'}
                    ${isActive ? 'bg-slate-800/20' : ''}
                    ${card.status === 'error' ? 'bg-rose-950/20' : ''}`}
                  onClick={() => {
                    if (!canToggle) return
                    setExpanded(prev => {
                      const next = new Set(prev)
                      if (next.has(card.phase)) next.delete(card.phase)
                      else next.add(card.phase)
                      return next
                    })
                  }}
                  disabled={!canToggle}
                >
                  <div className="relative z-10 mt-0.5">
                    <StatusDot status={card.status} />
                  </div>

                  {/* Label + last-event preview */}
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm font-medium
                      ${card.status === 'queued' ? 'text-slate-500'
                        : card.status === 'error' ? 'text-rose-300'
                        : meta.accent}`}>
                      {meta.label}
                    </span>
                    {/* Last-event preview (collapsed done/error cards) */}
                    {lastEvMsg && (
                      <p className="mt-0.5 truncate text-[11px] text-slate-500 leading-tight">
                        {lastEvMsg}
                      </p>
                    )}
                    {/* PR link directly in Ship card */}
                    {card.phase === 'ship' && card.status === 'done' && prUrl && (
                      <a
                        href={prUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 inline-block text-[11px] text-emerald-400 underline hover:text-emerald-300"
                        onClick={e => e.stopPropagation()}
                      >
                        View PR →
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                    {card.status === 'running' && (
                      <span className="text-[11px] text-blue-400 animate-pulse">running…</span>
                    )}
                    {card.status === 'done' && (
                      <span className={`text-[11px] ${meta.dimText}`}>
                        {card.events.length} event{card.events.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {card.status === 'error' && (
                      <span className="text-[11px] text-rose-500">failed</span>
                    )}
                    {card.status === 'queued' && (
                      <span className="text-[11px] text-slate-600">queued</span>
                    )}
                    {canToggle && (
                      <span className="text-[10px] text-slate-600 select-none">
                        {isExpanded ? '▲' : '▼'}
                      </span>
                    )}
                  </div>
                </button>

                {/* Expanded event list */}
                {isExpanded && hasEvents && (
                  <div className="mx-4 mb-2.5 ml-12 max-h-52 overflow-y-auto rounded-lg border border-slate-800/50 bg-slate-900/50 p-1.5 space-y-0.5">
                    {card.events.map((ev, i) => {
                      const msg = ev.message ?? ev.log_line ?? ''
                      const ts = formatEventTs(ev)
                      const taskId = ev.task_id
                      return (
                        <div key={i} className="flex items-start gap-2 rounded px-1.5 py-0.5 text-xs hover:bg-slate-800/30">
                          {ts && (
                            <span className="shrink-0 font-mono text-[10px] text-slate-600 mt-px tabular-nums">
                              {ts}
                            </span>
                          )}
                          <span className={`shrink-0 font-mono text-[10px] ${meta.dimText} mt-px`}>
                            {ev.type}
                          </span>
                          {taskId && (
                            <span className="shrink-0 font-mono text-[10px] text-slate-600 mt-px">
                              #{String(taskId).slice(0, 8)}
                            </span>
                          )}
                          {msg && <span className="text-slate-300 break-all leading-relaxed">{msg}</span>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Error events */}
      {errorEvents.length > 0 && (
        <div className="rounded-xl border border-rose-800/50 bg-rose-950/30 p-3 space-y-1">
          <div className="text-xs font-semibold text-rose-400 uppercase tracking-wide">Errors</div>
          {errorEvents.map((ev, i) => (
            <div key={i} className="text-xs text-rose-200 break-all leading-relaxed">
              {ev.message ?? ev.log_line ?? JSON.stringify(ev)}
            </div>
          ))}
        </div>
      )}

      {/* Raw events toggle */}
      {hasAnyEvents && (
        <div>
          <button
            className="text-[11px] text-slate-600 hover:text-slate-400 underline transition-colors"
            onClick={() => setShowRaw(v => !v)}
          >
            {showRaw ? 'Hide raw events' : `Show raw events (${events.length})`}
          </button>
          {showRaw && (
            <div className="mt-1.5 max-h-44 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/50 p-2 space-y-1">
              {events.map((ev, i) => {
                const evType = ev.type ?? 'event'
                const msg = ev.message ?? ev.log_line ?? ''
                const style = EVENT_TYPE_STYLES[evType] ?? 'bg-slate-800/60 text-slate-300 border-slate-700'
                return (
                  <div key={i} className={`flex items-start gap-2 rounded border px-2 py-1 text-xs ${style}`}>
                    <span className="shrink-0 font-mono font-semibold">{evType}</span>
                    {msg && <span className="break-all">{msg}</span>}
                  </div>
                )
              })}
              <div ref={rawEndRef} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Open path helper ──────────────────────────────────────────────────────────
async function openPath(absPath: string | null | undefined): Promise<void> {
  if (!absPath) return
  try {
    await fetch('/api/open-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: absPath }),
    })
  } catch {
    await navigator.clipboard.writeText(absPath).catch(() => {})
  }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function GitHubRepoPanel({
  envReady,
  repos,
  reposLoading,
  selectedRepo,
  onSelectRepo,
  branch,
  onBranchChange,
  integrationBranch,
  onIntegrationBranchChange,
  events,
  running,
  result,
  reportMd,
  cancelFn,
  error,
  runId,
  runDir,
  logsDir,
}: GitHubRepoPanelProps) {
  const [repoFilter, setRepoFilter] = useState('')

  const filteredRepos = repoFilter.trim()
    ? repos.filter((r) => r.full_name.toLowerCase().includes(repoFilter.trim().toLowerCase()))
    : repos

  const outcome = (result?.status ?? '') as string
  const outcomeStyle = OUTCOME_STYLES[outcome] ?? OUTCOME_STYLES.failed
  const hasResult = result !== null
  const prUrl = result?.prUrl ?? (result as Record<string, unknown> | null)?.['pr_url'] as string | undefined

  return (
    <div className="border-b border-gray-700 bg-gray-900/40">
      <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">

        {/* Loading state */}
        {reposLoading && (
          <div className="flex items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-800/30 px-4 py-3">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
            <span className="text-sm text-slate-300">Connecting to GitHub — loading repositories…</span>
          </div>
        )}

        {/* Token / env status */}
        {!envReady && !reposLoading && repos.length === 0 && (
          <div className="rounded-lg border border-amber-700/60 bg-amber-900/20 px-3 py-2 text-sm text-amber-200">
            No GitHub token detected. Configure <code className="text-amber-100">GITHUB_TOKEN</code> in the Orchestrator environment to use this mode.
          </div>
        )}

        {/* Repo selector — shown once repos are loaded */}
        {!reposLoading && repos.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-slate-400 uppercase tracking-wide">
              Repository <span className="normal-case text-slate-500">({repos.length} available)</span>
            </label>
            <input
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Filter repos…"
              value={repoFilter}
              onChange={(e) => setRepoFilter(e.target.value)}
              disabled={running}
            />
            <select
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
                value={selectedRepo?.full_name ?? ''}
                onChange={(e) => {
                  const repo = repos.find((r) => r.full_name === e.target.value) ?? null
                  onSelectRepo(repo)
                  if (repo) {
                    if (!branch) onBranchChange(repo.default_branch ?? 'main')
                  }
                }}
                disabled={running}
                size={Math.min(6, filteredRepos.length + 1)}
              >
                <option value="">— select repo —</option>
                {filteredRepos.map((r) => (
                  <option key={r.full_name} value={r.full_name}>
                    {r.full_name}
                    {r.appfactory?.known ? ' ✓' : ''}
                  </option>
                ))}
              </select>
          </div>

          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-xs text-slate-400 uppercase tracking-wide">Branch to work on</label>
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder={selectedRepo?.default_branch ?? 'main'}
                value={branch}
                onChange={(e) => onBranchChange(e.target.value)}
                disabled={running}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400 uppercase tracking-wide">Integration branch (PR target)</label>
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder={`${branch || selectedRepo?.default_branch || 'main'}-orchestration`}
                value={integrationBranch}
                onChange={(e) => onIntegrationBranchChange(e.target.value)}
                disabled={running}
              />
            </div>
          </div>
        </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-rose-700/60 bg-rose-900/20 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}

        {/* Run Cards — live phase timeline */}
        {events.length > 0 && (
          <RunCards events={events} running={running} cancelFn={cancelFn} />
        )}

        {/* Result */}
        {hasResult && (
          <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-full border px-3 py-0.5 text-xs font-semibold uppercase tracking-wide ${outcomeStyle}`}>
                {outcome.replace(/_/g, ' ') || 'complete'}
              </span>
              {prUrl && (
                <a className="text-xs text-emerald-300 underline" href={prUrl} target="_blank" rel="noreferrer">
                  View PR
                </a>
              )}
            </div>

            {/* Action links */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {runDir && (
                <button
                  className="rounded border border-slate-700 px-2 py-1 text-slate-200 hover:bg-slate-800/60"
                  onClick={() => void openPath(runDir)}
                >
                  Open Run Folder
                </button>
              )}
              {logsDir && (
                <button
                  className="rounded border border-slate-700 px-2 py-1 text-slate-200 hover:bg-slate-800/60"
                  onClick={() => void openPath(logsDir)}
                >
                  Open Logs Folder
                </button>
              )}
              {runId && ORCHESTRATOR_API_BASE && (
                <a
                  className="rounded border border-slate-700 px-2 py-1 text-slate-200 hover:bg-slate-800/60"
                  href={`${ORCHESTRATOR_API_BASE}/orchestrate/repo/${encodeURIComponent(runId)}/artifacts.zip`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download Artifacts ZIP
                </a>
              )}
              {runId && (
                <Link
                  className="rounded border border-blue-700/60 px-2 py-1 text-blue-200 hover:bg-blue-900/30"
                  href={`/runs/${encodeURIComponent(runId)}`}
                >
                  View Full Report
                </Link>
              )}
            </div>

            {/* Inline REPORT.md */}
            {reportMd ? (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Report</div>
                <div
                  className="prose prose-invert max-w-none rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(reportMd) }}
                />
              </div>
            ) : (
              <div className="text-xs text-slate-500">REPORT.md not yet available — click View Full Report for details.</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
