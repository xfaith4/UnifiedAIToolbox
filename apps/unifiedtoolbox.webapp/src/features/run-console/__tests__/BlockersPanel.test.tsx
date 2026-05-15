import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import BlockersPanel from '../BlockersPanel'

describe('BlockersPanel', () => {
  it('renders the severity label for each blocker', () => {
    const html = renderToStaticMarkup(
      <BlockersPanel
        blockers={[
          { severity: 'hard_blocker', summary: 'Missing token' },
          { severity: 'soft_blocker', summary: 'Slow path' },
          { severity: 'clarification_needed', summary: 'Need confirmation' },
          { severity: 'non_blocking_gap', summary: 'Polish later' },
        ]}
      />
    )
    expect(html).toContain('Hard Blocker')
    expect(html).toContain('Soft Blocker')
    expect(html).toContain('Clarification Needed')
    expect(html).toContain('Non-blocking Gap')
    expect(html).toContain('Missing token')
    expect(html).toContain('Slow path')
  })

  it('renders the empty state when no blockers are present', () => {
    const html = renderToStaticMarkup(<BlockersPanel blockers={[]} />)
    expect(html).toContain('No active blockers')
  })

  it('hides the CTA when status is not waiting_on_input', () => {
    const html = renderToStaticMarkup(
      <BlockersPanel
        blockers={[{ severity: 'hard_blocker', summary: 'Stop', needed_from: 'user' } as any]}
        runStatus="running"
        renderCta={() => <button>Unblock</button>}
      />
    )
    expect(html).not.toContain('Unblock')
    expect(html).toContain('data-cta-eligible="false"')
  })

  it('hides the CTA when blocker is not user-actionable', () => {
    const html = renderToStaticMarkup(
      <BlockersPanel
        blockers={[{ severity: 'hard_blocker', summary: 'System error', needed_from: 'system' } as any]}
        runStatus="waiting_on_input"
        renderCta={() => <button>Unblock</button>}
      />
    )
    expect(html).not.toContain('Unblock')
  })

  it('renders the CTA when status is waiting_on_input AND needed_from is user', () => {
    const html = renderToStaticMarkup(
      <BlockersPanel
        blockers={[{ severity: 'hard_blocker', summary: 'Answer please', needed_from: 'user' } as any]}
        runStatus="waiting_on_input"
        renderCta={() => <button data-testid="cta">Unblock</button>}
      />
    )
    expect(html).toContain('Unblock')
    expect(html).toContain('data-cta-eligible="true"')
  })

  it('renders agent name when provided', () => {
    const html = renderToStaticMarkup(
      <BlockersPanel
        blockers={[{ severity: 'hard_blocker', summary: 'Missing field', agent: 'Validator' }]}
      />
    )
    expect(html).toContain('Validator')
  })
})
