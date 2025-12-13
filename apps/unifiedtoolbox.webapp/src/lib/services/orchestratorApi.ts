'use client'

import type { OrchestrationRun, OrchestrationRunEvent } from '@/lib/types/orchestrator'

// API base URL from environment, falling back to the onboard Prompt API for local dev
const API_BASE_FROM_ENV = (process.env.NEXT_PUBLIC_API_BASE ?? process.env.NEXT_PUBLIC_PROMPT_API_BASE ?? '').trim()
const DEFAULT_API_BASE = 'http://localhost:8000'
const API_BASE_RAW = API_BASE_FROM_ENV || DEFAULT_API_BASE
const API_BASE = API_BASE_RAW.replace(/\/$/, '')

export const ORCHESTRATOR_API_BASE = API_BASE
export const ORCHESTRATOR_API_USING_DEFAULT_BASE = API_BASE_FROM_ENV === ''

// Log the configuration on module load (only in development)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.log('[OrchestratorAPI] Configuration:', {
    API_BASE,
    usingDefaultBase: ORCHESTRATOR_API_USING_DEFAULT_BASE,
    envVariable: API_BASE_FROM_ENV ? 'set' : 'not set',
  })
}

/**
 * Validate API connectivity by checking the health endpoint
 */
export async function validateApiConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    })
    
    if (!res.ok) {
      return { ok: false, error: `API health check failed with status ${res.status}` }
    }
    
    const data = await res.json()
    if (!data.ok) {
      return { ok: false, error: 'API health check returned not ok' }
    }
    
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { ok: false, error: `Failed to connect to API: ${message}` }
  }
}

/**
 * Create a new orchestration run via the API
 */
export async function createOrchestrationRun(run: OrchestrationRun): Promise<OrchestrationRun> {
  if (!API_BASE) {
    throw new Error('API base not configured')
  }
  
  try {
    const res = await fetch(`${API_BASE}/orchestrate/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(run),
    })
    
    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error')
      throw new Error(`Failed to launch orchestration (${res.status}): ${errorText}`)
    }
    
    const payload = await res.json()
    const manifest = payload.manifest as OrchestrationRun
    
    return {
      ...manifest,
      requestedAt: manifest.requestedAt,
    }
  } catch (error) {
    console.error('[OrchestratorAPI] Failed to create orchestration run:', error)
    
    // Provide helpful error message
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Cannot connect to API at ${API_BASE}. Is the Prompt API running?`)
    }
    
    throw error
  }
}

/**
 * Fetch all orchestration runs from the API
 */
export async function fetchOrchestrationRuns(): Promise<OrchestrationRun[]> {
  if (!API_BASE) throw new Error('API base not configured')
  
  try {
    const res = await fetch(`${API_BASE}/orchestrate/runs`)
    if (!res.ok) throw new Error(`Failed to fetch runs (${res.status})`)
    
    const payload = await res.json()
    const runs = payload.runs as Array<Record<string, unknown>>
    
    return runs.map((r) => normalizeApiRun(r))
  } catch (error) {
    console.error('[OrchestratorAPI] Failed to fetch orchestration runs:', error)
    throw error
  }
}

/**
 * Fetch a single orchestration run by ID
 */
export async function fetchOrchestrationRun(runId: string): Promise<OrchestrationRun> {
  if (!API_BASE) throw new Error('API base not configured')
  
  try {
    const res = await fetch(`${API_BASE}/orchestrate/run/${encodeURIComponent(runId)}`)
    if (!res.ok) throw new Error(`Failed to fetch run (${res.status})`)
    
    const payload = await res.json()
    return normalizeApiRun(payload)
  } catch (error) {
    console.error(`[OrchestratorAPI] Failed to fetch run ${runId}:`, error)
    throw error
  }
}

/**
 * Fetch the log for a specific orchestration run
 */
export async function fetchOrchestrationRunLog(
  runId: string,
  maxBytes = 8000
): Promise<{ log: string; bytes: number }> {
  if (!API_BASE) throw new Error('API base not configured')
  
  try {
    const res = await fetch(`${API_BASE}/orchestrate/run/${encodeURIComponent(runId)}/log?max_bytes=${maxBytes}`)
    if (!res.ok) throw new Error(`Failed to fetch log (${res.status})`)
    
    const payload = await res.json()
    return { log: payload.log as string, bytes: payload.bytes as number }
  } catch (error) {
    console.error(`[OrchestratorAPI] Failed to fetch log for run ${runId}:`, error)
    throw error
  }
}

/**
 * Normalize an API response into the client-side OrchestrationRun type
 */
function normalizeApiRun(raw: Record<string, unknown>): OrchestrationRun {
  const events: OrchestrationRunEvent[] = []
  if (Array.isArray(raw.events)) {
    for (const ev of raw.events) {
      if (ev && typeof ev === 'object' && 'ts' in ev && 'type' in ev && 'message' in ev) {
        events.push({
          timestamp: String(ev.ts),
          type: String(ev.type),
          message: String(ev.message),
        })
      }
    }
  }

  return {
    id: String(raw.run_id || raw.id || ''),
    promptId: String(raw.prompt_id || ''),
    goal: raw.goal ? String(raw.goal) : undefined,
    agents: Array.isArray(raw.agents) ? raw.agents.map(String) : [],
    status: String(raw.status || 'unknown'),
    mode: raw.mode as 'executed' | 'simulated' | undefined,
    runMode: (raw.run_mode || 'default') as 'default' | 'codex-swarm' | 'multi-agent',
    requestedAt: raw.requested_at ? String(raw.requested_at) : undefined,
    startedAt: raw.started_at ? String(raw.started_at) : undefined,
    completedAt: raw.completed_at ? String(raw.completed_at) : undefined,
    events,
    model: raw.model ? String(raw.model) : undefined,
    version: raw.version ? String(raw.version) : undefined,
    reviewPolicy: raw.review_policy ? String(raw.review_policy) : undefined,
    datasetId: raw.dataset_id ? String(raw.dataset_id) : undefined,
    datasetName: raw.dataset_name ? String(raw.dataset_name) : undefined,
    notes: raw.notes ? String(raw.notes) : undefined,
    output: raw.output ? String(raw.output) : undefined,
    tokens: raw.tokens as OrchestrationRun['tokens'],
  }
}
