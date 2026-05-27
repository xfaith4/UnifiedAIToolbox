import 'server-only'
import path from 'path'
import { getRunsRoot, isValidRunId } from './runStatus'
import type { RunEvent } from './types'
import {
  appendEvent,
  isCanonicalEventType,
  type CanonicalEventType,
  type CanonicalSeverity,
} from './canonicalEvents'

const MAX_BUFFER = 400

export type RunStreamEventStatus = 'running' | 'success' | 'failed' | 'skipped' | 'retrying' | 'pending'

export type RunStreamEvent = RunEvent & {
  runId: string
  level?: 'debug' | 'info' | 'warn' | 'error' | string
  phase?: string
  step?: string
  agent?: string
  status?: RunStreamEventStatus
  details?: Record<string, unknown>
}

type Subscriber = (event: RunStreamEvent) => void

const buffers = new Map<string, RunStreamEvent[]>()
const subscribers = new Map<string, Set<Subscriber>>()

function ensureWithin(root: string, candidate: string): string {
  const full = path.resolve(root, candidate)
  const r = path.resolve(root)
  if (!full.startsWith(r + path.sep) && full !== r) {
    throw new Error('path escaped root')
  }
  return full
}

function redactValue(value: string): string {
  let next = value
  next = next.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
  next = next.replace(/sk-[A-Za-z0-9]{10,}/g, 'sk-[REDACTED]')
  next = next.replace(/(api[_-]?key|token|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
  return next
}

function sanitizeDetails(input: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!input) return undefined
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    if (/token|authorization|api[_-]?key|secret/i.test(k)) {
      out[k] = '[REDACTED]'
      continue
    }
    if (typeof v === 'string') out[k] = redactValue(v)
    else out[k] = v
  }
  return out
}

function inferEventLevel(event: Omit<RunStreamEvent, 'ts'> & { ts?: string }): 'debug' | 'info' | 'warn' | 'error' {
  const explicitLevel = typeof event.level === 'string' ? event.level.toLowerCase() : ''
  if (explicitLevel === 'debug' || explicitLevel === 'info' || explicitLevel === 'warn' || explicitLevel === 'error') {
    return explicitLevel
  }
  const status = String(event.status || '').toLowerCase()
  if (status === 'failed') return 'error'
  if (status === 'skipped' || status === 'retrying') return 'warn'

  const text = String(event.msg || event.message || '').toLowerCase()
  if (text.includes('error') || text.includes('failed') || text.includes('exception')) return 'error'
  if (text.includes('warn') || text.includes('stalled') || text.includes('slow')) return 'warn'
  return 'info'
}

function inferEventType(event: Omit<RunStreamEvent, 'ts'> & { ts?: string }): string {
  if (typeof event.type === 'string' && event.type.trim()) return event.type
  const status = String(event.status || '').toLowerCase()
  const message = String(event.msg || event.message || '').toLowerCase()
  if (status === 'running') return message.includes('started') ? 'stage.start' : 'step.progress'
  if (status === 'success') return message.includes('completed') ? 'stage.complete' : 'step.complete'
  if (status === 'failed') return 'error'
  if (status === 'skipped') return 'warn'
  return 'metric'
}

function normalizeEvent(event: Omit<RunStreamEvent, 'ts'> & { ts?: string }): RunStreamEvent {
  const message = redactValue(event.message || event.msg || 'event')
  const stage = event.stage || event.phase
  const level = inferEventLevel(event)
  const normalizedType = inferEventType(event)
  return {
    ts: event.ts || new Date().toISOString(),
    runId: event.runId,
    type: normalizedType,
    level,
    stage,
    step: event.step,
    phase: event.phase,
    agent: event.agent,
    status: event.status,
    message,
    msg: message,
    details: sanitizeDetails(event.details),
    data: event.data,
  }
}

function toCanonicalSeverity(event: RunStreamEvent): CanonicalSeverity {
  const level = String(event.level || '').toLowerCase()
  const status = String(event.status || '').toLowerCase()
  if (level === 'error' || status === 'failed') return 'error'
  if (level === 'warn' || status === 'skipped' || status === 'retrying') return 'warn'
  return 'info'
}

function toCanonicalEventType(event: RunStreamEvent): CanonicalEventType {
  const rawType = String(event.type || '').trim()
  if (isCanonicalEventType(rawType)) {
    return rawType
  }

  const phase = String(event.phase || '').toLowerCase()
  if (phase === 'validation') {
    if (rawType === 'stage.start') return 'validation_started'
    if (rawType === 'stage.complete' || rawType === 'step.complete') return 'validation_completed'
  }

  if (rawType === 'stage.start') return 'agent_started'
  if (rawType === 'stage.complete' || rawType === 'step.complete') return 'agent_completed'

  const status = String(event.status || '').toLowerCase()
  const level = String(event.level || '').toLowerCase()
  if (rawType === 'error' || status === 'failed' || level === 'error') return 'agent_blocked'

  return 'agent_progress'
}

function toCanonicalData(event: RunStreamEvent): Record<string, unknown> | undefined {
  const data: Record<string, unknown> = {
    source: 'runEvents',
    original_type: event.type,
    phase: event.phase,
    stage: event.stage,
    step: event.step,
    status: event.status,
    level: event.level,
    details: event.details,
    data: event.data,
    attempt_id: event.attemptId,
  }

  const compact = Object.fromEntries(Object.entries(data).filter(([, value]) => value != null))
  return Object.keys(compact).length ? compact : undefined
}

async function appendCanonicalEvent(event: RunStreamEvent): Promise<void> {
  const runsRoot = getRunsRoot()
  ensureWithin(runsRoot, event.runId)
  await appendEvent({
    run_id: event.runId,
    timestamp: event.ts,
    event_type: toCanonicalEventType(event),
    severity: toCanonicalSeverity(event),
    agent_name: event.agent || event.stage || event.phase,
    message: event.message,
    data: toCanonicalData(event),
  })
}

export async function emitRunEvent(event: Omit<RunStreamEvent, 'ts'> & { ts?: string }): Promise<RunStreamEvent> {
  if (!isValidRunId(event.runId)) {
    throw new Error(`Invalid runId for run event: ${event.runId}`)
  }
  const normalized = normalizeEvent(event)
  const existing = buffers.get(normalized.runId) || []
  existing.push(normalized)
  if (existing.length > MAX_BUFFER) {
    existing.splice(0, existing.length - MAX_BUFFER)
  }
  buffers.set(normalized.runId, existing)
  await appendCanonicalEvent(normalized)

  const listeners = subscribers.get(normalized.runId)
  if (listeners?.size) {
    for (const fn of listeners) fn(normalized)
  }
  return normalized
}

export function getBufferedEvents(runId: string, since?: string): RunStreamEvent[] {
  const all = buffers.get(runId) || []
  if (!since) return [...all]
  const sinceMs = Date.parse(since)
  if (!Number.isFinite(sinceMs)) return [...all]
  return all.filter((event) => {
    const ts = Date.parse(event.ts)
    return Number.isFinite(ts) && ts > sinceMs
  })
}

export function subscribeRunEvents(runId: string, callback: Subscriber): () => void {
  const set = subscribers.get(runId) || new Set<Subscriber>()
  set.add(callback)
  subscribers.set(runId, set)
  return () => {
    const curr = subscribers.get(runId)
    if (!curr) return
    curr.delete(callback)
    if (curr.size === 0) subscribers.delete(runId)
  }
}
