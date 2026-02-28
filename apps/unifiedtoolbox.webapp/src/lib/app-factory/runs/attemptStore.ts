import 'server-only'
import path from 'path'
import { promises as fs } from 'fs'
import type { AttemptSummary, RunEvent } from './types'
import { getRunsRoot } from './runStatus'

function getAttemptsDir(): string {
  const override = process.env.UAITOOLBOX_ATTEMPTS_DIR
  if (override && override.trim()) {
    return path.resolve(override)
  }
  return path.resolve(getRunsRoot(), '..', 'run-attempts')
}

const RUN_ID_PATTERN = /^[a-zA-Z0-9._-]+$/

function isValidRunId(runId: string): boolean {
  const trimmed = runId.trim()
  if (!RUN_ID_PATTERN.test(trimmed)) return false
  if (trimmed.includes('..')) return false
  return true
}

export async function loadAttempts(runId: string): Promise<AttemptSummary[]> {
  if (!isValidRunId(runId)) return []
  const filePath = path.join(getAttemptsDir(), `${runId}.json`)
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as AttemptSummary[]
  } catch {
    // file missing or malformed — return empty
  }
  return []
}

export async function saveAttempts(runId: string, attempts: AttemptSummary[]): Promise<void> {
  if (!isValidRunId(runId)) return
  const dir = getAttemptsDir()
  await fs.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, `${runId}.json`)
  const tmpPath = `${filePath}.tmp`
  await fs.writeFile(tmpPath, JSON.stringify(attempts, null, 2), 'utf8')
  await fs.rename(tmpPath, filePath)
}

/**
 * Derive attempt boundaries from a flat chronological event list.
 * A new attempt starts when an event has type 'requeue' or
 * a status event whose message matches requeue/retry/repair.
 * Returns at least one attempt even for empty event arrays.
 */
export function deriveAttemptsFromEvents(runId: string, events: RunEvent[]): AttemptSummary[] {
  // Collect boundary indices (index of the first event of each new attempt after attempt 1)
  const boundaries: number[] = []
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    const evType = String(ev.type || '').toLowerCase()
    const evMsg = String(ev.message || '').toLowerCase()
    if (evType === 'requeue') {
      boundaries.push(i + 1)
    } else if (evType === 'status' && /requeue|retry|repair/.test(evMsg)) {
      boundaries.push(i + 1)
    }
  }

  // Build attempt summaries
  const attempts: AttemptSummary[] = []
  const slices = [0, ...boundaries, events.length]

  for (let n = 0; n < slices.length - 1; n++) {
    const start = slices[n]
    const end = slices[n + 1]
    const sliceEvents = events.slice(start, end)
    const attemptNumber = n + 1
    const attemptId = `a${attemptNumber}`
    const isLast = n === slices.length - 2

    const startedAt = sliceEvents.find((e) => e.ts)?.ts
    const endedAt = isLast ? undefined : sliceEvents.at(-1)?.ts

    // Infer status: last attempt mirrors run state; prior attempts are complete/failed
    let status: AttemptSummary['status'] = isLast ? 'running' : 'failed'
    if (!isLast) {
      // closed attempt — assume failed unless a succeeded event is present
      const hasSuccess = sliceEvents.some((e) => {
        const t = String(e.type || '').toLowerCase()
        const s = String(e.status || '').toLowerCase()
        const m = String(e.message || '').toLowerCase()
        return t === 'success' || s === 'succeeded' || m.includes('succeeded') || m.includes('completed')
      })
      status = hasSuccess ? 'succeeded' : 'failed'
    }

    // triggerReason
    let triggerReason: AttemptSummary['triggerReason']
    if (n === 0) {
      triggerReason = 'initial'
    } else {
      const boundaryEvent = events[boundaries[n - 1] - 1]
      if (boundaryEvent) {
        const bMsg = String(boundaryEvent.message || '').toLowerCase()
        triggerReason = /repair/.test(bMsg) ? 'repair' : 'requeue'
      } else {
        triggerReason = 'requeue'
      }
    }

    attempts.push({
      attemptId,
      attemptNumber,
      startedAt,
      endedAt,
      status,
      triggerReason,
    })
  }

  // Always return at least one attempt
  if (attempts.length === 0) {
    attempts.push({
      attemptId: 'a1',
      attemptNumber: 1,
      startedAt: undefined,
      endedAt: undefined,
      status: 'running',
      triggerReason: 'initial',
    })
  }

  return attempts
}

/**
 * Tag each event with the attemptId it belongs to based on attempt boundaries.
 * Returns a new array (events are not mutated).
 */
export function tagEventsWithAttemptId(
  _runId: string,
  events: RunEvent[],
  attempts: AttemptSummary[],
): RunEvent[] {
  if (!attempts.length) return events

  // Build boundary timestamps: attempt N owns events from attempts[N-1].startedAt
  // up to (but not including) attempts[N].startedAt.
  // Since we don't have index-level boundaries from the store, we derive them
  // by scanning events chronologically — same logic as deriveAttemptsFromEvents.
  const boundaries: number[] = []
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    const evType = String(ev.type || '').toLowerCase()
    const evMsg = String(ev.message || '').toLowerCase()
    if (evType === 'requeue') {
      boundaries.push(i + 1)
    } else if (evType === 'status' && /requeue|retry|repair/.test(evMsg)) {
      boundaries.push(i + 1)
    }
  }

  const sliceStarts = [0, ...boundaries]
  return events.map((ev, i) => {
    // Find which slice this event index belongs to
    let sliceIdx = 0
    for (let s = sliceStarts.length - 1; s >= 0; s--) {
      if (i >= sliceStarts[s]) {
        sliceIdx = s
        break
      }
    }
    const attempt = attempts[sliceIdx]
    const attemptId = attempt?.attemptId ?? attempts.at(-1)?.attemptId ?? 'a1'
    if (ev.attemptId === attemptId) return ev
    return { ...ev, attemptId }
  })
}
