'use client'

import { useState } from 'react'
import { getUserRepos } from '@/lib/services/github' // This path is already correct, but good to confirm
import type { GitHubRepo } from '@/lib/types/github'

export default function GitHubPage() {
  const [username, setUsername] = useState('')
  const [token, setToken] = useState('')
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFetch() {
    const trimmedUsername = username.trim()
    if (!trimmedUsername) return

    setLoading(true)
    setError(null)
    try {
      const list = await getUserRepos(trimmedUsername, token.trim() || undefined)
      setRepos(list)
      if (list.length === 0) {
        setError('No public repositories found for that user.')
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
          Fetch public repository information for any GitHub user.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="GitHub username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Personal Access Token (optional, for private repos)"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </div>
      <button
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        onClick={handleFetch}
        disabled={!username.trim() || loading}
      >
        {loading ? 'Fetching…' : 'Fetch Repos'}
      </button>
      {error && <div className="text-sm text-rose-400">{error}</div>}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="mb-3 font-semibold">Results</div>
        <ul className="space-y-3">
          {repos.map((r) => (
            <li key={r.id} className="flex items-center justify-between">
              <div>
                <div className="font-medium">{r.full_name}</div>
                <div className="text-xs text-slate-400">{r.description || '—'}</div>
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
