import type { RunStatusResponse } from '@/lib/app-factory/runs/types'

export type SwarmConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'error' | 'closed'

export type SwarmRawEventPayload = {
  ts?: string
  runId?: string
  type?: string
  stage?: string
  phase?: string
  agent?: string
  status?: string
  message?: string
  details?: Record<string, unknown>
  data?: Record<string, unknown>
}

export type SwarmRunEvent = {
  id: string
  ts: string
  runId: string
  type: string
  stage?: string
  phase?: string
  agent?: string
  status?: string
  message: string
  details?: Record<string, unknown>
  data?: Record<string, unknown>
}

export type SwarmAgentStatus = 'idle' | 'working' | 'complete' | 'error'

export type SwarmAgent = {
  id: string
  name: string
  phase?: string
  status: SwarmAgentStatus
  lastEventTs?: string
  lastMessage?: string
  known: boolean
}

export type SwarmNodeKind = 'phase' | 'task' | 'gate' | 'artifact' | 'export' | 'event'

export type SwarmNodeStatus = 'pending' | 'working' | 'complete' | 'error' | 'blocked'

export type SwarmNode = {
  id: string
  kind: SwarmNodeKind
  label: string
  phase?: string
  agent?: string
  status: SwarmNodeStatus
  firstTs: string
  lastTs: string
  eventCount: number
  message?: string
}

export type SwarmEdgeKind = 'assignment' | 'dependency'

export type SwarmEdge = {
  id: string
  from: string
  to: string
  kind: SwarmEdgeKind
}

export type SwarmActivityItem = {
  id: string
  ts: string
  type: string
  phase?: string
  agent?: string
  status?: string
  message: string
}

export type SwarmModel = {
  phases: string[]
  agents: SwarmAgent[]
  nodes: SwarmNode[]
  edges: SwarmEdge[]
  activity: SwarmActivityItem[]
}

export type UseRunEventsResult = {
  events: SwarmRunEvent[]
  runStatus: RunStatusResponse | null
  loading: boolean
  error: string | null
  connectionStatus: SwarmConnectionStatus
  lastEventTs: string | null
  reconnectCount: number
  refresh: () => Promise<void>
}
