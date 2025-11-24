import { PROMPT_API_BASE } from './promptStore'
import type { OrchestrationRun } from './orchestratorStore'

export async function createRunApi(run: OrchestrationRun): Promise<OrchestrationRun> {
  if (!PROMPT_API_BASE) {
    throw new Error('API base not configured')
  }
  const res = await fetch(`${PROMPT_API_BASE}/orchestrate/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(run),
  })
  if (!res.ok) {
    throw new Error(`Failed to launch orchestration (${res.status})`)
  }
  const payload = await res.json()
  const manifest = payload.manifest as OrchestrationRun
  return {
    ...manifest,
    requested_at: manifest.requested_at,
  }
}

export async function fetchRunsApi(): Promise<OrchestrationRun[]> {
  if (!PROMPT_API_BASE) throw new Error('API base not configured')
  const res = await fetch(`${PROMPT_API_BASE}/orchestrate/runs`)
  if (!res.ok) throw new Error(`Failed to fetch runs (${res.status})`)
  const payload = await res.json()
  return (payload.runs as OrchestrationRun[]).map((r) => ({
    ...r,
    run_id: r.run_id || r.prompt_id,
  }))
}

export async function fetchRunApi(run_id: string): Promise<OrchestrationRun> {
  if (!PROMPT_API_BASE) throw new Error('API base not configured')
  const res = await fetch(`${PROMPT_API_BASE}/orchestrate/run/${encodeURIComponent(run_id)}`)
  if (!res.ok) throw new Error(`Failed to fetch run (${res.status})`)
  const payload = await res.json()
  return payload as OrchestrationRun
}
