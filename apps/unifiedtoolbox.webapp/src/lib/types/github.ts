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
  appfactory?: {
    known?: boolean
    status?: string
    reason?: string
    topic_present?: boolean
    metadata_present?: boolean
    metadata_valid?: boolean
    schema_version?: string
    factory_name?: string
    contract_universe?: string
    contract_version?: string
    pipeline_id?: string
    topic_tag?: string
    needs_topic_heal?: boolean
    topic_healed?: boolean
    heal_error?: string
  }
}
