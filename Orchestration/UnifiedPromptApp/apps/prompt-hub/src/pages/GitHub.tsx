import { useState } from 'react'
import { useApi } from '../store/useApi'
import { getUserRepos } from '../services/github'
import type { GitHubRepo } from '../services/github'

export function GitHubPage() {
  const [username, setUsername] = useState('')
  const [token, setToken] = useState('')
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const api = useApi()

  async function handleFetch() {
    const trimmedUsername = username.trim()
    const trimmedToken = token.trim()
    setLoading(true)
    setError(null)
    try {
      if (trimmedToken) {
        api.setToken(trimmedToken)
      }
      const list = await getUserRepos(
        trimmedUsername,
        trimmedToken || undefined
      )
      setRepos(list)
      if (list.length === 0) {
        setError('No repositories found for that user.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
      setRepos([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-2xl font-semibold">GitHub Repositories</h1>
      <div className="grid sm:grid-cols-2 gap-3">
        <input
          className="rounded-xl border border-slate-300 px-3 py-2"
          placeholder="GitHub username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="rounded-xl border border-slate-300 px-3 py-2"
          placeholder="Personal Access Token (optional)"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </div>
      <button
        className="px-4 py-2 rounded-xl bg-brand-500 text-white hover:opacity-90 disabled:opacity-50"
        onClick={handleFetch}
        disabled={!username.trim() || loading}
      >
        {loading ? 'Fetching…' : 'Fetch Repos'}
      </button>
      {error && <div className="text-sm text-rose-500">{error}</div>}

      <div className="rounded-2xl bg-white shadow-soft p-4 border border-slate-100">
        <div className="font-semibold mb-3">Results</div>
        <ul className="space-y-2">
          {repos.map((r) => (
            <li key={r.id} className="flex items-center justify-between">
              <div>
                <div className="font-medium">{r.full_name}</div>
                <div className="text-xs text-slate-500">
                  {r.description || '—'}
                  {r.private && ' · private'}
                  {r.archived && ' · archived'}
                </div>
              </div>
              <a
                className="text-sm text-brand-600 underline"
                href={r.html_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open
              </a>
            </li>
          ))}
          {repos.length === 0 && (
            <div className="text-sm text-slate-500">No repos yet.</div>
          )}
        </ul>
      </div>
    </div>
  )
}
