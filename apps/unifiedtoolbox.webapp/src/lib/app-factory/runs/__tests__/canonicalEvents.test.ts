import path from 'path'
import os from 'os'
import { promises as fs } from 'fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  appendEvent,
  readEvents,
  sliceEventsFromCursor,
  CANONICAL_EVENT_TYPES,
  CANONICAL_EVENTS_FILENAME,
  type CanonicalEvent,
} from '../canonicalEvents'

async function makeTmpRoot(prefix = 'canonical-events-'): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

describe('canonicalEvents', () => {
  let rootDir: string

  beforeEach(async () => {
    rootDir = await makeTmpRoot()
  })
  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true })
  })

  it('appends a canonical event and stamps event_id + timestamp', async () => {
    const event = await appendEvent(
      {
        run_id: 'run-a',
        event_type: 'run_started',
        severity: 'info',
        message: 'starting',
      },
      { rootDir }
    )
    expect(event.event_id).toMatch(/[0-9a-f-]{8,}/)
    expect(event.timestamp).toMatch(/T/)
    expect(event.run_id).toBe('run-a')

    const file = path.join(rootDir, 'run-a', CANONICAL_EVENTS_FILENAME)
    const raw = await fs.readFile(file, 'utf8')
    expect(raw.split('\n').filter(Boolean)).toHaveLength(1)
  })

  it('rejects unknown event_type by default', async () => {
    await expect(
      appendEvent(
        {
          run_id: 'run-b',
          // @ts-expect-error - intentional bad value
          event_type: 'totally_made_up',
          severity: 'info',
          message: 'nope',
        },
        { rootDir }
      )
    ).rejects.toThrow(/Unknown event_type/)
  })

  it('redacts apparent secrets in messages and data', async () => {
    const event = await appendEvent(
      {
        run_id: 'run-c',
        event_type: 'agent_progress',
        severity: 'info',
        message: 'Using token=abc123 and Bearer skret',
        data: { api_key: 'sk-abcdefghijk', other: 'fine', authorization: 'Bearer real-token-here' },
      },
      { rootDir }
    )
    expect(event.message).not.toContain('abc123')
    expect(event.message).toContain('[REDACTED]')
    expect(event.data?.api_key).toBe('[REDACTED]')
    expect(event.data?.authorization).toBe('[REDACTED]')
    expect(event.data?.other).toBe('fine')
  })

  it('readEvents returns events in insertion order', async () => {
    for (const type of ['run_created', 'run_queued', 'run_started', 'run_completed'] as const) {
      await appendEvent({ run_id: 'run-d', event_type: type, severity: 'info', message: type }, { rootDir })
    }
    const events = await readEvents('run-d', { rootDir })
    expect(events.map((e) => e.event_type)).toEqual([
      'run_created',
      'run_queued',
      'run_started',
      'run_completed',
    ])
  })

  it('sliceEventsFromCursor slices strictly after the matching id', () => {
    const events: CanonicalEvent[] = [
      { event_id: 'a', run_id: 'r', timestamp: '2026-01-01T00:00:00Z', event_type: 'run_started', severity: 'info', message: 'a' },
      { event_id: 'b', run_id: 'r', timestamp: '2026-01-01T00:01:00Z', event_type: 'agent_started', severity: 'info', message: 'b' },
      { event_id: 'c', run_id: 'r', timestamp: '2026-01-01T00:02:00Z', event_type: 'agent_completed', severity: 'info', message: 'c' },
    ]
    const sliced = sliceEventsFromCursor(events, { afterEventId: 'a' })
    expect(sliced.map((e) => e.event_id)).toEqual(['b', 'c'])
  })

  it('sliceEventsFromCursor falls back to afterTimestamp when id is missing', () => {
    const events: CanonicalEvent[] = [
      { event_id: 'a', run_id: 'r', timestamp: '2026-01-01T00:00:00Z', event_type: 'run_started', severity: 'info', message: 'a' },
      { event_id: 'b', run_id: 'r', timestamp: '2026-01-01T00:05:00Z', event_type: 'agent_started', severity: 'info', message: 'b' },
    ]
    const sliced = sliceEventsFromCursor(events, {
      afterEventId: 'unknown',
      afterTimestamp: '2026-01-01T00:02:00Z',
    })
    expect(sliced.map((e) => e.event_id)).toEqual(['b'])
  })

  it('canonical event-type list matches the contract', () => {
    expect(CANONICAL_EVENT_TYPES).toContain('run_created')
    expect(CANONICAL_EVENT_TYPES).toContain('run_completed')
    expect(CANONICAL_EVENT_TYPES).toContain('agent_blocked')
    expect(CANONICAL_EVENT_TYPES).toContain('validation_completed')
  })

  it('handles concurrent appends without losing events', async () => {
    const runId = 'run-concurrent'
    const total = 25
    await Promise.all(
      Array.from({ length: total }, (_, i) =>
        appendEvent(
          {
            run_id: runId,
            event_type: 'agent_progress',
            severity: 'info',
            message: `tick-${i}`,
          },
          { rootDir }
        )
      )
    )
    const events = await readEvents(runId, { rootDir })
    expect(events).toHaveLength(total)
    const ids = new Set(events.map((e) => e.event_id))
    expect(ids.size).toBe(total)
  })
})
