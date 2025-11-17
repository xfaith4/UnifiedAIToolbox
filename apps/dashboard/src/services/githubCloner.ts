/**
 * Service for GitHub repository cloning and management
 */

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

export interface GitHubRepoInfo {
  full_name: string
  name: string
  owner: string
  description: string | null
  url: string
  clone_url: string
  stars: number
  forks: number
  language: string | null
  size_kb: number
  updated_at: string | null
  default_branch: string
  branches?: string[]
  topics?: string[]
  license: string | null
}

export interface CloneProgress {
  clone_id: string
  repo_url: string
  status: 'pending' | 'cloning' | 'completed' | 'failed' | 'cleaning'
  progress_percent: number
  message: string
  clone_path: string | null
  start_time: string
  end_time: string | null
  error: string | null
  size_mb: number | null
  file_count: number | null
  branches: string[] | null
}

export interface FileTreeNode {
  type: 'file' | 'directory' | 'truncated'
  name: string
  size?: number
  children?: FileTreeNode[]
}

/**
 * Search for GitHub repositories
 */
export async function searchRepositories(
  query: string,
  maxResults: number = 30
): Promise<GitHubRepoInfo[]> {
  const response = await fetch(`${API_BASE}/github/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, max_results: maxResults }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to search repositories' }))
    throw new Error(error.detail || 'Failed to search repositories')
  }

  return response.json()
}

/**
 * Get detailed information about a repository
 */
export async function getRepositoryInfo(
  owner: string,
  repoName: string
): Promise<GitHubRepoInfo> {
  const response = await fetch(`${API_BASE}/github/repo/${owner}/${repoName}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to get repository info' }))
    throw new Error(error.detail || 'Failed to get repository info')
  }

  return response.json()
}

/**
 * Clone a repository
 */
export async function cloneRepository(
  repoUrl: string,
  branch?: string,
  depth?: number
): Promise<CloneProgress> {
  const response = await fetch(`${API_BASE}/github/clone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_url: repoUrl, branch, depth }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to clone repository' }))
    throw new Error(error.detail || 'Failed to clone repository')
  }

  return response.json()
}

/**
 * Get the progress of a clone operation
 */
export async function getCloneProgress(cloneId: string): Promise<CloneProgress> {
  const response = await fetch(`${API_BASE}/github/clone/${cloneId}/progress`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to get clone progress' }))
    throw new Error(error.detail || 'Failed to get clone progress')
  }

  return response.json()
}

/**
 * Get the file tree of a cloned repository
 */
export async function getFileTree(
  cloneId: string,
  maxDepth: number = 3
): Promise<FileTreeNode> {
  const response = await fetch(
    `${API_BASE}/github/clone/${cloneId}/tree?max_depth=${maxDepth}`
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to get file tree' }))
    throw new Error(error.detail || 'Failed to get file tree')
  }

  return response.json()
}

/**
 * Clean up a cloned repository
 */
export async function cleanupClone(cloneId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/github/clone/${cloneId}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to cleanup clone' }))
    throw new Error(error.detail || 'Failed to cleanup clone')
  }
}

/**
 * List all tracked clone operations
 */
export async function listClones(): Promise<CloneProgress[]> {
  const response = await fetch(`${API_BASE}/github/clones`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to list clones' }))
    throw new Error(error.detail || 'Failed to list clones')
  }

  return response.json()
}
