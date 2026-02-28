'use client'

import type {
  OrchestrationRun,
  OrchestrationRunEvent,
  RepoOrchestrationEvent,
  RepoOrchestrationRequest,
  RepoOrchestrationResult,
  RepoOrchestrationRunSummary,
  RepoRunReportSummary,
} from '@/lib/types/orchestrator'

// API base URL from environment, falling back to the onboard Prompt API for local dev
const API_BASE_FROM_ENV = (process.env.NEXT_PUBLIC_API_BASE ?? process.env.NEXT_PUBLIC_PROMPT_API_BASE ?? '').trim()
const DEFAULT_API_BASE = 'http://localhost:8000'
const API_BASE_RAW = API_BASE_FROM_ENV || DEFAULT_API_BASE
const API_BASE = API_BASE_RAW.replace(/\/$/, '')

// Configuration
const API_HEALTH_CHECK_TIMEOUT_MS = 5000 // 5 seconds

export const ORCHESTRATOR_API_BASE = API_BASE
export const ORCHESTRATOR_API_USING_DEFAULT_BASE = API_BASE_FROM_ENV === ''

export interface OrchestrationRunCancelResult {
  run_id?: string
  runId?: string
  status?: string
  cancelled?: boolean
  cancel_requested?: boolean
  cancelRequested?: boolean
  message?: string
}

export interface OrchestrationRunRequeueResult {
  run_id: string
  status: string
  requeued: boolean
  message?: string
  attempt_id?: string
  attempt_number?: number
}

export interface ReleaseStaleLeasesResult {
  released: number
  run_ids: string[]
}

export interface BulkOrchestrationRunCancelResult {
  requested: number
  cancelled: number
  cancel_requested?: number
  cancelRequested?: number
  results: OrchestrationRunCancelResult[]
}

export interface OrchestrationQueueLimits {
  max_concurrent: number
  max_queued: number
  running: number
  queued: number
  dispatching?: number
  stuck?: number
  available_slots: number
}

export class OrchestratorApiHttpError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'OrchestratorApiHttpError'
    this.status = status
  }
}

export function isOrchestratorApiHttpError(error: unknown): error is OrchestratorApiHttpError {
  return error instanceof OrchestratorApiHttpError
}

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
    // Create AbortController for timeout (compatible with Node 18+)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), API_HEALTH_CHECK_TIMEOUT_MS)
    
    const res = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      signal: controller.signal,
    })
    
    clearTimeout(timeoutId)
    
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

  if (process.env.NODE_ENV === 'development') {
    console.debug(`[OrchestratorAPI] createOrchestrationRun → POST ${API_BASE}/orchestrate/run`, {
      localRunId: run.id,
      runMode: run.runMode,
      goal: run.goal?.slice(0, 80),
    })
  }

  try {
    // Send snake_case keys for fields the API reads by name
    const res = await fetch(`${API_BASE}/orchestrate/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...run,
        run_mode: run.runMode ?? 'default',
        prompt_id: run.promptId ?? null,
        acceptance_checks: run.acceptanceChecks ?? [],
      }),
    })

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error')
      throw new Error(`Failed to launch orchestration (${res.status}): ${errorText}`)
    }

    const payload = await res.json()
    const manifest = payload.manifest as OrchestrationRun

    if (process.env.NODE_ENV === 'development') {
      console.debug(`[OrchestratorAPI] createOrchestrationRun ← api_run_id: ${manifest.id}, status: ${manifest.status}`)
    }

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
  if (!runId?.trim()) {
    throw new Error('Run ID is required to fetch orchestration run details')
  }

  if (process.env.NODE_ENV === 'development') {
    console.debug(`[OrchestratorAPI] fetchOrchestrationRun → GET ${API_BASE}/orchestrate/run/${runId}`)
  }

  try {
    const res = await fetch(`${API_BASE}/orchestrate/run/${encodeURIComponent(runId)}`)
    if (!res.ok) throw new OrchestratorApiHttpError(`Failed to fetch run (${res.status})`, res.status)

    const payload = await res.json()
    const normalized = normalizeApiRun(payload)

    if (process.env.NODE_ENV === 'development') {
      console.debug(
        `[OrchestratorAPI] fetchOrchestrationRun ← run_id: ${normalized.id}, status: ${normalized.status}, events: ${normalized.events?.length ?? 0}`
      )
    }

    return normalized
  } catch (error) {
    // 404 is expected for stale/missing run contexts; callers can decide how to handle it.
    if (!(error instanceof OrchestratorApiHttpError && error.status === 404)) {
      console.error(`[OrchestratorAPI] Failed to fetch run ${runId}:`, error)
    }
    throw error
  }
}

/**
 * Cancel an orchestration run by ID.
 * Queued runs cancel immediately; running runs receive a cancellation request.
 */
export async function cancelOrchestrationRun(runId: string): Promise<OrchestrationRunCancelResult> {
  if (!API_BASE) throw new Error('API base not configured')
  if (!runId?.trim()) throw new Error('Run ID is required to cancel orchestration run')

  const res = await fetch(`${API_BASE}/orchestrate/run/${encodeURIComponent(runId)}/cancel`, {
    method: 'POST',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error')
    throw new OrchestratorApiHttpError(`Failed to cancel run (${res.status}): ${text}`, res.status)
  }
  return (await res.json()) as OrchestrationRunCancelResult
}

export async function forceCancelOrchestrationRun(runId: string): Promise<OrchestrationRunCancelResult> {
  if (!API_BASE) throw new Error('API base not configured')
  if (!runId?.trim()) throw new Error('Run ID is required to force-cancel orchestration run')

  const res = await fetch(`${API_BASE}/api/runs/${encodeURIComponent(runId)}/cancel?force=1`, {
    method: 'POST',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error')
    throw new OrchestratorApiHttpError(`Failed to force-cancel run (${res.status}): ${text}`, res.status)
  }
  return (await res.json()) as OrchestrationRunCancelResult
}

export async function requeueOrchestrationRun(runId: string): Promise<OrchestrationRunRequeueResult> {
  if (!API_BASE) throw new Error('API base not configured')
  if (!runId?.trim()) throw new Error('Run ID is required to requeue orchestration run')

  const res = await fetch(`${API_BASE}/api/runs/${encodeURIComponent(runId)}/requeue`, {
    method: 'POST',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error')
    throw new OrchestratorApiHttpError(`Failed to requeue run (${res.status}): ${text}`, res.status)
  }
  return (await res.json()) as OrchestrationRunRequeueResult
}

export async function releaseStaleRunLeases(): Promise<ReleaseStaleLeasesResult> {
  if (!API_BASE) throw new Error('API base not configured')

  const res = await fetch(`${API_BASE}/api/runs/release-stale-leases`, {
    method: 'POST',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error')
    throw new OrchestratorApiHttpError(`Failed to release stale leases (${res.status}): ${text}`, res.status)
  }
  return (await res.json()) as ReleaseStaleLeasesResult
}

/**
 * Cancel multiple orchestration runs.
 */
export async function bulkCancelOrchestrationRuns(args: {
  runIds?: string[]
  cancelAllQueued?: boolean
} = {}): Promise<BulkOrchestrationRunCancelResult> {
  if (!API_BASE) throw new Error('API base not configured')

  const runIds = Array.isArray(args.runIds) ? args.runIds.filter(Boolean) : []
  const body = {
    run_ids: runIds,
    cancel_all_queued: Boolean(args.cancelAllQueued),
  }

  const res = await fetch(`${API_BASE}/orchestrate/runs/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error')
    throw new OrchestratorApiHttpError(`Failed to cancel runs (${res.status}): ${text}`, res.status)
  }
  return (await res.json()) as BulkOrchestrationRunCancelResult
}

/**
 * Get current queue limits and occupancy for orchestration runs.
 */
export async function fetchOrchestrationQueueLimits(): Promise<OrchestrationQueueLimits> {
  if (!API_BASE) throw new Error('API base not configured')

  const res = await fetch(`${API_BASE}/orchestrate/runs/limits`)
  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error')
    throw new OrchestratorApiHttpError(`Failed to fetch queue limits (${res.status}): ${text}`, res.status)
  }
  return (await res.json()) as OrchestrationQueueLimits
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
  const rawSandboxReport = raw.sandbox_report as Record<string, unknown> | undefined
  const rawRequirementsRequest = (raw.requirements_request as Record<string, unknown> | undefined)
    ?? (rawSandboxReport?.requirements_request as Record<string, unknown> | undefined)
  const normalizeRequirementsRequest = (value?: Record<string, unknown>) => {
    if (!value) return undefined
    const blockersRaw = Array.isArray(value.blockers) ? value.blockers : []
    const blockers = blockersRaw
      .filter((b): b is Record<string, unknown> => Boolean(b && typeof b === 'object'))
      .map((b, idx) => ({
        id: String(b.id || `req_${idx + 1}`),
        question: String(b.question || ''),
        why: String(b.why || ''),
        defaults: Array.isArray(b.defaults) ? b.defaults.map(String) : undefined,
      }))
      .filter((b) => b.question.trim().length > 0)
    return {
      summary: value.summary ? String(value.summary) : undefined,
      blockers,
      proposed_acceptance_tests: Array.isArray(value.proposed_acceptance_tests)
        ? value.proposed_acceptance_tests.map(String)
        : undefined,
      performance_budget: value.performance_budget,
      maintenance_scope: value.maintenance_scope,
    }
  }
  const requirementsRequest = normalizeRequirementsRequest(rawRequirementsRequest)
  const sandboxReport = rawSandboxReport
    ? {
        generatedAt: String(rawSandboxReport.generated_at || rawSandboxReport.generatedAt || ''),
        verificationStatus: String(
          rawSandboxReport.verification_status || rawSandboxReport.verificationStatus || 'pending'
        ) as NonNullable<OrchestrationRun['sandboxReport']>['verificationStatus'],
        loopIteration: Number(rawSandboxReport.loop_iteration || rawSandboxReport.loopIteration || 0),
        checks: Array.isArray(rawSandboxReport.checks)
          ? rawSandboxReport.checks
              .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
              .map((c) => ({
                check: String(c.check || ''),
                evaluator: String(c.evaluator || ''),
                result: String(c.result || 'deferred') as NonNullable<OrchestrationRun['sandboxReport']>['checks'][number]['result'],
                details: String(c.details || ''),
                data: (c.data as Record<string, unknown> | undefined) ?? undefined,
              }))
          : [],
        passedCount: Number(rawSandboxReport.passed_count || rawSandboxReport.passedCount || 0),
        failedCount: Number(rawSandboxReport.failed_count || rawSandboxReport.failedCount || 0),
        needsRequirementsCount: Number(
          rawSandboxReport.needs_requirements_count || rawSandboxReport.needsRequirementsCount || 0
        ),
        deferredCount: Number(rawSandboxReport.deferred_count || rawSandboxReport.deferredCount || 0),
        requirementsRequest: normalizeRequirementsRequest(
          rawSandboxReport.requirements_request as Record<string, unknown> | undefined
        ),
      }
    : undefined
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
    rawStatus: raw.raw_status ? String(raw.raw_status) : undefined,
    heartbeatStale: Boolean(raw.heartbeat_stale),
    lastHeartbeatAt: raw.last_heartbeat_at ? String(raw.last_heartbeat_at) : undefined,
    lastEventAt: raw.last_event_at ? String(raw.last_event_at) : undefined,
    currentAgent: raw.current_agent ? String(raw.current_agent) : undefined,
    currentStage: raw.current_stage ? String(raw.current_stage) : undefined,
    lease: (raw.lease as OrchestrationRun['lease']) ?? undefined,
    mode: raw.mode as 'executed' | 'simulated' | undefined,
    runMode: (raw.run_mode || 'default') as 'default' | 'codex-swarm' | 'multi-agent',
    jobType: raw.job_type ? String(raw.job_type) : undefined,
    appType: raw.app_type ? String(raw.app_type) : undefined,
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
    runDir: raw.run_dir ? String(raw.run_dir) : undefined,
    errorDetail: raw.error_detail ? String(raw.error_detail) : undefined,
    tokens: raw.tokens as OrchestrationRun['tokens'],
    acceptanceChecks: Array.isArray(raw.acceptance_checks)
      ? (raw.acceptance_checks as string[])
      : undefined,
    verificationStatus: raw.verification_status ? String(raw.verification_status) as OrchestrationRun['verificationStatus'] : undefined,
    loopIteration: typeof raw.loop_iteration === 'number' ? raw.loop_iteration : undefined,
    sandboxReport,
    requirementsRequest,
  }
}

/**
 * Start a repository orchestration run with streaming SSE events
 */
export async function startRepoOrchestration(
  payload: RepoOrchestrationRequest,
  onEvent: (event: RepoOrchestrationEvent) => void
): Promise<{ cancel: () => void }> {
  if (!API_BASE) throw new Error('API base not configured')

  const controller = new AbortController()
  const res = await fetch(`${API_BASE}/orchestrate/repo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })

  if (!res.ok || !res.body) {
    const msg = await res.text().catch(() => 'failed to start repo orchestration')
    throw new Error(`Failed to start repo orchestration (${res.status}): ${msg}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const pump = async (): Promise<void> => {
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''
        for (const chunk of parts) {
          for (const line of chunk.split('\n')) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            const jsonPayload = trimmed.replace(/^data:\s*/, '')
            try {
              const parsed = JSON.parse(jsonPayload) as RepoOrchestrationEvent
              onEvent(parsed)
              if (parsed.final) {
                return
              }
            } catch (err) {
              console.warn('[RepoOrchestration] Failed to parse event', err, jsonPayload)
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      console.warn('[RepoOrchestration] Stream ended with error', err)
    }
  }

  // Begin processing asynchronously
  void pump()

  return {
    cancel: () => controller.abort(),
  }
}

/**
 * Cancel an active repository orchestration run
 */
export async function cancelRepoOrchestration(runId: string): Promise<RepoOrchestrationResult> {
  if (!API_BASE) throw new Error('API base not configured')
  const res = await fetch(`${API_BASE}/orchestrate/repo/${encodeURIComponent(runId)}/cancel`, {
    method: 'POST',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error')
    throw new Error(`Failed to cancel run (${res.status}): ${text}`)
  }
  return (await res.json()) as RepoOrchestrationResult
}

/**
 * Fetch recent repository orchestration runs with summary metadata.
 */
export async function fetchRepoOrchestrationRuns(): Promise<RepoOrchestrationRunSummary[]> {
  if (!API_BASE) throw new Error('API base not configured')
  const res = await fetch(`${API_BASE}/orchestrate/repo`)
  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error')
    throw new Error(`Failed to fetch repo runs (${res.status}): ${text}`)
  }
  const payload = (await res.json()) as { runs?: Array<Record<string, unknown>> }
  const runs = Array.isArray(payload.runs) ? payload.runs : []
  return runs.map((run) => {
    const summary = run.report_summary as Record<string, unknown> | undefined
    const reportSummary: RepoRunReportSummary | null = summary
      ? {
          outcome: summary.outcome as RepoRunReportSummary['outcome'],
          headline: summary.headline ? String(summary.headline) : undefined,
          patch: Boolean(summary.patch),
          commandsExecuted: summary.commands_executed ? Number(summary.commands_executed) : 0,
        }
      : null
    return {
      runId: String(run.run_id || run.runId || ''),
      repo: run.repo ? String(run.repo) : undefined,
      branch: run.branch ? String(run.branch) : undefined,
      status: run.status ? String(run.status) : undefined,
      requestedAt: run.requested_at ? String(run.requested_at) : undefined,
      reportSummary,
    }
  })
}
