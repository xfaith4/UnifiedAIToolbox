import { describe, expect, it } from 'vitest'
import { getBufferedEvents, subscribeRunEvents, emitRunEvent } from '../runEvents'

describe('runEvents', () => {
  it('buffers and publishes events', async () => {
    const runId = 'test-run-events'
    const received: string[] = []
    const unsub = subscribeRunEvents(runId, (event) => received.push(event.message))
    await emitRunEvent({ runId, phase: 'normalize', status: 'running', message: 'normalizing' })
    unsub()

    const buffered = getBufferedEvents(runId)
    expect(received).toContain('normalizing')
    expect(buffered.some((event) => event.phase === 'normalize')).toBe(true)
  })
})
