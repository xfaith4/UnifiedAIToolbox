/**
 * Decision Lock — blocker severity classification.
 *
 * Source of truth (human-readable): docs/contracts/DECISION_LOCK.md
 *
 * Naming note: there is an unrelated module at
 *   src/lib/app-factory/parallel/decisionLock.ts
 * that handles *repo-contract* locking. That is a different concept. This module
 * is the *blocker-severity* decision lock.
 *
 * Pure, no IO, no side effects.
 */

export type BlockerSeverity =
  | 'hard_blocker'
  | 'soft_blocker'
  | 'clarification_needed'
  | 'non_blocking_gap'

export const BLOCKER_SEVERITIES: readonly BlockerSeverity[] = [
  'hard_blocker',
  'soft_blocker',
  'clarification_needed',
  'non_blocking_gap',
] as const

export interface BlockerLike {
  severity?: string | BlockerSeverity
  code?: string
  summary?: string
  details?: string
  needed_from?: string
  options?: string[]
}

const HARD_CODE_PREFIXES = ['FATAL_', 'MISSING_CREDENTIAL', 'UNAUTHORIZED', 'BUDGET_EXCEEDED']
const CLARIFY_CODE_PREFIXES = ['CLARIFY_']
const CLARIFY_CODE_SUFFIXES = ['_AMBIGUOUS']
const SOFT_CODE_SUFFIXES = ['_FLAKY', '_TIMEOUT', '_RATE_LIMIT']

function startsWithAny(s: string, prefixes: readonly string[]): boolean {
  for (const p of prefixes) if (s.startsWith(p)) return true
  return false
}

function endsWithAny(s: string, suffixes: readonly string[]): boolean {
  for (const sfx of suffixes) if (s.endsWith(sfx)) return true
  return false
}

/**
 * Classify a blocker payload into a canonical severity.
 *
 * Precedence:
 *   1. Explicit `severity` if valid
 *   2. `code` heuristics
 *   3. `needed_from === 'user'` -> clarification_needed
 *   4. Fallback to non_blocking_gap
 */
export function classifyBlocker(blocker: BlockerLike | null | undefined): BlockerSeverity {
  if (!blocker || typeof blocker !== 'object') return 'non_blocking_gap'

  const explicit = String(blocker.severity || '').trim()
  if (BLOCKER_SEVERITIES.includes(explicit as BlockerSeverity)) {
    return explicit as BlockerSeverity
  }

  const code = String(blocker.code || '').trim().toUpperCase()
  if (code) {
    if (code === 'NEEDS_INPUT') return 'clarification_needed'
    if (startsWithAny(code, HARD_CODE_PREFIXES)) return 'hard_blocker'
    if (startsWithAny(code, CLARIFY_CODE_PREFIXES) || endsWithAny(code, CLARIFY_CODE_SUFFIXES)) {
      return 'clarification_needed'
    }
    if (endsWithAny(code, SOFT_CODE_SUFFIXES)) return 'soft_blocker'
  }

  if (String(blocker.needed_from || '').toLowerCase() === 'user') {
    return 'clarification_needed'
  }

  return 'non_blocking_gap'
}

/**
 * Default recovery strategy for a severity, per docs/contracts/DECISION_LOCK.md §3.
 * Orchestrator may override.
 */
export function defaultRecoveryStrategy(severity: BlockerSeverity):
  | 'retry'
  | 'retry_with_changes'
  | 'skip'
  | 'escalate'
  | 'abort' {
  switch (severity) {
    case 'hard_blocker':
      return 'escalate'
    case 'soft_blocker':
      return 'retry_with_changes'
    case 'clarification_needed':
      return 'escalate'
    case 'non_blocking_gap':
      return 'skip'
  }
}
