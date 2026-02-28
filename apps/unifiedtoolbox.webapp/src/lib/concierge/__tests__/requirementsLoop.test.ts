import { describe, expect, it } from 'vitest'
import { buildRequirementsRequestPrompt } from '@/lib/concierge/requirementsLoop'
import { TERMINAL_RUN_STATUSES } from '@/lib/services/conciergeRunService'

describe('requirements loop helpers', () => {
  it('builds concise concierge questions packet from blockers', () => {
    const text = buildRequirementsRequestPrompt({
      summary: 'Need measurable interactions before implementation.',
      blockers: [
        {
          id: 'interactions_measurable',
          question: 'Define 4 interactions and measurable state changes.',
          why: 'Needed for falsifiable acceptance checks.',
          defaults: ['toggle mode', 'increment metric'],
        },
      ],
      proposed_acceptance_tests: ['At least 4 interactions update visible numeric state'],
    })
    expect(text).toBeTruthy()
    expect(text).toContain('blocked pending your input')
    expect(text).toContain('Define 4 interactions')
    expect(text).toContain('Proposed acceptance tests')
  })

  it('treats blocked requirements as terminal non-failure state', () => {
    expect(TERMINAL_RUN_STATUSES.has('blocked_requirements')).toBe(true)
    expect(TERMINAL_RUN_STATUSES.has('needs_requirements')).toBe(true)
  })
})
