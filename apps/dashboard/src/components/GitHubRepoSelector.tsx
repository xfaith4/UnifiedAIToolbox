/**
 * Component for searching and cloning GitHub repositories
 */

import React, { useState, useEffect } from 'react'
import {
  searchRepositories,
  cloneRepository,
  getCloneProgress,
  getFileTree,
  cleanupClone,
  type GitHubRepoInfo,
  type CloneProgress,
  type FileTreeNode,
} from '../services/githubCloner'

interface GitHubRepoSelectorProps {
  onRepoSelected?: (cloneId: string, repoInfo: GitHubRepoInfo) => void
}

export function GitHubRepoSelector({ onRepoSelected }: GitHubRepoSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<GitHubRepoInfo[]>([])
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepoInfo | null>(null)
  const [cloneProgress, setCloneProgress] = useState<CloneProgress | null>(null)
  const [fileTree, setFileTree] = useState<FileTreeNode | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Poll for clone progress
  useEffect(() => {
    if (!cloneProgress || cloneProgress.status === 'completed' || cloneProgress.status === 'failed') {
      return
    }

    const interval = setInterval(async () => {
      try {
        const progress = await getCloneProgress(cloneProgress.clone_id)
        setCloneProgress(progress)

        if (progress.status === 'completed') {
          // Load file tree when clone completes
          const tree = await getFileTree(progress.clone_id)
          setFileTree(tree)
          if (onRepoSelected && selectedRepo) {
            onRepoSelected(progress.clone_id, selectedRepo)
          }
        }
      } catch (err) {
        console.error('Failed to get clone progress:', err)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [cloneProgress, selectedRepo, onRepoSelected])

  async function handleSearch() {
    if (!searchQuery.trim()) return

    setLoading(true)
    setError(null)
    try {
      const results = await searchRepositories(searchQuery)
      setSearchResults(results)
      if (results.length === 0) {
        setError('No repositories found')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
      setSearchResults([])
    } finally {
      setLoading(false)
    }
  }

  async function handleClone(repo: GitHubRepoInfo) {
    setSelectedRepo(repo)
    setError(null)
    try {
      const progress = await cloneRepository(repo.clone_url)
      setCloneProgress(progress)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clone failed')
    }
  }

  async function handleCleanup() {
    if (!cloneProgress) return

    try {
      await cleanupClone(cloneProgress.clone_id)
      setCloneProgress(null)
      setFileTree(null)
      setSelectedRepo(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cleanup failed')
    }
  }

  function renderFileTree(node: FileTreeNode, depth: number = 0): React.ReactNode {
    const indent = depth * 20

    if (node.type === 'truncated') {
      return (
        <div style={{ marginLeft: `${indent}px` }} className="text-xs text-slate-400">
          ...
        </div>
      )
    }

    if (node.type === 'file') {
      return (
        <div
          key={node.name}
          style={{ marginLeft: `${indent}px` }}
          className="text-sm py-0.5 flex items-center gap-1"
        >
          <span className="text-slate-400">📄</span>
          <span>{node.name}</span>
          {node.size !== undefined && (
            <span className="text-xs text-slate-400">
              ({(node.size / 1024).toFixed(1)} KB)
            </span>
          )}
        </div>
      )
    }

    return (
      <div key={node.name}>
        <div
          style={{ marginLeft: `${indent}px` }}
          className="text-sm py-0.5 font-medium flex items-center gap-1"
        >
          <span className="text-slate-400">📁</span>
          <span>{node.name}/</span>
        </div>
        {node.children?.map((child) => renderFileTree(child, depth + 1))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Search GitHub Repositories</h3>
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            placeholder="Search repositories (e.g., 'react language:typescript stars:>1000')"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button
            className="px-4 py-2 rounded-xl bg-brand-500 text-white hover:opacity-90 disabled:opacity-50"
            onClick={handleSearch}
            disabled={loading || !searchQuery.trim()}
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {searchResults.length > 0 && !cloneProgress && (
        <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-soft p-4 border border-slate-100 dark:border-slate-700">
          <h4 className="font-semibold mb-3">Search Results</h4>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {searchResults.map((repo) => (
              <div
                key={repo.full_name}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {repo.full_name}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                      {repo.description || 'No description'}
                    </div>
                    <div className="flex gap-3 mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {repo.language && <span>🔷 {repo.language}</span>}
                      <span>⭐ {repo.stars}</span>
                      <span>🔱 {repo.forks}</span>
                      <span>📦 {(repo.size_kb / 1024).toFixed(1)} MB</span>
                    </div>
                  </div>
                  <button
                    className="px-3 py-1.5 rounded-lg bg-brand-500 text-white text-sm hover:opacity-90"
                    onClick={() => handleClone(repo)}
                  >
                    Clone
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {cloneProgress && (
        <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-soft p-4 border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold">Clone Progress</h4>
            {cloneProgress.status === 'completed' && (
              <button
                className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-sm hover:opacity-90"
                onClick={handleCleanup}
              >
                Cleanup
              </button>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Repository:</span>
              <span className="font-medium">{selectedRepo?.full_name}</span>
            </div>

            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-slate-600 dark:text-slate-400">Status:</span>
                <span
                  className={`font-medium ${
                    cloneProgress.status === 'completed'
                      ? 'text-green-600 dark:text-green-400'
                      : cloneProgress.status === 'failed'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-blue-600 dark:text-blue-400'
                  }`}
                >
                  {cloneProgress.status.toUpperCase()}
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    cloneProgress.status === 'completed'
                      ? 'bg-green-500'
                      : cloneProgress.status === 'failed'
                      ? 'bg-red-500'
                      : 'bg-blue-500'
                  }`}
                  style={{ width: `${cloneProgress.progress_percent}%` }}
                />
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {cloneProgress.message}
              </div>
            </div>

            {cloneProgress.error && (
              <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
                {cloneProgress.error}
              </div>
            )}

            {cloneProgress.status === 'completed' && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-600 dark:text-slate-400">Files:</span>{' '}
                  <span className="font-medium">{cloneProgress.file_count}</span>
                </div>
                <div>
                  <span className="text-slate-600 dark:text-slate-400">Size:</span>{' '}
                  <span className="font-medium">{cloneProgress.size_mb?.toFixed(2)} MB</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {fileTree && cloneProgress?.status === 'completed' && (
        <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-soft p-4 border border-slate-100 dark:border-slate-700">
          <h4 className="font-semibold mb-3">File Tree</h4>
          <div className="max-h-96 overflow-y-auto font-mono text-sm">
            {renderFileTree(fileTree)}
          </div>
        </div>
      )}
    </div>
  )
}
