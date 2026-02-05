import { describe, expect, it } from 'vitest'

import { getOrchestratorRuntime } from '../orchestratorRuntime'

describe('orchestrator snapshot shape', () => {
  it('exposes the expected top-level fields', () => {
    const runtime = getOrchestratorRuntime()
    const snap = runtime.getSnapshot()

    expect(snap).toHaveProperty('session')
    expect(snap).toHaveProperty('history')
    expect(snap).toHaveProperty('isOrchestrating')
    expect(snap).toHaveProperty('isComplete')
    expect(snap).toHaveProperty('pipeline')
    expect(Array.isArray(snap.history)).toBe(true)
  })
})
