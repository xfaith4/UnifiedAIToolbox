import { describe, expect, it } from 'vitest'
import { classifyBlocker, defaultRecoveryStrategy } from '../decisionLock'

describe('classifyBlocker', () => {
  it('returns explicit severity when valid', () => {
    expect(classifyBlocker({ severity: 'hard_blocker', code: 'X', summary: 'y' })).toBe('hard_blocker')
    expect(classifyBlocker({ severity: 'soft_blocker', code: 'X', summary: 'y' })).toBe('soft_blocker')
    expect(classifyBlocker({ severity: 'clarification_needed', code: 'X', summary: 'y' })).toBe('clarification_needed')
    expect(classifyBlocker({ severity: 'non_blocking_gap', code: 'X', summary: 'y' })).toBe('non_blocking_gap')
  })

  it('ignores invalid explicit severity and falls through to heuristics', () => {
    expect(classifyBlocker({ severity: 'made_up', code: 'FATAL_BOOM' })).toBe('hard_blocker')
  })

  it('uses code-prefix heuristics for hard blockers', () => {
    expect(classifyBlocker({ code: 'FATAL_NO_DISK' })).toBe('hard_blocker')
    expect(classifyBlocker({ code: 'MISSING_CREDENTIAL_OPENAI' })).toBe('hard_blocker')
    expect(classifyBlocker({ code: 'UNAUTHORIZED_GITHUB' })).toBe('hard_blocker')
    expect(classifyBlocker({ code: 'BUDGET_EXCEEDED' })).toBe('hard_blocker')
  })

  it('uses code suffix heuristics for soft blockers', () => {
    expect(classifyBlocker({ code: 'NET_TIMEOUT' })).toBe('soft_blocker')
    expect(classifyBlocker({ code: 'TEST_FLAKY' })).toBe('soft_blocker')
    expect(classifyBlocker({ code: 'OPENAI_RATE_LIMIT' })).toBe('soft_blocker')
  })

  it('uses code heuristics for clarification', () => {
    expect(classifyBlocker({ code: 'CLARIFY_GOAL' })).toBe('clarification_needed')
    expect(classifyBlocker({ code: 'SCOPE_AMBIGUOUS' })).toBe('clarification_needed')
    expect(classifyBlocker({ code: 'NEEDS_INPUT' })).toBe('clarification_needed')
  })

  it('defaults to clarification_needed when needed_from is user', () => {
    expect(classifyBlocker({ code: 'UNRELATED_CODE', needed_from: 'user' })).toBe('clarification_needed')
  })

  it('falls back to non_blocking_gap for unknown inputs', () => {
    expect(classifyBlocker({ code: 'SOMETHING_ELSE' })).toBe('non_blocking_gap')
    expect(classifyBlocker({})).toBe('non_blocking_gap')
    expect(classifyBlocker(null)).toBe('non_blocking_gap')
    expect(classifyBlocker(undefined)).toBe('non_blocking_gap')
  })

  it('handles lower-cased codes by normalizing', () => {
    expect(classifyBlocker({ code: 'fatal_boom' })).toBe('hard_blocker')
    expect(classifyBlocker({ code: 'net_timeout' })).toBe('soft_blocker')
  })
})

describe('defaultRecoveryStrategy', () => {
  it('maps severities to default strategies', () => {
    expect(defaultRecoveryStrategy('hard_blocker')).toBe('escalate')
    expect(defaultRecoveryStrategy('soft_blocker')).toBe('retry_with_changes')
    expect(defaultRecoveryStrategy('clarification_needed')).toBe('escalate')
    expect(defaultRecoveryStrategy('non_blocking_gap')).toBe('skip')
  })
})
