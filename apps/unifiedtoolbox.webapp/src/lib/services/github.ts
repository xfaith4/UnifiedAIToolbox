'use client'

import { ORCHESTRATOR_API_BASE } from './orchestratorApi'
import type { GitHubRepo } from '@/lib/types/github'

type GitHubStatus = {
  available?: boolean
  authenticated?: boolean
  message?: string
}

export async function getGithubStatus(): Promise<GitHubStatus | null> {
  if (!ORCHESTRATOR_API_BASE) {
    return null
  }

  try {
    const res = await fetch(`${ORCHESTRATOR_API_BASE}/github/status`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as GitHubStatus
    return data
  } catch {
    return null
  }
}

export async function listAccessibleRepos(
  token?: string,
  options?: { appfactoryOnly?: boolean; includeAppfactory?: boolean; healTopics?: boolean }
): Promise<GitHubRepo[]> {
  const trimmedToken = token?.trim() ?? ''

  if (!ORCHESTRATOR_API_BASE) {
    throw new Error('Orchestrator API base URL is not configured.')
  }

  const params = new URLSearchParams()
  if (options?.appfactoryOnly) params.set('appfactory_only', 'true')
  if (options?.includeAppfactory) params.set('include_appfactory', 'true')
  if (options?.healTopics) params.set('heal_topics', 'true')
  const query = params.toString()

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (trimmedToken) {
    headers.Authorization = `Bearer ${trimmedToken}`
  }

  const res = await fetch(`${ORCHESTRATOR_API_BASE}/github/repos${query ? `?${query}` : ''}`, {
    headers,
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
