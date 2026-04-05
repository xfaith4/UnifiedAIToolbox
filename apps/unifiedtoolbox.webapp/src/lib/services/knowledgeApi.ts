'use client'

// API base — mirrors orchestratorApi.ts
const API_BASE_FROM_ENV = (process.env.NEXT_PUBLIC_API_BASE ?? process.env.NEXT_PUBLIC_PROMPT_API_BASE ?? '').trim()
const API_BASE = (API_BASE_FROM_ENV || 'http://localhost:8000').replace(/\/$/, '')

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KnowledgeEntry {
  run_id: string
  ingested_at: string
  goal: string
  goal_tokens: string[]
  status: string
  verification_status?: string | null
  knowledge_status?: 'pass' | 'needs_info' | 'fail'
  knowledge_score?: number | null
  learning?: {
    classification?: string
    what_broke?: string
    root_cause?: string
    evidence?: string[]
    prevention_patches?: Array<{ target: string; change: string; artifact_ref?: string }>
    regression_checks?: string[]
    questions_needed?: string[]
    corrective_actions?: Array<{
      type?: string
      agent?: string
      status?: string
      summary?: string
      question?: string
      response?: string | null
      requested_at?: string | null
      responded_at?: string | null
      resolved_by?: string | null
      answers?: Array<{ blocker_id?: string; question?: string; answer: string }>
    }>
    instruction_adjustments?: Array<{
      agent?: string
      suggestion: string
      timestamp?: string | null
      source?: string
    }>
  }
  checkpoint_history?: Array<{
    id?: string
    agent?: string
    question?: string
    status?: string
    response?: string | null
    requested_at?: string | null
    responded_at?: string | null
    resolved_by?: string | null
    answers?: Array<{ blocker_id?: string; question?: string; answer: string }>
  }>
  corrective_actions?: Array<{
    type?: string
    agent?: string
    status?: string
    summary?: string
    question?: string
    response?: string | null
    requested_at?: string | null
    responded_at?: string | null
    resolved_by?: string | null
    answers?: Array<{ blocker_id?: string; question?: string; answer: string }>
  }>
  instruction_adjustments?: Array<{
    agent?: string
    suggestion: string
    timestamp?: string | null
    source?: string
  }>
  agents: string[]
  model: string
  synthesis_present: boolean
  commissioner_score?: number | null
  commissioner_recommendation?: string
  commissioner_rationale?: string
  commissioner_improvements?: string[]
  critic_blockers?: string[]
  critic_ratings?: Record<string, number>
  researcher_facts?: string[]
  overseer_warnings?: string[]
  acceptance_checks_summary?: {
    passed: number
    failed: number
    deferred: number
  } | null
  // Added by query_knowledge_similar
  _similarity?: number
}

export interface RunDnaEntry {
  agents: string[]
  avg_score: number | null
  run_count: number
  success_rate: number
  model: string
}

export interface RunDnaResponse {
  goal_category: string
  best_config: RunDnaEntry | null
  configs: RunDnaEntry[]
}

// ── API calls ─────────────────────────────────────────────────────────────────

/**
 * Fetch all knowledge base entries (most recent first).
 */
export async function fetchKnowledgeEntries(): Promise<KnowledgeEntry[]> {
  const res = await fetch(`${API_BASE}/knowledge/entries`)
  if (!res.ok) throw new Error(`Knowledge entries fetch failed: ${res.status}`)
  const data = await res.json()
  return ((data.entries ?? []) as KnowledgeEntry[]).map(normalizeKnowledgeEntry)
}

/**
 * Fetch knowledge entries similar to a given goal (≥20% token overlap).
 */
export async function fetchSimilarKnowledge(goal: string, limit = 5): Promise<KnowledgeEntry[]> {
  const params = new URLSearchParams({ goal, limit: String(limit) })
  const res = await fetch(`${API_BASE}/knowledge/similar?${params}`)
  if (!res.ok) throw new Error(`Knowledge similar fetch failed: ${res.status}`)
  const data = await res.json()
  return ((data.entries ?? []) as KnowledgeEntry[]).map(normalizeKnowledgeEntry)
}

/**
 * Fetch Run DNA — recommended agent config for a given goal.
 */
export async function fetchRunDna(goal: string): Promise<RunDnaResponse> {
  const params = new URLSearchParams({ goal })
  const res = await fetch(`${API_BASE}/knowledge/run-dna?${params}`)
  if (!res.ok) throw new Error(`Run DNA fetch failed: ${res.status}`)
  return res.json() as Promise<RunDnaResponse>
}

function normalizeKnowledgeEntry(entry: KnowledgeEntry): KnowledgeEntry {
  const normalizedStatus = entry.knowledge_status ?? inferKnowledgeStatus(entry)
  return {
    ...entry,
    knowledge_status: normalizedStatus,
    learning: entry.learning
      ? {
          ...entry.learning,
          evidence: Array.isArray(entry.learning.evidence) ? entry.learning.evidence : [],
          prevention_patches: Array.isArray(entry.learning.prevention_patches) ? entry.learning.prevention_patches : [],
          regression_checks: Array.isArray(entry.learning.regression_checks) ? entry.learning.regression_checks : [],
          questions_needed: Array.isArray(entry.learning.questions_needed) ? entry.learning.questions_needed : [],
          corrective_actions: Array.isArray(entry.learning.corrective_actions) ? entry.learning.corrective_actions : [],
          instruction_adjustments: Array.isArray(entry.learning.instruction_adjustments) ? entry.learning.instruction_adjustments : [],
        }
      : undefined,
    checkpoint_history: Array.isArray(entry.checkpoint_history) ? entry.checkpoint_history : [],
    corrective_actions: Array.isArray(entry.corrective_actions) ? entry.corrective_actions : [],
    instruction_adjustments: Array.isArray(entry.instruction_adjustments) ? entry.instruction_adjustments : [],
  }
}

function inferKnowledgeStatus(entry: KnowledgeEntry): 'pass' | 'needs_info' | 'fail' {
  const patches = entry.learning?.prevention_patches
  if (Array.isArray(patches) && patches.length > 0) return 'pass'
  const hasWarnings = Array.isArray(entry.overseer_warnings) && entry.overseer_warnings.length > 0
  if (hasWarnings || entry.verification_status === 'failed') return 'needs_info'
  return 'needs_info'
}
