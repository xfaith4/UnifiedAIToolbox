import { describe, expect, it } from 'vitest'
import { isValidRunId } from '../runStatus'

describe('isValidRunId', () => {
  it('accepts simple run ids', () => {
    expect(isValidRunId('maint-2026-02-07')).toBe(true)
    expect(isValidRunId('run_ABC-123')).toBe(true)
  })

  it('rejects traversal or invalid characters', () => {
    expect(isValidRunId('../evil')).toBe(false)
    expect(isValidRunId('..\\evil')).toBe(false)
    expect(isValidRunId('run/evil')).toBe(false)
    expect(isValidRunId('run:evil')).toBe(false)
  })
})
