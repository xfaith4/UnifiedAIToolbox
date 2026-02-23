import { describe, expect, it } from 'vitest'
import { classifyCheck, evaluateAcceptanceChecks, aggregateStatus } from '../evaluateChecks'

describe('classifyCheck', () => {
  it('maps build-related checks to build_check evaluator', () => {
    const { evaluator, command } = classifyCheck('Build passes with exit code 0')
    expect(evaluator).toBe('build_check')
    expect(command).toBe('npm run build')
  })

  it('maps lint-related checks to lint_check evaluator', () => {
    const { evaluator, command } = classifyCheck('No high-severity findings in lint')
    expect(evaluator).toBe('lint_check')
    expect(command).toBe('npm run lint')
  })

  it('maps test-related checks to test_check evaluator', () => {
    const { evaluator, command } = classifyCheck('All tests pass')
    expect(evaluator).toBe('test_check')
    expect(command).toBe('npm test')
  })

  it('maps HTTP health checks to http_probe evaluator (no command)', () => {
    const { evaluator, command } = classifyCheck('API returns 200 on /health')
    expect(evaluator).toBe('http_probe')
    expect(command).toBeNull()
  })

  it('falls back to commissioner_score for abstract checks', () => {
    const { evaluator, command } = classifyCheck('Commissioner score >= 4')
    expect(evaluator).toBe('commissioner_score')
    expect(command).toBeNull()
  })

  it('falls back to commissioner_score for unrecognized checks', () => {
    const { evaluator, command } = classifyCheck('Some custom acceptance criterion')
    expect(evaluator).toBe('commissioner_score')
    expect(command).toBeNull()
  })
})

describe('evaluateAcceptanceChecks', () => {
  it('returns empty array for empty input', () => {
    expect(evaluateAcceptanceChecks([])).toEqual([])
  })

  it('marks shell-command checks as deferred with correct command', () => {
    const results = evaluateAcceptanceChecks(['Build passes with exit code 0'])
    expect(results).toHaveLength(1)
    expect(results[0].result).toBe('deferred')
    expect(results[0].evaluator).toBe('build_check')
    expect(results[0].command).toBe('npm run build')
    expect(results[0].details).toContain('npm run build')
  })

  it('marks abstract checks as deferred without a command', () => {
    const results = evaluateAcceptanceChecks(['Commissioner score >= 4'])
    expect(results).toHaveLength(1)
    expect(results[0].result).toBe('deferred')
    expect(results[0].command).toBeUndefined()
  })

  it('preserves the original check string', () => {
    const check = 'Build succeeds'
    const results = evaluateAcceptanceChecks([check])
    expect(results[0].check).toBe(check)
  })

  it('handles multiple checks', () => {
    const checks = ['Build passes with exit code 0', 'All tests pass', 'API returns 200 on /health']
    const results = evaluateAcceptanceChecks(checks)
    expect(results).toHaveLength(3)
    expect(results.every((r) => r.result === 'deferred')).toBe(true)
  })
})

describe('aggregateStatus', () => {
  it('returns pending for empty checks', () => {
    expect(aggregateStatus([])).toBe('pending')
  })

  it('returns passed when all checks pass', () => {
    const checks = [
      { check: 'a', evaluator: 'x', result: 'passed' as const, details: '' },
      { check: 'b', evaluator: 'x', result: 'passed' as const, details: '' },
    ]
    expect(aggregateStatus(checks)).toBe('passed')
  })

  it('returns failed when all checks fail and none pass', () => {
    const checks = [
      { check: 'a', evaluator: 'x', result: 'failed' as const, details: '' },
      { check: 'b', evaluator: 'x', result: 'failed' as const, details: '' },
    ]
    expect(aggregateStatus(checks)).toBe('failed')
  })

  it('returns partial when some checks fail and some pass', () => {
    const checks = [
      { check: 'a', evaluator: 'x', result: 'passed' as const, details: '' },
      { check: 'b', evaluator: 'x', result: 'failed' as const, details: '' },
    ]
    expect(aggregateStatus(checks)).toBe('partial')
  })

  it('returns deferred when all checks are deferred', () => {
    const checks = [
      { check: 'a', evaluator: 'x', result: 'deferred' as const, details: '' },
    ]
    expect(aggregateStatus(checks)).toBe('deferred')
  })

  it('returns partial when some pass and some are deferred with failures', () => {
    const checks = [
      { check: 'a', evaluator: 'x', result: 'passed' as const, details: '' },
      { check: 'b', evaluator: 'x', result: 'failed' as const, details: '' },
      { check: 'c', evaluator: 'x', result: 'deferred' as const, details: '' },
    ]
    expect(aggregateStatus(checks)).toBe('partial')
  })
})
