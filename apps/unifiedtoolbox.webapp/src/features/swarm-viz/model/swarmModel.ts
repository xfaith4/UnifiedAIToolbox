import type { RunStatusResponse } from '@/lib/app-factory/runs/types'
import type { SwarmActivityItem, SwarmAgent, SwarmAgentStatus, SwarmEdge, SwarmModel, SwarmNode, SwarmNodeStatus, SwarmRunEvent } from '../types'

const KNOWN_AGENT_NAMES = [
  'Supervisor',
  'Engineer',
  'Critic',
  'Researcher',
  'Synthesizer',
  'Commissioner',
  'Historian',
  'ReviewGate',
  'PRPublisher',
] as const

const PHASE_LABELS: Record<string, string> = {
  run: 'Run',
  artifacts: 'Artifacts',
  teams: 'Teams',
  assemble: 'Assemble',
  normalize: 'Normalize',
  contract: 'Contract',
  gates: 'Gates',
  'decision-lock': 'Decision Lock',
  repair: 'Repair',
  export: 'Export',
  misc: 'Misc',
}

const PHASE_ORDER = [
  'run',
  'artifacts',
  'teams',
  'assemble',
  'normalize',
  'contract',
  'gates',
  'decision-lock',
  'repair',
  'export',
  'misc',
]

const AGENT_ALIAS: Record<string, string> = {
  supervisor: 'Supervisor',
  engineer: 'Engineer',
  critic: 'Critic',
  researcher: 'Researcher',
  synthesizer: 'Synthesizer',
  commissioner: 'Commissioner',
  historian: 'Historian',
  reviewgate: 'ReviewGate',
  prpublisher: 'PRPublisher',
  prpublisheragent: 'PRPublisher',
  repocontextbuilder: 'RepoContextBuilder',
}

const STATUS_WEIGHT: Record<SwarmNodeStatus, number> = {
  error: 5,
  blocked: 4,
  working: 3,
  complete: 2,
  pending: 1,
}

function toIso(ts: string): string {
  const parsed = new Date(ts)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  return new Date().toISOString()
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function formatName(value: string): string {
  if (!value.trim()) return value
  if (/^[A-Z][A-Za-z0-9]+$/.test(value) && value !== value.toUpperCase()) {
    return value
  }
  return value
    .trim()
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function normalizePhase(rawPhase: string | undefined, message: string): string {
  const combined = `${rawPhase || ''} ${message}`.toLowerCase()
  if (combined.includes('normalize')) return 'normalize'
  if (combined.includes('contract')) return 'contract'
  if (combined.includes('gate')) return 'gates'
  if (combined.includes('repair')) return 'repair'
  if (combined.includes('export') || combined.includes('publish') || combined.includes('zip')) return 'export'
  if (combined.includes('assemble')) return 'assemble'
  if (combined.includes('decision lock') || combined.includes('decision-lock') || combined.includes('lock')) return 'decision-lock'
  if (combined.includes('team') || combined.includes('ownership') || combined.includes('assembler')) return 'teams'
  if (combined.includes('artifact')) return 'artifacts'
  if (combined.includes('run') || combined.includes('hardening')) return 'run'
  return rawPhase ? rawPhase.trim().toLowerCase() : 'misc'
}

function phaseLabel(phase: string): string {
  return PHASE_LABELS[phase] || formatName(phase)
}

function normalizeAgent(value: string | undefined, stage: string | undefined, message: string): string | undefined {
  const candidate = value || stage
  if (candidate && candidate.trim()) {
    const alias = AGENT_ALIAS[normalizeToken(candidate)]
    return alias || formatName(candidate)
  }

  const messageMatch = message.match(
    /\b(Supervisor|Engineer|Critic|Researcher|Synthesizer|Commissioner|Historian|ReviewGate|PRPublisher)\b/i,
  )
  if (!messageMatch) return undefined
  const alias = AGENT_ALIAS[normalizeToken(messageMatch[1])]
  return alias || formatName(messageMatch[1])
}

function normalizeAgentStatus(status: string | undefined, type: string, message: string): SwarmAgentStatus {
  const token = `${status || ''} ${type || ''} ${message || ''}`.toLowerCase()
  if (token.includes('fail') || token.includes('error') || token.includes('blocked')) return 'error'
  if (token.includes('running') || token.includes('retry') || token.includes('in_progress')) return 'working'
  if (token.includes('success') || token.includes('succeed') || token.includes('complete') || token.includes('passed') || token.includes('skipped')) return 'complete'
  return 'idle'
}

function normalizeNodeStatus(status: string | undefined, type: string, message: string): SwarmNodeStatus {
  const token = `${status || ''} ${type || ''} ${message || ''}`.toLowerCase()
  if (token.includes('export') && token.includes('block')) return 'blocked'
  if (token.includes('fail') || token.includes('error')) return 'error'
  if (token.includes('blocked')) return 'blocked'
  if (token.includes('running') || token.includes('retry') || token.includes('in_progress') || token.includes('start')) return 'working'
  if (token.includes('success') || token.includes('succeed') || token.includes('complete') || token.includes('passed') || token.includes('skipped')) return 'complete'
  return 'pending'
}

function pickFirstString(records: Array<Record<string, unknown> | undefined>, keys: string[]): string | undefined {
  for (const record of records) {
    if (!record) continue
    for (const key of keys) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }
  return undefined
}

function shortHash(value: string): string {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

function extractTaskId(event: SwarmRunEvent): string | undefined {
  return pickFirstString([event.details, event.data], ['taskId', 'task_id', 'task', 'subTaskId', 'subtask_id'])
}

function extractArtifactPath(event: SwarmRunEvent): string | undefined {
  const fromPayload = pickFirstString([event.details, event.data], ['file', 'path', 'artifact', 'artifactPath', 'artifact_path'])
  if (fromPayload) return fromPayload

  const created = event.message.match(/artifact\s+(?:created|written)\s*:?\s*([A-Za-z0-9_./-]+\.[A-Za-z0-9_-]+)/i)
  if (created?.[1]) return created[1]

  const saved = event.message.match(/saved[^:]*:\s*([A-Za-z0-9_./-]+\.[A-Za-z0-9_-]+)/i)
  if (saved?.[1]) return saved[1]

  return undefined
}

function extractGateName(event: SwarmRunEvent): string | undefined {
  const fromPayload = pickFirstString([event.details, event.data], ['gate', 'gateId', 'gate_id', 'check', 'step', 'name'])
  if (fromPayload) return fromPayload

  const gateMatch = event.message.match(/gate\s+([A-Za-z0-9_-]+)/i)
  if (gateMatch?.[1]) return gateMatch[1]
  return undefined
}

function isExportBlocked(event: SwarmRunEvent): boolean {
  const token = `${event.phase || ''} ${event.type} ${event.status || ''} ${event.message}`.toLowerCase()
  return token.includes('export') && (token.includes('block') || token.includes('failed'))
}

function addEdge(edgeMap: Map<string, SwarmEdge>, from: string, to: string, kind: SwarmEdge['kind']): void {
  const id = `${kind}:${from}->${to}`
  if (edgeMap.has(id)) return
  edgeMap.set(id, { id, from, to, kind })
}

function upsertNode(nodeMap: Map<string, SwarmNode>, next: Omit<SwarmNode, 'eventCount'>): SwarmNode {
  const existing = nodeMap.get(next.id)
  if (!existing) {
    const created: SwarmNode = { ...next, eventCount: 1 }
    nodeMap.set(next.id, created)
    return created
  }

  existing.lastTs = next.lastTs
  existing.message = next.message || existing.message
  existing.agent = next.agent || existing.agent
  existing.phase = next.phase || existing.phase
  existing.eventCount += 1

  if (STATUS_WEIGHT[next.status] >= STATUS_WEIGHT[existing.status]) {
    existing.status = next.status
  }

  return existing
}

function phaseSortValue(phase: string): number {
  const idx = PHASE_ORDER.indexOf(phase)
  return idx === -1 ? PHASE_ORDER.length + 1 : idx
}

function fromRunStatus(runStatus: RunStatusResponse | null): SwarmRunEvent[] {
  if (!runStatus || !Array.isArray(runStatus.events)) return []
  return runStatus.events.map((event, index) => {
    const ts = toIso(event.ts || new Date().toISOString())
    const type = (event.type || 'info').trim()
    const message = (event.message || type || 'event').trim()
    const phase = event.phase ? event.phase.trim() : undefined
    const stage = event.stage ? event.stage.trim() : undefined
    const agent = event.agent ? event.agent.trim() : undefined
    const status = event.status ? event.status.trim() : undefined
    const id = `${ts}|${type}|${phase || ''}|${agent || ''}|${status || ''}|${message}|${index}`
    return {
      id,
      ts,
      runId: runStatus.runId,
      type,
      stage,
      phase,
      agent,
      status,
      message,
      details: event.details,
      data: event.data,
    }
  })
}

export function buildSwarmModel(events: SwarmRunEvent[], runStatus: RunStatusResponse | null): SwarmModel {
  const phaseSet = new Set<string>()
  const agentMap = new Map<string, SwarmAgent>()
  const nodeMap = new Map<string, SwarmNode>()
  const edgeMap = new Map<string, SwarmEdge>()
  const activity: SwarmActivityItem[] = []

  const knownAgents = new Set<string>(KNOWN_AGENT_NAMES)
  for (const knownName of knownAgents) {
    agentMap.set(knownName, {
      id: knownName,
      name: knownName,
      status: 'idle',
      known: true,
    })
  }

  if (runStatus?.currentStage) {
    const inferred = normalizePhase(runStatus.currentStage, runStatus.currentStage)
    phaseSet.add(inferred)
  }

  if (Array.isArray(runStatus?.stages)) {
    for (const stage of runStatus.stages) {
      const phase = normalizePhase(stage.name || stage.id, stage.name || stage.id)
      phaseSet.add(phase)

      const agentName = normalizeAgent(stage.name || stage.id, stage.id, stage.name || stage.id)
      if (!agentName) continue

      const agent = agentMap.get(agentName) || {
        id: agentName,
        name: agentName,
        status: 'idle' as SwarmAgentStatus,
        known: knownAgents.has(agentName),
      }

      agent.phase = phase
      agent.status = normalizeAgentStatus(stage.status, stage.id, stage.name || '')
      agent.lastEventTs = stage.finishedAt || stage.startedAt
      agentMap.set(agentName, agent)
    }
  }

  const mergedEvents = [...fromRunStatus(runStatus), ...events]
  const deduped = Array.from(
    mergedEvents.reduce((map, event) => {
      if (!map.has(event.id)) map.set(event.id, event)
      return map
    }, new Map<string, SwarmRunEvent>()).values(),
  ).sort((a, b) => {
    if (a.ts === b.ts) return a.id.localeCompare(b.id)
    return a.ts.localeCompare(b.ts)
  })

  let prevPhaseNodeId: string | null = null
  let prevNodeId: string | null = null

  for (const event of deduped) {
    const phase = normalizePhase(event.phase || event.stage, event.message)
    const phaseNodeId = `phase:${phase}`
    phaseSet.add(phase)

    const phaseNode = upsertNode(nodeMap, {
      id: phaseNodeId,
      kind: 'phase',
      label: phaseLabel(phase),
      phase,
      status: normalizeNodeStatus(event.status, event.type, event.message),
      firstTs: event.ts,
      lastTs: event.ts,
      message: event.message,
    })

    if (prevPhaseNodeId && prevPhaseNodeId !== phaseNode.id) {
      addEdge(edgeMap, prevPhaseNodeId, phaseNode.id, 'dependency')
    }
    prevPhaseNodeId = phaseNode.id

    const agentName = normalizeAgent(event.agent, event.stage, event.message)
    if (agentName) {
      const agentStatus = normalizeAgentStatus(event.status, event.type, event.message)
      const existing = agentMap.get(agentName) || {
        id: agentName,
        name: agentName,
        status: 'idle' as SwarmAgentStatus,
        known: knownAgents.has(agentName),
      }

      existing.status = agentStatus
      existing.phase = phase
      existing.lastEventTs = event.ts
      existing.lastMessage = event.message
      agentMap.set(agentName, existing)
    }

    activity.push({
      id: event.id,
      ts: event.ts,
      type: event.type,
      phase,
      agent: agentName,
      status: event.status,
      message: event.message,
    })

    const taskId = extractTaskId(event)
    const artifactPath = extractArtifactPath(event)
    const gateName = extractGateName(event)
    const gateLike = phase === 'gates' || event.type.toLowerCase().includes('gate') || event.message.toLowerCase().includes('gate')

    let nodeId: string | null = null
    let kind: SwarmNode['kind'] = 'event'
    let label = event.message

    if (taskId) {
      nodeId = `task:${taskId}`
      kind = 'task'
      label = taskId
    } else if (gateLike) {
      const gateId = gateName ? normalizeToken(gateName) : shortHash(event.message)
      nodeId = `gate:${gateId}`
      kind = 'gate'
      label = gateName || 'Gate'
    } else if (artifactPath) {
      nodeId = `artifact:${artifactPath.toLowerCase()}`
      kind = 'artifact'
      label = artifactPath
    } else if (isExportBlocked(event)) {
      nodeId = `export-blocked:${shortHash(event.message)}`
      kind = 'export'
      label = 'Export Blocked'
    } else {
      const typeToken = event.type.toLowerCase()
      if (
        event.status ||
        typeToken.includes('stage') ||
        typeToken.includes('phase') ||
        typeToken.includes('run_') ||
        typeToken.includes('error') ||
        typeToken.includes('warn')
      ) {
        nodeId = `event:${shortHash(event.id)}`
        kind = 'event'
        label = event.message.length > 72 ? `${event.message.slice(0, 72)}...` : event.message
      }
    }

    if (nodeId) {
      const node = upsertNode(nodeMap, {
        id: nodeId,
        kind,
        label,
        phase,
        agent: agentName,
        status: normalizeNodeStatus(event.status, event.type, event.message),
        firstTs: event.ts,
        lastTs: event.ts,
        message: event.message,
      })

      addEdge(edgeMap, phaseNode.id, node.id, 'dependency')

      if (agentName) {
        addEdge(edgeMap, `agent:${agentName}`, node.id, 'assignment')
      }

      if (prevNodeId && prevNodeId !== node.id) {
        addEdge(edgeMap, prevNodeId, node.id, 'dependency')
      }
      prevNodeId = node.id
    }
  }

  const phases = Array.from(phaseSet).sort((a, b) => {
    const orderA = phaseSortValue(a)
    const orderB = phaseSortValue(b)
    if (orderA === orderB) return a.localeCompare(b)
    return orderA - orderB
  })

  const agents = Array.from(agentMap.values()).sort((a, b) => {
    if (a.known !== b.known) return a.known ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  const nodes = Array.from(nodeMap.values()).sort((a, b) => {
    if (a.firstTs === b.firstTs) return a.id.localeCompare(b.id)
    return a.firstTs.localeCompare(b.firstTs)
  })

  const edges = Array.from(edgeMap.values())

  const sortedActivity = [...activity].sort((a, b) => {
    if (a.ts === b.ts) return a.id.localeCompare(b.id)
    return b.ts.localeCompare(a.ts)
  })

  return {
    phases,
    agents,
    nodes,
    edges,
    activity: sortedActivity,
  }
}
