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
