export interface GitHubRepo {
  id: number
  name: string
  full_name: string
  html_url: string
  description?: string | null
  private?: boolean
}
