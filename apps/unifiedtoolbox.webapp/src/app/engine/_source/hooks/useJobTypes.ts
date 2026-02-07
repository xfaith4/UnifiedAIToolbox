import { useEffect, useState } from 'react'

export type JobTypeField = {
  path: string
  label: string
  type?: string
  enum?: string[]
}

export type JobTypeSummary = {
  id: string
  label: string
  request_schema?: string
  contract_schema?: string
  request_fields: JobTypeField[]
  pipeline: { stages: Array<{ id: string; name?: string; description?: string }> }
  default_agents: string[]
  gate_policy?: Record<string, any> | null
  artifact_policy?: Record<string, any> | null
  command_policy?: Record<string, any> | null
  supervisor_policy?: Record<string, any> | null
}

export type JobTypesResponse = {
  schema_version: string
  job_types: Record<string, JobTypeSummary>
}

export function useJobTypes() {
  const [data, setData] = useState<JobTypesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/job-types', { cache: 'no-store' })
        if (!res.ok) throw new Error(`Failed to load job types (${res.status})`)
        const json = (await res.json()) as JobTypesResponse
        if (!cancelled) {
          setData(json)
          setError(null)
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load job types.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return { data, error, loading }
}
