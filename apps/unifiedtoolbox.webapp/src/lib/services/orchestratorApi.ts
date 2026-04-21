'use client'

import type {
  ArenaLane,
  ArenaLoserReason,
  ArenaRecord,
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

    const payload = (await res.json()) as Record<string, unknown>
    const manifestRaw =
      payload.manifest && typeof payload.manifest === 'object'
        ? (payload.manifest as Record<string, unknown>)
        : payload
    const normalized = normalizeApiRun(manifestRaw)
    const manifest: OrchestrationRun = {
      ...run,
      ...normalized,
      id: normalized.id || run.id,
      goal: normalized.goal || run.goal,
      agents: normalized.agents && normalized.agents.length > 0 ? normalized.agents : run.agents,
      runMode:
        (typeof manifestRaw.run_mode === 'string' && manifestRaw.run_mode.trim()) ||
        (typeof manifestRaw.runMode === 'string' && manifestRaw.runMode.trim())
          ? normalized.runMode
          : run.runMode,
      promptId: normalized.promptId || run.promptId,
      acceptanceChecks: normalized.acceptanceChecks ?? run.acceptanceChecks,
      requestedAt: normalized.requestedAt || run.requestedAt,
    }

    if (process.env.NODE_ENV === 'development') {
      console.debug(`[OrchestratorAPI] createOrchestrationRun ← api_run_id: ${manifest.id}, status: ${manifest.status}`)
    }

    return manifest
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
    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown error')
      throw new OrchestratorApiHttpError(`Failed to fetch runs (${res.status}): ${text}`, res.status)
    }
    
    const payload = await res.json()
    const runs = payload.runs as Array<Record<string, unknown>>
    
    return runs.map((r) => normalizeApiRun(r))
  } catch (error) {
    if (error instanceof OrchestratorApiHttpError && error.status === 429) {
      console.warn('[OrchestratorAPI] Rate-limited fetching runs (429). Will retry on next refresh.')
    } else {
      console.error('[OrchestratorAPI] Failed to fetch orchestration runs:', error)
    }
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

function pickString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function pickNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function normalizeArenaLane(raw: Record<string, unknown>): ArenaLane {
  const evidenceRaw = (raw.evidence && typeof raw.evidence === 'object' ? raw.evidence : {}) as Record<string, unknown>
  const gatesRaw = (evidenceRaw.gates && typeof evidenceRaw.gates === 'object' ? evidenceRaw.gates : {}) as Record<string, unknown>
  const repairRaw = (evidenceRaw.repair && typeof evidenceRaw.repair === 'object' ? evidenceRaw.repair : {}) as Record<string, unknown>
  const scoreRaw = (raw.score && typeof raw.score === 'object' ? raw.score : {}) as Record<string, unknown>
  const componentsRaw = (scoreRaw.components && typeof scoreRaw.components === 'object' ? scoreRaw.components : {}) as Record<string, unknown>
  const artifactsRaw = (raw.artifacts && typeof raw.artifacts === 'object' ? raw.artifacts : {}) as Record<string, unknown>

  const verdicts = Array.isArray(gatesRaw.verdicts)
    ? (gatesRaw.verdicts as unknown[])
        .filter((v): v is Record<string, unknown> => Boolean(v && typeof v === 'object'))
        .map((v) => ({
          name: pickString(v.name, 'check'),
          status: pickString(v.status, 'unknown'),
        }))
    : []

  const components: Record<string, number> = {}
  for (const [key, value] of Object.entries(componentsRaw)) {
    if (typeof value === 'number' && Number.isFinite(value)) components[key] = value
  }

  return {
    laneId: pickString(raw.lane_id ?? raw.laneId, 'lane'),
    provider: pickString(raw.provider, 'unknown'),
    label: pickString(raw.label, 'Lane'),
    status: pickString(raw.status, 'unknown'),
    startedAt: typeof raw.started_at === 'string' ? raw.started_at : typeof raw.startedAt === 'string' ? raw.startedAt : null,
    completedAt: typeof raw.completed_at === 'string' ? raw.completed_at : typeof raw.completedAt === 'string' ? raw.completedAt : null,
    evidence: {
      filesChangedCount: pickNumber(evidenceRaw.files_changed_count ?? evidenceRaw.filesChangedCount),
      filesChanged: Array.isArray(evidenceRaw.files_changed)
        ? (evidenceRaw.files_changed as unknown[]).map((v) => String(v))
        : Array.isArray(evidenceRaw.filesChanged)
          ? (evidenceRaw.filesChanged as unknown[]).map((v) => String(v))
          : [],
      commandsRunCount: pickNumber(evidenceRaw.commands_run_count ?? evidenceRaw.commandsRunCount),
      checkpointsTriggered: pickNumber(evidenceRaw.checkpoints_triggered ?? evidenceRaw.checkpointsTriggered),
      eventsRecorded: pickNumber(evidenceRaw.events_recorded ?? evidenceRaw.eventsRecorded),
      gates: {
        passed: pickNumber(gatesRaw.passed),
        failed: pickNumber(gatesRaw.failed),
        skipped: pickNumber(gatesRaw.skipped),
        verdicts,
      },
      repair: {
        targets: pickNumber(repairRaw.targets),
        attempts: pickNumber(repairRaw.attempts),
        status: pickString(repairRaw.status, 'unknown'),
      },
      verificationStatus: pickString(evidenceRaw.verification_status ?? evidenceRaw.verificationStatus, 'pending'),
      deliveryReadiness: pickString(evidenceRaw.delivery_readiness ?? evidenceRaw.deliveryReadiness, 'insufficient_evidence'),
    },
    score: {
      total: pickNumber(scoreRaw.total),
      components,
    },
    artifacts: {
      appProductionReport:
        typeof artifactsRaw.app_production_report === 'string'
          ? artifactsRaw.app_production_report
          : typeof artifactsRaw.appProductionReport === 'string'
            ? artifactsRaw.appProductionReport
            : null,
      appProductionSummary:
        typeof artifactsRaw.app_production_summary === 'string'
          ? artifactsRaw.app_production_summary
          : typeof artifactsRaw.appProductionSummary === 'string'
            ? artifactsRaw.appProductionSummary
            : null,
      repairReport:
        typeof artifactsRaw.repair_report === 'string'
          ? artifactsRaw.repair_report
          : typeof artifactsRaw.repairReport === 'string'
            ? artifactsRaw.repairReport
            : null,
      repairExecutionReport:
        typeof artifactsRaw.repair_execution_report === 'string'
          ? artifactsRaw.repair_execution_report
          : typeof artifactsRaw.repairExecutionReport === 'string'
            ? artifactsRaw.repairExecutionReport
            : null,
    },
  }
}

function normalizeArena(raw: unknown): ArenaRecord | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const obj = raw as Record<string, unknown>
  const lanesRaw = Array.isArray(obj.lanes) ? (obj.lanes as unknown[]) : []
  const lanes = lanesRaw
    .filter((l): l is Record<string, unknown> => Boolean(l && typeof l === 'object'))
    .map((l) => normalizeArenaLane(l))
  if (lanes.length === 0) return undefined

  const verdictRaw = (obj.verdict && typeof obj.verdict === 'object' ? obj.verdict : {}) as Record<string, unknown>
  const criteriaRaw = (verdictRaw.criteria && typeof verdictRaw.criteria === 'object' ? verdictRaw.criteria : {}) as Record<string, unknown>
  const reasonsRaw = Array.isArray(verdictRaw.reasons) ? (verdictRaw.reasons as unknown[]) : []
  const followUpRaw = Array.isArray(verdictRaw.follow_up)
    ? (verdictRaw.follow_up as unknown[])
    : Array.isArray(verdictRaw.followUp)
      ? (verdictRaw.followUp as unknown[])
      : []
  const loserReasonsRaw = Array.isArray(verdictRaw.loser_reasons)
    ? (verdictRaw.loser_reasons as unknown[])
    : Array.isArray(verdictRaw.loserReasons)
      ? (verdictRaw.loserReasons as unknown[])
      : []
  const loserReasons: ArenaLoserReason[] = loserReasonsRaw
    .filter((l): l is Record<string, unknown> => Boolean(l && typeof l === 'object'))
    .map((l) => ({
      laneId: typeof l.lane_id === 'string' ? l.lane_id : typeof l.laneId === 'string' ? l.laneId : undefined,
      score: pickNumber(l.score),
      rationale: pickString(l.rationale, ''),
    }))

  return {
    schemaVersion: pickString(obj.schema_version ?? obj.schemaVersion, '1'),
    runId: typeof obj.run_id === 'string' ? obj.run_id : typeof obj.runId === 'string' ? obj.runId : undefined,
    intent: typeof obj.intent === 'string' ? obj.intent : null,
    generatedAt: typeof obj.generated_at === 'string' ? obj.generated_at : typeof obj.generatedAt === 'string' ? obj.generatedAt : undefined,
    lanes,
    verdict: {
      winnerLaneId:
        typeof verdictRaw.winner_lane_id === 'string'
          ? verdictRaw.winner_lane_id
          : typeof verdictRaw.winnerLaneId === 'string'
            ? verdictRaw.winnerLaneId
            : undefined,
      winnerScore: pickNumber(verdictRaw.winner_score ?? verdictRaw.winnerScore),
      confidence: pickString(verdictRaw.confidence, 'low'),
      reasons: reasonsRaw.map((r) => String(r)).filter((r) => r.length > 0),
      loserReasons,
      followUp: followUpRaw.map((f) => String(f)).filter((f) => f.length > 0),
      criteria: {
        mustHave: Array.isArray(criteriaRaw.must_have)
          ? (criteriaRaw.must_have as unknown[]).map((v) => String(v))
          : Array.isArray(criteriaRaw.mustHave)
            ? (criteriaRaw.mustHave as unknown[]).map((v) => String(v))
            : [],
        niceToHave: Array.isArray(criteriaRaw.nice_to_have)
          ? (criteriaRaw.nice_to_have as unknown[]).map((v) => String(v))
          : Array.isArray(criteriaRaw.niceToHave)
            ? (criteriaRaw.niceToHave as unknown[]).map((v) => String(v))
            : [],
        intent: typeof criteriaRaw.intent === 'string' ? criteriaRaw.intent : null,
      },
    },
    reportArtifact:
      typeof obj.report_artifact === 'string'
        ? obj.report_artifact
        : typeof obj.reportArtifact === 'string'
          ? obj.reportArtifact
          : undefined,
    summaryArtifact:
      typeof obj.summary_artifact === 'string'
        ? obj.summary_artifact
        : typeof obj.summaryArtifact === 'string'
          ? obj.summaryArtifact
          : undefined,
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
  const checkpoints = Array.isArray(raw.checkpoints)
    ? raw.checkpoints
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map((item, idx) => ({
          id: String(item.id || item.checkpoint_id || `checkpoint_${idx + 1}`),
          agent: String(item.agent || 'unknown'),
          question: String(item.question || ''),
          options: Array.isArray(item.options) ? item.options.map(String) : [],
          defaultOption: String(item.default_option || item.defaultOption || ''),
          requestedAt: String(item.requested_at || item.requestedAt || ''),
          response: item.response == null ? null : String(item.response),
          respondedAt: item.responded_at == null && item.respondedAt == null ? null : String(item.responded_at || item.respondedAt),
          resolvedBy: item.resolved_by == null && item.resolvedBy == null
            ? null
            : String(item.resolved_by || item.resolvedBy) as 'human' | 'timeout',
          status: item.status ? String(item.status) : undefined,
          answers: Array.isArray(item.answers)
            ? item.answers
                .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
                .map((entry) => ({
                  blockerId: entry.blocker_id ? String(entry.blocker_id) : entry.blockerId ? String(entry.blockerId) : undefined,
                  question: entry.question ? String(entry.question) : undefined,
                  answer: String(entry.answer || ''),
                }))
            : undefined,
        }))
    : undefined
  const correctiveActions = Array.isArray(raw.corrective_actions)
    ? raw.corrective_actions
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map((item) => ({
          type: String(item.type || 'requirements_checkpoint'),
          agent: item.agent ? String(item.agent) : undefined,
          status: item.status ? String(item.status) : undefined,
          summary: String(item.summary || ''),
          question: item.question ? String(item.question) : undefined,
          response: item.response == null ? null : String(item.response),
          requestedAt:
            item.requested_at == null && item.requestedAt == null ? null : String(item.requested_at || item.requestedAt),
          respondedAt:
            item.responded_at == null && item.respondedAt == null ? null : String(item.responded_at || item.respondedAt),
          resolvedBy:
            item.resolved_by == null && item.resolvedBy == null ? null : String(item.resolved_by || item.resolvedBy),
          answers: Array.isArray(item.answers)
            ? item.answers
                .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
                .map((entry) => ({
                  blockerId: entry.blocker_id ? String(entry.blocker_id) : entry.blockerId ? String(entry.blockerId) : undefined,
                  question: entry.question ? String(entry.question) : undefined,
                  answer: String(entry.answer || ''),
                }))
            : undefined,
        }))
        .filter((item) => item.summary.trim().length > 0)
    : undefined
  const agentImprovements = Array.isArray(raw.agent_improvements)
    ? raw.agent_improvements
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map((item) => ({
          agent: String(item.agent || 'unknown'),
          suggestion: String(item.suggestion || ''),
          timestamp: item.timestamp == null ? null : String(item.timestamp),
          source: item.source ? String(item.source) : undefined,
        }))
        .filter((item) => item.suggestion.trim().length > 0)
    : undefined
  const appProduction = raw.app_production && typeof raw.app_production === 'object'
    ? {
        status: String((raw.app_production as Record<string, unknown>).status || 'insufficient_evidence'),
        deliveryReadiness: String(
          (raw.app_production as Record<string, unknown>).delivery_readiness
          || (raw.app_production as Record<string, unknown>).deliveryReadiness
          || 'insufficient_evidence'
        ),
        appDir:
          (raw.app_production as Record<string, unknown>).app_dir
            ? String((raw.app_production as Record<string, unknown>).app_dir)
            : (raw.app_production as Record<string, unknown>).appDir
              ? String((raw.app_production as Record<string, unknown>).appDir)
              : undefined,
        reportArtifact:
          (raw.app_production as Record<string, unknown>).report_artifact
            ? String((raw.app_production as Record<string, unknown>).report_artifact)
            : (raw.app_production as Record<string, unknown>).reportArtifact
              ? String((raw.app_production as Record<string, unknown>).reportArtifact)
              : undefined,
        summaryArtifact:
          (raw.app_production as Record<string, unknown>).summary_artifact
            ? String((raw.app_production as Record<string, unknown>).summary_artifact)
            : (raw.app_production as Record<string, unknown>).summaryArtifact
              ? String((raw.app_production as Record<string, unknown>).summaryArtifact)
              : undefined,
        passedCount: Number(
          (raw.app_production as Record<string, unknown>).passed_count
          || (raw.app_production as Record<string, unknown>).passedCount
          || 0
        ),
        failedCount: Number(
          (raw.app_production as Record<string, unknown>).failed_count
          || (raw.app_production as Record<string, unknown>).failedCount
          || 0
        ),
        skippedCount: Number(
          (raw.app_production as Record<string, unknown>).skipped_count
          || (raw.app_production as Record<string, unknown>).skippedCount
          || 0
        ),
        checks: Array.isArray((raw.app_production as Record<string, unknown>).checks)
          ? ((raw.app_production as Record<string, unknown>).checks as unknown[])
              .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
              .map((item) => ({
                name: String(item.name || 'check'),
                status: String(item.status || 'unknown'),
                summary: item.summary ? String(item.summary) : undefined,
                command: item.command == null ? null : String(item.command),
                exitCode:
                  typeof item.exit_code === 'number'
                    ? item.exit_code
                    : typeof item.exitCode === 'number'
                      ? item.exitCode
                      : null,
                logArtifact:
                  item.log_artifact ? String(item.log_artifact) : item.logArtifact ? String(item.logArtifact) : null,
              }))
          : [],
      }
    : undefined
  const appProductionRepairs = raw.app_production_repairs && typeof raw.app_production_repairs === 'object'
    ? {
        status: String((raw.app_production_repairs as Record<string, unknown>).status || 'not_needed'),
        reportArtifact:
          (raw.app_production_repairs as Record<string, unknown>).report_artifact
            ? String((raw.app_production_repairs as Record<string, unknown>).report_artifact)
            : (raw.app_production_repairs as Record<string, unknown>).reportArtifact
              ? String((raw.app_production_repairs as Record<string, unknown>).reportArtifact)
              : undefined,
        summaryArtifact:
          (raw.app_production_repairs as Record<string, unknown>).summary_artifact
            ? String((raw.app_production_repairs as Record<string, unknown>).summary_artifact)
            : (raw.app_production_repairs as Record<string, unknown>).summaryArtifact
              ? String((raw.app_production_repairs as Record<string, unknown>).summaryArtifact)
              : undefined,
        executionStatus:
          (raw.app_production_repairs as Record<string, unknown>).execution_status
            ? String((raw.app_production_repairs as Record<string, unknown>).execution_status)
            : (raw.app_production_repairs as Record<string, unknown>).executionStatus
              ? String((raw.app_production_repairs as Record<string, unknown>).executionStatus)
              : undefined,
        executionReportArtifact:
          (raw.app_production_repairs as Record<string, unknown>).execution_report_artifact
            ? String((raw.app_production_repairs as Record<string, unknown>).execution_report_artifact)
            : (raw.app_production_repairs as Record<string, unknown>).executionReportArtifact
              ? String((raw.app_production_repairs as Record<string, unknown>).executionReportArtifact)
              : undefined,
        executionSummaryArtifact:
          (raw.app_production_repairs as Record<string, unknown>).execution_summary_artifact
            ? String((raw.app_production_repairs as Record<string, unknown>).execution_summary_artifact)
            : (raw.app_production_repairs as Record<string, unknown>).executionSummaryArtifact
              ? String((raw.app_production_repairs as Record<string, unknown>).executionSummaryArtifact)
              : undefined,
        items: Array.isArray((raw.app_production_repairs as Record<string, unknown>).items)
          ? ((raw.app_production_repairs as Record<string, unknown>).items as unknown[])
              .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
              .map((item) => ({
                id: String(item.id || `repair-${String(item.gate || 'gate')}`),
                gate: String(item.gate || 'gate'),
                agent: String(item.agent || 'Engineer'),
                priority: String(item.priority || 'medium'),
                summary: String(item.summary || ''),
                failureSummary:
                  item.failure_summary ? String(item.failure_summary) : item.failureSummary ? String(item.failureSummary) : undefined,
                command: item.command == null ? null : String(item.command),
                exitCode:
                  typeof item.exit_code === 'number'
                    ? item.exit_code
                    : typeof item.exitCode === 'number'
                      ? item.exitCode
                      : null,
                logArtifact:
                  item.log_artifact ? String(item.log_artifact) : item.logArtifact ? String(item.logArtifact) : null,
                blockedChecks: Array.isArray(item.blocked_checks)
                  ? item.blocked_checks.map((entry) => String(entry))
                  : Array.isArray(item.blockedChecks)
                    ? item.blockedChecks.map((entry) => String(entry))
                    : undefined,
                recommendedActions: Array.isArray(item.recommended_actions)
                  ? item.recommended_actions.map((entry) => String(entry))
                  : Array.isArray(item.recommendedActions)
                    ? item.recommendedActions.map((entry) => String(entry))
                    : undefined,
              }))
          : [],
        attempts: Array.isArray((raw.app_production_repairs as Record<string, unknown>).attempts)
          ? ((raw.app_production_repairs as Record<string, unknown>).attempts as unknown[])
              .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
              .map((item) => ({
                attempt: Number(item.attempt || 0),
                gate: String(item.gate || 'gate'),
                status: String(item.status || 'unknown'),
                summary: item.summary ? String(item.summary) : undefined,
                error: item.error ? String(item.error) : undefined,
                model: item.model == null ? null : String(item.model),
                startedAt:
                  item.started_at ? String(item.started_at) : item.startedAt ? String(item.startedAt) : null,
                completedAt:
                  item.completed_at ? String(item.completed_at) : item.completedAt ? String(item.completedAt) : null,
                filesWritten: Array.isArray(item.files_written)
                  ? item.files_written.map((entry) => String(entry))
                  : Array.isArray(item.filesWritten)
                    ? item.filesWritten.map((entry) => String(entry))
                    : undefined,
                notes: Array.isArray(item.notes) ? item.notes.map((entry) => String(entry)) : undefined,
                verificationStatus:
                  item.verification_status
                    ? String(item.verification_status)
                    : item.verificationStatus
                      ? String(item.verificationStatus)
                      : undefined,
              }))
          : undefined,
      }
    : undefined
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
    id: String(raw.run_id || raw.runId || raw.id || ''),
    promptId: String(raw.prompt_id || raw.promptId || ''),
    goal: raw.goal ? String(raw.goal) : undefined,
    agents: Array.isArray(raw.agents) ? raw.agents.map(String) : [],
    status: String(raw.status || 'unknown'),
    rawStatus: raw.raw_status ? String(raw.raw_status) : raw.rawStatus ? String(raw.rawStatus) : undefined,
    heartbeatStale: Boolean(raw.heartbeat_stale ?? raw.heartbeatStale),
    lastHeartbeatAt: raw.last_heartbeat_at ? String(raw.last_heartbeat_at) : raw.lastHeartbeatAt ? String(raw.lastHeartbeatAt) : undefined,
    lastEventAt: raw.last_event_at ? String(raw.last_event_at) : raw.lastEventAt ? String(raw.lastEventAt) : undefined,
    currentAgent: raw.current_agent ? String(raw.current_agent) : raw.currentAgent ? String(raw.currentAgent) : undefined,
    currentStage: raw.current_stage ? String(raw.current_stage) : raw.currentStage ? String(raw.currentStage) : undefined,
    lease: (raw.lease as OrchestrationRun['lease']) ?? undefined,
    mode: raw.mode as 'executed' | 'simulated' | undefined,
    runMode: (raw.run_mode || raw.runMode || 'default') as 'default' | 'codex-swarm' | 'multi-agent',
    jobType: raw.job_type ? String(raw.job_type) : raw.jobType ? String(raw.jobType) : undefined,
    appType: raw.app_type ? String(raw.app_type) : raw.appType ? String(raw.appType) : undefined,
    requestedAt: raw.requested_at ? String(raw.requested_at) : raw.requestedAt ? String(raw.requestedAt) : undefined,
    startedAt: raw.started_at ? String(raw.started_at) : raw.startedAt ? String(raw.startedAt) : undefined,
    completedAt: raw.completed_at ? String(raw.completed_at) : raw.completedAt ? String(raw.completedAt) : undefined,
    events,
    model: raw.model ? String(raw.model) : undefined,
    version: raw.version ? String(raw.version) : undefined,
    reviewPolicy: raw.review_policy ? String(raw.review_policy) : raw.reviewPolicy ? String(raw.reviewPolicy) : undefined,
    datasetId: raw.dataset_id ? String(raw.dataset_id) : raw.datasetId ? String(raw.datasetId) : undefined,
    datasetName: raw.dataset_name ? String(raw.dataset_name) : raw.datasetName ? String(raw.datasetName) : undefined,
    notes: raw.notes ? String(raw.notes) : undefined,
    output: raw.output ? String(raw.output) : undefined,
    runDir: raw.run_dir ? String(raw.run_dir) : raw.runDir ? String(raw.runDir) : undefined,
    errorDetail: raw.error_detail ? String(raw.error_detail) : raw.errorDetail ? String(raw.errorDetail) : undefined,
    tokens: raw.tokens as OrchestrationRun['tokens'],
    acceptanceChecks: Array.isArray(raw.acceptance_checks)
      ? (raw.acceptance_checks as string[])
      : Array.isArray(raw.acceptanceChecks)
        ? (raw.acceptanceChecks as string[])
        : undefined,
    verificationStatus: raw.verification_status
      ? String(raw.verification_status) as OrchestrationRun['verificationStatus']
      : raw.verificationStatus
        ? String(raw.verificationStatus) as OrchestrationRun['verificationStatus']
        : undefined,
    loopIteration:
      typeof raw.loop_iteration === 'number'
        ? raw.loop_iteration
        : typeof raw.loopIteration === 'number'
          ? raw.loopIteration
          : undefined,
    sandboxReport,
    requirementsRequest,
    checkpoints,
    correctiveActions,
    agentImprovements,
    generatedAppFiles: Array.isArray(raw.generated_app_files) ? raw.generated_app_files.map(String) : undefined,
    appProduction,
    appProductionRepairs,
    arena: normalizeArena(raw.arena),
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
    throw new OrchestratorApiHttpError(`Failed to fetch repo runs (${res.status}): ${text}`, res.status)
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
