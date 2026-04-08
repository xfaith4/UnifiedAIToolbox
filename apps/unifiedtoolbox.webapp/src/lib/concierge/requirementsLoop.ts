import type { RequirementsRequest } from '@/lib/types/orchestrator'

export function buildRequirementsRequestPrompt(packet: RequirementsRequest | null | undefined): string | null {
  if (!packet || !Array.isArray(packet.blockers) || packet.blockers.length === 0) return null

  const lines: string[] = []
  lines.push('Commissioner returned needs_requirements. The run is blocked pending your input.')
  if (packet.summary) lines.push(packet.summary)
  lines.push('')
  lines.push('What I need next:')
  for (const blocker of packet.blockers) {
    lines.push(`- ${blocker.question}`)
    if (blocker.why) lines.push(`  Why: ${blocker.why}`)
    if (blocker.defaults && blocker.defaults.length > 0) {
      lines.push(`  Default options: ${blocker.defaults.join(' | ')}`)
    }
  }
  if (packet.proposed_acceptance_tests && packet.proposed_acceptance_tests.length > 0) {
    lines.push('')
    lines.push('Proposed acceptance tests:')
    for (const test of packet.proposed_acceptance_tests) {
      lines.push(`- ${test}`)
    }
  }
  lines.push('')
  lines.push('Reply with your choices and I will route this back into execution.')
  return lines.join('\n')
}

/**
 * Enhanced version that presents numbered choices and guided instructions
 * for the Concierge chat flow.
 */
export function buildRequirementsRequestPromptWithGuidance(
  packet: RequirementsRequest | null | undefined,
  goal?: string,
): string | null {
  if (!packet || !Array.isArray(packet.blockers) || packet.blockers.length === 0) return null

  const lines: string[] = []
  lines.push('The run is blocked and needs your input before it can continue.')
  if (packet.summary) lines.push(packet.summary)
  lines.push('')

  for (let i = 0; i < packet.blockers.length; i++) {
    const blocker = packet.blockers[i]
    lines.push(`**Question ${i + 1}:** ${blocker.question}`)
    if (blocker.why) lines.push(`  Why: ${blocker.why}`)
    if (blocker.defaults && blocker.defaults.length > 0) {
      lines.push('  Choose from:')
      blocker.defaults.forEach((d, j) => {
        lines.push(`    [${j + 1}] ${d}`)
      })
      lines.push(`    [${blocker.defaults.length + 1}] Provide your own answer`)
    }
    lines.push('')
  }

  if (packet.proposed_acceptance_tests && packet.proposed_acceptance_tests.length > 0) {
    lines.push('Proposed acceptance tests:')
    for (const test of packet.proposed_acceptance_tests) {
      lines.push(`- ${test}`)
    }
    lines.push('')
  }

  if (goal) {
    lines.push(`Your original goal: "${goal}"`)
    lines.push('')
  }

  lines.push('Reply with your choices (by number or in your own words) and I will prepare a confirmation for you to review before submitting.')
  return lines.join('\n')
}
