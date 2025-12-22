'use client'

import { useState } from 'react'
import { listAccessibleRepos } from '@/lib/services/github'
import type { GitHubRepo } from '@/lib/types/github'

export default function GitHubPage() {
  const [filter, setFilter] = useState('')
  const [token, setToken] = useState('')
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFetch() {
    const trimmedToken = token.trim()
    if (!trimmedToken) {
      setError('A GitHub personal access token is required.')
      return
    }

    setLoading(true)
    setError(null)
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
        {loading ? 'Fetching…' : 'List Accessible Repos'}
      </button>
      {error && <div className="text-sm text-rose-400">{error}</div>}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="mb-3 font-semibold">Results</div>
        <ul className="space-y-3">
          {repos.map((r) => (
            <li key={r.id} className="flex items-center justify-between">
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
                  {r.description || '—'}{' '}
                  {r.updated_at ? (
                    <span className="text-slate-500">
                      · Updated {new Date(r.updated_at).toLocaleDateString()}
                    </span>
                  ) : null}
                </div>
              </div>
              <a
                className="text-sm text-blue-400 underline hover:text-blue-300"
                href={r.html_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open
              </a>
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
