import { describe, expect, it } from 'vitest'
import type { AgentInstruction } from '@/lib/types/agents'
import {
  getAgentReadinessIssues,
  getEffectiveAgentPrompt,
  validateImportedAgentLibrary,
} from '@/app/agents/utils'

function makeAgent(overrides: Partial<AgentInstruction> = {}): AgentInstruction {
  const now = new Date().toISOString()
  return {
    id: 'agent_1',
    name: 'Engineer',
    purpose: 'Implement changes safely',
    mission: 'Deliver production-quality changes',
    prompt: 'Canonical prompt',
    promptOverride: null,
    status: 'ready',
    tags: ['engineering'],
    triggers: [],
    inputs: [],
    outputs: ['Code changes'],
    tools: ['read_file'],
    playbook: ['Inspect', 'Implement', 'Verify'],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('agent utils', () => {
  it('prefers promptOverride over canonical prompt', () => {
    expect(getEffectiveAgentPrompt(makeAgent({ promptOverride: 'Override prompt' }))).toBe('Override prompt')
  })

  it('reports readiness gaps for build handoff', () => {
    const issues = getAgentReadinessIssues(
      makeAgent({ prompt: '', promptOverride: null, purpose: '', mission: '', outputs: [], playbook: [] }),
    )
    expect(issues).toEqual(['Prompt', 'Purpose or mission', 'Expected outputs', 'Playbook'])
  })

  it('validates imported agent libraries and trims fields', () => {
    const validated = validateImportedAgentLibrary([
      {
        name: '  Engineer  ',
        purpose: ' Implement ',
        prompt: 'Do the work',
        status: 'ready',
        tags: [' code ', ''],
        outputs: ['patch'],
        playbook: ['inspect'],
      },
    ])

    expect(validated[0]).toMatchObject({
      name: 'Engineer',
      purpose: 'Implement',
      status: 'ready',
      tags: ['code'],
      outputs: ['patch'],
      playbook: ['inspect'],
    })
  })

  it('rejects malformed imported agents', () => {
    expect(() =>
      validateImportedAgentLibrary([{ name: 'Broken Agent', tags: 'bad-shape' }]),
    ).toThrow(/tags must be an array of strings/i)
  })
})
