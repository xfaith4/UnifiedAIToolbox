import { describe, expect, it } from 'vitest'
import { buildRunSuccessContract } from '../a2aEnvelope'

const validInput = {
  requested_objective: 'Add an /events endpoint that streams via SSE.',
  completed_deliverables: ['Endpoint scaffold', 'Subscriber helper'],
  incomplete_items: ['Auth wiring'],
  assumptions_used: ['Single-tenant'],
  blockers_encountered: [],
  artifacts_created: [{ path: 'src/app/api/events/route.ts', kind: 'route' }],
  validation_status: 'partial' as const,
  recommended_next_step: 'Wire auth and re-run validation.',
}

describe('buildRunSuccessContract', () => {
  it('returns a normalized FinalAnswer for well-formed input', () => {
    const result = buildRunSuccessContract(validInput)
    expect(result.requested_objective).toBe(validInput.requested_objective)
    expect(result.completed_deliverables).toEqual(validInput.completed_deliverables)
    expect(result.validation_status).toBe('partial')
    expect(result.artifacts_created).toHaveLength(1)
  })

  it('does not mutate input arrays', () => {
    const result = buildRunSuccessContract(validInput)
    result.completed_deliverables.push('mutated')
    expect(validInput.completed_deliverables).toHaveLength(2)
  })

  it('throws on missing requested_objective', () => {
    expect(() =>
      buildRunSuccessContract({ ...validInput, requested_objective: '' })
    ).toThrow(/requested_objective/)
  })

  it('throws on missing recommended_next_step', () => {
    expect(() =>
      buildRunSuccessContract({ ...validInput, recommended_next_step: '' })
    ).toThrow(/recommended_next_step/)
  })

  it('throws on invalid validation_status', () => {
    expect(() =>
      // @ts-expect-error testing runtime guard
      buildRunSuccessContract({ ...validInput, validation_status: 'YOLO' })
    ).toThrow(/validation_status/)
  })

  it('throws when array fields are not arrays', () => {
    expect(() =>
      // @ts-expect-error testing runtime guard
      buildRunSuccessContract({ ...validInput, completed_deliverables: 'not-an-array' })
    ).toThrow(/completed_deliverables/)
  })

  it('throws when blockers_encountered is missing', () => {
    const { blockers_encountered: _omit, ...rest } = validInput
    expect(() =>
      // @ts-expect-error testing runtime guard
      buildRunSuccessContract(rest)
    ).toThrow(/blockers_encountered/)
  })
})
