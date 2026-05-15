import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AgentCard } from '../AgentCards'
import type { ManifestAgent, ManifestBlocker } from '@/lib/app-factory/runs/manifest'

const baseAgent: ManifestAgent = {
  name: 'Engineer',
  role: 'Implements changes',
  status: 'running',
  lastEventAt: new Date(Date.now() - 30_000).toISOString(),
}

describe('AgentCard', () => {
  it('renders the agent name, role, and status label', () => {
    const html = renderToStaticMarkup(<AgentCard agent={baseAgent} />)
    expect(html).toContain('Engineer')
    expect(html).toContain('Implements changes')
    expect(html).toContain('Running')
    expect(html).toContain('data-agent-name="Engineer"')
    expect(html).toContain('data-agent-status="running"')
  })

  it('renders a blocker indicator when a blocker is present', () => {
    const blocker: ManifestBlocker = {
      severity: 'hard_blocker',
      summary: 'Cannot continue',
      agent: 'Engineer',
    }
    const html = renderToStaticMarkup(<AgentCard agent={baseAgent} blocker={blocker} />)
    expect(html).toContain('Blocker')
    expect(html).toContain('aria-label="Agent reported a blocker"')
  })

  it('omits the blocker indicator when no blocker is supplied', () => {
    const html = renderToStaticMarkup(<AgentCard agent={baseAgent} />)
    expect(html).not.toContain('aria-label="Agent reported a blocker"')
  })

  it('highlights the active agent', () => {
    const htmlActive = renderToStaticMarkup(
      <AgentCard agent={baseAgent} activeAgent="Engineer" />
    )
    const htmlInactive = renderToStaticMarkup(<AgentCard agent={baseAgent} activeAgent="Validator" />)
    expect(htmlActive).toContain('border-blue-700')
    expect(htmlInactive).not.toContain('border-blue-700')
  })

  it('renders the pending status when no status is given', () => {
    const pendingAgent: ManifestAgent = { ...baseAgent, status: 'pending' }
    const html = renderToStaticMarkup(<AgentCard agent={pendingAgent} />)
    expect(html).toContain('Pending')
  })
})
