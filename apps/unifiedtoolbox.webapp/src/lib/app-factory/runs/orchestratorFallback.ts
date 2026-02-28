import 'server-only'
import type { RunEvent, RunStatusResponse } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// orchestratorFallback — server-side proxy to the external orchestrator API.
//
// When a run_id is not found in the App Factory filesystem (i.e., it belongs
// to a Concierge/orchestrator run), these helpers fetch from the orchestrator
// API and normalize the response into the same RunStatusResponse / RunEvent[]
// shapes used by App Factory routes.
//
// This unifies the status and events routes so Swarm View and Run Detail work
// for BOTH pathways using the same canonical /api/runs/* endpoints.
// ─────────────────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 8000

function resolveOrchestratorBase(): string {
  const raw = (
    process.env.NEXT_PUBLIC_API_BASE ??
    process.env.NEXT_PUBLIC_PROMPT_API_BASE ??
    ''
  ).trim()
  return (raw || 'http://localhost:8000').replace(/\/$/, '')
}

type OrchestratorRunRaw = {
  run_id?: string
  id?: string
  status?: string
  goal?: string
  started_at?: string
  completed_at?: string
  updated_at?: string
  last_heartbeat_at?: string
  last_event_at?: string
  current_stage?: string
  current_agent?: string
  run_mode?: string
  job_type?: string
  events?: Array<Record<string, unknown>>
}

function normalizeOrchestratorEvent(raw: Record<string, unknown>, runId: string): RunEvent {
  const ts = String(raw.ts ?? raw.timestamp ?? raw.time ?? new Date().toISOString())
  const type = String(raw.type ?? 'info')
  const message = String(raw.message ?? raw.msg ?? '')
  const stage = raw.stage ?? raw.phase ?? raw.agent
  return {
    ts,
    runId,
    type,
    stage: stage ? String(stage) : undefined,
    message,
  }
}

function normalizeOrchestratorStatus(raw: OrchestratorRunRaw, runId: string): RunStatusResponse {
  const events: RunEvent[] = Array.isArray(raw.events)
    ? raw.events.map((ev) => normalizeOrchestratorEvent(ev as Record<string, unknown>, runId))
    : []

  const rawStatus = String(raw.status ?? 'unknown').toLowerCase()
  let status: RunStatusResponse['status']
  if (['queued', 'pending'].includes(rawStatus)) {
    status = 'queued'
  } else if (['succeeded', 'completed', 'success', 'done'].includes(rawStatus)) {
    status = 'succeeded'
  } else if (['failed', 'error', 'cancelled', 'canceled'].includes(rawStatus)) {
    status = 'failed'
  } else {
    // running, dispatching, in_progress, gating, stuck → running
    status = 'running'
  }

  const latest = events.at(-1)
  const currentStage = raw.current_stage ? String(raw.current_stage) : latest?.stage ?? null

  return {
    runId,
    jobType: raw.job_type ? String(raw.job_type) : raw.run_mode ? String(raw.run_mode) : undefined,
    status,
    currentStage,
    stageIndex: undefined,
    stageCount: undefined,
    progress: undefined,
    startedAt: raw.started_at ? String(raw.started_at) : undefined,
    updatedAt: raw.updated_at ?? raw.last_heartbeat_at ? String(raw.updated_at ?? raw.last_heartbeat_at) : undefined,
    endedAt: raw.completed_at ? String(raw.completed_at) : undefined,
    stages: [],
    events,
    artifacts: [],
  }
}

/**
 * Fetch run status from the orchestrator API.
 * Returns null if the run is not found (404) or the orchestrator is unreachable.
 */
export async function fetchOrchestratorRunStatus(runId: string): Promise<RunStatusResponse | null> {
  const base = resolveOrchestratorBase()
  const url = `${base}/orchestrate/run/${encodeURIComponent(runId)}`

  if (process.env.NODE_ENV === 'development') {
    console.debug(`[orchestratorFallback] status lookup → ${url}`)
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    } finally {
      clearTimeout(timer)
    }

    if (res.status === 404) return null
    if (!res.ok) {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`[orchestratorFallback] status lookup failed: ${res.status}`)
      }
      return null
    }

    const raw = (await res.json()) as OrchestratorRunRaw
    const runStatus = normalizeOrchestratorStatus(raw, runId)

    if (process.env.NODE_ENV === 'development') {
      console.debug(`[orchestratorFallback] status resolved: ${runStatus.status}, events: ${runStatus.events.length}`)
    }

    return runStatus
  } catch {
    // Orchestrator unreachable — return null so caller can handle gracefully
    return null
  }
}

/**
 * Fetch run events from the orchestrator API.
 * Returns an empty array if the run is not found or the orchestrator is unreachable.
 */
export async function fetchOrchestratorRunEvents(
  runId: string,
  since?: string | null
): Promise<RunEvent[]> {
  const status = await fetchOrchestratorRunStatus(runId)
  if (!status) return []

  let events = status.events
  if (since) {
    const sinceMs = new Date(since).getTime()
    if (!Number.isNaN(sinceMs)) {
      events = events.filter((ev) => {
        const ts = new Date(ev.ts).getTime()
        return !Number.isNaN(ts) && ts > sinceMs
      })
    }
  }
  return events
}
