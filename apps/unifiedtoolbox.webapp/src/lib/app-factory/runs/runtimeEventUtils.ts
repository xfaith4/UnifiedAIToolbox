import type { RunEvent } from './types'

export type EventFilterMode = 'all' | 'warn_error' | 'error'

export function normalizeRuntimeEvent(raw: unknown, fallbackRunId?: string): RunEvent {
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>
    const eventType =
      typeof record.type === 'string'
        ? record.type
        : typeof record.event_type === 'string'
          ? record.event_type
          : undefined
    const level =
      typeof record.level === 'string'
        ? record.level
        : typeof record.severity === 'string'
          ? record.severity
          : undefined
    const stage =
      typeof record.stage === 'string'
        ? record.stage
        : typeof record.phase === 'string'
          ? record.phase
          : typeof record.agent_name === 'string'
            ? record.agent_name
            : typeof record.agent_id === 'string'
              ? record.agent_id
              : undefined

    const ts = String(record.ts || record.timestamp || record.time || new Date().toISOString())
    const step = typeof record.step === 'string' ? record.step : undefined
    const message = String(record.message || record.msg || record.status || eventType || 'event')
    const data = record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : undefined
    const details =
      record.details && typeof record.details === 'object'
        ? (record.details as Record<string, unknown>)
        : undefined
    return {
      ts,
      runId:
        typeof record.runId === 'string'
          ? record.runId
          : typeof record.run_id === 'string'
            ? record.run_id
            : fallbackRunId,
      type: eventType,
      level,
      stage,
      step,
      phase: typeof record.phase === 'string' ? record.phase : undefined,
      agent:
        typeof record.agent === 'string'
          ? record.agent
          : typeof record.agent_name === 'string'
            ? record.agent_name
            : typeof record.agent_id === 'string'
              ? record.agent_id
              : undefined,
      status: typeof record.status === 'string' ? record.status : undefined,
      message,
      msg: typeof record.msg === 'string' ? record.msg : message,
      details,
      data,
      attemptId:
        typeof record.attemptId === 'string'
          ? record.attemptId
          : typeof record.attempt_id === 'string'
            ? record.attempt_id
            : undefined,
    }
  }

  return {
    ts: new Date().toISOString(),
    runId: fallbackRunId,
    level: 'info',
    type: 'metric',
    message: String(raw ?? 'event'),
    msg: String(raw ?? 'event'),
  }
}

export function parseNdjsonChunk(chunk: string, fallbackRunId?: string): { events: RunEvent[]; remainder: string } {
  const text = chunk || ''
  const lines = text.split(/\r?\n/)
  const hasTrailingNewline = text.endsWith('\n') || text.endsWith('\r')
  const remainder = hasTrailingNewline ? '' : lines.pop() || ''
  const events: RunEvent[] = []
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      events.push(normalizeRuntimeEvent(JSON.parse(line), fallbackRunId))
    } catch {
      events.push(normalizeRuntimeEvent(line, fallbackRunId))
    }
  }
  return { events, remainder }
}

export function eventKey(event: RunEvent): string {
  return `${event.ts}:${event.type || ''}:${event.stage || ''}:${event.step || ''}:${event.attemptId || ''}:${event.message}`
}

export function dedupeEvents(events: RunEvent[]): RunEvent[] {
  const seen = new Set<string>()
  const out: RunEvent[] = []
  for (const event of events) {
    const key = eventKey(event)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(event)
  }
  return out
}

export function filterEvents(events: RunEvent[], mode: EventFilterMode): RunEvent[] {
  if (mode === 'all') return events
  return events.filter((event) => {
    const level = String(event.level || '').toLowerCase()
    const status = String(event.status || '').toLowerCase()
    const type = String(event.type || '').toLowerCase()
    const message = String(event.message || '').toLowerCase()
    const isError =
      level === 'error' ||
      status === 'failed' ||
      type === 'error' ||
      message.includes('error') ||
      message.includes('failed')
    if (mode === 'error') return isError
    const isWarn =
      level === 'warn' ||
      status === 'skipped' ||
      type === 'warn' ||
      message.includes('warn') ||
      message.includes('stuck')
    return isError || isWarn
  })
}
