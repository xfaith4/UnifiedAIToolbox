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
