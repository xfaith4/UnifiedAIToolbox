import { describe, expect, it } from 'vitest'
import { validateA2AEnvelope, A2A_ENVELOPE_VERSION } from '../a2aEnvelope'

function baseEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    envelope_version: A2A_ENVELOPE_VERSION,
    message_id: 'msg_01',
    run_id: 'run_test',
    from_agent: 'Engineer',
    to_agent: 'Critic',
    intent: 'handoff',
    status: 'running',
    ts: new Date().toISOString(),
    payload: {},
    ...overrides,
  }
}

describe('validateA2AEnvelope', () => {
  it('accepts a well-formed handoff envelope', () => {
    const result = validateA2AEnvelope(baseEnvelope())
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.envelope?.from_agent).toBe('Engineer')
  })

  it('rejects a malformed envelope (not an object)', () => {
    const result = validateA2AEnvelope('not-an-envelope')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('envelope must be an object')
  })

  it('reports each missing required field', () => {
    const result = validateA2AEnvelope({})
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('envelope_version'))).toBe(true)
    expect(result.errors.some((e) => e.includes('message_id'))).toBe(true)
    expect(result.errors.some((e) => e.includes('run_id'))).toBe(true)
    expect(result.errors.some((e) => e.includes('from_agent'))).toBe(true)
    expect(result.errors.some((e) => e.includes('to_agent'))).toBe(true)
    expect(result.errors.some((e) => e.includes('ts'))).toBe(true)
    expect(result.errors.some((e) => e.includes('intent'))).toBe(true)
    expect(result.errors.some((e) => e.includes('status'))).toBe(true)
  })

  it('rejects an unknown status string', () => {
    const result = validateA2AEnvelope(baseEnvelope({ status: 'ALL_GOOD' }))
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('status must be one of'))).toBe(true)
  })

  it('rejects an unknown intent string', () => {
    const result = validateA2AEnvelope(baseEnvelope({ intent: 'gossip' }))
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('intent must be one of'))).toBe(true)
  })

  it('requires blocker when intent="blocker"', () => {
    const result = validateA2AEnvelope(baseEnvelope({ intent: 'blocker' }))
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('blocker is required'))).toBe(true)
  })

  it('accepts a well-formed blocker envelope', () => {
    const result = validateA2AEnvelope(
      baseEnvelope({
        intent: 'blocker',
        status: 'blocked',
        blocker: {
          severity: 'hard_blocker',
          code: 'MISSING_CREDENTIAL_OPENAI',
          summary: 'OPENAI_API_KEY not provided',
        },
      })
    )
    expect(result.valid).toBe(true)
  })

  it('rejects a final envelope missing required fields', () => {
    const result = validateA2AEnvelope(
      baseEnvelope({
        intent: 'final',
        status: 'completed',
        final: { requested_objective: 'do thing' },
      })
    )
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('final.completed_deliverables'))).toBe(true)
    expect(result.errors.some((e) => e.includes('final.validation_status'))).toBe(true)
  })

  it('rejects a bad envelope_version', () => {
    const result = validateA2AEnvelope(baseEnvelope({ envelope_version: 'one-point-oh' }))
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('envelope_version'))).toBe(true)
  })

  it('rejects a non-ISO ts', () => {
    const result = validateA2AEnvelope(baseEnvelope({ ts: 'yesterday' }))
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('ts'))).toBe(true)
  })
})
