import { describe, expect, it } from 'vitest'
import type { Proposal, DraftRunConfig } from '@/lib/types/proposal'
import type { ToolPermission } from '@/lib/types/toolPermission'
import { buildKickoffRefinementMessage, getRunMonitorHref } from '@/lib/services/conciergeKickoff'

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    proposal_version: '1.0',
    id: 'proposal_test',
    status: 'approved',
    createdAt: '2026-03-13T12:00:00.000Z',
    updatedAt: '2026-03-13T12:00:00.000Z',
    goal: {
      summary: 'Stabilize the dashboard build',
      context: 'Existing repo with flaky CI behavior',
    },
    inputs: {
      repo: 'acme/dashboard',
      files: [],
      constraints: ['Do not change deployment config'],
    },
    plan: {
      steps: [
        { id: '1', title: 'Inspect', description: 'Review the failing build', agent: 'Engineer' },
      ],
    },
    recommended: {
      prompts: [],
      agents: ['Supervisor', 'Engineer'],
      tools: ['read_file', 'write_file'],
    },
    approvals: {
      required: [],
    },
    acceptance_checks: ['Build passes', 'Tests pass'],
    assumptions: ['CI secrets are already configured'],
    confidence: {
      level: 'medium',
      reasoning: 'Build failures were reported but not yet reproduced locally.',
    },
    risks: [{ level: 'medium', description: 'Fix may expose unrelated config drift.' }],
    estimate: {
      time: '~15 minutes',
      cost: '~$0.10',
      tokens: 5000,
    },
    run_recipe: {
      goal: 'Stabilize the dashboard build',
      mode: 'multi-agent',
      agents: ['Supervisor', 'Engineer'],
      jobType: 'build_new_app',
    },
    conversation: [],
    ...overrides,
  }
}

function makeDraft(overrides: Partial<DraftRunConfig> = {}): DraftRunConfig {
  return {
    id: 'proposal_test',
    proposalId: 'proposal_test',
    createdAt: '2026-03-13T12:00:00.000Z',
    goal: 'Stabilize the dashboard build',
    mode: 'multi-agent',
    agents: ['Supervisor', 'Engineer'],
    jobType: 'build_new_app',
    runStatus: 'running',
    acceptanceChecks: ['Build passes', 'Tests pass'],
    ...overrides,
  }
}

describe('getRunMonitorHref', () => {
  it('routes orchestration runs to swarm view', () => {
    expect(getRunMonitorHref('multi-agent_123', 'multi-agent')).toBe('/runs/multi-agent_123/swarm')
    expect(getRunMonitorHref('codex_123', 'codex-swarm')).toBe('/runs/codex_123/swarm')
  })

  it('falls back to run detail when mode is unknown', () => {
    expect(getRunMonitorHref('maint-123', 'maintain_existing_app')).toBe('/runs/maint-123')
    expect(getRunMonitorHref('run_123')).toBe('/runs/run_123')
  })
})

describe('buildKickoffRefinementMessage', () => {
  it('includes the refined brief and direct monitor link', () => {
    const proposal = makeProposal()
    const draft = makeDraft()
    const tools: ToolPermission[] = [
      { name: 'read_file', enabled: true, access: 'read', pathAllowlist: ['src/**'] },
      { name: 'write_file', enabled: false, access: 'write', pathAllowlist: [] },
    ]

    const message = buildKickoffRefinementMessage({
      proposal,
      draft,
      runId: 'multi-agent_123',
      toolPermissions: tools,
    })

    expect(message).toContain('[Open run monitor](/runs/multi-agent_123/swarm)')
    expect(message).toContain('Draft brief:')
    expect(message).toContain('Refined brief:')
    expect(message).toContain('Use only these enabled tools: read_file (read within src/**)')
    expect(message).toContain('If requirements are missing or contradictory, stop and return a blocker packet instead of guessing')
  })

  it('calls out when no tools are enabled', () => {
    const message = buildKickoffRefinementMessage({
      proposal: makeProposal(),
      draft: makeDraft(),
      runId: 'multi-agent_456',
      toolPermissions: [],
    })

    expect(message).toContain('Do not assume extra tool access; continue with built-in capabilities unless the user enables more')
  })
})
