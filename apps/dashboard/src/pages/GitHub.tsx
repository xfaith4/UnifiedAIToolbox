import { useState } from 'react'
import { GitHubRepoSelector } from '../components/GitHubRepoSelector'
import type { GitHubRepoInfo } from '../services/githubCloner'

export function GitHubPage() {
  const [selectedClone, setSelectedClone] = useState<{
    cloneId: string
    repo: GitHubRepoInfo
  } | null>(null)

  function handleRepoSelected(cloneId: string, repo: GitHubRepoInfo) {
    setSelectedClone({ cloneId, repo })
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-semibold">GitHub Repository Cloning</h1>
      <p className="text-slate-600 dark:text-slate-400">
        Search for GitHub repositories and clone them locally for Codex analysis.
      </p>

      <GitHubRepoSelector onRepoSelected={handleRepoSelected} />

      {selectedClone && (
        <div className="rounded-2xl bg-green-50 dark:bg-green-900/20 p-4 border border-green-200 dark:border-green-800">
          <h4 className="font-semibold text-green-900 dark:text-green-100 mb-2">
            Repository Ready for Analysis
          </h4>
          <p className="text-sm text-green-700 dark:text-green-300">
            <strong>{selectedClone.repo.full_name}</strong> has been cloned successfully.
            <br />
            Clone ID: <code className="text-xs">{selectedClone.cloneId}</code>
          </p>
        </div>
      )}
    </div>
  )
}
