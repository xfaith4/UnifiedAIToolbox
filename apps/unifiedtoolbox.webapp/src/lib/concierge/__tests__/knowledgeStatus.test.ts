import { describe, expect, it } from 'vitest'
import { formatRunResultLabel, normalizeKnowledgeStatus } from '@/lib/knowledge/status'

describe('knowledge badge logic', () => {
  it('formats run result with blocked requirements as non-failure', () => {
    expect(formatRunResultLabel('needs_requirements')).toBe('Run: BLOCKED REQUIREMENTS')
    expect(formatRunResultLabel('blocked_requirements')).toBe('Run: BLOCKED REQUIREMENTS')
    expect(formatRunResultLabel('failed')).toBe('Run: FAILED')
  })

  it('normalizes learning status for badge rendering', () => {
    expect(normalizeKnowledgeStatus('pass')).toBe('pass')
    expect(normalizeKnowledgeStatus('needs_info')).toBe('needs_info')
    expect(normalizeKnowledgeStatus('fail')).toBe('fail')
    expect(normalizeKnowledgeStatus(undefined)).toBe('needs_info')
  })
})
