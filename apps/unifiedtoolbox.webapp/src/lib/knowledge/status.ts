export type KnowledgeStatus = 'pass' | 'needs_info' | 'fail'

export function normalizeKnowledgeStatus(status: string | null | undefined): KnowledgeStatus {
  const value = String(status ?? '').toLowerCase()
  if (value === 'pass' || value === 'needs_info' || value === 'fail') return value
  return 'needs_info'
}

export function formatRunResultLabel(v: string | null | undefined): string {
  const value = String(v ?? 'pending').toLowerCase()
  if (value === 'needs_requirements' || value === 'blocked_requirements') return 'Run: BLOCKED REQUIREMENTS'
  if (value === 'passed') return 'Run: PASSED'
  if (value === 'failed') return 'Run: FAILED'
  if (value === 'deferred') return 'Run: DEFERRED'
  if (value === 'partial') return 'Run: CONDITIONAL'
  return 'Run: PENDING'
}
