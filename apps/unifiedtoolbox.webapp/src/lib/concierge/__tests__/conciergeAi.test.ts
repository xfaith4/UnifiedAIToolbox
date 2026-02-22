import { describe, it, expect } from 'vitest'
import { extractProposalJson, hydrateProposal } from '@/lib/services/conciergeAi'
import type { ChatMessage } from '@/lib/types/proposal'

// ── extractProposalJson ────────────────────────────────────────────────────────
describe('extractProposalJson', () => {
  it('extracts from a fenced ```json block', () => {
    const text = `Here is your proposal:\n\`\`\`json\n{"goal":{"summary":"Do the thing"}}\n\`\`\``
    const result = extractProposalJson(text)
    expect(result?.goal?.summary).toBe('Do the thing')
  })

  it('returns null when no json block or bare object present', () => {
    expect(extractProposalJson('Just a plain text message with no JSON.')).toBeNull()
  })

  it('returns null when json is present but goal.summary is missing', () => {
    const text = '```json\n{"foo":"bar"}\n```'
    expect(extractProposalJson(text)).toBeNull()
  })

  it('returns null on malformed JSON', () => {
    const text = '```json\n{broken json\n```'
    expect(extractProposalJson(text)).toBeNull()
  })

  it('handles extra whitespace around the fenced block', () => {
    const text = 'Some preamble.\n\n```json\n  {"goal":{"summary":"Trim me"}}\n  ```\nSome postamble.'
    const result = extractProposalJson(text)
    expect(result?.goal?.summary).toBe('Trim me')
  })
})

// ── hydrateProposal ───────────────────────────────────────────────────────────
describe('hydrateProposal', () => {
  const emptyHistory: ChatMessage[] = []

  it('fills required fields with defaults when partial is mostly empty', () => {
    const p = hydrateProposal({ goal: { summary: 'Test goal' } }, emptyHistory)
    expect(p.proposal_version).toBe('1.0')
    expect(p.status).toBe('draft')
    expect(p.goal.summary).toBe('Test goal')
    expect(p.plan.steps).toEqual([])
    expect(p.recommended.agents).toEqual([])
    expect(p.risks).toEqual([])
    expect(p.run_recipe).toBeNull()
  })

  it('preserves plan steps with default ids when id is missing', () => {
    const partial = {
      goal: { summary: 'Step test' },
      plan: { steps: [{ title: 'Step A', description: 'Do A' }] },
    } as Partial<import('@/lib/types/proposal').Proposal>
    const p = hydrateProposal(partial, emptyHistory)
    expect(p.plan.steps[0].id).toBe('1')
    expect(p.plan.steps[0].title).toBe('Step A')
  })

  it('coerces invalid risk level to "low"', () => {
    const partial = {
      goal: { summary: 'Risk test' },
      risks: [{ level: 'extreme' as 'low', description: 'Very risky' }],
    }
    const p = hydrateProposal(partial, emptyHistory)
    expect(p.risks[0].level).toBe('low')
  })

  it('assigns a unique id on every call', () => {
    const p1 = hydrateProposal({ goal: { summary: 'A' } }, emptyHistory)
    const p2 = hydrateProposal({ goal: { summary: 'B' } }, emptyHistory)
    expect(p1.id).not.toBe(p2.id)
  })

  it('stores the passed conversation history', () => {
    const history: ChatMessage[] = [
      { id: '1', role: 'user', content: 'hello', timestamp: new Date().toISOString() },
    ]
    const p = hydrateProposal({ goal: { summary: 'History test' } }, history)
    expect(p.conversation).toHaveLength(1)
    expect(p.conversation[0].content).toBe('hello')
  })
})
