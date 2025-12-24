'use client'

import { useState } from 'react'
import { listAccessibleRepos } from '@/lib/services/github'
import { startRepoOrchestration } from '@/lib/services/orchestratorApi'
import type { GitHubRepo } from '@/lib/types/github'
import type { RepoOrchestrationEvent, RepoOrchestrationResult } from '@/lib/types/orchestrator'

export default function GitHubPage() {
  const [filter, setFilter] = useState('')
  const [token, setToken] = useState('')
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null)
  const [instruction, setInstruction] = useState('')
  const [branch, setBranch] = useState('')
  const [integrationBranch, setIntegrationBranch] = useState('')
  const [orchEvents, setOrchEvents] = useState<RepoOrchestrationEvent[]>([])
  const [orchResult, setOrchResult] = useState<RepoOrchestrationResult | null>(null)
  const [orchRunning, setOrchRunning] = useState(false)
  const [orchError, setOrchError] = useState<string | null>(null)
  const [cancelStream, setCancelStream] = useState<(() => void) | null>(null)

  async function handleFetch() {
    const trimmedToken = token.trim()
    if (!trimmedToken) {
      setError('A GitHub personal access token is required.')
      return
    }

    setLoading(true)
    setError(null)
    setSelectedRepo(null)
    setOrchEvents([])
    setOrchResult(null)
    try {
      const list = await listAccessibleRepos(trimmedToken)
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
    setBranch(repo.default_branch || 'main')
    setIntegrationBranch(`${repo.default_branch || 'main'}-orchestration`)
  }

  const handleRunRepoOrchestration = async () => {
    const trimmedToken = token.trim()
    if (!trimmedToken) {
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

    try {
      const { cancel } = await startRepoOrchestration(
        {
          repo: repoUrl,
          goal: instruction.trim(),
          options: {
            github_token: trimmedToken,
            branch: branchValue,
            integration_branch: integrationBranchValue,
          },
        },
        (event) => {
          setOrchEvents((prev) => [...prev, event])
          if (event.result) {
            setOrchResult(event.result)
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
    <main className="max-w-3xl space-y-6">
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
          placeholder="Optional filter (owner/repo contains...)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <button
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        onClick={handleFetch}
        disabled={!token.trim() || loading}
      >
        {loading ? 'Fetching.' : 'List Accessible Repos'}
      </button>
      {error && <div className="text-sm text-rose-400">{error}</div>}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="mb-3 font-semibold">Results</div>
        <ul className="space-y-3">
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
          </div>

          <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <div className="text-sm font-semibold text-slate-200">Supervisor Activity</div>
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

            {orchResult && (
              <div className="rounded border border-emerald-800 bg-emerald-900/30 px-3 py-2 text-sm text-emerald-100">
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
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
