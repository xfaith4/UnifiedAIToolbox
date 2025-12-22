'use client'

import { ORCHESTRATOR_API_BASE } from './orchestratorApi'
import type { GitHubRepo } from '@/lib/types/github'

export async function listAccessibleRepos(token: string): Promise<GitHubRepo[]> {
  const trimmedToken = token.trim()
  if (!trimmedToken) {
    throw new Error('A GitHub personal access token is required to list repositories.')
  }

  if (!ORCHESTRATOR_API_BASE) {
    throw new Error('Orchestrator API base URL is not configured.')
  }

  const res = await fetch(`${ORCHESTRATOR_API_BASE}/github/repos`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${trimmedToken}`,
    },
    cache: 'no-store',
  })

  const body = await res.text()

  if (!res.ok) {
    let detail = res.statusText
    try {
      const parsed = JSON.parse(body)
      detail = parsed.detail || parsed.error || detail
    } catch {
      if (body) detail = body
    }
    throw new Error(`Failed to load repositories (${res.status}): ${detail}`)
  }

  try {
    const data = JSON.parse(body) as GitHubRepo[]
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}
