/**
 * proposal.ts
 * Central, versioned schema for Concierge Proposals.
 * proposal_version allows forward-compatible schema migrations.
 *
 * Phase 1: Proposal is generated and stored; run_recipe is optional/empty.
 * Phase 2: run_recipe will be fully populated and used to prefill Run pages.
 */

export type ProposalStatus = 'draft' | 'approved' | 'rejected' | 'archived'
export type RiskLevel = 'low' | 'medium' | 'high'

// ── Sub-objects ───────────────────────────────────────────────────────────────

export interface ProposalGoal {
  summary: string
  context?: string
}

export interface ProposalPlanStep {
  id: string
  title: string
  description: string
  agent?: string
  tool?: string
}

export interface ProposalRisk {
  level: RiskLevel
  description: string
}

export interface ProposalEstimate {
  time?: string   // e.g. "~5 minutes"
  cost?: string   // e.g. "~$0.04"
  tokens?: number
}

/**
 * RunRecipe — Phase 1: stored but not yet used for prefill.
 * Phase 2 will expand this and wire it to Playground + App Factory.
 */
export interface ProposalRunRecipe {
  mode?: 'multi-agent' | 'codex-swarm'
  goal?: string
  agents?: string[]
  promptId?: string
}

// ── Chat message ──────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
}

// ── Proposal (root) ───────────────────────────────────────────────────────────

export interface Proposal {
  /** Bumped when the schema changes. */
  proposal_version: '1.0'

  id: string
  status: ProposalStatus
  createdAt: string
  updatedAt: string

  goal: ProposalGoal

  inputs: {
    repo?: string
    files?: string[]
    constraints?: string[]
  }

  plan: {
    steps: ProposalPlanStep[]
  }

  recommended: {
    prompts: string[]   // prompt names from Prompt Library
    agents: string[]    // agent names from Agent Library
    tools: string[]     // MCP tool names (plan only in Phase 1)
  }

  approvals: {
    required: string[]  // human-readable approval gates
  }

  acceptance_checks: string[]

  risks: ProposalRisk[]

  estimate: ProposalEstimate

  /** Optional in Phase 1; fully populated in Phase 2. */
  run_recipe: ProposalRunRecipe | null

  /** Full conversation that produced this proposal. */
  conversation: ChatMessage[]
}

// ── Draft run config (created on Approve; used by Run pages in Phase 2) ───────

export interface DraftRunConfig {
  id: string                  // matches proposal.id
  proposalId: string
  createdAt: string
  goal: string
  mode: 'multi-agent' | 'codex-swarm'
  agents: string[]
  promptId?: string
  /** 'pending' until the user actually starts the run */
  runStatus: 'pending'
}
