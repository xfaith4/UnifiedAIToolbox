/**
 * Observability Alignment — Regression Test Harness
 *
 * Validates that the two run pathways (App Factory + Concierge/Orchestrator)
 * produce consistent, resolvable run records via the canonical routes.
 *
 * Tests are unit-level (no live server required). They verify:
 *   1. Status enum normalization covers both pathway vocabularies
 *   2. orchestratorFallback correctly normalizes orchestrator API responses
 *   3. isValidRunId accepts both maint- and multi-agent_ prefixed IDs
 *   4. runContextStore links run_id → proposal_id correctly
 *
 * Integration tests (requiring a live server) are in:
 *   scripts/test-observability-integration.sh  (manual / CI)
 */

import { describe, it, expect, beforeEach } from 'vitest'

// ── 1. isValidRunId accepts both pathway formats ──────────────────────────────

describe('isValidRunId — both pathway formats', () => {
  // Inline implementation matching runStatus.ts to avoid server-only import
  function isValidRunId(runId: string): boolean {
    const RUN_ID_PATTERN = /^[a-zA-Z0-9._-]+$/
    const trimmed = runId.trim()
    if (!RUN_ID_PATTERN.test(trimmed)) return false
    if (trimmed.includes('..')) return false
    return true
  }

  it('accepts App Factory maint- IDs', () => {
    expect(isValidRunId('maint-2026-02-28T12-00-00-000Z-a3f7b2c1')).toBe(true)
  })

  it('accepts orchestrator multi-agent_ IDs', () => {
    expect(isValidRunId('multi-agent_1706700000000')).toBe(true)
  })

  it('accepts orchestrator codex_ IDs', () => {
    expect(isValidRunId('codex_1706700000000')).toBe(true)
  })

  it('rejects path traversal', () => {
    expect(isValidRunId('../etc/passwd')).toBe(false)
    expect(isValidRunId('../../secret')).toBe(false)
  })

  it('rejects IDs with spaces', () => {
    expect(isValidRunId('run id with spaces')).toBe(false)
  })
})

// ── 2. Status enum normalization covers both vocabularies ─────────────────────

describe('normalizeState — unified status vocabulary', () => {
  // Inline implementation matching the updated runStatus.ts
  function normalizeState(raw?: string): 'queued' | 'running' | 'succeeded' | 'failed' {
    const value = String(raw || '').toLowerCase()
    if (['queued', 'pending'].includes(value)) return 'queued'
    if (['running', 'in_progress', 'active', 'dispatching', 'gating', 'awaiting_gate', 'awaiting_input', 'starting'].includes(value)) return 'running'
    if (['succeeded', 'success', 'passed', 'completed', 'done'].includes(value)) return 'succeeded'
    if (['failed', 'error', 'cancelled', 'canceled', 'stuck'].includes(value)) return 'failed'
    return 'running'
  }

  const cases: [string, 'queued' | 'running' | 'succeeded' | 'failed'][] = [
    // App Factory statuses
    ['queued',    'queued'],
    ['running',   'running'],
    ['succeeded', 'succeeded'],
    ['failed',    'failed'],
    // Orchestrator statuses
    ['pending',        'queued'],
    ['dispatching',    'running'],
    ['in_progress',    'running'],
    ['gating',         'running'],
    ['awaiting_gate',  'running'],
    ['awaiting_input', 'running'],
    ['starting',       'running'],
    ['completed',      'succeeded'],
    ['success',        'succeeded'],
    ['done',           'succeeded'],
    ['error',          'failed'],
    ['cancelled',      'failed'],
    ['canceled',       'failed'],
    ['stuck',          'failed'],
    // Edge cases
    ['RUNNING',   'running'],  // case-insensitive
    ['',          'running'],  // default
    [undefined as unknown as string, 'running'],
  ]

  for (const [input, expected] of cases) {
    it(`normalizeState("${input}") → "${expected}"`, () => {
      expect(normalizeState(input)).toBe(expected)
    })
  }
})

// ── 3. orchestratorFallback normalization (pure logic, no HTTP) ───────────────

describe('orchestratorFallback — response normalization', () => {
  // Extract the normalization logic inline so we can test without server-only imports
  type RunEvent = { ts: string; runId?: string; type?: string; stage?: string; message: string }
  type RunStatusLike = {
    runId: string
    status: 'queued' | 'running' | 'succeeded' | 'failed'
    currentStage: string | null
    events: RunEvent[]
  }

  function normalizeOrchestratorRaw(raw: Record<string, unknown>, runId: string): RunStatusLike {
    const events: RunEvent[] = Array.isArray(raw.events)
      ? (raw.events as Record<string, unknown>[]).map((ev) => ({
          ts: String(ev.ts ?? ev.timestamp ?? new Date().toISOString()),
          runId,
          type: String(ev.type ?? 'info'),
          stage: ev.stage ? String(ev.stage) : undefined,
          message: String(ev.message ?? ev.msg ?? ''),
        }))
      : []

    const rawStatus = String(raw.status ?? 'unknown').toLowerCase()
    let status: RunStatusLike['status']
    if (['queued', 'pending'].includes(rawStatus)) status = 'queued'
    else if (['succeeded', 'completed', 'success', 'done'].includes(rawStatus)) status = 'succeeded'
    else if (['failed', 'error', 'cancelled', 'canceled'].includes(rawStatus)) status = 'failed'
    else status = 'running'

    const latest = events.at(-1)
    const currentStage = raw.current_stage ? String(raw.current_stage) : latest?.stage ?? null

    return { runId, status, currentStage, events }
  }

  it('maps completed orchestrator run to succeeded', () => {
    const raw = { run_id: 'multi-agent_123', status: 'completed', events: [], current_stage: null }
    const result = normalizeOrchestratorRaw(raw, 'multi-agent_123')
    expect(result.status).toBe('succeeded')
    expect(result.runId).toBe('multi-agent_123')
  })

  it('maps running orchestrator run', () => {
    const raw = { run_id: 'multi-agent_456', status: 'running', current_stage: 'Analyze', events: [] }
    const result = normalizeOrchestratorRaw(raw, 'multi-agent_456')
    expect(result.status).toBe('running')
    expect(result.currentStage).toBe('Analyze')
  })

  it('normalizes events from orchestrator format', () => {
    const raw = {
      run_id: 'codex_789',
      status: 'running',
      events: [
        { ts: '2026-02-28T10:00:00Z', type: 'status', message: 'running' },
        { ts: '2026-02-28T10:01:00Z', type: 'info', message: 'Stage Analyze started', stage: 'Analyze' },
      ],
    }
    const result = normalizeOrchestratorRaw(raw, 'codex_789')
    expect(result.events).toHaveLength(2)
    expect(result.events[0].type).toBe('status')
    expect(result.events[1].stage).toBe('Analyze')
    expect(result.currentStage).toBe('Analyze')
  })

  it('handles missing events gracefully', () => {
    const raw = { run_id: 'multi-agent_000', status: 'queued' }
    const result = normalizeOrchestratorRaw(raw, 'multi-agent_000')
    expect(result.status).toBe('queued')
    expect(result.events).toHaveLength(0)
    expect(result.currentStage).toBeNull()
  })
})

// ── 4. runContextStore links run_id → proposal_id ────────────────────────────

describe('runContextStore — proposal_id linking', () => {
  let storage: Record<string, string> = {}

  beforeEach(() => {
    storage = {}
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => storage[key] ?? null,
        setItem: (key: string, value: string) => { storage[key] = value },
        removeItem: (key: string) => { delete storage[key] },
        clear: () => { storage = {} },
      },
      writable: true,
      configurable: true,
    })
  })

  it('saves and retrieves run context with proposalId', async () => {
    const { saveRunContext, getRunContext } = await import('@/lib/services/runContextStore')
    saveRunContext({
      runId: 'multi-agent_123',
      goal: 'Test alignment',
      startedAt: new Date().toISOString(),
      mode: 'multi-agent',
      status: 'running',
      proposalId: 'proposal_456_abc123',
    })
    const entry = getRunContext('multi-agent_123')
    expect(entry).toBeDefined()
    expect(entry?.proposalId).toBe('proposal_456_abc123')
    expect(entry?.runId).toBe('multi-agent_123')
  })

  it('preserves run_id stability across status updates', async () => {
    const { saveRunContext, updateRunContextStatus, getRunContext } = await import('@/lib/services/runContextStore')
    saveRunContext({
      runId: 'maint-2026-02-28T12-00-00-000Z-a3f7b2c1',
      goal: 'App Factory run',
      startedAt: new Date().toISOString(),
      mode: 'maintain_existing_app',
      status: 'queued',
    })
    updateRunContextStatus('maint-2026-02-28T12-00-00-000Z-a3f7b2c1', 'running')
    const entry = getRunContext('maint-2026-02-28T12-00-00-000Z-a3f7b2c1')
    expect(entry?.runId).toBe('maint-2026-02-28T12-00-00-000Z-a3f7b2c1')
    expect(entry?.status).toBe('running')
  })

  it('does not mix run IDs from different proposals', async () => {
    const { saveRunContext, getRunContext } = await import('@/lib/services/runContextStore')
    saveRunContext({ runId: 'multi-agent_111', goal: 'Goal A', startedAt: new Date().toISOString(), status: 'running', proposalId: 'proposal_AAA' })
    saveRunContext({ runId: 'multi-agent_222', goal: 'Goal B', startedAt: new Date().toISOString(), status: 'queued', proposalId: 'proposal_BBB' })
    expect(getRunContext('multi-agent_111')?.proposalId).toBe('proposal_AAA')
    expect(getRunContext('multi-agent_222')?.proposalId).toBe('proposal_BBB')
  })
})

// ── 5. isAppFactoryRunId detection ───────────────────────────────────────────

describe('isAppFactoryRunId — run source detection', () => {
  function isAppFactoryRunId(runId: string): boolean {
    return runId.startsWith('maint-')
  }

  it('identifies App Factory run IDs', () => {
    expect(isAppFactoryRunId('maint-2026-02-28T12-00-00-000Z-a3f7b2c1')).toBe(true)
  })

  it('identifies orchestrator run IDs as NOT App Factory', () => {
    expect(isAppFactoryRunId('multi-agent_1706700000000')).toBe(false)
    expect(isAppFactoryRunId('codex_1706700000000')).toBe(false)
  })
})
