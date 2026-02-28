import { describe, expect, it } from 'vitest'
import { dedupeEvents, filterEvents, parseNdjsonChunk } from '../runtimeEventUtils'

describe('runtimeEventUtils', () => {
  it('parses ndjson chunk and keeps remainder for partial lines', () => {
    const input = [
      JSON.stringify({ ts: '2026-02-28T18:00:00.000Z', stage: 'gates', type: 'step.progress', msg: 'running' }),
      JSON.stringify({ ts: '2026-02-28T18:00:01.000Z', level: 'warn', stage: 'repair', msg: 'slow pass' }),
      '{"ts":"2026-02-28T18:00:02.000Z"',
    ].join('\n')

    const parsed = parseNdjsonChunk(input, 'run-1')
    expect(parsed.events).toHaveLength(2)
    expect(parsed.events[0].runId).toBe('run-1')
    expect(parsed.remainder).toContain('18:00:02')
  })

  it('filters and dedupes warn/error events', () => {
    const events = [
      { ts: '2026-02-28T18:00:00.000Z', message: 'ok', level: 'info' },
      { ts: '2026-02-28T18:00:01.000Z', message: 'warn threshold', level: 'warn' },
      { ts: '2026-02-28T18:00:02.000Z', message: 'warn threshold', level: 'warn' },
      { ts: '2026-02-28T18:00:03.000Z', message: 'failed lint', level: 'error' },
    ]

    const deduped = dedupeEvents(events)
    expect(deduped).toHaveLength(4)

    const warnErr = filterEvents(deduped, 'warn_error')
    expect(warnErr).toHaveLength(3)

    const errorsOnly = filterEvents(deduped, 'error')
    expect(errorsOnly).toHaveLength(1)
  })
})
