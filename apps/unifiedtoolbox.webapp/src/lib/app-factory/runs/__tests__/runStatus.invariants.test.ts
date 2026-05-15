import { describe, expect, it } from 'vitest'
import { CANONICAL_RUN_STATUSES, isTerminalStatus, type CanonicalRunStatus } from '../manifest'

describe('canonical run status invariants', () => {
  it('contains exactly the documented statuses', () => {
    expect([...CANONICAL_RUN_STATUSES].sort()).toEqual(
      [
        'blocked',
        'completed',
        'failed',
        'queued',
        'recovering',
        'running',
        'validating',
        'waiting_on_input',
      ].sort()
    )
  })

  it('terminal statuses are exactly completed and failed', () => {
    const terminal = CANONICAL_RUN_STATUSES.filter((s: CanonicalRunStatus) => isTerminalStatus(s))
    expect([...terminal].sort()).toEqual(['completed', 'failed'])
  })

  it('every status is a string with no whitespace', () => {
    for (const s of CANONICAL_RUN_STATUSES) {
      expect(typeof s).toBe('string')
      expect(s).not.toMatch(/\s/)
    }
  })
})
