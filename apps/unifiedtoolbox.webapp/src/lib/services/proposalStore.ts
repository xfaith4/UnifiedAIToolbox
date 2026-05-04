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

export function updateDraftRun(id: string, updates: Partial<DraftRunConfig>): DraftRunConfig | undefined {
  const drafts = listDraftRuns()
  const draft = drafts.find((d) => d.id === id)
  if (!draft) return undefined
  const updated = { ...draft, ...updates }
  save(DRAFT_RUNS_KEY, drafts.map((d) => (d.id === id ? updated : d)))
  return updated
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
    goal: buildDraftGoalFromProposal(proposal),
    mode: proposal.run_recipe?.mode ?? 'multi-agent',
    agents: proposal.run_recipe?.agents ?? proposal.recommended.agents,
    promptId: proposal.run_recipe?.promptId,
    agentInstructions: proposal.run_recipe?.agentInstructions,
    jobType: proposal.run_recipe?.jobType,
    runStatus: 'pending',
    acceptanceChecks: proposal.acceptance_checks?.length ? proposal.acceptance_checks : undefined,
  }
  return saveDraftRun(draft)
}

function formatListSection(title: string, items: string[]): string | null {
  const cleanItems = items.map((item) => item.trim()).filter(Boolean)
  if (cleanItems.length === 0) return null
  return `${title}:\n${cleanItems.map((item) => `- ${item}`).join('\n')}`
}

function buildDraftGoalFromProposal(proposal: Proposal): string {
  const baseGoal = proposal.run_recipe?.goal?.trim() || proposal.goal.summary.trim()
  const context = proposal.goal.context?.trim()
  const originalRequest = proposal.conversation
    .filter((message) => message.role === 'user')
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join('\n\n')
  const constraints = proposal.inputs.constraints ?? []
  const assumptions = proposal.assumptions?.map((item) => `Assumption: ${item}`) ?? []
  const planSteps = proposal.plan.steps.map((step) => {
    const title = step.title?.trim()
    const description = step.description?.trim()
    if (title && description) return `${title}: ${description}`
    return title || description || ''
  })

  const sections = [
    baseGoal ? `Goal:\n${baseGoal}` : null,
    originalRequest ? `Original user request:\n${originalRequest}` : null,
    context ? `Context:\n${context}` : null,
    formatListSection('Constraints', constraints),
    formatListSection('Plan', planSteps),
    formatListSection('Acceptance checks', proposal.acceptance_checks ?? []),
    formatListSection('Assumptions', assumptions),
  ].filter(Boolean)

  return sections.join('\n\n') || proposal.goal.summary
}
