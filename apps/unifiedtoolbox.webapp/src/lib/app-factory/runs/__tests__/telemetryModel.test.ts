import { describe, expect, it } from 'vitest'
import type { RunStatusResponse } from '../types'
import {
  buildRunTelemetryState,
  normalizeRunEvent,
  selectAgentBoardGroups,
  selectAgentSignals,
  selectArtifactsPanel,
  selectGates,
  selectPhaseBoardCards,
  selectPipelineSteps,
  selectRunOperatorWarnings,
  selectTimelineEvents,
  selectTimelineGroups,
  selectTimeline,
  RUN_VIEW_WARNING_THRESHOLD_MS,
} from '../telemetryModel'

function sampleStatus(): RunStatusResponse {
  return {
    runId: 'run-telemetry-sample',
    status: 'running',
    currentStage: 'Engineer',
    startedAt: '2026-02-10T10:00:00.000Z',
    updatedAt: '2026-02-10T10:00:30.000Z',
    stageCount: 4,
    stageIndex: 1,
    progress: 45,
    stages: [
      {
        id: 'Researcher',
        name: 'Research Phase',
        status: 'succeeded',
        startedAt: '2026-02-10T10:00:00.000Z',
        finishedAt: '2026-02-10T10:00:10.000Z',
      },
      {
        id: 'Engineer',
        name: 'Implementation Phase',
        status: 'running',
        startedAt: '2026-02-10T10:00:11.000Z',
      },
      {
        id: 'Critic',
        name: 'Validation Phase',
        status: 'pending',
      },
      {
        id: 'ReviewGate',
        name: 'Review Gate',
        status: 'pending',
      },
    ],
    events: [
      {
        ts: '2026-02-10T10:00:00.000Z',
        type: 'stage_start',
        stage: 'Researcher',
        message: 'Stage Researcher: running',
      },
      {
        ts: '2026-02-10T10:00:10.000Z',
        type: 'stage_end',
        stage: 'Researcher',
        message: 'Stage Researcher: succeeded',
      },
      {
        ts: '2026-02-10T10:00:11.000Z',
        type: 'stage_start',
        stage: 'Engineer',
        message: 'Stage Engineer: running',
      },
      {
        ts: '2026-02-10T10:00:20.000Z',
        type: 'artifact_written',
        stage: 'Engineer',
        message: 'Artifact written: src/new-file.ts',
        data: { bytes: 200 },
      },
      {
        ts: '2026-02-10T10:00:25.000Z',
        type: 'contract_repair_attempted',
        stage: 'Engineer',
        message: 'contract repair 1/1 attempted',
      },
      {
        ts: '2026-02-10T10:00:26.000Z',
        type: 'warn',
        stage: 'Engineer',
        message: 'Minor warning from engineer',
      },
    ],
    artifacts: [
      {
        path: 'src/new-file.ts',
        exists: true,
        bytes: 200,
        mtime: '2026-02-10T10:00:20.000Z',
      },
      {
        path: 'reports/review_gate.json',
        exists: false,
      },
    ],
  }
}

describe('telemetryModel', () => {
  it('builds normalized state and derives active phase/agent', () => {
    const state = buildRunTelemetryState(sampleStatus())

    expect(state.runId).toBe('run-telemetry-sample')
    expect(state.activePhaseId).toBe('implementation')
    expect(state.activeAgentId).toBe('Engineer')
    expect(state.agents.Engineer.status).toBe('running')
    expect(state.phases.implementation.status).toBe('running')
  })

  it('exposes grouped agents, timeline, and artifacts panel state', () => {
    const state = buildRunTelemetryState(sampleStatus())

    const groups = selectAgentBoardGroups(state)
    const buildGroup = groups.find((group) => group.id === 'build')
    expect(buildGroup?.agents.some((agent) => agent.id === 'Engineer')).toBe(true)

    const timeline = selectTimeline(state)
    expect(timeline.find((node) => node.phaseId === 'implementation')?.status).toBe('running')

    const artifacts = selectArtifactsPanel(state)
    expect(artifacts.counts.total).toBeGreaterThan(0)
    expect(artifacts.counts.inProgress).toBe(1)
    expect(artifacts.counts.produced).toBeGreaterThanOrEqual(1)

    const steps = selectPipelineSteps(state)
    expect(steps.find((step) => step.phaseId === 'research')?.status).toBe('pass')
  })

  it('normalizes raw events into machine-usable event types', () => {
    const event = normalizeRunEvent(
      {
        ts: '2026-02-10T10:01:00.000Z',
        type: 'run_failed',
        stage: 'PRPublisher',
        message: 'Run failed: publish blocked',
      },
      0,
    )

    expect(event.type).toBe('run_failed')
    expect(event.phaseId).toBe('export')
    expect(event.severity).toBe('error')
  })

  it('filters selectors by phase', () => {
    const state = buildRunTelemetryState(sampleStatus())

    const agents = selectAgentBoardGroups(state, { phaseId: 'implementation' })
    expect(agents).toHaveLength(1)
    expect(agents[0]?.agents.map((agent) => agent.id)).toEqual(['Engineer'])

    const timelineGroups = selectTimelineGroups(state, { phaseId: 'implementation' })
    expect(timelineGroups).toHaveLength(1)
    expect(timelineGroups[0]?.phaseId).toBe('implementation')
    expect(timelineGroups[0]?.events.length).toBeGreaterThan(0)

    const artifacts = selectArtifactsPanel(state, { phaseId: 'implementation' })
    expect(artifacts.counts.total).toBeGreaterThanOrEqual(1)
    expect(artifacts.produced.some((artifact) => artifact.path === 'src/new-file.ts')).toBe(true)

    const gates = selectGates(state, { phaseId: 'validation' })
    expect(gates.some((gate) => gate.id === 'ReviewGate')).toBe(true)
  })

  it('filters selectors by agent and dims unrelated phases', () => {
    const state = buildRunTelemetryState(sampleStatus())

    const timelineEvents = selectTimelineEvents(state, { agentId: 'Engineer' })
    expect(timelineEvents.length).toBeGreaterThan(0)
    expect(timelineEvents.every((event) => event.agentId === 'Engineer')).toBe(true)

    const phaseCards = selectPhaseBoardCards(state, { agentId: 'Engineer' })
    const implementation = phaseCards.find((card) => card.phaseId === 'implementation')
    const research = phaseCards.find((card) => card.phaseId === 'research')
    expect(implementation?.dimmed).toBe(false)
    expect(research?.dimmed).toBe(true)

    const signals = selectAgentSignals(state)
    expect(signals.Engineer?.warningCount).toBe(1)
  })

  it('marks unknown phases when telemetry is incomplete', () => {
    const state = buildRunTelemetryState(null)
    const phaseCards = selectPhaseBoardCards(state)
    expect(phaseCards.length).toBeGreaterThan(0)
    expect(phaseCards.every((phase) => phase.isKnown === false)).toBe(true)
  })

  it('does not emit operator warnings for finished runs', () => {
    const state = buildRunTelemetryState({ ...sampleStatus(), status: 'succeeded' })
    const warnings = selectRunOperatorWarnings(state, { nowMs: Date.parse('2026-02-10T10:20:00.000Z') })
    expect(warnings).toEqual([])
  })

  it('handles missing and future updatedAt safely for no-telemetry checks', () => {
    const missingUpdatedState = buildRunTelemetryState({
      ...sampleStatus(),
      updatedAt: undefined,
      events: [],
    })
    const warningsWithMissingUpdatedAt = selectRunOperatorWarnings(missingUpdatedState, {
      nowMs: Date.parse('2026-02-10T10:20:00.000Z'),
      thresholdMs: RUN_VIEW_WARNING_THRESHOLD_MS,
    })
    expect(warningsWithMissingUpdatedAt.some((warning) => warning.id === 'no_telemetry')).toBe(false)

    const futureUpdatedState = buildRunTelemetryState({
      ...sampleStatus(),
      updatedAt: '2026-02-10T11:00:00.000Z',
    })
    const warningsWithFutureUpdatedAt = selectRunOperatorWarnings(futureUpdatedState, {
      nowMs: Date.parse('2026-02-10T10:20:00.000Z'),
      thresholdMs: RUN_VIEW_WARNING_THRESHOLD_MS,
    })
    expect(warningsWithFutureUpdatedAt.some((warning) => warning.id === 'no_telemetry')).toBe(false)
  })

  it('does not emit phase stalled warning when active phase cannot be determined', () => {
    const state = buildRunTelemetryState(sampleStatus())
    state.activePhaseId = null
    const warnings = selectRunOperatorWarnings(state, {
      nowMs: Date.parse('2026-02-10T10:20:00.000Z'),
      thresholdMs: RUN_VIEW_WARNING_THRESHOLD_MS,
    })
    expect(warnings.some((warning) => warning.id === 'phase_stalled')).toBe(false)
  })

  it('emits no-telemetry and phase-stalled warnings for stale running runs', () => {
    const state = buildRunTelemetryState(sampleStatus())
    const warnings = selectRunOperatorWarnings(state, {
      nowMs: Date.parse('2026-02-10T10:20:00.000Z'),
      thresholdMs: 3 * 60 * 1000,
    })
    expect(warnings.some((warning) => warning.id === 'no_telemetry')).toBe(true)
    expect(warnings.some((warning) => warning.id === 'phase_stalled')).toBe(true)
  })
})
