import type { DraftRunConfig, Proposal } from '@/lib/types/proposal'
import type { ToolPermission } from '@/lib/types/toolPermission'

function compact(items: Array<string | null | undefined>): string[] {
  return items.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
}

function joinSentence(items: string[], fallback: string): string {
  return items.length > 0 ? items.join('; ') : fallback
}

function formatToolPermission(permission: ToolPermission): string {
  const scope = permission.access === 'write' ? 'write' : 'read'
  const allowlist =
    permission.pathAllowlist.length > 0 ? ` within ${permission.pathAllowlist.join(', ')}` : ''
  return `${permission.name} (${scope}${allowlist})`
}

function summarizeEnabledTools(toolPermissions: ToolPermission[]): string[] {
  return toolPermissions.filter((permission) => permission.enabled).map(formatToolPermission)
}

function summarizeConstraints(proposal: Proposal): string[] {
  return compact([
    ...(proposal.inputs.constraints ?? []),
    ...((proposal.assumptions ?? []).map((assumption) => `Assumption to verify: ${assumption}`)),
  ])
}

export function getRunMonitorHref(runId: string, mode?: string | null): string {
  const normalizedMode = String(mode || '').trim().toLowerCase()
  const encodedRunId = encodeURIComponent(runId)

  if (normalizedMode === 'multi-agent' || normalizedMode === 'codex-swarm') {
    return `/runs/${encodedRunId}/swarm`
  }

  return `/runs/${encodedRunId}`
}

export function buildKickoffRefinementMessage(args: {
  proposal: Proposal
  draft: DraftRunConfig
  runId: string
  toolPermissions: ToolPermission[]
}): string {
  const { proposal, draft, runId, toolPermissions } = args
  const goal = draft.goal || proposal.run_recipe?.goal || proposal.goal.summary
  const agents = draft.agents.length > 0 ? draft.agents : proposal.recommended.agents
  const enabledTools = summarizeEnabledTools(toolPermissions)
  const acceptanceChecks =
    draft.acceptanceChecks && draft.acceptanceChecks.length > 0
      ? draft.acceptanceChecks
      : proposal.acceptance_checks
  const constraints = summarizeConstraints(proposal)
  const monitorHref = getRunMonitorHref(runId, draft.mode)

  const draftBrief = joinSentence(
    compact([
      `Goal: ${goal}`,
      agents.length > 0 ? `Agents: ${agents.join(', ')}` : null,
      proposal.run_recipe?.promptId ? `Prompt: ${proposal.run_recipe.promptId}` : null,
      acceptanceChecks.length > 0 ? `Acceptance checks: ${acceptanceChecks.join('; ')}` : null,
    ]),
    `Goal: ${goal}`,
  )

  const refinedBrief = joinSentence(
    compact([
      `Execute the approved goal without expanding scope: ${goal}`,
      `Run mode: ${draft.mode}`,
      agents.length > 0 ? `Coordinate these agents: ${agents.join(', ')}` : null,
      constraints.length > 0 ? `Honor these constraints: ${constraints.join('; ')}` : null,
      enabledTools.length > 0
        ? `Use only these enabled tools: ${enabledTools.join('; ')}`
        : 'Do not assume extra tool access; continue with built-in capabilities unless the user enables more',
      acceptanceChecks.length > 0
        ? `Finish only when these checks are satisfied: ${acceptanceChecks.join('; ')}`
        : 'Return concrete evidence of completion before marking the run done',
      'If requirements are missing or contradictory, stop and return a blocker packet instead of guessing',
    ]),
    `Execute the approved goal without expanding scope: ${goal}`,
  )

  return [
    `Run started. [Open run monitor](${monitorHref})`,
    '',
    'I refined the orchestration brief before handing it off.',
    '',
    'Draft brief:',
    `- ${draftBrief}`,
    '',
    'Refined brief:',
    `- ${refinedBrief}`,
    '',
    'Direction while this runs:',
    '- Watch the linked monitor for stage changes, blockers, and verification results.',
    "- If the run asks for missing requirements, answer here and I'll prepare the next pass.",
  ].join('\n')
}
