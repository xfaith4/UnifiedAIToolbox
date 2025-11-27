'use client'

import type { OrchestrationRun, OrchestrationRunEvent } from '@/lib/types/orchestrator'

// API base URL from environment, with fallback
const API_BASE_RAW = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000'
const API_BASE = API_BASE_RAW ? API_BASE_RAW.replace(/\/$/, '') : ''
export const ORCHESTRATOR_API_BASE = API_BASE

/**
 * Create a new orchestration run via the API
 */
export async function createOrchestrationRun(run: OrchestrationRun): Promise<OrchestrationRun> {
  if (!API_BASE) {
    throw new Error('API base not configured')
  }
  const res = await fetch(`${API_BASE}/orchestrate/run`, {
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
    requestedAt: manifest.requestedAt,
  }
}

/**
 * Fetch all orchestration runs from the API
 */
export async function fetchOrchestrationRuns(): Promise<OrchestrationRun[]> {
  if (!API_BASE) throw new Error('API base not configured')
  const res = await fetch(`${API_BASE}/orchestrate/runs`)
  if (!res.ok) throw new Error(`Failed to fetch runs (${res.status})`)
  const payload = await res.json()
  const runs = payload.runs as Array<Record<string, unknown>>
  return runs.map((r) => normalizeApiRun(r))
}

/**
 * Fetch a single orchestration run by ID
 */
export async function fetchOrchestrationRun(runId: string): Promise<OrchestrationRun> {
  if (!API_BASE) throw new Error('API base not configured')
  const res = await fetch(`${API_BASE}/orchestrate/run/${encodeURIComponent(runId)}`)
  if (!res.ok) throw new Error(`Failed to fetch run (${res.status})`)
  const payload = await res.json()
  return normalizeApiRun(payload)
}

/**
 * Fetch the log for a specific orchestration run
 */
export async function fetchOrchestrationRunLog(
  runId: string,
  maxBytes = 8000
): Promise<{ log: string; bytes: number }> {
  if (!API_BASE) throw new Error('API base not configured')
  const res = await fetch(`${API_BASE}/orchestrate/run/${encodeURIComponent(runId)}/log?max_bytes=${maxBytes}`)
  if (!res.ok) throw new Error(`Failed to fetch log (${res.status})`)
  const payload = await res.json()
  return { log: payload.log as string, bytes: payload.bytes as number }
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
