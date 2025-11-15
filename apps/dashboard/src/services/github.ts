/**
 * Simple GitHub client using the public API.
 * If a token is provided, it's sent as Bearer for higher rate limits/private repos.
 */
export interface GitHubRepo {
  id: number
  full_name: string
  html_url: string
  description: string | null
  private: boolean
  archived: boolean
  [key: string]: unknown
}

export async function getUserRepos(
  username: string,
  token?: string
): Promise<GitHubRepo[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(
    `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100`,
    {
      headers,
    }
  )
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`GitHub error ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  return (await res.json()) as GitHubRepo[]
}
