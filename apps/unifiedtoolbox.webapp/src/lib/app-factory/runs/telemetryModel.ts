import type { RunArtifact, RunEvent, RunStage, RunStatusResponse } from './types'

export type TimelinePhaseId =
  | 'research'
  | 'implementation'
  | 'validation'
  | 'synthesis'
  | 'decision'
  | 'quality'
  | 'memory'
  | 'export'

export type AgentBoardGroupId = 'research' | 'build' | 'review' | 'synthesis' | 'meta' | 'other'
export type TelemetryAgentStatus = 'queued' | 'running' | 'waiting' | 'done' | 'failed' | 'skipped'
export type TelemetryPhaseStatus = 'pending' | 'running' | 'pass' | 'fail'
export type TelemetryGateStatus = 'pending' | 'running' | 'pass' | 'fail'
export type ArtifactLifecycleStatus = 'in_progress' | 'produced'

export type TelemetryEventType =
  | 'run_started'
  | 'run_completed'
  | 'run_failed'
  | 'phase_started'
  | 'phase_completed'
  | 'phase_failed'
  | 'agent_started'
  | 'agent_completed'
  | 'agent_failed'
  | 'agent_waiting'
  | 'artifact_created'
  | 'artifact_updated'
  | 'gate_started'
  | 'gate_result'
  | 'contract_invalid'
  | 'contract_repair_attempted'
  | 'contract_repair_failed'
  | 'log'

export type TelemetryEventSeverity = 'info' | 'warn' | 'error'

export type NormalizedTelemetryEvent = {
  id: string
  ts: string
  type: TelemetryEventType
  severity: TelemetryEventSeverity
  rawType?: string
  message: string
  phaseId?: TimelinePhaseId
  agentId?: string
  gateId?: string
  artifactPath?: string
  data?: Record<string, unknown>
}

export type AgentRepairState = {
  attempted: boolean
  count: number
  max: number
  failed: boolean
  failureArtifactPath?: string
  lastError?: string
}

export type AgentTelemetryState = {
  id: string
  displayName: string
  group: AgentBoardGroupId
  phaseId: TimelinePhaseId
  status: TelemetryAgentStatus
  currentActivity?: string
  startedAt?: string
  finishedAt?: string
  durationMs?: number
  artifactPaths: string[]
  repair?: AgentRepairState
  lastEventAt?: string
}

export type PhaseTelemetryState = {
  id: TimelinePhaseId
  label: string
  status: TelemetryPhaseStatus
  startedAt?: string
  finishedAt?: string
  durationMs?: number
  completeCount: number
  totalCount: number
  blocked: boolean
  activeAgentId?: string
  lastMessage?: string
  agentIds: string[]
  artifactPaths: string[]
  gateIds: string[]
}

export type ArtifactTelemetryState = {
  path: string
  type?: string
  bytes?: number
  exists?: boolean
  mtime?: string
  createdAt?: string
  status: ArtifactLifecycleStatus
  phaseId?: TimelinePhaseId
  agentId?: string
}

export type GateTelemetryState = {
  id: string
  label: string
  status: TelemetryGateStatus
  phaseId: TimelinePhaseId
  startedAt?: string
  finishedAt?: string
  lastMessage?: string
  reportArtifactPath?: string
}

export type TimelineNodeState = {
  phaseId: TimelinePhaseId
  label: string
  status: TelemetryPhaseStatus
  activeText?: string
  activeAgentId?: string
  artifactCount: number
  gateCount: number
}

export type RunTelemetryState = {
  runId: string
  runStatus: RunStatusResponse['status']
  startedAt?: string
  updatedAt?: string
  endedAt?: string
  activePhaseId: TimelinePhaseId | null
  activeAgentId: string | null
  phases: Record<TimelinePhaseId, PhaseTelemetryState>
  phaseOrder: TimelinePhaseId[]
  agents: Record<string, AgentTelemetryState>
  agentOrder: string[]
  artifacts: ArtifactTelemetryState[]
  gates: Record<string, GateTelemetryState>
  gateOrder: string[]
  events: NormalizedTelemetryEvent[]
  timeline: TimelineNodeState[]
  narrative: string
  warnings: string[]
}

export type AgentBoardGroup = {
  id: AgentBoardGroupId
  label: string
  agents: AgentTelemetryState[]
}

export type PipelineStepState = {
  phaseId: TimelinePhaseId
  label: string
  status: TelemetryPhaseStatus
  completeCount: number
  totalCount: number
  blocked: boolean
  activeAgentId?: string
}

export type ArtifactsPanelState = {
  inProgress: ArtifactTelemetryState[]
  produced: ArtifactTelemetryState[]
  counts: {
    inProgress: number
    produced: number
    total: number
  }
}

export type TelemetryFilterOptions = {
  phaseId?: TimelinePhaseId
  agentId?: string
}

export type PhaseBoardCardState = PipelineStepState & {
  isSelected: boolean
  isActive: boolean
  dimmed: boolean
  isKnown: boolean
}

export type TimelinePhaseEvents = {
  phaseId: TimelinePhaseId
  label: string
  status: TelemetryPhaseStatus
  events: NormalizedTelemetryEvent[]
}

export type AgentSignalSummary = {
  warningCount: number
  errorCount: number
  gateFailCount: number
}

export type RepairTarget = {
  agentId: string
  eventId?: string
  artifactPath?: string
  available: boolean
}

export type RunOperatorWarning = {
  id: 'no_telemetry' | 'phase_stalled' | 'queued_stalled'
  message: string
  minutes: number
}

export const RUN_VIEW_WARNING_THRESHOLD_MINUTES = 5
export const RUN_VIEW_WARNING_THRESHOLD_MS = RUN_VIEW_WARNING_THRESHOLD_MINUTES * 60 * 1000

const PHASE_LABELS: Record<TimelinePhaseId, string> = {
  research: 'Research',
  implementation: 'Implementation',
  validation: 'Validation',
  synthesis: 'Synthesis',
  decision: 'Decision',
  quality: 'Quality',
  memory: 'Memory',
  export: 'Export',
}

const PHASE_ORDER: TimelinePhaseId[] = [
  'research',
  'implementation',
  'validation',
  'synthesis',
  'decision',
  'quality',
  'memory',
  'export',
]

const GROUP_LABELS: Record<AgentBoardGroupId, string> = {
  research: 'Research',
  build: 'Build',
  review: 'Review',
  synthesis: 'Synthesis',
  meta: 'Meta',
  other: 'Other',
}

const GROUP_ORDER: AgentBoardGroupId[] = ['research', 'build', 'review', 'synthesis', 'meta', 'other']

function safeIso(value: string | undefined): string | undefined {
  if (!value) return undefined
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

function epoch(value: string | undefined): number | null {
  if (!value) return null
  const d = new Date(value)
  const t = d.getTime()
  if (Number.isNaN(t)) return null
  return t
}

function durationMs(startedAt: string | undefined, endedAt: string | undefined): number | undefined {
  const start = epoch(startedAt)
  if (start == null) return undefined
  const end = epoch(endedAt) ?? Date.now()
  if (end < start) return undefined
  return end - start
}

function sanitizeAgentId(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.replace(/\s+/g, '_')
}

function toDisplayName(agentId: string): string {
  return agentId.replace(/_/g, ' ')
}

function inferPhaseId(value: string | undefined): TimelinePhaseId {
  const v = String(value || '').toLowerCase()
  if (!v) return 'research'
  if (v.includes('research') || v.includes('context')) return 'research'
  if (v.includes('engineer') || v.includes('implement') || v.includes('build')) return 'implementation'
  if (v.includes('critic') || v.includes('validat') || v.includes('review') || v.includes('gate')) return 'validation'
  if (v.includes('synth')) return 'synthesis'
  if (v.includes('decision') || v.includes('commissioner') || v.includes('lock')) return 'decision'
  if (v.includes('quality') || v.includes('supervisor')) return 'quality'
  if (v.includes('historian') || v.includes('memory')) return 'memory'
  if (v.includes('publish') || v.includes('export') || v.includes('pr')) return 'export'
  return 'implementation'
}

function inferGroup(agentId: string): AgentBoardGroupId {
  const v = agentId.toLowerCase()
  if (v.includes('research')) return 'research'
  if (v.includes('engineer') || v.includes('builder') || v.includes('developer')) return 'build'
  if (v.includes('critic') || v.includes('commissioner') || v.includes('supervisor') || v.includes('review') || v.includes('gate')) return 'review'
  if (v.includes('synth')) return 'synthesis'
  if (v.includes('historian') || v.includes('memory')) return 'meta'
  return 'other'
}

function normalizeFilters(
  phaseOrFilters?: TimelinePhaseId | TelemetryFilterOptions,
  agentFilterId?: string,
): TelemetryFilterOptions {
  if (typeof phaseOrFilters === 'string') {
    return {
      phaseId: phaseOrFilters,
      agentId: agentFilterId,
    }
  }
  return {
    phaseId: phaseOrFilters?.phaseId,
    agentId: agentFilterId ?? phaseOrFilters?.agentId,
  }
}

function resolvePhaseFilter(state: RunTelemetryState, filters: TelemetryFilterOptions): TimelinePhaseId | undefined {
  if (filters.phaseId) return filters.phaseId
  if (filters.agentId && state.agents[filters.agentId]) {
    return state.agents[filters.agentId].phaseId
  }
  return undefined
}

function eventPhaseForFilter(state: RunTelemetryState, event: NormalizedTelemetryEvent): TimelinePhaseId | undefined {
  if (event.phaseId) return event.phaseId
  if (event.agentId && state.agents[event.agentId]) {
    return state.agents[event.agentId].phaseId
  }
  return undefined
}

function inferKnownPhase(phase: PhaseTelemetryState): boolean {
  return Boolean(
    phase.agentIds.length ||
    phase.artifactPaths.length ||
    phase.gateIds.length ||
    phase.startedAt ||
    phase.finishedAt ||
    phase.status !== 'pending',
  )
}

function resolvePhaseForEvent(state: RunTelemetryState, event: NormalizedTelemetryEvent): TimelinePhaseId | undefined {
  return event.phaseId || (event.agentId ? state.agents[event.agentId]?.phaseId : undefined)
}

function mapStageStatusToAgentStatus(status: string | undefined): TelemetryAgentStatus {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'running') return 'running'
  if (normalized === 'failed' || normalized === 'error') return 'failed'
  if (normalized === 'skipped') return 'skipped'
  if (normalized === 'succeeded' || normalized === 'success' || normalized === 'completed' || normalized === 'done' || normalized === 'passed') {
    return 'done'
  }
  return 'queued'
}

function gateStatusFromAgentStatus(status: TelemetryAgentStatus): TelemetryGateStatus {
  if (status === 'failed') return 'fail'
  if (status === 'running' || status === 'waiting') return 'running'
  if (status === 'done' || status === 'skipped') return 'pass'
  return 'pending'
}

function extractAgentFromMessage(message: string): string | undefined {
  const match = message.match(/Agent:\s*([A-Za-z0-9_ -]+)/i)
  if (!match) return undefined
  return sanitizeAgentId(match[1])
}

function extractPhaseFromMessage(message: string): TimelinePhaseId | undefined {
  const match = message.match(/milestone:\s*([^\n]+)/i)
  if (!match) return undefined
  return inferPhaseId(match[1])
}

function extractArtifactPath(message: string): string | undefined {
  const writeMatch = message.match(/Artifact written:\s*([^\n]+)$/i)
  if (writeMatch) return writeMatch[1].trim().replace(/^['"]|['"]$/g, '')
  const saveMatch = message.match(/saved .*?:\s*([^\n]+\.(?:json|md|txt|log|yaml|yml|patch|diff))/i)
  if (saveMatch) return saveMatch[1].trim().replace(/^['"]|['"]$/g, '')
  return undefined
}

function parseRepairHint(message: string): { count: number; max: number } | undefined {
  const match = message.match(/repair\s*(\d+)\s*\/\s*(\d+)/i)
  if (!match) return undefined
  return {
    count: Number(match[1]),
    max: Number(match[2]),
  }
}

function parseGateStatus(message: string): TelemetryGateStatus | undefined {
  const lowered = message.toLowerCase()
  if (lowered.includes('failed') || lowered.includes('blocked')) return 'fail'
  if (lowered.includes('pass') || lowered.includes('succeeded')) return 'pass'
  if (lowered.includes('running') || lowered.includes('in progress')) return 'running'
  return undefined
}

function severityFromType(rawType: string, message: string): TelemetryEventSeverity {
  const type = rawType.toLowerCase()
  const text = message.toLowerCase()
  if (type.includes('error') || type.includes('fail') || text.includes('failed') || text.includes('error')) return 'error'
  if (type.includes('warn') || text.includes('warn') || text.includes('blocked')) return 'warn'
  return 'info'
}

export function normalizeRunEvent(event: RunEvent, index: number): NormalizedTelemetryEvent {
  const message = String(event.message || '').trim()
  const rawType = String(event.type || 'info').toLowerCase()
  const stageId = sanitizeAgentId(event.stage)
  const messageAgentId = extractAgentFromMessage(message)
  const agentId = stageId || messageAgentId
  const artifactPath = extractArtifactPath(message)
  const phaseId = inferPhaseId(event.stage || message)
  const severity = severityFromType(rawType, message)

  let type: TelemetryEventType = 'log'

  if (rawType === 'stage_start') type = 'agent_started'
  else if (rawType === 'stage_end') {
    const lowered = message.toLowerCase()
    if (lowered.includes('failed')) type = 'agent_failed'
    else if (lowered.includes('skipped')) type = 'agent_waiting'
    else type = 'agent_completed'
  } else if (rawType === 'artifact_written') {
    type = 'artifact_created'
  } else if (rawType === 'run_started' || message.toLowerCase().includes('run started')) {
    type = 'run_started'
  } else if (rawType === 'run_completed' || message.toLowerCase().includes('run completed')) {
    type = 'run_completed'
  } else if (rawType === 'run_failed' || message.toLowerCase().includes('run failed') || message.toLowerCase().includes('orchestration failed')) {
    type = 'run_failed'
  } else if (rawType === 'phase_started') {
    type = 'phase_started'
  } else if (rawType === 'phase_completed') {
    type = 'phase_completed'
  } else if (rawType === 'phase_failed') {
    type = 'phase_failed'
  } else if (rawType === 'agent_started') {
    type = 'agent_started'
  } else if (rawType === 'agent_completed') {
    type = 'agent_completed'
  } else if (rawType === 'agent_failed') {
    type = 'agent_failed'
  } else if (rawType === 'agent_waiting') {
    type = 'agent_waiting'
  } else if (rawType === 'gate_started') {
    type = 'gate_started'
  } else if (rawType === 'gate_result') {
    type = 'gate_result'
  } else if (rawType === 'contract_invalid' || message.toLowerCase().includes('contract invalid')) {
    type = 'contract_invalid'
  } else if (rawType === 'contract_repair_attempted' || message.toLowerCase().includes('contract repair')) {
    type = 'contract_repair_attempted'
  } else if (rawType === 'contract_repair_failed' || message.toLowerCase().includes('contract repair failed')) {
    type = 'contract_repair_failed'
  }

  let gateId: string | undefined
  if (stageId && stageId.toLowerCase().includes('gate')) {
    gateId = stageId
  } else if (rawType.startsWith('gate_')) {
    gateId = sanitizeAgentId(String(event.data?.gate_id || event.data?.id || 'gate'))
  }

  const normalized: NormalizedTelemetryEvent = {
    id: `${event.ts || 'event'}-${index}`,
    ts: safeIso(event.ts) || new Date().toISOString(),
    type,
    severity,
    rawType,
    message,
    phaseId,
    agentId,
    gateId,
    artifactPath,
    data: event.data,
  }

  const messagePhase = extractPhaseFromMessage(message)
  if (messagePhase) normalized.phaseId = messagePhase

  return normalized
}

function buildInitialPhase(phaseId: TimelinePhaseId): PhaseTelemetryState {
  return {
    id: phaseId,
    label: PHASE_LABELS[phaseId],
    status: 'pending',
    completeCount: 0,
    totalCount: 0,
    blocked: false,
    agentIds: [],
    artifactPaths: [],
    gateIds: [],
  }
}

function emptyState(run: RunStatusResponse | null): RunTelemetryState {
  const phases = PHASE_ORDER.reduce<Record<TimelinePhaseId, PhaseTelemetryState>>((acc, phaseId) => {
    acc[phaseId] = buildInitialPhase(phaseId)
    return acc
  }, {} as Record<TimelinePhaseId, PhaseTelemetryState>)

  return {
    runId: run?.runId || 'unknown',
    runStatus: run?.status || 'queued',
    startedAt: safeIso(run?.startedAt),
    updatedAt: safeIso(run?.updatedAt),
    endedAt: safeIso(run?.endedAt),
    activePhaseId: null,
    activeAgentId: null,
    phases,
    phaseOrder: [...PHASE_ORDER],
    agents: {},
    agentOrder: [],
    artifacts: [],
    gates: {},
    gateOrder: [],
    events: [],
    timeline: [],
    narrative: 'No telemetry yet',
    warnings: [],
  }
}

function ensureAgent(state: RunTelemetryState, agentId: string, phaseId: TimelinePhaseId): AgentTelemetryState {
  const existing = state.agents[agentId]
  if (existing) {
    if (existing.phaseId !== phaseId) {
      existing.phaseId = phaseId
    }
    return existing
  }

  const agent: AgentTelemetryState = {
    id: agentId,
    displayName: toDisplayName(agentId),
    group: inferGroup(agentId),
    phaseId,
    status: 'queued',
    artifactPaths: [],
  }

  state.agents[agentId] = agent
  state.agentOrder.push(agentId)

  const phase = state.phases[phaseId]
  if (!phase.agentIds.includes(agentId)) {
    phase.agentIds.push(agentId)
  }

  return agent
}

function ensureGate(state: RunTelemetryState, gateId: string, phaseId: TimelinePhaseId): GateTelemetryState {
  const existing = state.gates[gateId]
  if (existing) {
    if (existing.phaseId !== phaseId) existing.phaseId = phaseId
    return existing
  }

  const gate: GateTelemetryState = {
    id: gateId,
    label: toDisplayName(gateId),
    phaseId,
    status: 'pending',
  }

  state.gates[gateId] = gate
  state.gateOrder.push(gateId)

  const phase = state.phases[phaseId]
  if (!phase.gateIds.includes(gateId)) {
    phase.gateIds.push(gateId)
  }

  return gate
}

function addArtifact(state: RunTelemetryState, artifact: ArtifactTelemetryState): ArtifactTelemetryState {
  const existing = state.artifacts.find((candidate) => candidate.path === artifact.path)
  if (existing) {
    existing.type = artifact.type ?? existing.type
    existing.bytes = artifact.bytes ?? existing.bytes
    existing.exists = artifact.exists ?? existing.exists
    existing.mtime = artifact.mtime ?? existing.mtime
    existing.createdAt = artifact.createdAt ?? existing.createdAt
    existing.status = artifact.status
    existing.phaseId = artifact.phaseId ?? existing.phaseId
    existing.agentId = artifact.agentId ?? existing.agentId
    return existing
  }

  state.artifacts.push(artifact)
  if (artifact.phaseId) {
    const phase = state.phases[artifact.phaseId]
    if (!phase.artifactPaths.includes(artifact.path)) {
      phase.artifactPaths.push(artifact.path)
    }
  }
  if (artifact.agentId && state.agents[artifact.agentId] && !state.agents[artifact.agentId].artifactPaths.includes(artifact.path)) {
    state.agents[artifact.agentId].artifactPaths.push(artifact.path)
  }
  return artifact
}

function applyStageSnapshot(state: RunTelemetryState, stage: RunStage): void {
  const agentId = sanitizeAgentId(stage.id || stage.name)
  if (!agentId) return

  const phaseId = inferPhaseId(stage.name || stage.id)
  const agent = ensureAgent(state, agentId, phaseId)
  agent.displayName = stage.name || agent.displayName
  agent.startedAt = safeIso(stage.startedAt) || agent.startedAt
  agent.finishedAt = safeIso(stage.finishedAt) || agent.finishedAt
  agent.durationMs = durationMs(agent.startedAt, agent.finishedAt)

  const mappedStatus = mapStageStatusToAgentStatus(stage.status)
  agent.status = mappedStatus

  if (mappedStatus === 'running') {
    state.activeAgentId = agentId
    state.activePhaseId = phaseId
  }

  const phase = state.phases[phaseId]
  if (agent.startedAt && !phase.startedAt) phase.startedAt = agent.startedAt
  if (mappedStatus === 'running') {
    phase.status = 'running'
    phase.activeAgentId = agentId
  }
  if (mappedStatus === 'failed') phase.status = 'fail'

  if (agentId.toLowerCase().includes('gate')) {
    const gate = ensureGate(state, agentId, phaseId)
    gate.status = gateStatusFromAgentStatus(mappedStatus)
    gate.startedAt = agent.startedAt ?? gate.startedAt
    gate.finishedAt = agent.finishedAt ?? gate.finishedAt
  }
}

function applyEvent(state: RunTelemetryState, event: NormalizedTelemetryEvent): void {
  state.events.push(event)

  if (event.type === 'run_started' && !state.startedAt) {
    state.startedAt = event.ts
  }
  if (event.type === 'run_completed') {
    state.endedAt = state.endedAt || event.ts
  }
  if (event.type === 'run_failed') {
    state.endedAt = state.endedAt || event.ts
    state.warnings.push(event.message)
  }

  const phaseId = event.phaseId || state.activePhaseId || 'research'
  const phase = state.phases[phaseId]

  if (event.type === 'phase_started') {
    phase.status = 'running'
    phase.startedAt = phase.startedAt || event.ts
    state.activePhaseId = phaseId
  }

  if (event.type === 'phase_completed') {
    phase.status = 'pass'
    phase.finishedAt = phase.finishedAt || event.ts
  }

  if (event.type === 'phase_failed') {
    phase.status = 'fail'
    phase.finishedAt = phase.finishedAt || event.ts
    state.activePhaseId = phaseId
  }

  if (event.type === 'agent_started' || event.type === 'agent_completed' || event.type === 'agent_failed' || event.type === 'agent_waiting') {
    const agentId = event.agentId
    if (agentId) {
      const agent = ensureAgent(state, agentId, phaseId)
      agent.currentActivity = event.message || agent.currentActivity
      agent.lastEventAt = event.ts
      if (event.type === 'agent_started') {
        agent.status = 'running'
        agent.startedAt = agent.startedAt || event.ts
        phase.status = 'running'
        phase.startedAt = phase.startedAt || event.ts
        phase.activeAgentId = agentId
        state.activeAgentId = agentId
        state.activePhaseId = phaseId
      } else if (event.type === 'agent_completed') {
        agent.status = 'done'
        agent.finishedAt = agent.finishedAt || event.ts
      } else if (event.type === 'agent_failed') {
        agent.status = 'failed'
        agent.finishedAt = agent.finishedAt || event.ts
        phase.status = 'fail'
        phase.finishedAt = phase.finishedAt || event.ts
        state.activeAgentId = agentId
        state.activePhaseId = phaseId
      } else if (event.type === 'agent_waiting') {
        agent.status = 'waiting'
      }
      agent.durationMs = durationMs(agent.startedAt, agent.finishedAt)
    }
  }

  if (event.type === 'artifact_created' || event.type === 'artifact_updated') {
    const path = event.artifactPath || sanitizeAgentId(String(event.data?.path || '')) || undefined
    if (path) {
      addArtifact(state, {
        path,
        type: typeof event.data?.type === 'string' ? event.data.type : undefined,
        bytes: typeof event.data?.bytes === 'number' ? event.data.bytes : undefined,
        mtime: typeof event.data?.mtime === 'string' ? safeIso(event.data.mtime) : undefined,
        createdAt: event.ts,
        status: 'produced',
        phaseId,
        agentId: event.agentId,
      })
    }
  }

  if (event.type === 'gate_started' || event.type === 'gate_result' || event.gateId) {
    const gateId = event.gateId || 'Gate'
    const gate = ensureGate(state, gateId, phaseId)
    gate.lastMessage = event.message
    if (event.type === 'gate_started') {
      gate.status = 'running'
      gate.startedAt = gate.startedAt || event.ts
    }
    if (event.type === 'gate_result') {
      gate.status = parseGateStatus(event.message) || gate.status
      if (gate.status === 'pass' || gate.status === 'fail') {
        gate.finishedAt = gate.finishedAt || event.ts
      }
    }

    if (event.type === 'agent_started' || event.type === 'agent_failed' || event.type === 'agent_completed') {
      if (event.type === 'agent_started') gate.status = 'running'
      if (event.type === 'agent_failed') gate.status = 'fail'
      if (event.type === 'agent_completed') gate.status = 'pass'
    }
  }

  if (event.type === 'contract_invalid' || event.type === 'contract_repair_attempted' || event.type === 'contract_repair_failed') {
    const targetAgentId = event.agentId || state.activeAgentId || undefined
    if (targetAgentId) {
      const agent = ensureAgent(state, targetAgentId, phaseId)
      const repair = agent.repair || {
        attempted: false,
        count: 0,
        max: 1,
        failed: false,
      }

      if (event.type === 'contract_invalid') {
        repair.attempted = true
      }
      if (event.type === 'contract_repair_attempted') {
        repair.attempted = true
        const parsed = parseRepairHint(event.message)
        if (parsed) {
          repair.count = parsed.count
          repair.max = parsed.max
        } else {
          repair.count = Math.max(repair.count, 1)
        }
      }
      if (event.type === 'contract_repair_failed') {
        repair.attempted = true
        repair.failed = true
        repair.lastError = event.message
      }

      const failureArtifactFromEvent = typeof event.data?.artifactPath === 'string'
        ? event.data.artifactPath
        : typeof event.data?.failureArtifact === 'string'
          ? event.data.failureArtifact
          : undefined
      if (failureArtifactFromEvent) {
        repair.failureArtifactPath = failureArtifactFromEvent
      }
      agent.repair = repair
    }
  }

  phase.lastMessage = event.message || phase.lastMessage
  const existingUpdatedMs = epoch(state.updatedAt)
  const eventUpdatedMs = epoch(event.ts)
  if (eventUpdatedMs != null && (existingUpdatedMs == null || eventUpdatedMs > existingUpdatedMs)) {
    state.updatedAt = event.ts
  }
}

function mergeArtifactSnapshot(state: RunTelemetryState, artifact: RunArtifact, fallbackPhaseId: TimelinePhaseId | null, fallbackAgentId: string | null): void {
  const phaseId = fallbackPhaseId || inferPhaseId(artifact.path)
  addArtifact(state, {
    path: artifact.path,
    type: artifact.type,
    bytes: artifact.bytes,
    exists: artifact.exists,
    mtime: safeIso(artifact.mtime),
    status: artifact.exists === false ? 'in_progress' : 'produced',
    phaseId,
    agentId: fallbackAgentId || undefined,
  })
}

function finalize(state: RunTelemetryState): RunTelemetryState {
  for (const phaseId of state.phaseOrder) {
    const phase = state.phases[phaseId]
    let total = 0
    let complete = 0
    let running = false
    let failed = false

    for (const agentId of phase.agentIds) {
      const agent = state.agents[agentId]
      if (!agent) continue
      total += 1
      if (agent.status === 'running' || agent.status === 'waiting') running = true
      if (agent.status === 'failed') failed = true
      if (agent.status === 'done' || agent.status === 'skipped') complete += 1
      agent.durationMs = durationMs(agent.startedAt, agent.finishedAt)
    }

    phase.totalCount = total
    phase.completeCount = complete

    if (failed) {
      phase.status = 'fail'
    } else if (running) {
      phase.status = 'running'
    } else if (total > 0 && complete === total) {
      phase.status = 'pass'
      const lastAgentFinished = phase.agentIds
        .map((agentId) => state.agents[agentId]?.finishedAt)
        .find((value) => Boolean(value))
      phase.finishedAt = phase.finishedAt || lastAgentFinished
    }

    phase.durationMs = durationMs(phase.startedAt, phase.finishedAt)
    if (phase.status === 'running' && phase.activeAgentId) {
      state.activePhaseId = phaseId
      state.activeAgentId = phase.activeAgentId
    }
  }

  if (!state.activePhaseId && state.activeAgentId && state.agents[state.activeAgentId]) {
    state.activePhaseId = state.agents[state.activeAgentId].phaseId
  }

  if (!state.activePhaseId) {
    const runningPhase = state.phaseOrder.find((phaseId) => state.phases[phaseId].status === 'running')
    if (runningPhase) state.activePhaseId = runningPhase
  }

  if (!state.activePhaseId && state.runStatus === 'failed') {
    const failedPhase = state.phaseOrder.find((phaseId) => state.phases[phaseId].status === 'fail')
    state.activePhaseId = failedPhase || null
  }

  let blockedSeen = false
  for (const phaseId of state.phaseOrder) {
    const phase = state.phases[phaseId]
    phase.blocked = blockedSeen && phase.status === 'pending'
    if (phase.status === 'fail') blockedSeen = true
  }

  state.timeline = state.phaseOrder.map((phaseId) => {
    const phase = state.phases[phaseId]
    return {
      phaseId,
      label: phase.label,
      status: phase.status,
      activeText: state.activePhaseId === phaseId ? phase.lastMessage : undefined,
      activeAgentId: state.activePhaseId === phaseId ? phase.activeAgentId : undefined,
      artifactCount: phase.artifactPaths.length,
      gateCount: phase.gateIds.length,
    }
  })

  if (state.activeAgentId && state.agents[state.activeAgentId]) {
    const agent = state.agents[state.activeAgentId]
    state.narrative = `${agent.displayName}: ${agent.currentActivity || 'Working'}`
  } else if (state.activePhaseId) {
    const phase = state.phases[state.activePhaseId]
    if (phase.status === 'running') {
      state.narrative = `${phase.label}: in progress`
    } else if (phase.status === 'fail') {
      state.narrative = `${phase.label}: blocked`
    }
  } else if (state.runStatus === 'succeeded') {
    state.narrative = 'Run completed'
  } else if (state.runStatus === 'failed') {
    state.narrative = 'Run failed'
  }

  return state
}

export function buildRunTelemetryState(status: RunStatusResponse | null): RunTelemetryState {
  const state = emptyState(status)
  if (!status) return state

  if (Array.isArray(status.stages)) {
    for (const stage of status.stages) {
      applyStageSnapshot(state, stage)
    }
  }

  if (Array.isArray(status.events)) {
    status.events
      .map((event, index) => normalizeRunEvent(event, index))
      .forEach((event) => applyEvent(state, event))
  }

  const fallbackPhaseId = state.activePhaseId || (status.currentStage ? inferPhaseId(status.currentStage) : null)
  const fallbackAgentId = state.activeAgentId || sanitizeAgentId(status.currentStage) || null

  if (Array.isArray(status.artifacts)) {
    for (const artifact of status.artifacts) {
      mergeArtifactSnapshot(state, artifact, fallbackPhaseId, fallbackAgentId)
    }
  }

  return finalize(state)
}

export function selectAgentBoardGroups(
  state: RunTelemetryState,
  phaseOrFilters?: TimelinePhaseId | TelemetryFilterOptions,
  selectedAgentId?: string,
): AgentBoardGroup[] {
  const filters = normalizeFilters(phaseOrFilters, selectedAgentId)
  const phaseFilterId = resolvePhaseFilter(state, filters)

  const grouped = GROUP_ORDER.reduce<Record<AgentBoardGroupId, AgentTelemetryState[]>>((acc, id) => {
    acc[id] = []
    return acc
  }, {} as Record<AgentBoardGroupId, AgentTelemetryState[]>)

  for (const agentId of state.agentOrder) {
    const agent = state.agents[agentId]
    if (!agent) continue
    if (phaseFilterId && agent.phaseId !== phaseFilterId) continue
    if (filters.agentId && agent.id !== filters.agentId) continue
    grouped[agent.group].push(agent)
  }

  return GROUP_ORDER
    .map((id) => ({
      id,
      label: GROUP_LABELS[id],
      agents: grouped[id].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    }))
    .filter((group) => group.agents.length > 0)
}

export function selectPhaseBoardCards(state: RunTelemetryState, filters: TelemetryFilterOptions = {}): PhaseBoardCardState[] {
  const phaseFilterId = resolvePhaseFilter(state, filters)

  return state.phaseOrder.map((phaseId) => {
    const phase = state.phases[phaseId]
    const isKnown = inferKnownPhase(phase)
    const matchesAgent = !filters.agentId || phase.agentIds.includes(filters.agentId)
    const matchesPhase = !phaseFilterId || phaseId === phaseFilterId
    const matches = matchesAgent && matchesPhase

    return {
      phaseId,
      label: phase.label,
      status: phase.status,
      completeCount: phase.completeCount,
      totalCount: phase.totalCount,
      blocked: phase.blocked,
      activeAgentId: phase.activeAgentId,
      isSelected: Boolean(phaseFilterId && phaseFilterId === phaseId),
      isActive: state.activePhaseId === phaseId,
      dimmed: !matches,
      isKnown,
    }
  })
}

export function selectPipelineSteps(state: RunTelemetryState): PipelineStepState[] {
  return state.phaseOrder.map((phaseId) => {
    const phase = state.phases[phaseId]
    return {
      phaseId,
      label: phase.label,
      status: phase.status,
      completeCount: phase.completeCount,
      totalCount: phase.totalCount,
      blocked: phase.blocked,
      activeAgentId: phase.activeAgentId,
    }
  })
}

export function selectArtifactsPanel(
  state: RunTelemetryState,
  phaseOrFilters?: TimelinePhaseId | TelemetryFilterOptions,
  agentFilterId?: string,
): ArtifactsPanelState {
  const filters = normalizeFilters(phaseOrFilters, agentFilterId)
  const phaseFilterId = resolvePhaseFilter(state, filters)

  const source = state.artifacts.filter((artifact) => {
    if (phaseFilterId && artifact.phaseId !== phaseFilterId) return false
    if (!filters.agentId) return true

    if (artifact.agentId === filters.agentId) return true
    const selectedAgent = state.agents[filters.agentId]
    if (selectedAgent && !artifact.agentId && artifact.phaseId === selectedAgent.phaseId) return true
    return false
  })

  const sorted = [...source].sort((a, b) => {
    const left = epoch(a.mtime || a.createdAt) || 0
    const right = epoch(b.mtime || b.createdAt) || 0
    return right - left
  })

  const inProgress = sorted.filter((artifact) => artifact.status === 'in_progress')
  const produced = sorted.filter((artifact) => artifact.status === 'produced')

  return {
    inProgress,
    produced,
    counts: {
      inProgress: inProgress.length,
      produced: produced.length,
      total: sorted.length,
    },
  }
}

export function selectGates(
  state: RunTelemetryState,
  phaseOrFilters?: TimelinePhaseId | TelemetryFilterOptions,
  agentFilterId?: string,
): GateTelemetryState[] {
  const filters = normalizeFilters(phaseOrFilters, agentFilterId)
  const effectivePhaseFilter = resolvePhaseFilter(state, filters)

  const gates = state.gateOrder
    .map((gateId) => state.gates[gateId])
    .filter((gate): gate is GateTelemetryState => Boolean(gate))

  const filtered = effectivePhaseFilter ? gates.filter((gate) => gate.phaseId === effectivePhaseFilter) : gates

  const weight: Record<TelemetryGateStatus, number> = {
    fail: 0,
    running: 1,
    pending: 2,
    pass: 3,
  }

  return filtered.sort((a, b) => {
    const byStatus = weight[a.status] - weight[b.status]
    if (byStatus !== 0) return byStatus
    return a.label.localeCompare(b.label)
  })
}

export function selectTimeline(state: RunTelemetryState): TimelineNodeState[] {
  return state.timeline
}

export function selectAgentSignals(state: RunTelemetryState): Record<string, AgentSignalSummary> {
  const warningCounts: Record<string, number> = {}
  const errorCounts: Record<string, number> = {}
  const gateFailCountsByPhase: Record<string, number> = {}

  for (const event of state.events) {
    if (!event.agentId) continue
    if (event.severity === 'warn') {
      warningCounts[event.agentId] = (warningCounts[event.agentId] || 0) + 1
    } else if (event.severity === 'error') {
      errorCounts[event.agentId] = (errorCounts[event.agentId] || 0) + 1
    }
  }

  for (const gateId of state.gateOrder) {
    const gate = state.gates[gateId]
    if (!gate || gate.status !== 'fail') continue
    gateFailCountsByPhase[gate.phaseId] = (gateFailCountsByPhase[gate.phaseId] || 0) + 1
  }

  const byAgent: Record<string, AgentSignalSummary> = {}
  for (const agentId of state.agentOrder) {
    const agent = state.agents[agentId]
    if (!agent) continue
    byAgent[agentId] = {
      warningCount: warningCounts[agentId] || 0,
      errorCount: errorCounts[agentId] || 0,
      gateFailCount: gateFailCountsByPhase[agent.phaseId] || 0,
    }
  }
  return byAgent
}

export function selectRepairTargets(state: RunTelemetryState): Record<string, RepairTarget> {
  const byAgent: Record<string, RepairTarget> = {}

  for (const agentId of state.agentOrder) {
    const agent = state.agents[agentId]
    if (!agent?.repair?.attempted) continue

    const matchingEvent = [...state.events]
      .reverse()
      .find(
        (event) =>
          event.agentId === agentId &&
          (event.type === 'contract_invalid' || event.type === 'contract_repair_attempted' || event.type === 'contract_repair_failed'),
      )

    const artifactFromEvent =
      matchingEvent?.artifactPath ||
      (typeof matchingEvent?.data?.artifactPath === 'string' ? matchingEvent.data.artifactPath : undefined) ||
      (typeof matchingEvent?.data?.failureArtifact === 'string' ? matchingEvent.data.failureArtifact : undefined)

    const artifactPath = agent.repair.failureArtifactPath || artifactFromEvent
    const eventId = matchingEvent?.id
    byAgent[agentId] = {
      agentId,
      eventId,
      artifactPath,
      available: Boolean(eventId || artifactPath),
    }
  }

  return byAgent
}

function resolveActivePhaseLastTransitionMs(
  state: RunTelemetryState,
  activePhaseId: TimelinePhaseId,
): number | null {
  let currentPhase: TimelinePhaseId | null = null
  let lastTransitionMs: number | null = null

  for (const event of state.events) {
    const phaseForEvent = resolvePhaseForEvent(state, event)
    if (!phaseForEvent) continue
    const eventMs = epoch(event.ts)
    if (eventMs == null) continue
    if (currentPhase !== phaseForEvent) {
      currentPhase = phaseForEvent
      lastTransitionMs = eventMs
    }
  }

  if (currentPhase === activePhaseId && lastTransitionMs != null) return lastTransitionMs
  const fallback = epoch(state.phases[activePhaseId]?.startedAt)
  return fallback ?? null
}

export function selectRunOperatorWarnings(
  state: RunTelemetryState,
  options: {
    nowMs?: number
    thresholdMs?: number
  } = {},
): RunOperatorWarning[] {
  if (state.runStatus !== 'running' && state.runStatus !== 'queued') return []

  const warnings: RunOperatorWarning[] = []
  const nowMs = options.nowMs ?? Date.now()
  const thresholdMs = options.thresholdMs ?? RUN_VIEW_WARNING_THRESHOLD_MS

  const telemetryAnchor =
    state.runStatus === 'queued'
      ? (epoch(state.updatedAt) ?? epoch(state.startedAt))
      : epoch(state.updatedAt)
  if (telemetryAnchor != null) {
    const ageMs = Math.max(0, nowMs - telemetryAnchor)
    if (ageMs > thresholdMs) {
      const ageMinutes = Math.floor(ageMs / 60000)
      if (state.runStatus === 'queued') {
        warnings.push({
          id: 'queued_stalled',
          message: `Run still queued after ${ageMinutes} minutes. Worker may be unavailable.`,
          minutes: ageMinutes,
        })
      } else {
        warnings.push({
          id: 'no_telemetry',
          message: `No telemetry for ${ageMinutes} minutes`,
          minutes: ageMinutes,
        })
      }
    }
  }

  if (state.runStatus !== 'running') return warnings
  if (!state.activePhaseId) return warnings
  const lastTransitionMs = resolveActivePhaseLastTransitionMs(state, state.activePhaseId)
  if (lastTransitionMs == null) return warnings

  const phaseAgeMs = Math.max(0, nowMs - lastTransitionMs)
  if (phaseAgeMs > thresholdMs) {
    const stalledMinutes = Math.floor(phaseAgeMs / 60000)
    warnings.push({
      id: 'phase_stalled',
      message: 'Phase appears stalled',
      minutes: stalledMinutes,
    })
  }

  return warnings
}

export function selectTimelineEvents(
  state: RunTelemetryState,
  filters: TelemetryFilterOptions = {},
): NormalizedTelemetryEvent[] {
  const phaseFilterId = resolvePhaseFilter(state, filters)

  const filtered = state.events.filter((event) => {
    if (filters.agentId && event.agentId !== filters.agentId) return false
    if (!phaseFilterId) return true
    return eventPhaseForFilter(state, event) === phaseFilterId
  })

  return [...filtered].sort((a, b) => {
    const left = epoch(a.ts) || 0
    const right = epoch(b.ts) || 0
    return left - right
  })
}

export function selectTimelineGroups(
  state: RunTelemetryState,
  filters: TelemetryFilterOptions = {},
): TimelinePhaseEvents[] {
  const phaseFilterId = resolvePhaseFilter(state, filters)
  const events = selectTimelineEvents(state, filters)
  const grouped = new Map<TimelinePhaseId, NormalizedTelemetryEvent[]>()

  for (const event of events) {
    const phaseId = eventPhaseForFilter(state, event) || 'research'
    const list = grouped.get(phaseId) || []
    list.push(event)
    grouped.set(phaseId, list)
  }

  return state.phaseOrder
    .filter((phaseId) => {
      if (phaseFilterId) return phaseId === phaseFilterId
      return grouped.has(phaseId)
    })
    .map((phaseId) => ({
      phaseId,
      label: state.phases[phaseId].label,
      status: state.phases[phaseId].status,
      events: grouped.get(phaseId) || [],
    }))
}
