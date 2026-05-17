import 'server-only'
import path from 'path'
import { promises as fs } from 'fs'
import { randomUUID } from 'crypto'
import { getRunsRoot, isValidRunId } from './runStatus'
import { runLogger } from './runLogger'

/**
 * Canonical event taxonomy.
 *
 * These event types are part of the public run-lifecycle contract documented in
 * `docs/contracts/EVENT_TAXONOMY.md` (owned by Agent 1). Adding a new event_type
 * must go through the contract, not just this file.
 */
export const CANONICAL_EVENT_TYPES = [
  'run_created',
  'run_queued',
  'run_started',
  'agent_started',
  'agent_progress',
  'agent_blocked',
  'agent_completed',
  'artifact_created',
  'validation_started',
  'validation_completed',
  'run_completed',
  'run_failed',
  'run_recovered',
] as const

export type CanonicalEventType = (typeof CANONICAL_EVENT_TYPES)[number]

const CANONICAL_EVENT_TYPE_SET: ReadonlySet<string> = new Set(CANONICAL_EVENT_TYPES)

export function isCanonicalEventType(value: unknown): value is CanonicalEventType {
  return typeof value === 'string' && CANONICAL_EVENT_TYPE_SET.has(value)
}

export type CanonicalSeverity = 'info' | 'warn' | 'error'

/**
 * Canonical event row written to `events.jsonl`. Append-only, stable schema.
 *
 * The on-disk row is `CanonicalEvent` exactly — fields are not nested.
 */
export interface CanonicalEvent {
  event_id: string
  run_id: string
  timestamp: string
  event_type: CanonicalEventType
  severity: CanonicalSeverity
  agent_id?: string
  agent_name?: string
  message: string
  data?: Record<string, unknown>
  artifact_refs?: string[]
}

export type CanonicalEventInput = Omit<CanonicalEvent, 'event_id' | 'timestamp'> & {
  event_id?: string
  timestamp?: string
}

export const CANONICAL_EVENTS_FILENAME = 'events.jsonl'

const SECRET_KEY_RE = /token|authorization|api[_-]?key|secret|password/i

function redactString(value: string): string {
  let next = value
  next = next.replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [REDACTED]')
  next = next.replace(/sk-[A-Za-z0-9]{10,}/g, 'sk-[REDACTED]')
  next = next.replace(/(api[_-]?key|token|authorization|secret|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
  return next
}

function sanitizeData(input: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!input) return undefined
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    if (SECRET_KEY_RE.test(k)) {
      out[k] = '[REDACTED]'
      continue
    }
    if (typeof v === 'string') out[k] = redactString(v)
    else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = sanitizeData(v as Record<string, unknown>)
    } else out[k] = v
  }
  return out
}

function ensureWithin(root: string, candidate: string): string {
  const full = path.resolve(root, candidate)
  const r = path.resolve(root)
  if (!full.startsWith(r + path.sep) && full !== r) {
    throw new Error('path escaped root')
  }
  return full
}

/** Per-run mutex for safe concurrent appends within a single Node process. */
const runMutex = new Map<string, Promise<void>>()
async function withRunLock<T>(runId: string, fn: () => Promise<T>): Promise<T> {
  const previous = runMutex.get(runId) ?? Promise.resolve()
  let release: () => void = () => undefined
  const next = new Promise<void>((resolve) => {
    release = resolve
  })
  runMutex.set(runId, previous.then(() => next))
  try {
    await previous
    return await fn()
  } finally {
    release()
    // Clean up if no later locks queued after us
    if (runMutex.get(runId) === previous.then(() => next)) {
      runMutex.delete(runId)
    }
  }
}

export interface AppendEventOptions {
  /** Override the runs root (primarily for tests). */
  rootDir?: string
  /** Skip canonical-type validation. Use only to recover legacy events. */
  allowNonCanonical?: boolean
}

/**
 * Append a single canonical event to the run's `events.jsonl`. Append-only,
 * never rewrites. Stamps `event_id` (UUID) and `timestamp` (ISO) if missing
 * and validates `event_type` against the canonical enum.
 */
export async function appendEvent(
  input: CanonicalEventInput,
  options: AppendEventOptions = {}
): Promise<CanonicalEvent> {
  if (!isValidRunId(input.run_id)) {
    throw new Error(`Invalid run_id for canonical event: ${input.run_id}`)
  }
  if (!options.allowNonCanonical && !isCanonicalEventType(input.event_type)) {
    throw new Error(
      `Unknown event_type: "${String(input.event_type)}". ` +
        `Must be one of: ${CANONICAL_EVENT_TYPES.join(', ')}`
    )
  }
  const severity: CanonicalSeverity =
    input.severity === 'warn' || input.severity === 'error' ? input.severity : 'info'

  const event: CanonicalEvent = {
    event_id: input.event_id ?? randomUUID(),
    run_id: input.run_id,
    timestamp: input.timestamp ?? new Date().toISOString(),
    event_type: input.event_type,
    severity,
    agent_id: input.agent_id,
    agent_name: input.agent_name,
    message: redactString(String(input.message ?? '')),
    data: sanitizeData(input.data),
    artifact_refs: input.artifact_refs && input.artifact_refs.length ? [...input.artifact_refs] : undefined,
  }

  const rootDir = options.rootDir ?? getRunsRoot()
  const runDir = ensureWithin(rootDir, input.run_id)
  const filePath = path.join(runDir, CANONICAL_EVENTS_FILENAME)

  await withRunLock(input.run_id, async () => {
    try {
      await fs.mkdir(runDir, { recursive: true })
      const fh = await fs.open(filePath, 'a')
      try {
        await fh.appendFile(JSON.stringify(event) + '\n', 'utf8')
        // Best-effort durability; ignore platforms where fsync isn't supported.
        try {
          await fh.sync()
        } catch {
          // ignore
        }
      } finally {
        await fh.close()
      }
    } catch (error) {
      runLogger.error('canonicalEvent.appendFailed', {
        run_id: input.run_id,
        event_type: input.event_type,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })

  return event
}

export interface ReadEventsOptions {
  rootDir?: string
  /** If set, only return events recorded strictly after this event_id. */
  afterEventId?: string
  /** If set, only return events with timestamp strictly after this ISO. */
  afterTimestamp?: string
  /** Cap the number of events returned (most recent N). */
  limit?: number
}

/**
 * Read events from `events.jsonl`. Returns events in insertion order.
 *
 * If both `afterEventId` and `afterTimestamp` are provided, `afterEventId`
 * takes precedence and `afterTimestamp` is used as a fallback when the id
 * is not found (e.g. client missed the buffer).
 */
export async function readEvents(
  runId: string,
  options: ReadEventsOptions = {}
): Promise<CanonicalEvent[]> {
  if (!isValidRunId(runId)) return []
  const rootDir = options.rootDir ?? getRunsRoot()
  const runDir = ensureWithin(rootDir, runId)
  const filePath = path.join(runDir, CANONICAL_EVENTS_FILENAME)

  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }

  const events: CanonicalEvent[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line) as CanonicalEvent
      if (!parsed || typeof parsed !== 'object') continue
      if (!parsed.event_id || !parsed.event_type) continue
      events.push(parsed)
    } catch {
      // skip malformed line
    }
  }

  return sliceEventsFromCursor(events, options)
}

/**
 * Pure helper for slicing event arrays — exported so the SSE route handler
 * and unit tests can share the exact same replay semantics.
 */
export function sliceEventsFromCursor(
  events: CanonicalEvent[],
  options: { afterEventId?: string; afterTimestamp?: string; limit?: number } = {}
): CanonicalEvent[] {
  let sliced = events
  if (options.afterEventId) {
    const idx = events.findIndex((e) => e.event_id === options.afterEventId)
    if (idx >= 0) {
      sliced = events.slice(idx + 1)
    } else if (options.afterTimestamp) {
      const cutoff = Date.parse(options.afterTimestamp)
      if (Number.isFinite(cutoff)) {
        sliced = events.filter((e) => {
          const ts = Date.parse(e.timestamp)
          return Number.isFinite(ts) && ts > cutoff
        })
      }
    }
  } else if (options.afterTimestamp) {
    const cutoff = Date.parse(options.afterTimestamp)
    if (Number.isFinite(cutoff)) {
      sliced = events.filter((e) => {
        const ts = Date.parse(e.timestamp)
        return Number.isFinite(ts) && ts > cutoff
      })
    }
  }
  if (options.limit && options.limit > 0 && sliced.length > options.limit) {
    sliced = sliced.slice(-options.limit)
  }
  return sliced
}

/**
 * Render a canonical event as an SSE frame. The `id:` line is set to
 * `event_id` so clients can use the standard `Last-Event-ID` header for
 * resumption.
 */
export function toSseFrame(event: CanonicalEvent): string {
  return `id: ${event.event_id}\nevent: ${event.event_type}\ndata: ${JSON.stringify(event)}\n\n`
}
