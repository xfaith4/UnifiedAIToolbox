export interface GitHubRepo {
  id?: number
  name: string
  full_name: string
  html_url: string
  description?: string | null
  owner?: string | null
  default_branch?: string | null
  visibility?: string | null
  private?: boolean
  archived?: boolean
  updated_at?: string | null
  open_prs_count?: number
}
