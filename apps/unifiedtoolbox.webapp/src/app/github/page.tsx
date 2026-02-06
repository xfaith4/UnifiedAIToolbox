'use client'

import { useEffect, useMemo, useState } from 'react'
import { getGithubStatus, listAccessibleRepos } from '@/lib/services/github'
import { ORCHESTRATOR_API_BASE, startRepoOrchestration } from '@/lib/services/orchestratorApi'
import type { GitHubRepo } from '@/lib/types/github'
import type { RepoOrchestrationEvent, RepoOrchestrationResult } from '@/lib/types/orchestrator'
import Link from 'next/link'

type ArtifactItem = {
  artifactId?: string
  fileName?: string
  filePath?: string
  mimeType?: string
  size?: number
  createdAt?: string
}

export default function GitHubPage() {
  const uiV2 = (process.env.NEXT_PUBLIC_GITHUB_UI_V2 ?? 'false').toLowerCase() === 'true'
  const [filter, setFilter] = useState('')
  const [token, setToken] = useState('')
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [githubEnvReady, setGithubEnvReady] = useState(false)

  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null)
  const [instruction, setInstruction] = useState('')
  const [branch, setBranch] = useState('')
  const [integrationBranch, setIntegrationBranch] = useState('')
  const [orchEvents, setOrchEvents] = useState<RepoOrchestrationEvent[]>([])
  const [orchResult, setOrchResult] = useState<RepoOrchestrationResult | null>(null)
  const [orchRunning, setOrchRunning] = useState(false)
  const [orchError, setOrchError] = useState<string | null>(null)
  const [cancelStream, setCancelStream] = useState<(() => void) | null>(null)
  const [errorDetails, setErrorDetails] = useState<Record<string, unknown> | null>(null)
  const [showTechDetails, setShowTechDetails] = useState(false)

  const toFileUrl = (path: string) => `file:///${path.replace(/\\/g, '/')}`
  const joinPath = (base: string, segment: string) => {
    const separator = base.includes('\\') ? '\\' : '/'
    if (base.endsWith(separator)) return `${base}${segment}`
    return `${base}${separator}${segment}`
  }
  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      return
    }
  }

  const artifactsIndex = useMemo(() => {
    if (!orchResult) return []
    const direct = (orchResult as Record<string, unknown>)['artifacts_index']
    if (Array.isArray(direct)) return direct as ArtifactItem[]
    const nested = (orchResult.artifacts as Record<string, unknown> | undefined)?.['index']
    return Array.isArray(nested) ? (nested as ArtifactItem[]) : []
  }, [orchResult])

  const runId = (orchResult?.run_id || orchResult?.runId || '') as string
  const runDir = useMemo(() => {
    const artifacts = orchResult?.artifacts as Record<string, unknown> | undefined
    if (typeof artifacts?.run_dir === 'string') return artifacts.run_dir as string
    const candidate = artifactsIndex.find((item) => typeof item.filePath === 'string')?.filePath
    if (typeof candidate === 'string') {
      const normalized = candidate.replace(/\\/g, '/')
      return normalized.slice(0, normalized.lastIndexOf('/'))
    }
    return undefined
  }, [orchResult, artifactsIndex])
  const logsDir = runDir ? joinPath(runDir, 'codex_runs') : undefined
  const gateLogsDir = runDir ? joinPath(runDir, 'gate-logs') : undefined

  const reportArtifactId = useMemo(() => {
    const report = artifactsIndex.find((item) => (item as Record<string, unknown>)['fileName'] === 'REPORT.md')
    return (report as Record<string, unknown> | undefined)?.artifactId as string | undefined
  }, [artifactsIndex])

  const reportJsonArtifactId = useMemo(() => {
    const report = artifactsIndex.find((item) => (item as Record<string, unknown>)['fileName'] === 'REPORT.json')
    return (report as Record<string, unknown> | undefined)?.artifactId as string | undefined
  }, [artifactsIndex])

  const timelineEvents = useMemo(() => {
    const filtered = orchEvents.filter(
      (ev) => !['clone_progress', 'task_progress'].includes(String(ev.type || ''))
    )
    return filtered.map((ev, idx) => {
      const type = String(ev.type || 'event')
      const labelMap: Record<string, string> = {
        accepted: 'Accepted',
        cloned: 'Clone complete',
        intake_complete: 'Intake',
        planned: 'Plan',
        tasks_complete: 'Execute',
        repo_gates_complete: 'Safety Gates',
        merged: 'Merge',
        complete: 'Complete',
        error: 'Error',
      }
      return {
        id: idx,
        type,
        label: labelMap[type] || type.replace(/_/g, ' '),
        message: String(ev.message || ''),
        payload: ev,
      }
    })
  }, [orchEvents])

  const lastErrorEvent = useMemo(() => {
    const reversed = [...orchEvents].reverse()
    return reversed.find((ev) => {
      const message = String(ev.message || '').toLowerCase()
      const type = String(ev.type || '').toLowerCase()
      return type === 'error' || message.includes('failed') || message.includes('error')
    })
  }, [orchEvents])

  const errorSummary = useMemo(() => {
    if (errorDetails?.userMessage) return String(errorDetails.userMessage)
    if (orchError) return orchError
    if (lastErrorEvent?.message) return String(lastErrorEvent.message)
    const status = String(orchResult?.status || '').toLowerCase()
    if (status && ['error', 'failed', 'validation_failed', 'cancelled'].includes(status)) {
      return `Run finished with status: ${status}`
    }
    return null
  }, [errorDetails, orchError, lastErrorEvent, orchResult])

  const hasRepoGates = useMemo(
    () => artifactsIndex.some((item) => String(item.fileName || '').startsWith('REPO_GATES_')),
    [artifactsIndex]
  )

  useEffect(() => {
    let mounted = true
    getGithubStatus()
      .then((status) => {
        if (!mounted) return
        setGithubEnvReady(Boolean(status?.authenticated))
      })
      .catch(() => {
        if (!mounted) return
        setGithubEnvReady(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  async function handleFetch() {
    const trimmedToken = token.trim()
    if (!trimmedToken && !githubEnvReady) {
      setError('A GitHub personal access token is required.')
      return
    }

    setLoading(true)
    setError(null)
    setSelectedRepo(null)
    setOrchEvents([])
    setOrchResult(null)
    setErrorDetails(null)
    setShowTechDetails(false)
    try {
      const list = await listAccessibleRepos(trimmedToken || undefined)
      const filterTerm = filter.trim().toLowerCase()
      const filtered = filterTerm
        ? list.filter((repo) => repo.full_name.toLowerCase().includes(filterTerm))
        : list
      setRepos(filtered)
      if (filtered.length === 0) {
        setError('No repositories found for this token and filter.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.')
      setRepos([])
    } finally {
      setLoading(false)
    }
  }

  const handleSelectRepo = (repo: GitHubRepo) => {
    setSelectedRepo(repo)
    setOrchEvents([])
    setOrchResult(null)
    setOrchError(null)
    setErrorDetails(null)
    setShowTechDetails(false)
    setBranch(repo.default_branch || 'main')
    setIntegrationBranch(`${repo.default_branch || 'main'}-orchestration`)
  }

  const handleRunRepoOrchestration = async () => {
    const trimmedToken = token.trim()
    if (!trimmedToken && !githubEnvReady) {
      setOrchError('Provide a GitHub token first.')
      return
    }
    if (!selectedRepo) {
      setOrchError('Select a repository to orchestrate.')
      return
    }
    if (!instruction.trim()) {
      setOrchError('Enter an instruction/goal for the supervisor agent.')
      return
    }

    const repoUrl = `https://github.com/${selectedRepo.full_name}.git`
    const branchValue = branch.trim() || selectedRepo.default_branch || 'main'
    const integrationBranchValue = integrationBranch.trim() || `${branchValue}-orchestration`
    setOrchRunning(true)
    setOrchEvents([])
    setOrchResult(null)
    setOrchError(null)
    setErrorDetails(null)
    setShowTechDetails(false)

    try {
      const { cancel } = await startRepoOrchestration(
        {
          repo: repoUrl,
          goal: instruction.trim(),
          options: {
            github_token: trimmedToken || undefined,
            branch: branchValue,
            integration_branch: integrationBranchValue,
          },
        },
        (event) => {
          setOrchEvents((prev) => [...prev, event])
          if (event.result) {
            setOrchResult(event.result)
          }
          if (event.type === 'error' && event.error) {
            setErrorDetails(event.error as Record<string, unknown>)
          }
          if (event.type === 'error' && event.message) {
            setOrchError(String(event.message))
          }
          if (event.final || event.type === 'error') {
            setOrchRunning(false)
            setCancelStream(null)
          }
        }
      )
      setCancelStream(() => cancel)
    } catch (err) {
      setOrchError(err instanceof Error ? err.message : 'Failed to start repo orchestration.')
      setOrchRunning(false)
    }
  }

  return (
    <main className={`${uiV2 ? 'max-w-7xl' : 'max-w-3xl'} space-y-6`}>
      <div>
        <h1 className="text-2xl font-semibold">GitHub Integration</h1>
        <p className="mt-1 text-sm text-slate-400">
          List repositories the provided token can access (including private and organization
          repositories). The token is only used to query the backend and is never stored.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Personal Access Token (required for listing private repos)"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <input
          className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Search repositories (filter by owner/repo name)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <button
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        onClick={handleFetch}
        disabled={(!token.trim() && !githubEnvReady) || loading}
      >
        {loading ? 'Fetching.' : 'List Accessible Repos'}
      </button>
      {error && <div className="text-sm text-rose-400">{error}</div>}

      {selectedRepo && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Repo Orchestrator</h2>
            <p className="text-sm text-slate-400">
              Supervisor-led orchestration for <span className="font-semibold text-slate-200">{selectedRepo.full_name}</span>.
              Enter the instruction/goal and we will run the multi-step repo workflow via the orchestrator service.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-slate-300">Instruction / Goal</label>
            <textarea
              className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={4}
              placeholder="e.g., Audit the repo for lint errors and open a PR with fixes."
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              disabled={orchRunning}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm text-slate-300">Branch to work on</label>
              <input
                className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., main"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                disabled={orchRunning}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-300">Integration branch (PR target)</label>
              <input
                className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., main-orchestration"
                value={integrationBranch}
                onChange={(e) => setIntegrationBranch(e.target.value)}
                disabled={orchRunning}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              onClick={handleRunRepoOrchestration}
              disabled={orchRunning}
            >
              {orchRunning ? 'Running…' : 'Run Repo Orchestration'}
            </button>
            {orchRunning && cancelStream && (
              <button
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
                onClick={() => {
                  cancelStream()
                  setOrchRunning(false)
                  setOrchEvents((prev) => [...prev, { type: 'status', message: 'Cancelled by user', run_id: orchResult?.runId }])
                }}
              >
                Cancel
              </button>
            )}
            {orchError && <span className="text-sm text-rose-400">{orchError}</span>}
            {!uiV2 && logsDir && (
              <a className="text-sm text-blue-200 underline" href={toFileUrl(logsDir)} target="_blank" rel="noreferrer">
                Open Logs Folder
              </a>
            )}
          </div>

          <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <div className="text-sm font-semibold text-slate-200">Supervisor Activity</div>
            {uiV2 ? (
              <div className="space-y-3">
                {timelineEvents.length === 0 && !orchRunning && (
                  <p className="text-sm text-slate-500">No activity yet. Start an orchestration to see progress.</p>
                )}
                <ul className="space-y-2">
                  {timelineEvents.map((ev) => (
                    <li key={`${ev.type}-${ev.id}`} className="rounded border border-slate-800 bg-slate-900/70 px-3 py-2">
                      <details className="group">
                        <summary className="flex cursor-pointer items-center justify-between text-xs text-slate-200">
                          <span className="font-semibold">{ev.label}</span>
                          <span className="text-[11px] text-slate-400">{ev.type}</span>
                        </summary>
                        <div className="mt-2 space-y-2 text-xs text-slate-300">
                          {ev.message && <div className="whitespace-pre-wrap">{ev.message}</div>}
                          <pre className="rounded border border-slate-800 bg-slate-950/50 p-2 text-[11px] text-slate-300 whitespace-pre-wrap">
                            {JSON.stringify(ev.payload, null, 2)}
                          </pre>
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                {orchEvents.length === 0 && !orchRunning && (
                  <p className="text-sm text-slate-500">No activity yet. Start an orchestration to see progress.</p>
                )}
                <div className="space-y-2 max-h-72 overflow-auto text-xs">
                  {orchEvents.map((ev, idx) => (
                    <div key={idx} className="rounded border border-slate-800 bg-slate-900/70 px-3 py-2">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>{ev.type || 'event'}</span>
                        <span>{ev.run_id || ''}</span>
                      </div>
                      <div className="text-slate-100 whitespace-pre-wrap">{ev.message}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {orchResult && (
              <div className="rounded border border-emerald-800 bg-emerald-900/30 px-3 py-2 text-sm text-emerald-100 space-y-2">
                <div className="font-semibold">Result</div>
                <div>Status: {orchResult.status || 'unknown'}</div>
                {orchResult.prUrl && (
                  <div>
                    PR:{' '}
                    <a className="text-emerald-200 underline" href={orchResult.prUrl} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  </div>
                )}
                {uiV2 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {reportArtifactId && runId && (
                      <Link
                        className="rounded border border-emerald-500/40 px-2 py-1 text-emerald-100 hover:bg-emerald-800/40"
                        href={`/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(reportArtifactId)}`}
                      >
                        View Report
                      </Link>
                    )}
                    {reportJsonArtifactId && runId && (
                      <Link
                        className="rounded border border-emerald-500/40 px-2 py-1 text-emerald-100 hover:bg-emerald-800/40"
                        href={`/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(reportJsonArtifactId)}`}
                      >
                        View Report JSON
                      </Link>
                    )}
                    {runDir && (
                      <a
                        className="rounded border border-emerald-500/40 px-2 py-1 text-emerald-100 hover:bg-emerald-800/40"
                        href={toFileUrl(runDir)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open Run Folder
                      </a>
                    )}
                    {logsDir && (
                      <a
                        className="rounded border border-emerald-500/40 px-2 py-1 text-emerald-100 hover:bg-emerald-800/40"
                        href={toFileUrl(logsDir)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open Logs Folder
                      </a>
                    )}
                    {gateLogsDir && hasRepoGates && (
                      <a
                        className="rounded border border-emerald-500/40 px-2 py-1 text-emerald-100 hover:bg-emerald-800/40"
                        href={toFileUrl(gateLogsDir)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open Gate Logs
                      </a>
                    )}
                    {runId && ORCHESTRATOR_API_BASE && (
                      <a
                        className="rounded border border-emerald-500/40 px-2 py-1 text-emerald-100 hover:bg-emerald-800/40"
                        href={`${ORCHESTRATOR_API_BASE}/orchestrate/repo/${encodeURIComponent(runId)}/artifacts.zip`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download Artifacts ZIP
                      </a>
                    )}
                    {selectedRepo?.full_name && (
                      <button
                        className="rounded border border-emerald-500/40 px-2 py-1 text-emerald-100 hover:bg-emerald-800/40"
                        onClick={() => copyText(`https://github.com/${selectedRepo.full_name}.git`)}
                      >
                        Copy Repo URL
                      </button>
                    )}
                    {branch && (
                      <button
                        className="rounded border border-emerald-500/40 px-2 py-1 text-emerald-100 hover:bg-emerald-800/40"
                        onClick={() => copyText(branch)}
                      >
                        Copy Branch
                      </button>
                    )}
                    {runId && (
                      <button
                        className="rounded border border-emerald-500/40 px-2 py-1 text-emerald-100 hover:bg-emerald-800/40"
                        onClick={() => copyText(runId)}
                      >
                        Copy Run ID
                      </button>
                    )}
                  </div>
                )}
                {!uiV2 && (runDir || logsDir || (gateLogsDir && hasRepoGates)) && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {runDir && (
                      <a
                        className="rounded border border-emerald-500/40 px-2 py-1 text-emerald-100 hover:bg-emerald-800/40"
                        href={toFileUrl(runDir)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open Run Folder
                      </a>
                    )}
                    {logsDir && (
                      <a
                        className="rounded border border-emerald-500/40 px-2 py-1 text-emerald-100 hover:bg-emerald-800/40"
                        href={toFileUrl(logsDir)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open Logs Folder
                      </a>
                    )}
                    {gateLogsDir && hasRepoGates && (
                      <a
                        className="rounded border border-emerald-500/40 px-2 py-1 text-emerald-100 hover:bg-emerald-800/40"
                        href={toFileUrl(gateLogsDir)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open Gate Logs
                      </a>
                    )}
                  </div>
                )}
                {uiV2 && artifactsIndex.length > 0 && (
                  <div className="space-y-2 rounded border border-emerald-800/60 bg-emerald-900/10 px-3 py-2 text-emerald-50">
                    <div className="text-xs font-semibold uppercase tracking-wide">Artifacts</div>
                    <div className="grid gap-2 text-xs sm:grid-cols-2">
                      {artifactsIndex.map((artifact) => (
                        <div key={artifact.artifactId} className="rounded border border-emerald-800/40 px-2 py-1">
                          <div className="font-semibold">{artifact.fileName}</div>
                          <div className="text-[11px] text-emerald-200">{artifact.mimeType}</div>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            {runId && artifact.artifactId && (
                              <Link
                                className="text-[11px] underline text-emerald-100"
                                href={`/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifact.artifactId)}`}
                              >
                                View in app
                              </Link>
                            )}
                            {artifact.filePath && (
                              <a
                                className="text-[11px] underline text-emerald-100"
                                href={toFileUrl(artifact.filePath)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open file
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {uiV2 && (errorDetails || errorSummary) && (
              <div className="rounded border border-rose-800 bg-rose-900/30 px-3 py-2 text-sm text-rose-100 space-y-2">
                <div className="font-semibold">Run Error</div>
                <div>{String(errorDetails?.userMessage || errorSummary || orchError || 'Run failed')}</div>
                {Array.isArray(errorDetails?.suggestedFixes) && errorDetails.suggestedFixes.length > 0 && (
                  <ul className="list-disc pl-5 text-xs text-rose-100">
                    {errorDetails?.suggestedFixes?.map((fix, idx) => (
                      <li key={idx}>{String(fix)}</li>
                    ))}
                  </ul>
                )}
                {logsDir && (
                  <a className="text-xs text-rose-200 underline" href={toFileUrl(logsDir)} target="_blank" rel="noreferrer">
                    Open logs folder
                  </a>
                )}
                <button
                  className="text-xs text-rose-200 underline"
                  onClick={() => setShowTechDetails((prev) => !prev)}
                >
                  {showTechDetails ? 'Hide technical details' : 'Show technical details'}
                </button>
                {showTechDetails && (
                  <pre className="rounded border border-rose-800/60 bg-rose-950/40 p-2 text-[11px] text-rose-100 whitespace-pre-wrap">
                    {String(
                      errorDetails?.technicalDetails ||
                        (lastErrorEvent ? JSON.stringify(lastErrorEvent, null, 2) : '') ||
                        orchError ||
                        ''
                    )}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="mb-3 font-semibold">Repository Results</div>
        <ul className="space-y-3">
          {loading && repos.length === 0 && (
            <>
              {[0, 1, 2].map((idx) => (
                <li key={`skeleton-${idx}`} className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2">
                  <div className="h-4 w-48 rounded bg-slate-800/80" />
                  <div className="mt-2 h-3 w-72 rounded bg-slate-800/60" />
                </li>
              ))}
            </>
          )}
          {repos.map((r) => (
            <li
              key={r.id}
              className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                selectedRepo?.full_name === r.full_name ? 'border-blue-700 bg-blue-900/20' : 'border-slate-800 bg-slate-900/40'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="font-medium">{r.full_name}</div>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-200">
                    {r.private ? 'Private' : 'Public'}
                  </span>
                  {r.archived && (
                    <span className="rounded-full bg-amber-900/60 px-2 py-0.5 text-xs text-amber-200">
                      Archived
                    </span>
                  )}
                  {r.open_prs_count !== undefined && r.open_prs_count > 0 && (
                    <span className="rounded-full bg-green-900/60 px-2 py-0.5 text-xs text-green-200">
                      {r.open_prs_count} PR{r.open_prs_count !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400">
                  {r.description || '-'}{' '}
                  {r.updated_at ? (
                    <span className="text-slate-500">
                      Updated {new Date(r.updated_at).toLocaleDateString()}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  className="text-sm rounded-lg border border-blue-700 px-3 py-1 text-blue-200 hover:bg-blue-800/40"
                  onClick={() => handleSelectRepo(r)}
                  disabled={orchRunning && selectedRepo?.full_name !== r.full_name}
                >
                  {selectedRepo?.full_name === r.full_name ? 'Selected' : 'Select'}
                </button>
                <a
                  className="text-sm text-blue-400 underline hover:text-blue-300"
                  href={r.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open
                </a>
              </div>
            </li>
          ))}
          {!loading && repos.length === 0 && (
            <li className="text-sm text-slate-500">No repositories to display.</li>
          )}
        </ul>
      </div>
    </main>
  )
}
