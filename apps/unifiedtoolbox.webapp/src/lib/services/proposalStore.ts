'use client'

import type { Proposal, DraftRunConfig, ProposalStatus } from '@/lib/types/proposal'

const PROPOSALS_KEY = 'concierge.proposals.v1'
const DRAFT_RUNS_KEY = 'concierge.draft-runs.v1'

// ── Helpers ───────────────────────────────────────────────────────────────────

function load<T>(key: string): T[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

function save<T>(key: string, items: T[]): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, JSON.stringify(items))
}

export function generateProposalId(): string {
  return `proposal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// ── Proposal CRUD ─────────────────────────────────────────────────────────────

export function listProposals(): Proposal[] {
  return load<Proposal>(PROPOSALS_KEY)
}

export function getProposal(id: string): Proposal | undefined {
  return listProposals().find((p) => p.id === id)
}

export function saveProposal(proposal: Proposal): Proposal {
  const existing = listProposals()
  const idx = existing.findIndex((p) => p.id === proposal.id)
  const updated =
    idx >= 0
      ? existing.map((p) => (p.id === proposal.id ? proposal : p))
      : [proposal, ...existing]
  save(PROPOSALS_KEY, updated)
  return proposal
}

export function updateProposalStatus(id: string, status: ProposalStatus): Proposal | undefined {
  const proposals = listProposals()
  const proposal = proposals.find((p) => p.id === id)
  if (!proposal) return undefined
  const updated = { ...proposal, status, updatedAt: new Date().toISOString() }
  save(
    PROPOSALS_KEY,
    proposals.map((p) => (p.id === id ? updated : p))
  )
  return updated
}

export function deleteProposal(id: string): void {
  save(
    PROPOSALS_KEY,
    listProposals().filter((p) => p.id !== id)
  )
}

// ── Draft run CRUD ────────────────────────────────────────────────────────────

export function listDraftRuns(): DraftRunConfig[] {
  return load<DraftRunConfig>(DRAFT_RUNS_KEY)
}

export function getDraftRun(id: string): DraftRunConfig | undefined {
  return listDraftRuns().find((d) => d.id === id)
}

export function saveDraftRun(draft: DraftRunConfig): DraftRunConfig {
  const existing = listDraftRuns()
  const idx = existing.findIndex((d) => d.id === draft.id)
  const updated =
    idx >= 0
      ? existing.map((d) => (d.id === draft.id ? draft : d))
      : [draft, ...existing]
  save(DRAFT_RUNS_KEY, updated)
  return draft
}

/**
 * Create and save a DraftRunConfig from an approved Proposal.
 */
export function createDraftRunFromProposal(proposal: Proposal): DraftRunConfig {
  const draft: DraftRunConfig = {
    id: proposal.id,
    proposalId: proposal.id,
    createdAt: new Date().toISOString(),
    goal: proposal.goal.summary,
    mode: proposal.run_recipe?.mode ?? 'multi-agent',
    agents: proposal.run_recipe?.agents ?? proposal.recommended.agents,
    promptId: proposal.run_recipe?.promptId,
    runStatus: 'pending',
  }
  return saveDraftRun(draft)
}
