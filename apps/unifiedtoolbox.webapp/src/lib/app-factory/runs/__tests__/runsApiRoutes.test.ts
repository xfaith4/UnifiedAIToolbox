import { beforeEach, describe, expect, it, vi } from 'vitest'

const isValidRunIdMock = vi.fn<(runId: string) => boolean>()
const buildRunManifestMock = vi.fn<(runId: string) => Promise<unknown | null>>()
const readEventsMock = vi.fn<(runId: string, opts?: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>>()
const loadRunStatusMock = vi.fn<(runId: string) => Promise<unknown>>()
const fetchOrchestratorRunStatusMock = vi.fn<(runId: string) => Promise<unknown>>()
const readFinalSummaryMock = vi.fn<(runId: string) => Promise<unknown | null>>()
const runLoggerMock = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}
// Snapshot streams in these tests emit a small connected+replay+stream-end backlog.
const MAX_SSE_CHUNK_READS = 20

async function readSseSnapshot(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let out = ''
  for (let readCount = 0; readCount < MAX_SSE_CHUNK_READS; readCount += 1) {
    const { done, value } = await reader.read()
    if (done || !value) break
    out += decoder.decode(value, { stream: true })
    if (out.includes('event: stream-end')) break
  }
  await reader.cancel()
  return out
}

vi.mock('@/lib/app-factory/runs/runStatus', () => ({
  isValidRunId: isValidRunIdMock,
  loadRunStatus: loadRunStatusMock,
}))

vi.mock('@/lib/app-factory/runs/manifest', () => ({
  buildRunManifest: buildRunManifestMock,
}))

vi.mock('@/lib/app-factory/runs/canonicalEvents', () => ({
  readEvents: readEventsMock,
  sliceEventsFromCursor: (events: Array<Record<string, unknown>>) => events,
  toSseFrame: (event: Record<string, unknown>) => {
    const id = String(event.event_id ?? 'evt-unknown')
    return `id: ${id}\n` + `event: ${String(event.event_type ?? 'unknown')}\n` + `data: ${JSON.stringify(event)}\n\n`
  },
}))

vi.mock('@/lib/app-factory/runs/orchestratorFallback', () => ({
  fetchOrchestratorRunStatus: fetchOrchestratorRunStatusMock,
}))

vi.mock('@/lib/app-factory/runs/finalSummary', () => ({
  readFinalSummary: readFinalSummaryMock,
}))

vi.mock('@/lib/app-factory/runs/runLogger', () => ({
  runLogger: runLoggerMock,
}))

describe('runs API canonical routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isValidRunIdMock.mockReturnValue(true)
  })

  it('returns 400 for invalid runId across canonical endpoints', async () => {
    isValidRunIdMock.mockReturnValue(false)

    const { GET: manifestGet } = await import('@/app/api/runs/[runId]/manifest/route')
    const { GET: canonicalGet } = await import('@/app/api/runs/[runId]/events/canonical/route')
    const { GET: summaryGet } = await import('@/app/api/runs/[runId]/summary/route')

    const req = new Request('http://localhost/api/runs/invalid')
    const params = { params: Promise.resolve({ runId: 'invalid-run-id' }) }

    const manifestRes = await manifestGet(req, params)
    const canonicalRes = await canonicalGet(req, params)
    const summaryRes = await summaryGet(req, params)

    expect(manifestRes.status).toBe(400)
    expect(canonicalRes.status).toBe(400)
    expect(summaryRes.status).toBe(400)

    await expect(manifestRes.json()).resolves.toMatchObject({ error: { code: 'INVALID_RUN_ID' } })
    await expect(canonicalRes.json()).resolves.toMatchObject({ error: { code: 'INVALID_RUN_ID' } })
    await expect(summaryRes.json()).resolves.toMatchObject({ error: { code: 'INVALID_RUN_ID' } })
  })

  it('returns 404 for missing run manifest and summary', async () => {
    buildRunManifestMock.mockResolvedValue(null)
    loadRunStatusMock.mockResolvedValue(null)
    fetchOrchestratorRunStatusMock.mockResolvedValue(null)

    const { GET: manifestGet } = await import('@/app/api/runs/[runId]/manifest/route')
    const { GET: summaryGet } = await import('@/app/api/runs/[runId]/summary/route')

    const req = new Request('http://localhost/api/runs/run_404')
    const params = { params: Promise.resolve({ runId: 'run_404' }) }

    const manifestRes = await manifestGet(req, params)
    const summaryRes = await summaryGet(req, params)

    expect(manifestRes.status).toBe(404)
    expect(summaryRes.status).toBe(404)
    await expect(manifestRes.json()).resolves.toMatchObject({ error: { code: 'RUN_NOT_FOUND' } })
    await expect(summaryRes.json()).resolves.toMatchObject({ error: { code: 'RUN_NOT_FOUND' } })
  })

  it('returns 200 and empty canonical events payload for an empty run', async () => {
    readEventsMock.mockResolvedValue([])

    const { GET: canonicalGet } = await import('@/app/api/runs/[runId]/events/canonical/route')

    const eventsRes = await canonicalGet(new Request('http://localhost/api/runs/run_empty/events/canonical'), {
      params: Promise.resolve({ runId: 'run_empty' }),
    })

    expect(eventsRes.status).toBe(200)
    await expect(eventsRes.json()).resolves.toEqual({ runId: 'run_empty', events: [], cursor: null })
  })

  it('returns 200 for terminal run summary with canonical enrichment', async () => {
    loadRunStatusMock.mockResolvedValue({
      runId: 'run_terminal',
      status: 'completed',
      updatedAt: '2026-05-30T10:00:00.000Z',
      events: [{ ts: '2026-05-30T10:00:00.000Z', stage: 'complete', step: 'finalize' }],
      attempts: [],
      attemptNumber: 1,
      currentAttemptId: 'attempt-1',
    })

    buildRunManifestMock.mockResolvedValue({
      runId: 'run_terminal',
      status: 'completed',
      quality: { verdict: 'pass' },
    })

    readFinalSummaryMock.mockResolvedValue({
      runId: 'run_terminal',
      final_status: 'completed',
      readiness: 'ready',
    })

    const { GET: summaryGet } = await import('@/app/api/runs/[runId]/summary/route')
    const res = await summaryGet(new Request('http://localhost/api/runs/run_terminal/summary'), {
      params: Promise.resolve({ runId: 'run_terminal' }),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('X-Run-Source')).toBe('app-factory')
    await expect(res.json()).resolves.toMatchObject({
      runId: 'run_terminal',
      status: 'completed',
      canonical_status: 'completed',
      final_summary: {
        final_status: 'completed',
      },
      manifest: {
        runId: 'run_terminal',
        status: 'completed',
      },
    })
  })

  it('returns 200 for manifest and canonical events when run data exists', async () => {
    buildRunManifestMock.mockResolvedValue({
      runId: 'run_ok',
      status: 'running',
      started_at: '2026-05-30T11:00:00.000Z',
    })

    readEventsMock.mockResolvedValue([
      {
        event_id: 'evt-1',
        event_type: 'run.lifecycle.started',
        ts: '2026-05-30T11:00:00.000Z',
      },
      {
        event_id: 'evt-2',
        event_type: 'run.lifecycle.stage_changed',
        ts: '2026-05-30T11:00:02.000Z',
      },
    ])

    const { GET: manifestGet } = await import('@/app/api/runs/[runId]/manifest/route')
    const { GET: canonicalGet } = await import('@/app/api/runs/[runId]/events/canonical/route')

    const manifestRes = await manifestGet(new Request('http://localhost/api/runs/run_ok/manifest'), {
      params: Promise.resolve({ runId: 'run_ok' }),
    })

    const canonicalRes = await canonicalGet(
      new Request('http://localhost/api/runs/run_ok/events/canonical?after_event_id=evt-1&limit=10'),
      {
        params: Promise.resolve({ runId: 'run_ok' }),
      }
    )

    expect(manifestRes.status).toBe(200)
    await expect(manifestRes.json()).resolves.toMatchObject({ runId: 'run_ok', status: 'running' })

    expect(canonicalRes.status).toBe(200)
    await expect(canonicalRes.json()).resolves.toMatchObject({
      runId: 'run_ok',
      cursor: 'evt-2',
      events: [
        { event_id: 'evt-1' },
        { event_id: 'evt-2' },
      ],
    })
    expect(readEventsMock).toHaveBeenCalledWith('run_ok', {
      afterEventId: 'evt-1',
      afterTimestamp: undefined,
      limit: 10,
    })
  })

  it('replays canonical SSE from Last-Event-ID when reconnecting', async () => {
    readEventsMock.mockResolvedValue([
      {
        event_id: 'evt-2',
        event_type: 'run.lifecycle.stage_changed',
        ts: '2026-05-30T11:00:02.000Z',
      },
    ])

    const { GET: canonicalGet } = await import('@/app/api/runs/[runId]/events/canonical/route')
    const res = await canonicalGet(
      new Request('http://localhost/api/runs/run_ok/events/canonical?stream=1', {
        headers: {
          accept: 'text/event-stream',
          'last-event-id': 'evt-1',
        },
      }),
      {
        params: Promise.resolve({ runId: 'run_ok' }),
      }
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(readEventsMock).toHaveBeenCalledWith('run_ok', {
      afterEventId: 'evt-1',
      afterTimestamp: undefined,
      limit: undefined,
    })

    const body = await readSseSnapshot(res)
    expect(body).toContain(': connected')
    expect(body).toContain('id: evt-2')
    expect(body).toContain('event: stream-end')
    expect(body).toContain('"runId":"run_ok"')
  })

  it('prefers after_event_id query over Last-Event-ID for SSE replay', async () => {
    readEventsMock.mockResolvedValue([])

    const { GET: canonicalGet } = await import('@/app/api/runs/[runId]/events/canonical/route')
    const res = await canonicalGet(
      new Request('http://localhost/api/runs/run_ok/events/canonical?stream=1&after_event_id=evt-4', {
        headers: {
          accept: 'text/event-stream',
          'last-event-id': 'evt-1',
        },
      }),
      {
        params: Promise.resolve({ runId: 'run_ok' }),
      }
    )

    expect(res.status).toBe(200)
    expect(readEventsMock).toHaveBeenCalledWith('run_ok', {
      afterEventId: 'evt-4',
      afterTimestamp: undefined,
      limit: undefined,
    })
  })
})
