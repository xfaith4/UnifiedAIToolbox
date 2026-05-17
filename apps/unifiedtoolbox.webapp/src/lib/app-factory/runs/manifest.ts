import 'server-only'
import path from 'path'
import { promises as fs } from 'fs'
import { getRunsRoot, isValidRunId } from './runStatus'
import {
  CANONICAL_EVENTS_FILENAME,
  readEvents,
  type CanonicalEvent,
  type CanonicalEventType,
} from './canonicalEvents'
import {
  ARTIFACTS_INDEX_FILENAME,
  listArtifactIndex,
  type ArtifactIndexEntry,
} from './artifactIndex'
import {
  FINAL_SUMMARY_FILENAME,
  readFinalSummary,
  type BlockerSeverity,
  type FinalRunSummary,
} from './finalSummary'

/**
 * Canonical run status enum. This must stay in sync with
 * `docs/contracts/RUN_LIFECYCLE.md` (owned by Agent 1).
 */
export const CANONICAL_RUN_STATUSES = [
  'queued',
  'running',
  'waiting_on_input',
  'recovering',
  'blocked',
  'validating',
  'completed',
  'failed',
] as const

export type CanonicalRunStatus = (typeof CANONICAL_RUN_STATUSES)[number]

const TERMINAL_STATUSES: ReadonlySet<CanonicalRunStatus> = new Set(['completed', 'failed'])

export function isTerminalStatus(status: CanonicalRunStatus): boolean {
  return TERMINAL_STATUSES.has(status)
}

export type AgentLifecycleStatus =
  | 'pending'
  | 'running'
  | 'blocked'
  | 'completed'
  | 'failed'

export interface ManifestAgent {
  name: string
  role?: string
  status: AgentLifecycleStatus
  lastEventAt?: string
}

export interface ManifestBlocker {
  id?: string
  severity: BlockerSeverity
  summary: string
  agent?: string
}

export interface ManifestValidationSnapshot {
  status: 'not_started' | 'in_progress' | 'passed' | 'failed' | 'partial'
  passed?: number
  failed?: number
  deferred?: number
}

export interface ManifestPaths {
  /** Relative path to the events JSONL file (canonical). */
  events_jsonl: string
  /** Relative path to the artifacts index. */
  artifacts_index: string
  /** Relative path to the directory containing per-agent / per-step logs. */
  logs_dir: string
  /** Relative path to the final summary, when present. */
  final_summary?: string
}

/**
 * Canonical view of a run, derived from the on-disk JSONL files. This is the
 * shape Agent 2 (UI) consumes. Fields are additive; we never remove fields.
 */
export interface RunManifest {
  schema_version: 1
  run_id: string
  objective: string
  created_at: string
  updated_at: string
  status: CanonicalRunStatus
  active_agent: string | null
  agents: ManifestAgent[]
  event_count: number
  artifact_count: number
  blockers: ManifestBlocker[]
  validation: ManifestValidationSnapshot
  final_summary: FinalRunSummary | null
  paths: ManifestPaths
}

export interface BuildRunManifestOptions {
  rootDir?: string
  /** Override the objective when it cannot be derived from disk. */
  objective?: string
  /** Override the run id-level status (e.g. when the orchestrator is the source of truth). */
  status?: CanonicalRunStatus
}

function ensureWithin(root: string, candidate: string): string {
  const full = path.resolve(root, candidate)
  const r = path.resolve(root)
  if (!full.startsWith(r + path.sep) && full !== r) {
    throw new Error('path escaped root')
  }
  return full
}

async function readJsonIfExists<T>(p: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(p, 'utf8')
    return JSON.parse(raw) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    return null
  }
}

/**
 * Pure derivation from an event stream → manifest fields. Exported so tests
 * and the SSE route handler can share the same logic.
 */
export function deriveManifestFromEvents(
  events: CanonicalEvent[],
  artifacts: ArtifactIndexEntry[],
  finalSummary: FinalRunSummary | null,
  overrides: { status?: CanonicalRunStatus; objective?: string } = {}
): Pick<
  RunManifest,
  | 'status'
  | 'active_agent'
  | 'agents'
  | 'event_count'
  | 'artifact_count'
  | 'blockers'
  | 'validation'
  | 'updated_at'
  | 'created_at'
  | 'final_summary'
  | 'objective'
> {
  const agentMap = new Map<string, ManifestAgent>()
  let activeAgent: string | null = null
  let createdAt: string | null = null
  let updatedAt: string | null = null
  let validation: ManifestValidationSnapshot = { status: 'not_started' }
  const blockers: ManifestBlocker[] = []
  let derivedStatus: CanonicalRunStatus = 'queued'

  for (const event of events) {
    if (!createdAt) createdAt = event.timestamp
    updatedAt = event.timestamp

    const type = event.event_type as CanonicalEventType
    const agentName = event.agent_name ?? event.agent_id

    if (agentName) {
      const existing = agentMap.get(agentName)
      const base: ManifestAgent =
        existing ?? { name: agentName, status: 'pending', lastEventAt: event.timestamp }
      base.lastEventAt = event.timestamp
      switch (type) {
        case 'agent_started':
          base.status = 'running'
          activeAgent = agentName
          break
        case 'agent_progress':
          if (base.status === 'pending') base.status = 'running'
          activeAgent = agentName
          break
        case 'agent_blocked':
          base.status = 'blocked'
          break
        case 'agent_completed':
          base.status = 'completed'
          if (activeAgent === agentName) activeAgent = null
          break
      }
      agentMap.set(agentName, base)
    }

    switch (type) {
      case 'run_created':
        derivedStatus = 'queued'
        break
      case 'run_queued':
        derivedStatus = 'queued'
        break
      case 'run_started':
        derivedStatus = 'running'
        break
      case 'agent_started':
      case 'agent_progress':
        if (!isTerminalStatus(derivedStatus) && derivedStatus !== 'validating') {
          derivedStatus = 'running'
        }
        break
      case 'agent_blocked':
        derivedStatus = 'blocked'
        if (event.data && typeof event.data === 'object') {
          const severityRaw = String((event.data as Record<string, unknown>).severity ?? 'hard_blocker')
          const severity: BlockerSeverity =
            severityRaw === 'soft_blocker' ||
            severityRaw === 'clarification_needed' ||
            severityRaw === 'non_blocking_gap'
              ? severityRaw
              : 'hard_blocker'
          blockers.push({
            id: event.event_id,
            severity,
            summary: event.message,
            agent: agentName,
          })
        }
        break
      case 'validation_started':
        derivedStatus = 'validating'
        validation = { ...validation, status: 'in_progress' }
        break
      case 'validation_completed': {
        const data = (event.data as Record<string, unknown> | undefined) ?? {}
        const failed = Number(data.failed ?? 0)
        const passed = Number(data.passed ?? 0)
        const deferred = Number(data.deferred ?? 0)
        validation = {
          status: failed > 0 ? 'failed' : passed > 0 ? 'passed' : 'partial',
          passed,
          failed,
          deferred,
        }
        break
      }
      case 'run_completed':
        derivedStatus = 'completed'
        activeAgent = null
        break
      case 'run_failed':
        derivedStatus = 'failed'
        activeAgent = null
        break
      case 'run_recovered':
        derivedStatus = 'recovering'
        break
    }
  }

  // Final summary, if present, is the authoritative source of terminal state
  // and blockers. Don't *downgrade* status from terminal back to running.
  let finalStatus = overrides.status ?? derivedStatus
  if (finalSummary) {
    if (finalSummary.outcome === 'completed' || finalSummary.outcome === 'completed_with_warnings') {
      finalStatus = 'completed'
    } else if (finalSummary.outcome === 'failed') {
      finalStatus = 'failed'
    }
    for (const b of finalSummary.blockers) {
      blockers.push({ id: b.id, severity: b.severity, summary: b.summary, agent: b.agent })
    }
  }

  const nowIso = new Date().toISOString()
  return {
    status: finalStatus,
    active_agent: isTerminalStatus(finalStatus) ? null : activeAgent,
    agents: [...agentMap.values()],
    event_count: events.length,
    artifact_count: artifacts.length,
    blockers,
    validation,
    created_at: createdAt ?? nowIso,
    updated_at: updatedAt ?? createdAt ?? nowIso,
    final_summary: finalSummary,
    objective: overrides.objective ?? '',
  }
}

/**
 * Build a {@link RunManifest} for a run by reading the canonical files on
 * disk. Returns `null` when the run directory does not exist.
 */
export async function buildRunManifest(
  runId: string,
  options: BuildRunManifestOptions = {}
): Promise<RunManifest | null> {
  if (!isValidRunId(runId)) return null
  const rootDir = options.rootDir ?? getRunsRoot()
  const runDir = ensureWithin(rootDir, runId)
  try {
    const stat = await fs.stat(runDir)
    if (!stat.isDirectory()) return null
  } catch {
    return null
  }

  const [events, artifacts, finalSummary, requestJson] = await Promise.all([
    readEvents(runId, { rootDir }),
    listArtifactIndex(runId, { rootDir }),
    readFinalSummary(runId, { rootDir }),
    readJsonIfExists<Record<string, unknown>>(path.join(runDir, 'request.json')),
  ])

  let objective = options.objective ?? ''
  if (!objective && requestJson) {
    objective = String(
      requestJson.objective ??
        requestJson.goal ??
        requestJson.prompt ??
        requestJson.title ??
        ''
    )
  }

  const derived = deriveManifestFromEvents(events, artifacts, finalSummary, {
    status: options.status,
    objective,
  })

  const manifest: RunManifest = {
    schema_version: 1,
    run_id: runId,
    objective: derived.objective,
    created_at: derived.created_at,
    updated_at: derived.updated_at,
    status: derived.status,
    active_agent: derived.active_agent,
    agents: derived.agents,
    event_count: derived.event_count,
    artifact_count: derived.artifact_count,
    blockers: derived.blockers,
    validation: derived.validation,
    final_summary: derived.final_summary,
    paths: {
      events_jsonl: CANONICAL_EVENTS_FILENAME,
      artifacts_index: ARTIFACTS_INDEX_FILENAME,
      logs_dir: 'logs',
      final_summary: finalSummary ? FINAL_SUMMARY_FILENAME : undefined,
    },
  }
  return manifest
}
