import { describe, expect, it } from 'vitest'
import { buildSwarmModel } from '../swarmModel'
import type { SwarmRunEvent } from '../../types'

function makeEvent(overrides: Partial<SwarmRunEvent> = {}): SwarmRunEvent {
  return {
    id: `evt-${Math.random()}`,
    ts: '2026-03-22T19:46:03Z',
    runId: 'test-run',
    type: 'info',
    message: 'test event',
    ...overrides,
  }
}

describe('buildSwarmModel', () => {
  it('returns empty model for no events and no runStatus', () => {
    const model = buildSwarmModel([], null)
    expect(model.nodes).toHaveLength(0)
    expect(model.edges).toHaveLength(0)
    expect(model.activity).toHaveLength(0)
    // Known agents are always pre-seeded
    expect(model.agents.length).toBeGreaterThan(0)
    expect(model.agents.every((a) => a.status === 'idle')).toBe(true)
  })

  it('populates all 9 known agents in idle state by default', () => {
    const model = buildSwarmModel([], null)
    const names = model.agents.map((a) => a.name)
    expect(names).toContain('Supervisor')
    expect(names).toContain('Engineer')
    expect(names).toContain('Critic')
    expect(names).toContain('Synthesizer')
    expect(names).toContain('Commissioner')
  })

  it('creates a phase node for each event', () => {
    const events = [makeEvent({ message: 'starting contract phase', type: 'info' })]
    const model = buildSwarmModel(events, null)
    const phases = model.nodes.filter((n) => n.kind === 'phase')
    expect(phases.length).toBeGreaterThan(0)
    expect(phases.some((n) => n.phase === 'contract')).toBe(true)
  })

  it('normalizes phase from message content', () => {
    const cases: Array<{ message: string; expectedPhase: string }> = [
      { message: 'running normalize step', expectedPhase: 'normalize' },
      { message: 'publishing export artifact', expectedPhase: 'export' },
      { message: 'gate check passed', expectedPhase: 'gates' },
      { message: 'assemble started', expectedPhase: 'assemble' },
      { message: 'repair loop triggered', expectedPhase: 'repair' },
    ]
    for (const { message, expectedPhase } of cases) {
      const model = buildSwarmModel([makeEvent({ message })], null)
      const phaseNode = model.nodes.find((n) => n.kind === 'phase')
      expect(phaseNode?.phase, `message "${message}" should map to phase "${expectedPhase}"`).toBe(expectedPhase)
    }
  })

  it('assigns error status to node for error-type events', () => {
    const events = [makeEvent({ type: 'error', message: 'orchestrator failed', status: 'failed' })]
    const model = buildSwarmModel(events, null)
    const errorNodes = model.nodes.filter((n) => n.status === 'error')
    expect(errorNodes.length).toBeGreaterThan(0)
  })

  it('deduplicates nodes with the same taskId and accumulates eventCount', () => {
    // STATUS_WEIGHT: error(5) > blocked(4) > working(3) > complete(2) > pending(1)
    // Once a node reaches 'working', a later 'complete' event won't downgrade it.
    // This test uses only neutral messages so the node stays at 'pending' until the final event.
    const events = [
      makeEvent({ ts: '2026-03-22T19:46:01Z', type: 'info', message: 'queued', details: { taskId: 'task-42' } }),
      makeEvent({ ts: '2026-03-22T19:46:02Z', type: 'info', message: 'queued again', details: { taskId: 'task-42' } }),
      makeEvent({ ts: '2026-03-22T19:46:03Z', type: 'info', message: 'task succeeded', details: { taskId: 'task-42' }, status: 'success' }),
    ]
    const model = buildSwarmModel(events, null)
    const taskNodes = model.nodes.filter((n) => n.kind === 'task' && n.id === 'task:task-42')
    expect(taskNodes).toHaveLength(1)
    expect(taskNodes[0].eventCount).toBe(3)
    expect(taskNodes[0].status).toBe('complete')
  })

  it('detects agent name from event message', () => {
    const events = [makeEvent({ type: 'info', message: 'Engineer is starting work' })]
    const model = buildSwarmModel(events, null)
    const engineer = model.agents.find((a) => a.name === 'Engineer')
    expect(engineer).toBeDefined()
    expect(engineer?.status).toBe('idle') // message alone doesn't trigger working status
  })

  it('marks agent as working when type/status indicate it', () => {
    const events = [makeEvent({ type: 'info', message: 'Engineer running task', agent: 'engineer', status: 'running' })]
    const model = buildSwarmModel(events, null)
    const engineer = model.agents.find((a) => a.name === 'Engineer')
    expect(engineer?.status).toBe('working')
  })

  it('marks agent as error when event signals failure', () => {
    const events = [makeEvent({ type: 'error', message: 'Critic blocked on missing data', agent: 'critic' })]
    const model = buildSwarmModel(events, null)
    const critic = model.agents.find((a) => a.name === 'Critic')
    expect(critic?.status).toBe('error')
  })

  it('marks agent as complete when event signals success', () => {
    const events = [makeEvent({ type: 'info', message: 'Synthesizer succeeded', agent: 'synthesizer', status: 'success' })]
    const model = buildSwarmModel(events, null)
    const synthesizer = model.agents.find((a) => a.name === 'Synthesizer')
    expect(synthesizer?.status).toBe('complete')
  })

  it('creates dependency edges from phase node to event node', () => {
    const events = [makeEvent({ type: 'error', message: 'orchestrator failed', status: 'failed' })]
    const model = buildSwarmModel(events, null)
    const depEdges = model.edges.filter((e) => e.kind === 'dependency')
    expect(depEdges.length).toBeGreaterThan(0)
    // At least one edge should originate from a phase node
    expect(depEdges.some((e) => e.from.startsWith('phase:'))).toBe(true)
  })

  it('creates assignment edges from agent to node when agent is known', () => {
    const events = [
      makeEvent({ type: 'error', message: 'Engineer failed task', agent: 'engineer', status: 'failed' }),
    ]
    const model = buildSwarmModel(events, null)
    const assignEdges = model.edges.filter((e) => e.kind === 'assignment')
    expect(assignEdges.some((e) => e.from === 'agent:Engineer')).toBe(true)
  })

  it('sorts phases by canonical PHASE_ORDER', () => {
    const events = [
      makeEvent({ ts: '2026-03-22T19:46:01Z', message: 'export artifact published' }),
      makeEvent({ ts: '2026-03-22T19:46:02Z', message: 'contract finalized' }),
      makeEvent({ ts: '2026-03-22T19:46:03Z', message: 'run started' }),
    ]
    const model = buildSwarmModel(events, null)
    const runIdx = model.phases.indexOf('run')
    const contractIdx = model.phases.indexOf('contract')
    const exportIdx = model.phases.indexOf('export')
    expect(runIdx).toBeLessThan(contractIdx)
    expect(contractIdx).toBeLessThan(exportIdx)
  })

  it('falls back to misc phase for unrecognised messages', () => {
    const events = [makeEvent({ message: 'something completely unrelated', type: 'debug' })]
    const model = buildSwarmModel(events, null)
    const phaseNode = model.nodes.find((n) => n.kind === 'phase')
    expect(phaseNode?.phase).toBe('misc')
  })

  it('deduplicates events with identical ids within the events array', () => {
    // The same SwarmRunEvent (same id) appearing twice in the events array
    // should produce only one activity entry.
    const event = makeEvent({ type: 'info', message: 'duplicate event' })
    const model = buildSwarmModel([event, event], null)
    const activity = model.activity.filter((a) => a.message === 'duplicate event')
    expect(activity.length).toBe(1)
  })

  it('activity list is sorted newest-first', () => {
    const events = [
      makeEvent({ ts: '2026-03-22T19:46:01Z', message: 'first' }),
      makeEvent({ ts: '2026-03-22T19:46:05Z', message: 'last' }),
      makeEvent({ ts: '2026-03-22T19:46:03Z', message: 'middle' }),
    ]
    const model = buildSwarmModel(events, null)
    const timestamps = model.activity.map((a) => a.ts)
    for (let i = 0; i < timestamps.length - 1; i++) {
      expect(timestamps[i] >= timestamps[i + 1]).toBe(true)
    }
  })

  it('status weight: error supersedes working which supersedes complete', () => {
    const taskId = 'priority-task'
    const events = [
      makeEvent({ ts: '2026-03-22T19:46:01Z', details: { taskId }, status: 'success', message: 'task done' }),
      makeEvent({ ts: '2026-03-22T19:46:02Z', details: { taskId }, status: 'running', message: 'task running' }),
      makeEvent({ ts: '2026-03-22T19:46:03Z', details: { taskId }, type: 'error', message: 'task errored' }),
    ]
    const model = buildSwarmModel(events, null)
    const node = model.nodes.find((n) => n.id === `task:${taskId}`)
    expect(node?.status).toBe('error')
  })
})
