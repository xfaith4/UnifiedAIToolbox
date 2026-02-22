import React, { useState, useEffect, useRef } from 'react'
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

const EVENT_TYPE_STYLES: Record<string, string> = {
  error: 'bg-rose-900/60 text-rose-200 border-rose-700',
  complete: 'bg-emerald-900/60 text-emerald-200 border-emerald-700',
  task_progress: 'bg-blue-900/60 text-blue-200 border-blue-800',
  clone_progress: 'bg-slate-800/80 text-slate-300 border-slate-700',
  codex_summary: 'bg-violet-900/60 text-violet-200 border-violet-700',
  merged: 'bg-emerald-900/60 text-emerald-200 border-emerald-700',
  tasks_complete: 'bg-emerald-900/40 text-emerald-300 border-emerald-800',
}

const OUTCOME_STYLES: Record<string, string> = {
  changes_applied: 'border-emerald-600 text-emerald-300 bg-emerald-900/30',
  no_changes: 'border-slate-600 text-slate-300 bg-slate-800/40',
  no_changes_by_design: 'border-slate-600 text-slate-300 bg-slate-800/40',
  blocked: 'border-amber-600 text-amber-300 bg-amber-900/30',
  failed: 'border-rose-600 text-rose-300 bg-rose-900/30',
}

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
  const eventsEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll event log to bottom
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

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

        {/* Live event log */}
        {events.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Live Events {running && <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400" />}
            </div>
            <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/50 p-2 space-y-1">
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
              <div ref={eventsEndRef} />
            </div>
            {running && cancelFn && (
              <button
                className="text-xs text-slate-400 underline hover:text-slate-200"
                onClick={cancelFn}
              >
                Cancel run
              </button>
            )}
          </div>
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
