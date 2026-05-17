import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import RunTimeline, { derivePhasesFromEvents } from '../RunTimeline'
import type { CanonicalEvent } from '@/lib/app-factory/runs/canonicalEvents'

function ev(overrides: Partial<CanonicalEvent>): CanonicalEvent {
  return {
    event_id: 'evt-' + Math.random().toString(36).slice(2),
    run_id: 'maint-test',
    timestamp: new Date().toISOString(),
    event_type: 'agent_progress',
    severity: 'info',
    message: '',
    ...overrides,
  } as CanonicalEvent
}

describe('derivePhasesFromEvents', () => {
  it('marks Created as done after run_queued', () => {
    const phases = derivePhasesFromEvents([ev({ event_type: 'run_queued', message: 'queued' })])
    const created = phases.find((p) => p.id === 'created')!
    expect(created.state).toBe('done')
  })

  it('promotes Working to active when agent_started arrives', () => {
    const phases = derivePhasesFromEvents([
      ev({ event_type: 'run_queued' }),
      ev({ event_type: 'run_started' }),
      ev({ event_type: 'agent_started', agent_name: 'Engineer' }),
    ])
    expect(phases.find((p) => p.id === 'working')!.state).toBe('active')
  })

  it('moves to Validating then Finalized on completion', () => {
    const phases = derivePhasesFromEvents([
      ev({ event_type: 'run_started' }),
      ev({ event_type: 'agent_started', agent_name: 'Engineer' }),
      ev({ event_type: 'agent_completed', agent_name: 'Engineer' }),
      ev({ event_type: 'validation_started' }),
      ev({ event_type: 'validation_completed', data: { passed: 3, failed: 0 } }),
      ev({ event_type: 'run_completed' }),
    ])
    const byId = Object.fromEntries(phases.map((p) => [p.id, p]))
    expect(byId.validating.state).toBe('done')
    expect(byId.finalized.state).toBe('done')
  })

  it('marks Validating as failed when failures present', () => {
    const phases = derivePhasesFromEvents([
      ev({ event_type: 'validation_started' }),
      ev({ event_type: 'validation_completed', data: { passed: 1, failed: 2 } }),
    ])
    expect(phases.find((p) => p.id === 'validating')!.state).toBe('failed')
  })

  it('marks Finalized as failed on run_failed', () => {
    const phases = derivePhasesFromEvents([
      ev({ event_type: 'run_started' }),
      ev({ event_type: 'agent_started', agent_name: 'Engineer' }),
      ev({ event_type: 'run_failed' }),
    ])
    expect(phases.find((p) => p.id === 'finalized')!.state).toBe('failed')
  })

  it('renders 5 phase labels in the markup', () => {
    const html = renderToStaticMarkup(<RunTimeline events={[ev({ event_type: 'run_started' })]} />)
    expect(html).toContain('Created')
    expect(html).toContain('Started')
    expect(html).toContain('Working')
    expect(html).toContain('Validating')
    expect(html).toContain('Finalized')
  })
})
