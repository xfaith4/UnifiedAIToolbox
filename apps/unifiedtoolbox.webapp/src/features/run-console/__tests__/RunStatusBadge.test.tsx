// Vitest runs in `node` environment (no jsdom). React Testing Library is not
// installed, so we use `renderToStaticMarkup` to assert label + accessible
// attributes for each of the 8 canonical statuses, plus the defensive
// fallback for unknown inputs.

import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import RunStatusBadge from '../RunStatusBadge'
import { ALL_STATUSES, getStatusConfig } from '../statusConfig'

describe('RunStatusBadge', () => {
  it.each(ALL_STATUSES)('renders the canonical label for "%s"', (status) => {
    const html = renderToStaticMarkup(<RunStatusBadge status={status} />)
    const cfg = getStatusConfig(status)
    expect(html).toContain(cfg.label)
    expect(html).toContain(`data-status="${status}"`)
    expect(html).toContain('role="status"')
    expect(html).toContain(`aria-label="Run status: ${cfg.label}"`)
  })

  it('exposes the engineer-friendly label conventions', () => {
    expect(getStatusConfig('queued').label).toBe('Queued')
    expect(getStatusConfig('running').label).toBe('Running')
    expect(getStatusConfig('waiting_on_input').label).toBe('Waiting on Input')
    expect(getStatusConfig('recovering').label).toBe('Recovering')
    expect(getStatusConfig('blocked').label).toBe('Blocked')
    expect(getStatusConfig('validating').label).toBe('Validating')
    expect(getStatusConfig('completed').label).toBe('Complete')
    expect(getStatusConfig('failed').label).toBe('Failed')
  })

  it('falls back to "Running" for unknown status and warns', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const html = renderToStaticMarkup(<RunStatusBadge status="banana" />)
    expect(html).toContain('Running')
    expect(spy).toHaveBeenCalledOnce()
    spy.mockRestore()
  })

  it('falls back without warning for null/undefined input', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const htmlNull = renderToStaticMarkup(<RunStatusBadge status={null} />)
    const htmlUndef = renderToStaticMarkup(<RunStatusBadge status={undefined} />)
    expect(htmlNull).toContain('Running')
    expect(htmlUndef).toContain('Running')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('marks completed and failed as terminal in the status config', () => {
    expect(getStatusConfig('completed').terminal).toBe(true)
    expect(getStatusConfig('failed').terminal).toBe(true)
    expect(getStatusConfig('running').terminal).toBe(false)
    expect(getStatusConfig('queued').terminal).toBe(false)
  })
})
