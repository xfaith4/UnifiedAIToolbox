'use client'

import type { GitHubRepo } from '@/lib/types/github'

export async function getUserRepos(username: string, token?: string): Promise<GitHubRepo[]> {
  if (!username) return []
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos`, {
    headers,
  })

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`GitHub request failed (${res.status}): ${detail || res.statusText}`)
  }

  const data = (await res.json()) as GitHubRepo[]
  return Array.isArray(data) ? data : []
}
