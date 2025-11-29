/**
 * GitHub API Client
 * 
 * Service for interacting with GitHub integration endpoints.
 */

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

export interface RepositorySearchResult {
  full_name: string;
  description: string;
  stars: number;
  language: string;
  size: number;
  html_url: string;
  private: boolean;
  topics: string[];
}

export interface RepositoryMetadata extends RepositorySearchResult {
  forks: number;
  default_branch: string;
  clone_url: string;
  archived: boolean;
}

export interface CloneRequest {
  repo_url: string;
  branch?: string;
  clone_id?: string;
}

export interface CloneResponse {
  clone_id: string;
  clone_path: string;
  status: string;
  message: string;
}

export interface FileTreeNode {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileTreeNode[];
  truncated?: boolean;
}

export interface CodexRunRequest {
  repo_path: string;
  model?: string;
  max_parallel?: number;
}

export interface CodexRunResponse {
  run_id: string;
  status: string;
  message: string;
}

export interface CodexRunStatus {
  run_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  repo_path: string;
  model: string;
  start_time: string;
  end_time?: string;
  findings_count?: number;
  log_file: string;
}

export interface CodexFinding {
  id: string;
  agent_role: string;
  shard: string;
  log_content: string;
  log_file: string;
  directory: string;
}

/**
 * Search for GitHub repositories
 */
export async function searchRepositories(
  query: string,
  limit = 20
): Promise<RepositorySearchResult[]> {
  const url = `${API_BASE}/github/search`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, max_results: limit }),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Search failed' }));
    throw new Error(error.detail || `Search failed: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Get metadata for a specific repository
 */
export async function getRepositoryMetadata(
  owner: string,
  repo: string
): Promise<RepositoryMetadata> {
  const url = `${API_BASE}/github/repo/${owner}/${repo}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch repository: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Clone a GitHub repository
 */
export async function cloneRepository(
  request: CloneRequest
): Promise<CloneResponse> {
  const url = `${API_BASE}/github/clone`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || 'Clone failed');
  }
  
  return response.json();
}

/**
 * List branches in a cloned repository
 */
export async function listBranches(cloneId: string): Promise<string[]> {
  const url = `${API_BASE}/github/clone/${cloneId}/branches`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to list branches: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.branches || [];
}

/**
 * Get file tree of a cloned repository
 */
export async function getFileTree(
  cloneId: string,
  maxDepth = 3
): Promise<FileTreeNode> {
  const url = `${API_BASE}/github/clone/${cloneId}/tree?max_depth=${maxDepth}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to get file tree: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Delete a cloned repository
 */
export async function deleteClone(cloneId: string): Promise<void> {
  const url = `${API_BASE}/github/clone/${cloneId}`;
  const response = await fetch(url, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    throw new Error(`Failed to delete clone: ${response.statusText}`);
  }
}

/**
 * Start a Codex swarm run
 */
export async function startCodexRun(
  request: CodexRunRequest
): Promise<CodexRunResponse> {
  const url = `${API_BASE}/github/codex/run`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || 'Failed to start Codex run');
  }
  
  return response.json();
}

/**
 * Get status of a Codex run
 */
export async function getCodexRunStatus(runId: string): Promise<CodexRunStatus> {
  const url = `${API_BASE}/github/codex/run/${runId}/status`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to get run status: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * List all Codex runs
 */
export async function listCodexRuns(): Promise<{ runs: CodexRunStatus[]; count: number }> {
  const url = `${API_BASE}/github/codex/runs`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to list runs: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Get findings from a completed Codex run
 */
export async function getCodexFindings(
  runId: string
): Promise<{ run_id: string; findings: CodexFinding[]; count: number }> {
  const url = `${API_BASE}/github/codex/run/${runId}/findings`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to get findings: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Cancel a running Codex swarm
 */
export async function cancelCodexRun(runId: string): Promise<void> {
  const url = `${API_BASE}/github/codex/run/${runId}/cancel`;
  const response = await fetch(url, {
    method: 'POST',
  });
  
  if (!response.ok) {
    throw new Error(`Failed to cancel run: ${response.statusText}`);
  }
}

/**
 * Stream Codex run progress (returns EventSource for Server-Sent Events)
 */
export function streamCodexRun(runId: string): EventSource {
  const url = `${API_BASE}/github/codex/run/${runId}/stream`;
  return new EventSource(url);
}
