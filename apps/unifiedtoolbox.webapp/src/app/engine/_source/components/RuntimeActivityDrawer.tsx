import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { RunEvent, RunStatusResponse } from '@/lib/app-factory/runs/types'
import { filterEvents, type EventFilterMode } from '@/lib/app-factory/runs/runtimeEventUtils'

const STAGES = ['agents', 'assemble', 'normalize', 'contract', 'gates', 'repair', 'export'] as const
const LONG_STAGE_NO_PROGRESS_SEC = 20
const LIKELY_STUCK_SEC = 30

type Props = {
  runId: string
  status: RunStatusResponse | null
  events: RunEvent[]
  mode: 'sse' | 'file'
  loading?: boolean
  error?: string | null
  autoOpenLongStageThresholdSec?: number
}

type TabId = 'live' | 'steps' | 'errors' | 'artifacts'

function secondsSince(ts?: string | null): number | null {
  if (!ts) return null
  const ms = Date.parse(ts)
  if (!Number.isFinite(ms)) return null
  return Math.floor(Math.max(0, Date.now() - ms) / 1000)
}

function normalizeStage(value?: string | null): string | null {
  const raw = String(value || '').toLowerCase().trim()
  if (!raw) return null
  if (STAGES.includes(raw as (typeof STAGES)[number])) return raw
  if (raw.includes('assemble')) return 'assemble'
  if (raw.includes('normal')) return 'normalize'
  if (raw.includes('contract')) return 'contract'
  if (raw.includes('gate')) return 'gates'
  if (raw.includes('repair')) return 'repair'
  if (raw.includes('export')) return 'export'
  if (raw.includes('agent') || raw.includes('team')) return 'agents'
  return raw
}

function eventMessage(event: RunEvent): string {
  return event.msg || event.message || 'event'
}

function extractCounters(events: RunEvent[]) {
  const counters: Record<string, number> = {}
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const data = events[i].data || events[i].details
    if (!data) continue
    const numericKeys = ['files_scanned', 'files_excluded', 'files_written', 'bytes_written', 'bytes_total_estimate', 'pass', 'total_passes'] as const
    for (const key of numericKeys) {
      const value = data[key]
      if (typeof value === 'number' && Number.isFinite(value) && counters[key] == null) {
        counters[key] = value
      }
    }
  }
  return counters
}

function formatBytes(bytes?: number): string {
  if (!Number.isFinite(bytes || NaN)) return '-'
  const value = Number(bytes)
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function dedupeErrors(events: RunEvent[]): Array<{ key: string; count: number; event: RunEvent }> {
  const grouped = new Map<string, { count: number; event: RunEvent }>()
  for (const event of events) {
    const level = String(event.level || '').toLowerCase()
    const type = String(event.type || '').toLowerCase()
    const message = eventMessage(event).trim()
    const isError = level === 'error' || type === 'error' || message.toLowerCase().includes('failed') || message.toLowerCase().includes('error')
    if (!isError) continue
    const key = `${event.stage || 'unknown'}:${event.step || '-'}:${message}`
    const curr = grouped.get(key)
    if (curr) curr.count += 1
    else grouped.set(key, { count: 1, event })
  }
  return Array.from(grouped.entries()).map(([key, value]) => ({ key, ...value }))
}

const RuntimeActivityDrawer: React.FC<Props> = ({
  runId,
  status,
  events,
  mode,
  loading,
  error,
  autoOpenLongStageThresholdSec = LONG_STAGE_NO_PROGRESS_SEC,
}) => {
  const [, setClock] = useState(0)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<TabId>('live')
  const [filter, setFilter] = useState<EventFilterMode>('all')
  const [search, setSearch] = useState('')
  const [autoFollow, setAutoFollow] = useState(true)
  const tailRef = useRef<HTMLDivElement | null>(null)

  const activeState = status?.status
  const isActive = activeState === 'queued' || activeState === 'running'

  const currentStage = useMemo(() => {
    const fromStatus = normalizeStage(status?.currentStage)
    if (fromStatus) return fromStatus
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const stage = normalizeStage(events[i].stage || events[i].phase)
      if (stage) return stage
    }
    return null
  }, [events, status?.currentStage])

  const currentStep = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      if (events[i].step) return events[i].step as string
      const msg = eventMessage(events[i])
      if (msg) return msg
    }
    return null
  }, [events])

  const filteredEvents = useMemo(() => {
    const base = filterEvents(events, filter)
    if (!search.trim()) return base
    const needle = search.trim().toLowerCase()
    return base.filter((event) => {
      return [eventMessage(event), event.stage, event.step, event.type]
        .filter(Boolean)
        .some((part) => String(part).toLowerCase().includes(needle))
    })
  }, [events, filter, search])

  const lastProgressAt = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const type = String(events[i].type || '').toLowerCase()
      if (type.includes('progress') || type === 'metric') return events[i].ts
    }
    return events.at(-1)?.ts || null
  }, [events])

  const lastProgressSec = secondsSince(lastProgressAt)
  const likelyStuck = isActive && (lastProgressSec ?? 0) >= LIKELY_STUCK_SEC
  const longRunningNoProgress =
    isActive &&
    ['normalize', 'repair', 'export', 'gates', 'contract'].includes(String(currentStage || '')) &&
    (lastProgressSec ?? 0) >= autoOpenLongStageThresholdSec

  const errors = useMemo(() => dedupeErrors(events), [events])
  const counters = useMemo(() => extractCounters(events), [events])

  useEffect(() => {
    const timer = setInterval(() => {
      setClock((value) => (value + 1) % 10_000)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const artifacts = useMemo(() => {
    return events
      .filter((event) => {
        const type = String(event.type || '').toLowerCase()
        const message = eventMessage(event).toLowerCase()
        return type === 'artifact.created' || message.includes('artifact created') || Boolean(event.data?.path)
      })
      .map((event) => ({
        ts: event.ts,
        path: String(event.data?.path || event.details?.file || event.message || '-'),
        size: typeof event.data?.bytes === 'number' ? event.data.bytes : undefined,
      }))
      .reverse()
  }, [events])

  useEffect(() => {
    if (errors.length > 0 || longRunningNoProgress) {
      setOpen(true)
    }
  }, [errors.length, longRunningNoProgress])

  useEffect(() => {
    if (!open || !autoFollow) return
    const el = tailRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [filteredEvents.length, open, autoFollow])

  const copyLast200 = async () => {
    const slice = events.slice(-200)
    const lines = slice.map((event) => JSON.stringify(event)).join('\n')
    await navigator.clipboard.writeText(lines)
  }

  const explainStub = () => {
    window.alert('Explain last 200 events is not wired to a local summarizer yet. This is a placeholder.')
  }

  const stageProgressByStep = useMemo(() => {
    const map = new Map<string, string>()
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const step = events[i].step || eventMessage(events[i])
      if (!step || map.has(step)) continue
      map.set(step, events[i].ts)
    }
    return Array.from(map.entries())
  }, [events])

  return (
    <section className="border-t border-slate-800 bg-slate-950/80">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-slate-200 hover:bg-slate-900/70"
      >
        <span className="font-medium">Runtime Log / Activity</span>
        <span className="text-xs text-slate-400">
          {open ? 'Hide' : 'Show'} · {currentStage || 'idle'}{currentStep ? ` / ${currentStep}` : ''}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-800 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-300">run: {runId.slice(0, 22)}</span>
            <span className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-300">stage: {currentStage || '-'}</span>
            <span className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-300">step: {currentStep || '-'}</span>
            <span className={`rounded border px-2 py-1 ${likelyStuck ? 'border-amber-500/50 bg-amber-900/30 text-amber-100' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>
              Last progress: {lastProgressSec != null ? `${lastProgressSec}s ago` : '-'}
            </span>
            {likelyStuck && <span className="rounded border border-amber-500/50 bg-amber-900/30 px-2 py-1 text-amber-100">Likely stuck</span>}
            {status?.updatedAt && secondsSince(status.updatedAt) != null && secondsSince(status.updatedAt)! > 60 && (
              <span className="rounded border border-rose-500/50 bg-rose-900/30 px-2 py-1 text-rose-100">No heartbeat</span>
            )}
            {mode === 'file' && (
              <span className="rounded border border-amber-500/40 bg-amber-950/30 px-2 py-1 text-amber-100">
                Live stream unavailable - using file tail.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs">
            {(['live', 'steps', 'errors', 'artifacts'] as TabId[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded border px-2 py-1 ${tab === id ? 'border-blue-500/60 bg-blue-900/30 text-blue-100' : 'border-slate-700 bg-slate-900 text-slate-300'}`}
              >
                {id === 'live' ? 'Live' : id === 'steps' ? 'Steps' : id === 'errors' ? 'Errors' : 'Artifacts'}
              </button>
            ))}
          </div>

          {tab === 'live' && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as EventFilterMode)}
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"
                >
                  <option value="all">All</option>
                  <option value="warn_error">Warn + Error</option>
                  <option value="error">Errors only</option>
                </select>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search events"
                  className="min-w-[14rem] flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"
                />
                <label className="inline-flex items-center gap-1 text-slate-300">
                  <input type="checkbox" checked={autoFollow} onChange={(e) => setAutoFollow(e.target.checked)} />
                  Auto-follow
                </label>
                <button type="button" onClick={() => void copyLast200()} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200">Copy last 200 lines</button>
                <button type="button" onClick={explainStub} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200">Explain last 200 events</button>
              </div>
              <div ref={tailRef} className="max-h-72 overflow-auto rounded border border-slate-800 bg-slate-950 p-2 text-xs">
                {loading && <div className="text-slate-500">Loading events...</div>}
                {error && <div className="text-rose-300">{error}</div>}
                {!filteredEvents.length && !loading && <div className="text-slate-500">No events.</div>}
                {filteredEvents.map((event, idx) => {
                  const lvl = String(event.level || 'info').toLowerCase()
                  const color = lvl === 'error' ? 'text-rose-300' : lvl === 'warn' ? 'text-amber-200' : 'text-slate-200'
                  return (
                    <div key={`${event.ts}-${idx}`} className={`font-mono ${color}`}>
                      [{new Date(event.ts).toLocaleTimeString()}] [{event.stage || event.phase || '-'}] {eventMessage(event)}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {tab === 'steps' && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded border border-slate-800 bg-slate-950 p-2 text-xs">
                <div className="mb-2 text-slate-300">Pipeline stages</div>
                <ul className="space-y-1">
                  {STAGES.map((stageId) => (
                    <li key={stageId} className={stageId === currentStage ? 'text-blue-200' : 'text-slate-300'}>
                      {stageId}{stageId === currentStage ? ' (current)' : ''}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded border border-slate-800 bg-slate-950 p-2 text-xs">
                <div className="mb-2 text-slate-300">Recent step signals</div>
                <ul className="space-y-1 text-slate-300">
                  {stageProgressByStep.slice(0, 20).map(([step, ts]) => (
                    <li key={step}>
                      {step} - {new Date(ts).toLocaleTimeString()}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {tab === 'errors' && (
            <div className="max-h-72 space-y-2 overflow-auto rounded border border-slate-800 bg-slate-950 p-2 text-xs">
              {!errors.length && <div className="text-slate-500">No errors recorded.</div>}
              {errors.map((item) => (
                <details key={item.key} className="rounded border border-rose-900/40 bg-rose-950/20 p-2">
                  <summary className="cursor-pointer text-rose-200">
                    {eventMessage(item.event)} ({item.count})
                  </summary>
                  <pre className="mt-2 overflow-x-auto text-[11px] text-slate-300">{JSON.stringify(item.event, null, 2)}</pre>
                </details>
              ))}
            </div>
          )}

          {tab === 'artifacts' && (
            <div className="max-h-72 overflow-auto rounded border border-slate-800 bg-slate-950 p-2 text-xs text-slate-300">
              {!artifacts.length && <div className="text-slate-500">No artifact events yet.</div>}
              {artifacts.map((artifact, index) => (
                <div key={`${artifact.path}-${index}`} className="flex items-center justify-between border-b border-slate-900 py-1 last:border-b-0">
                  <span>{artifact.path}</span>
                  <span className="text-slate-500">{formatBytes(artifact.size)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
            <span>events: {events.length}</span>
            <span>files scanned: {counters.files_scanned ?? '-'}</span>
            <span>excluded: {counters.files_excluded ?? '-'}</span>
            <span>bytes zipped: {formatBytes(counters.bytes_written)}</span>
            <span>repair pass: {counters.pass != null ? `${counters.pass}/${counters.total_passes ?? '-'}` : '-'}</span>
          </div>
        </div>
      )}
    </section>
  )
}

export default RuntimeActivityDrawer
