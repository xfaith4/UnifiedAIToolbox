'use client'

import type { DraftRunConfig } from '@/lib/types/proposal'
import type { OrchestrationRun, OrchestrationRunEvent } from '@/lib/types/orchestrator'
import { createNewRun, addLocalRun } from '@/lib/services/orchestratorStore'
import { createOrchestrationRun, fetchOrchestrationRun } from '@/lib/services/orchestratorApi'

// ── Terminal states ────────────────────────────────────────────────────────────

export const TERMINAL_RUN_STATUSES = new Set([
  'completed',
  'blocked_requirements',
  'needs_requirements',
  'failed',
  'cancelled',
  'error',
])

// ── Run launch ────────────────────────────────────────────────────────────────

/**
 * Start an orchestrator run from a DraftRunConfig.
 * Only multi-agent and codex-swarm modes are supported here;
 * maintain_existing_app jobs must be launched from App Factory.
 */
export async function startOrchestratorRun(draft: DraftRunConfig): Promise<OrchestrationRun> {
  if (draft.jobType === 'maintain_existing_app') {
    throw new Error('This job type must be launched from App Factory (use the link below).')
  }

  const localRun = createNewRun(draft.goal, {
    agents: draft.agents,
    runMode: draft.mode as 'multi-agent' | 'codex-swarm',
    promptId: draft.promptId ?? undefined,
    acceptanceChecks: draft.acceptanceChecks,
  })

  if (process.env.NODE_ENV === 'development') {
    console.debug(`[ConciergeRun] startOrchestratorRun: local_run_id=${localRun.id}, mode=${localRun.runMode}, goal="${draft.goal.slice(0, 60)}"`)
  }

  addLocalRun(localRun)

  const apiRun = await createOrchestrationRun(localRun)

  if (process.env.NODE_ENV === 'development') {
    console.debug(`[ConciergeRun] startOrchestratorRun: api_run_id=${apiRun.id} — SSE/polling will subscribe to this id`)
  }

  return apiRun
}

// Re-export so page only needs one import point
export { fetchOrchestrationRun }

// ── Narration ─────────────────────────────────────────────────────────────────

/**
 * Convert a raw orchestration run event into a human-readable chat string.
 * Returns null for events that should not produce a message.
 */
export function narrateRunEvent(event: OrchestrationRunEvent): string | null {
  const { type, message } = event

  if (type === 'status') {
    switch (message.toLowerCase()) {
      case 'queued':
        return 'Run queued. The monitor page will show activity as soon as a worker picks it up.'
      case 'running':
        return 'Agents are now working on your goal. Use the run monitor to follow live progress.'
      case 'completed':
        return 'Run completed successfully. Open the run monitor for the final status, artifacts, and follow-up actions.'
      case 'failed':
        return 'Run failed. Open the run monitor to inspect the failure details and event trail.'
      case 'cancelled':
        return 'Run was cancelled.'
      default:
        return `Status update: ${message}`
    }
  }

  if (type === 'warn')  return `⚠ ${message}`
  if (type === 'error') return `Error during run: ${message}`
  if (type === 'info')  return message || null

  // Unknown event types: skip
  return null
}
