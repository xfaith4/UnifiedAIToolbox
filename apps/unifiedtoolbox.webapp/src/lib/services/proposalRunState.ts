'use client'

import type { Proposal, ProposalStatus } from '@/lib/types/proposal'
import type { OrchestrationRun, VerificationStatus } from '@/lib/types/orchestrator'
import { listDraftRuns, listProposals, updateDraftRun, updateProposalStatus } from '@/lib/services/proposalStore'

const RUN_SUCCESS_STATUSES = new Set(['completed', 'success', 'succeeded'])
const RUN_FAILURE_STATUSES = new Set(['failed', 'error', 'stuck', 'cancelled', 'canceled'])
const RUN_PENDING_STATUSES = new Set(['queued', 'pending'])
const RUN_ACTIVE_STATUSES = new Set(['dispatching', 'running', 'in_progress', 'gating', 'awaiting_gate', 'awaiting_input'])
const RUN_REQUIREMENTS_STATUSES = new Set(['blocked_requirements', 'needs_requirements'])

function normalizeStatus(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

export function deriveProposalStatusFromRun(
  runStatus: string | null | undefined,
  verificationStatus?: VerificationStatus | null,
): ProposalStatus {
  const status = normalizeStatus(runStatus)
  const verification = normalizeStatus(verificationStatus)

  if (RUN_SUCCESS_STATUSES.has(status)) return 'completed'
  if (verification === 'needs_requirements' || RUN_REQUIREMENTS_STATUSES.has(status)) return 'approved'
  if (RUN_FAILURE_STATUSES.has(status)) return 'approved'
  if (RUN_PENDING_STATUSES.has(status) || RUN_ACTIVE_STATUSES.has(status)) return 'running'
  return 'approved'
}

export function deriveDraftRunStatusFromRun(
  runStatus: string | null | undefined,
  verificationStatus?: VerificationStatus | null,
): 'pending' | 'running' | 'completed' | 'failed' {
  const status = normalizeStatus(runStatus)
  const verification = normalizeStatus(verificationStatus)

  if (RUN_SUCCESS_STATUSES.has(status)) return 'completed'
  if (verification === 'needs_requirements' || RUN_REQUIREMENTS_STATUSES.has(status) || RUN_PENDING_STATUSES.has(status)) {
    return 'pending'
  }
  if (RUN_FAILURE_STATUSES.has(status)) return 'failed'
  if (RUN_ACTIVE_STATUSES.has(status)) return 'running'
  return 'pending'
}

export function syncProposalAndDraftFromRun(
  proposalId: string,
  run: Pick<OrchestrationRun, 'id' | 'status' | 'verificationStatus'>,
): void {
  const proposalStatus = deriveProposalStatusFromRun(run.status, run.verificationStatus)
  const draftRunStatus = deriveDraftRunStatusFromRun(run.status, run.verificationStatus)

  updateDraftRun(proposalId, {
    activeRunId: run.id,
    runStatus: draftRunStatus,
  })
  updateProposalStatus(proposalId, proposalStatus)
}

export function reconcileStoredProposalStatuses(
  runs: Array<Pick<OrchestrationRun, 'id' | 'status' | 'verificationStatus'>>,
): Proposal[] {
  const runById = new Map(runs.map((run) => [run.id, run]))
  const drafts = listDraftRuns()

  for (const draft of drafts) {
    const proposalId = draft.proposalId || draft.id
    const activeRunId = draft.activeRunId?.trim()
    if (!proposalId || !activeRunId) continue
    const liveRun = runById.get(activeRunId)
    if (!liveRun) continue
    syncProposalAndDraftFromRun(proposalId, liveRun)
  }

  return listProposals()
}
