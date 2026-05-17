import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import EmptyState from '../EmptyState'

describe('EmptyState', () => {
  it('renders no-runs copy', () => {
    const html = renderToStaticMarkup(<EmptyState reason="no-runs" />)
    expect(html).toContain('No runs yet')
    expect(html).toContain('data-reason="no-runs"')
  })

  it('renders no-events copy', () => {
    const html = renderToStaticMarkup(<EmptyState reason="no-events" />)
    expect(html).toContain('No events recorded yet')
  })

  it('renders no-artifacts copy', () => {
    const html = renderToStaticMarkup(<EmptyState reason="no-artifacts" />)
    expect(html).toContain('No artifacts yet')
  })

  it('renders legacy-run copy', () => {
    const html = renderToStaticMarkup(<EmptyState reason="legacy-run" />)
    expect(html).toContain('Legacy run')
    expect(html).toContain('canonical manifest')
  })

  it('renders queued-not-started copy', () => {
    const html = renderToStaticMarkup(<EmptyState reason="queued-not-started" />)
    expect(html).toContain('Queued')
    expect(html).toContain('no worker has started it yet')
  })

  it('renders sse-disconnected copy', () => {
    const html = renderToStaticMarkup(<EmptyState reason="sse-disconnected" />)
    expect(html).toContain('Live stream disconnected')
  })

  it('respects title and body overrides', () => {
    const html = renderToStaticMarkup(
      <EmptyState reason="generic" title="Custom title" body="Custom body" />
    )
    expect(html).toContain('Custom title')
    expect(html).toContain('Custom body')
  })
})
