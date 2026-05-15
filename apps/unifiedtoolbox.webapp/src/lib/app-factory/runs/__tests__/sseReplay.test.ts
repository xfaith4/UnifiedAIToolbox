import { describe, expect, it } from 'vitest'
import { sliceEventsFromCursor, toSseFrame, type CanonicalEvent } from '../canonicalEvents'

function ev(id: string, ts: string): CanonicalEvent {
  return {
    event_id: id,
    run_id: 'r',
    timestamp: ts,
    event_type: 'agent_progress',
    severity: 'info',
    message: id,
  }
}

describe('SSE replay helpers', () => {
  const events: CanonicalEvent[] = [
    ev('e1', '2026-01-01T00:00:00Z'),
    ev('e2', '2026-01-01T00:01:00Z'),
    ev('e3', '2026-01-01T00:02:00Z'),
    ev('e4', '2026-01-01T00:03:00Z'),
  ]

  it('replays from a known Last-Event-ID', () => {
    const out = sliceEventsFromCursor(events, { afterEventId: 'e2' })
    expect(out.map((e) => e.event_id)).toEqual(['e3', 'e4'])
  })

  it('returns all when no cursor is provided', () => {
    const out = sliceEventsFromCursor(events, {})
    expect(out).toHaveLength(4)
  })

  it('returns empty when cursor is the last event', () => {
    const out = sliceEventsFromCursor(events, { afterEventId: 'e4' })
    expect(out).toEqual([])
  })

  it('applies limit to tail when set', () => {
    const out = sliceEventsFromCursor(events, { limit: 2 })
    expect(out.map((e) => e.event_id)).toEqual(['e3', 'e4'])
  })

  it('toSseFrame uses event_id on the id: line', () => {
    const frame = toSseFrame(events[0])
    expect(frame).toMatch(/^id: e1\n/)
    expect(frame).toContain('event: agent_progress')
    expect(frame).toContain('"event_id":"e1"')
    expect(frame.endsWith('\n\n')).toBe(true)
  })
})
