'use client'

import type { OrchestrationRun } from '@/lib/types/orchestrator'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PastRunInsight {
  runId: string
  goal: string
  status: string
  requestedAt: string | null
  similarity: number           // 0–1 keyword overlap score
  overseerWarnings: string[]   // overseer:warn / overseer:critical event messages
  overseerActions: string[]    // overseer:action event messages (reclassifications etc.)
  agentErrors: string[]        // overseer:warn messages that contain agent output errors
  runErrors: string[]          // error-type event messages
  isFailure: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Tokenise text into meaningful words (length > 3, lowercased). */
function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/\W+/).filter((t) => t.length > 3))
}

/** Jaccard-like overlap: shared tokens / max(|A|, |B|). */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  return shared / Math.max(a.size, b.size, 1)
}

const FAILURE_STATUSES = new Set([
  'error:CalledProcessError',
  'failed',
  'cancelled',
  'error',
  'completed_with_errors',
])

function extractInsight(run: OrchestrationRun): Omit<PastRunInsight, 'similarity'> {
  const events = run.events ?? []

  const overseerWarnings = events
    .filter((e) => e.type === 'overseer:warn' || e.type === 'overseer:critical')
    .map((e) => e.message)

  const overseerActions = events
    .filter((e) => e.type === 'overseer:action')
    .map((e) => e.message)

  // Agent output errors are overseer:warn events that contain "agent_output_error"
  const agentErrors = overseerWarnings.filter((m) => m.includes('agent_output_error'))

  const runErrors = events
    .filter((e) => e.type === 'error')
    .map((e) => e.message)

  return {
    runId: run.id,
    goal: run.goal ?? '',
    status: run.status ?? 'unknown',
    requestedAt: run.requestedAt ?? null,
    overseerWarnings,
    overseerActions,
    agentErrors,
    runErrors,
    isFailure: FAILURE_STATUSES.has(run.status ?? ''),
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Find runs with goals semantically similar to the given goal.
 * Returns up to `limit` results sorted by similarity descending.
 * Only includes runs with ≥20% token overlap to avoid noise.
 */
export function findSimilarRuns(
  goal: string,
  runs: OrchestrationRun[],
  limit = 4,
): PastRunInsight[] {
  const goalTokens = tokenize(goal)
  if (goalTokens.size === 0) return []

  return runs
    .filter((r) => r.goal) // only goal-based runs
    .map((run) => {
      const insight = extractInsight(run)
      const sim = jaccardSimilarity(goalTokens, tokenize(insight.goal))
      return { ...insight, similarity: sim }
    })
    .filter((r) => r.similarity >= 0.2)
    .sort(
      (a, b) =>
        b.similarity - a.similarity ||
        (b.requestedAt ?? '').localeCompare(a.requestedAt ?? ''),
    )
    .slice(0, limit)
}

/**
 * Build a past-run context block to inject into the Concierge system prompt.
 * Returns empty string if there are no relevant insights.
 */
export function buildRunHistoryPrompt(insights: PastRunInsight[]): string {
  if (!insights.length) return ''

  const lines: string[] = [
    '',
    '---',
    '## Past Orchestration Run Context',
    'The following historical runs are relevant to this goal. Use them to give the user',
    'proactive, specific advice — surface failure patterns and recommend concrete goal refinements',
    'BEFORE generating a proposal. Do not dump raw data; reason about it naturally.',
    '',
  ]

  for (const r of insights) {
    const pct = Math.round(r.similarity * 100)
    lines.push(`### Run (${pct}% goal match): "${r.goal.slice(0, 140)}"`)
    lines.push(`Status: ${r.status}`)

    if (r.runErrors.length) {
      lines.push(`System errors: ${r.runErrors.slice(0, 2).join(' | ')}`)
    }
    if (r.agentErrors.length) {
      lines.push(`Agent output errors (Overseer detected): ${r.agentErrors.slice(0, 3).join(' | ')}`)
    }
    if (r.overseerWarnings.filter((m) => !m.includes('agent_output_error')).length) {
      const others = r.overseerWarnings.filter((m) => !m.includes('agent_output_error'))
      lines.push(`Overseer warnings: ${others.slice(0, 2).join(' | ')}`)
    }
    if (r.overseerActions.length) {
      lines.push(`Overseer actions: ${r.overseerActions.slice(0, 2).join(' | ')}`)
    }
    lines.push('')
  }

  lines.push(
    'Your job with this context:',
    '1. Identify which parts of the user\'s goal likely caused these past failures.',
    '2. Ask for — or recommend — the specific clarifications that would prevent recurrence.',
    '3. If the goal is vague (e.g. undefined success criteria, missing safety constraints),',
    '   highlight this and suggest how to make it more precise before proceeding.',
    '---',
  )

  return lines.join('\n')
}
