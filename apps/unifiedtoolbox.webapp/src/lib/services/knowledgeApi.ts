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
  return (data.entries ?? []) as KnowledgeEntry[]
}

/**
 * Fetch knowledge entries similar to a given goal (≥20% token overlap).
 */
export async function fetchSimilarKnowledge(goal: string, limit = 5): Promise<KnowledgeEntry[]> {
  const params = new URLSearchParams({ goal, limit: String(limit) })
  const res = await fetch(`${API_BASE}/knowledge/similar?${params}`)
  if (!res.ok) throw new Error(`Knowledge similar fetch failed: ${res.status}`)
  const data = await res.json()
  return (data.entries ?? []) as KnowledgeEntry[]
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
