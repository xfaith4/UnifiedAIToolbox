import { describe, it, expect, beforeEach } from 'vitest'
import type { Proposal } from '@/lib/types/proposal'

// ── localStorage stub ──────────────────────────────────────────────────────────
// The store uses localStorage directly (not via window), so we provide a
// minimal in-memory stub that satisfies the interface used by the module.
const storage: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => { storage[key] = value },
  removeItem: (key: string) => { delete storage[key] },
  clear: () => { for (const k in storage) delete storage[k] },
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })

// Import AFTER stub is in place
import {
  listProposals,
  saveProposal,
  getProposal,
  updateProposalStatus,
  deleteProposal,
  createDraftRunFromProposal,
  listDraftRuns,
  generateProposalId,
} from '@/lib/services/proposalStore'

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  const now = new Date().toISOString()
  return {
    proposal_version: '1.0',
    id: generateProposalId(),
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    goal: { summary: 'Refactor auth module', context: undefined },
    inputs: { repo: 'my/repo', files: [], constraints: [] },
    plan: { steps: [{ id: '1', title: 'Analyse', description: 'Survey codebase', agent: 'Researcher' }] },
    recommended: { prompts: [], agents: ['Supervisor', 'Engineer'], tools: [] },
    approvals: { required: ['Human review'] },
    acceptance_checks: ['Tests pass'],
    risks: [{ level: 'low', description: 'Scope creep' }],
    estimate: { time: '~5m', cost: '~$0.02' },
    run_recipe: null,
    conversation: [],
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('proposalStore', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  describe('listProposals', () => {
    it('returns empty array when no proposals stored', () => {
      expect(listProposals()).toEqual([])
    })
  })

  describe('saveProposal', () => {
    it('persists a new proposal and returns it', () => {
      const p = makeProposal()
      const saved = saveProposal(p)
      expect(saved.id).toBe(p.id)
      expect(listProposals()).toHaveLength(1)
      expect(listProposals()[0].id).toBe(p.id)
    })

    it('prepends new proposals (most recent first)', () => {
      const p1 = makeProposal()
      const p2 = makeProposal()
      saveProposal(p1)
      saveProposal(p2)
      const list = listProposals()
      expect(list[0].id).toBe(p2.id)
      expect(list[1].id).toBe(p1.id)
    })

    it('updates an existing proposal in-place', () => {
      const p = makeProposal()
      saveProposal(p)
      const updated = { ...p, goal: { summary: 'Updated goal' } }
      saveProposal(updated)
      const list = listProposals()
      expect(list).toHaveLength(1)
      expect(list[0].goal.summary).toBe('Updated goal')
    })
  })

  describe('getProposal', () => {
    it('finds a proposal by id', () => {
      const p = makeProposal()
      saveProposal(p)
      expect(getProposal(p.id)?.id).toBe(p.id)
    })

    it('returns undefined for unknown id', () => {
      expect(getProposal('nonexistent')).toBeUndefined()
    })
  })

  describe('updateProposalStatus', () => {
    it('changes status to approved', () => {
      const p = makeProposal()
      saveProposal(p)
      const updated = updateProposalStatus(p.id, 'approved')
      expect(updated?.status).toBe('approved')
      expect(getProposal(p.id)?.status).toBe('approved')
    })

    it('returns undefined for unknown id', () => {
      expect(updateProposalStatus('ghost', 'approved')).toBeUndefined()
    })

    it('updates updatedAt timestamp', () => {
      const p = makeProposal()
      saveProposal(p)
      const before = new Date(p.updatedAt).getTime()
      const updated = updateProposalStatus(p.id, 'rejected')
      const after = new Date(updated!.updatedAt).getTime()
      expect(after).toBeGreaterThanOrEqual(before)
    })
  })

  describe('deleteProposal', () => {
    it('removes the proposal', () => {
      const p = makeProposal()
      saveProposal(p)
      deleteProposal(p.id)
      expect(listProposals()).toHaveLength(0)
    })

    it('is a no-op for unknown id', () => {
      const p = makeProposal()
      saveProposal(p)
      deleteProposal('nope')
      expect(listProposals()).toHaveLength(1)
    })
  })

  describe('createDraftRunFromProposal', () => {
    it('creates a DraftRunConfig from an approved proposal', () => {
      const p = makeProposal({ status: 'approved' })
      saveProposal(p)
      const draft = createDraftRunFromProposal(p)
      expect(draft.proposalId).toBe(p.id)
      expect(draft.goal).toBe(p.goal.summary)
      expect(draft.runStatus).toBe('pending')
      expect(listDraftRuns()).toHaveLength(1)
    })

    it('uses run_recipe agents when present', () => {
      const p = makeProposal({
        status: 'approved',
        run_recipe: { mode: 'codex-swarm', agents: ['SpecialAgent'], goal: 'do it' },
      })
      saveProposal(p)
      const draft = createDraftRunFromProposal(p)
      expect(draft.mode).toBe('codex-swarm')
      expect(draft.agents).toEqual(['SpecialAgent'])
    })

    it('falls back to recommended.agents when run_recipe is null', () => {
      const p = makeProposal({ status: 'approved', run_recipe: null })
      saveProposal(p)
      const draft = createDraftRunFromProposal(p)
      expect(draft.agents).toEqual(p.recommended.agents)
    })
  })

  describe('generateProposalId', () => {
    it('generates unique ids', () => {
      const ids = new Set(Array.from({ length: 20 }, () => generateProposalId()))
      expect(ids.size).toBe(20)
    })

    it('starts with "proposal_"', () => {
      expect(generateProposalId()).toMatch(/^proposal_/)
    })
  })
})
