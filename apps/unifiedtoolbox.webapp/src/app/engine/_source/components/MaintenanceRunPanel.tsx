import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  RUN_VIEW_WARNING_THRESHOLD_MINUTES,
  buildRunTelemetryState,
  selectAgentBoardGroups,
  selectAgentSignals,
  selectArtifactsPanel,
  selectGates,
  selectPhaseBoardCards,
  selectRepairTargets,
  selectRunOperatorWarnings,
  selectTimeline,
  selectTimelineGroups,
  type NormalizedTelemetryEvent,
  type TelemetryAgentStatus,
  type TelemetryFilterOptions,
  type TelemetryGateStatus,
  type TelemetryPhaseStatus,
  type TimelinePhaseEvents,
  type TimelinePhaseId,
} from '@/lib/app-factory/runs/telemetryModel'
import type { RunStatusResponse } from '@/lib/app-factory/runs/types'

type Props = {
  runId: string | null
  status: RunStatusResponse | null
  loading?: boolean
  error?: string | null
  onOpenArtifact?: (path: string) => void
  onCancel?: () => void
}

type TimelineRenderRow =
  | {
      kind: 'header'
      key: string
      group: TimelinePhaseEvents
    }
  | {
      kind: 'event'
      key: string
      group: TimelinePhaseEvents
      event: NormalizedTelemetryEvent
    }

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900'
const TIMELINE_QUERY_PARAM_PHASE = 'selectedPhaseId'
const TIMELINE_QUERY_PARAM_AGENT = 'selectedAgentId'
const TIMELINE_VIRTUALIZATION_ROW_THRESHOLD = 240
const TIMELINE_VIEWPORT_HEIGHT_PX = 288
const TIMELINE_OVERSCAN = 8

const TIMELINE_PHASES: TimelinePhaseId[] = [
  'research',
  'implementation',
  'validation',
  'synthesis',
  'decision',
  'quality',
  'memory',
  'export',
]

function isTimelinePhaseId(value: string | null | undefined): value is TimelinePhaseId {
  if (!value) return false
  return TIMELINE_PHASES.includes(value as TimelinePhaseId)
}

function badgeClass(state: string) {
  switch (state) {
    case 'queued':
      return 'border-slate-600 bg-slate-800/60 text-slate-200'
    case 'running':
      return 'border-amber-500/40 bg-amber-900/30 text-amber-100'
    case 'succeeded':
      return 'border-emerald-500/40 bg-emerald-900/30 text-emerald-100'
    case 'failed':
      return 'border-rose-500/40 bg-rose-900/30 text-rose-100'
    default:
      return 'border-slate-700 bg-slate-900 text-slate-200'
  }
}

function phaseStatusClass(status: TelemetryPhaseStatus) {
  switch (status) {
    case 'running':
      return 'border-amber-600/40 bg-amber-900/30 text-amber-100'
    case 'pass':
      return 'border-emerald-600/40 bg-emerald-900/30 text-emerald-100'
    case 'fail':
      return 'border-rose-600/40 bg-rose-900/30 text-rose-100'
    default:
      return 'border-slate-700 bg-slate-900 text-slate-200'
  }
}

function agentStatusClass(status: TelemetryAgentStatus) {
  switch (status) {
    case 'running':
      return 'border-amber-600/40 bg-amber-900/30 text-amber-100'
    case 'done':
      return 'border-emerald-600/40 bg-emerald-900/30 text-emerald-100'
    case 'waiting':
      return 'border-sky-600/40 bg-sky-900/30 text-sky-100'
    case 'failed':
      return 'border-rose-600/40 bg-rose-900/30 text-rose-100'
    case 'skipped':
      return 'border-slate-700 bg-slate-800/70 text-slate-300'
    default:
      return 'border-slate-700 bg-slate-900 text-slate-200'
  }
}

function gateStatusClass(status: TelemetryGateStatus) {
  switch (status) {
    case 'running':
      return 'border-amber-600/40 bg-amber-900/30 text-amber-100'
    case 'pass':
      return 'border-emerald-600/40 bg-emerald-900/30 text-emerald-100'
    case 'fail':
      return 'border-rose-600/40 bg-rose-900/30 text-rose-100'
    default:
      return 'border-slate-700 bg-slate-900 text-slate-200'
  }
}

function severityClass(event: NormalizedTelemetryEvent) {
  if (event.severity === 'error') return 'border-rose-800/80 bg-rose-950/40'
  if (event.severity === 'warn') return 'border-amber-800/80 bg-amber-950/30'
  return 'border-gray-800 bg-gray-950/40'
}

function formatTime(value?: string | null) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleTimeString()
}

function formatDuration(ms?: number) {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}m ${secs}s`
}

function formatBytes(bytes?: number) {
  if (bytes == null || !Number.isFinite(bytes)) return 'file'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function canOpenArtifact(path: string | undefined) {
  if (!path) return false
  const lowered = path.toLowerCase()
  return (
    lowered.endsWith('.md') ||
    lowered.endsWith('.txt') ||
    lowered.endsWith('.json') ||
    lowered.endsWith('.log') ||
    lowered.endsWith('.diff') ||
    lowered.endsWith('.patch') ||
    lowered.endsWith('.yaml') ||
    lowered.endsWith('.yml')
  )
}

function timelineRowsFromGroups(groups: TimelinePhaseEvents[]): TimelineRenderRow[] {
  const rows: TimelineRenderRow[] = []
  for (const group of groups) {
    rows.push({
      kind: 'header',
      key: `header-${group.phaseId}`,
      group,
    })
    for (const event of group.events) {
      rows.push({
        kind: 'event',
        key: `event-${event.id}`,
        group,
        event,
      })
    }
  }
  return rows
}

function rowDefaultHeight(row: TimelineRenderRow) {
  return row.kind === 'header' ? 36 : 88
}

function findIndexForOffset(offsets: number[], target: number): number {
  if (!offsets.length) return 0
  let low = 0
  let high = offsets.length - 1
  let answer = 0

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const value = offsets[mid]
    if (value <= target) {
      answer = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return answer
}

const MaintenanceRunPanel: React.FC<Props> = ({ runId, status, loading, error, onOpenArtifact, onCancel }) => {
  const timelineViewportRef = useRef<HTMLDivElement | null>(null)

  const [selectedPhaseId, setSelectedPhaseId] = useState<TimelinePhaseId | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null)
  const [warningNowMs, setWarningNowMs] = useState(() => Date.now())
  const [timelineScrollTop, setTimelineScrollTop] = useState(0)
  const [measuredRowHeights, setMeasuredRowHeights] = useState<Record<number, number>>({})

  const telemetry = useMemo(() => buildRunTelemetryState(status), [status])

  const onPhaseClick = useCallback((phaseId: TimelinePhaseId) => {
    setSelectedPhaseId((current) => (current === phaseId ? null : phaseId))
    setSelectedAgentId(null)
    setHighlightedEventId(null)
  }, [])

  const onAgentClick = useCallback((agentId: string) => {
    setSelectedAgentId((current) => (current === agentId ? null : agentId))
    setSelectedPhaseId(null)
    setHighlightedEventId(null)
  }, [])

  const clearFilters = useCallback(() => {
    setSelectedPhaseId(null)
    setSelectedAgentId(null)
    setHighlightedEventId(null)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const phaseFromUrl = params.get(TIMELINE_QUERY_PARAM_PHASE)
    const agentFromUrl = params.get(TIMELINE_QUERY_PARAM_AGENT)
    setSelectedPhaseId(isTimelinePhaseId(phaseFromUrl) ? phaseFromUrl : null)
    setSelectedAgentId(agentFromUrl && agentFromUrl.trim() ? agentFromUrl.trim() : null)
  }, [runId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const params = url.searchParams

    if (selectedPhaseId) params.set(TIMELINE_QUERY_PARAM_PHASE, selectedPhaseId)
    else params.delete(TIMELINE_QUERY_PARAM_PHASE)

    if (selectedAgentId) params.set(TIMELINE_QUERY_PARAM_AGENT, selectedAgentId)
    else params.delete(TIMELINE_QUERY_PARAM_AGENT)

    const nextSearch = params.toString()
    const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`
    const currentUrl = `${url.pathname}${url.search}${url.hash}`
    if (nextUrl !== currentUrl) {
      window.history.replaceState(window.history.state, '', nextUrl)
    }
  }, [selectedPhaseId, selectedAgentId])

  useEffect(() => {
    if (!status || status.status !== 'running') return
    const interval = window.setInterval(() => setWarningNowMs(Date.now()), 30000)
    return () => window.clearInterval(interval)
  }, [status])

  const hasFilters = Boolean(selectedPhaseId || selectedAgentId)

  useEffect(() => {
    if (!hasFilters) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      clearFilters()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [clearFilters, hasFilters])

  const filters = useMemo<TelemetryFilterOptions>(
    () => ({
      phaseId: selectedPhaseId || undefined,
      agentId: selectedAgentId || undefined,
    }),
    [selectedPhaseId, selectedAgentId],
  )

  const viewState = useMemo(() => {
    return {
      phaseCards: selectPhaseBoardCards(telemetry, filters),
      agentGroups: selectAgentBoardGroups(telemetry, filters),
      timelineNodes: selectTimeline(telemetry),
      timelineGroups: selectTimelineGroups(telemetry, filters),
      artifactPanel: selectArtifactsPanel(telemetry, filters),
      gates: selectGates(telemetry, filters),
      agentSignals: selectAgentSignals(telemetry),
      repairTargets: selectRepairTargets(telemetry),
      operatorWarnings: selectRunOperatorWarnings(telemetry, { nowMs: warningNowMs }),
    }
  }, [telemetry, filters, warningNowMs])

  const timelineRows = useMemo(() => timelineRowsFromGroups(viewState.timelineGroups), [viewState.timelineGroups])
  const shouldVirtualizeTimeline = timelineRows.length > TIMELINE_VIRTUALIZATION_ROW_THRESHOLD

  useEffect(() => {
    setTimelineScrollTop(0)
    setMeasuredRowHeights({})
  }, [selectedPhaseId, selectedAgentId, runId, status?.updatedAt])

  const rowLayout = useMemo(() => {
    const rowOffsets: number[] = []
    let cursor = 0
    for (let idx = 0; idx < timelineRows.length; idx += 1) {
      rowOffsets.push(cursor)
      const measured = measuredRowHeights[idx]
      const height = measured != null ? measured : rowDefaultHeight(timelineRows[idx])
      cursor += height
    }
    return { rowOffsets, totalHeight: cursor }
  }, [timelineRows, measuredRowHeights])

  const visibleRange = useMemo(() => {
    if (!shouldVirtualizeTimeline || timelineRows.length === 0) {
      return { start: 0, end: Math.max(0, timelineRows.length - 1) }
    }
    const start = Math.max(0, findIndexForOffset(rowLayout.rowOffsets, timelineScrollTop) - TIMELINE_OVERSCAN)
    const end = Math.min(
      timelineRows.length - 1,
      findIndexForOffset(rowLayout.rowOffsets, timelineScrollTop + TIMELINE_VIEWPORT_HEIGHT_PX) + TIMELINE_OVERSCAN,
    )
    return { start, end }
  }, [shouldVirtualizeTimeline, timelineRows.length, rowLayout.rowOffsets, timelineScrollTop])

  const visibleRows = useMemo(() => {
    if (timelineRows.length === 0) return [] as Array<{ row: TimelineRenderRow; index: number }>
    const rows: Array<{ row: TimelineRenderRow; index: number }> = []
    for (let idx = visibleRange.start; idx <= visibleRange.end; idx += 1) {
      rows.push({ row: timelineRows[idx], index: idx })
    }
    return rows
  }, [timelineRows, visibleRange])

  const measureRow = useCallback((index: number, node: HTMLDivElement | null) => {
    if (!node) return
    const measured = Math.ceil(node.getBoundingClientRect().height)
    setMeasuredRowHeights((prev) => {
      if (prev[index] === measured) return prev
      return { ...prev, [index]: measured }
    })
  }, [])

  useEffect(() => {
    if (!highlightedEventId) return
    const targetIndex = timelineRows.findIndex((row) => row.kind === 'event' && row.event.id === highlightedEventId)
    if (targetIndex < 0) return

    if (shouldVirtualizeTimeline) {
      const top = Math.max(0, (rowLayout.rowOffsets[targetIndex] || 0) - 24)
      setTimelineScrollTop(top)
      timelineViewportRef.current?.scrollTo({ top, behavior: 'smooth' })
      return
    }

    const targetEl = document.getElementById(`timeline-event-${highlightedEventId}`)
    targetEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightedEventId, rowLayout.rowOffsets, shouldVirtualizeTimeline, timelineRows])

  const warningBannerLines = useMemo(() => {
    const deduped = new Set<string>()
    for (const value of status?.warnings || []) deduped.add(value)
    for (const value of telemetry.warnings || []) deduped.add(value)
    return Array.from(deduped)
  }, [status?.warnings, telemetry.warnings])

  const onRepairIndicatorClick = useCallback(
    (agentId: string) => {
      const target = viewState.repairTargets[agentId]
      if (!target?.available) return

      const artifactPath = target.artifactPath
      if (artifactPath && onOpenArtifact && canOpenArtifact(artifactPath)) {
        onOpenArtifact(artifactPath)
        return
      }

      if (target.eventId) {
        setHighlightedEventId(target.eventId)
        setSelectedAgentId(agentId)
        const phaseId = telemetry.agents[agentId]?.phaseId
        if (phaseId) setSelectedPhaseId(phaseId)
      }
    },
    [viewState.repairTargets, onOpenArtifact, telemetry.agents],
  )

  const renderTimelineRow = useCallback(
    (row: TimelineRenderRow) => {
      if (row.kind === 'header') {
        return (
          <div className="rounded border border-gray-800 bg-gray-950/40 p-2">
            <button
              type="button"
              className={`w-full flex items-center justify-between gap-2 text-left ${FOCUS_RING}`}
              onClick={() => onPhaseClick(row.group.phaseId)}
            >
              <span className="text-xs font-semibold text-gray-200">{row.group.label}</span>
              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${phaseStatusClass(row.group.status)}`}>
                {row.group.events.length} events
              </span>
            </button>
          </div>
        )
      }

      const event = row.event
      const highlight = highlightedEventId === event.id
      return (
        <div
          id={`timeline-event-${event.id}`}
          className={`rounded border px-2 py-1 ${severityClass(event)} ${highlight ? 'ring-1 ring-sky-400 ring-offset-1 ring-offset-gray-900' : ''}`}
        >
          <div className="flex items-center justify-between gap-2 text-[11px] text-gray-400">
            <button
              type="button"
              className={`truncate hover:text-sky-200 ${FOCUS_RING}`}
              onClick={() => (event.agentId ? onAgentClick(event.agentId) : onPhaseClick(row.group.phaseId))}
            >
              {event.agentId || event.type}
            </button>
            <span>{formatTime(event.ts) || event.ts}</span>
          </div>
          <div className="mt-1 text-xs text-gray-200 whitespace-pre-wrap">{event.message}</div>
          {(event.artifactPath || event.gateId) && (
            <div className="mt-1 flex items-center gap-2 text-[10px]">
              {event.artifactPath && onOpenArtifact && canOpenArtifact(event.artifactPath) ? (
                <button
                  type="button"
                  className={`text-indigo-300 underline ${FOCUS_RING}`}
                  onClick={() => onOpenArtifact(event.artifactPath as string)}
                >
                  Open artifact
                </button>
              ) : event.artifactPath ? (
                <span className="text-gray-500">Open not available</span>
              ) : null}
              {event.gateId ? (
                <button
                  type="button"
                  className={`text-amber-200 underline ${FOCUS_RING}`}
                  onClick={() => onPhaseClick(row.group.phaseId)}
                >
                  Focus gate
                </button>
              ) : null}
            </div>
          )}
        </div>
      )
    },
    [highlightedEventId, onAgentClick, onOpenArtifact, onPhaseClick],
  )

  if (!runId) {
    return (
      <section className="p-4 border-b border-gray-700 bg-gray-900/20">
        <div className="max-w-6xl mx-auto text-sm text-gray-400">
          No maintenance run started yet. Start a run to see live status and artifacts.
        </div>
      </section>
    )
  }

  return (
    <section className="p-4 border-b border-gray-700 bg-gray-900/30">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-gray-200">Maintenance Run</div>
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${badgeClass(status?.status || 'queued')}`}>
              {status?.status || 'queued'}
            </span>
            <span className="text-[11px] text-gray-500 font-mono">run: {runId}</span>
          </div>
          <div className="flex items-center gap-3">
            {loading && <div className="text-xs text-gray-400">Refreshing...</div>}
            {status?.artifacts?.length ? (
              <a
                href={`/api/app-factory/runs/${encodeURIComponent(runId)}/export?scope=artifacts`}
                download
                className="rounded border border-blue-700 bg-blue-900/40 px-2 py-1 text-[11px] text-blue-100 hover:bg-blue-900/60"
              >
                Export Artifacts
              </a>
            ) : null}
            {onCancel && (status?.status === 'queued' || status?.status === 'running') ? (
              <button
                type="button"
                className={`rounded border border-rose-700 bg-rose-900/40 px-2 py-1 text-[11px] text-rose-100 hover:bg-rose-900/60 ${FOCUS_RING}`}
                onClick={onCancel}
              >
                Cancel run
              </button>
            ) : null}
          </div>
        </div>

        {error && (
          <div className="rounded border border-rose-800 bg-rose-900/30 px-3 py-2 text-xs text-rose-100">
            {error}
          </div>
        )}

        {status?.errors?.length ? (
          <div className="rounded border border-rose-800 bg-rose-900/40 px-3 py-2 text-xs text-rose-100 whitespace-pre-wrap">
            {status.errors.join('\n')}
          </div>
        ) : null}

        {status?.links?.pr_url ? (
          <div className="rounded border border-emerald-700 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-100">
            PR:{' '}
            <a className="underline" href={status.links.pr_url} target="_blank" rel="noreferrer">
              {status.links.pr_url}
            </a>
          </div>
        ) : null}

        <div className="rounded border border-indigo-700/50 bg-indigo-900/20 px-3 py-2 text-xs text-indigo-100">
          <span className="font-semibold text-indigo-200">Narrative:</span>{' '}
          <span>{telemetry.narrative || 'No telemetry yet'}</span>
        </div>

        {viewState.operatorWarnings.length ? (
          <div className="rounded border border-amber-700/70 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
            <div className="font-semibold">Live run warnings</div>
            <ul className="mt-1 list-disc list-inside space-y-1">
              {viewState.operatorWarnings.map((warning) => (
                <li key={warning.id}>{warning.message}</li>
              ))}
            </ul>
            <div className="mt-1 text-[11px] text-amber-200/80">
              Threshold: {RUN_VIEW_WARNING_THRESHOLD_MINUTES} minutes
            </div>
          </div>
        ) : null}

        {warningBannerLines.length ? (
          <div className="rounded border border-amber-800 bg-amber-900/30 px-3 py-2 text-xs text-amber-100">
            <div className="font-semibold">Warnings</div>
            <ul className="mt-1 list-disc list-inside space-y-1">
              {warningBannerLines.map((line, idx) => (
                <li key={`${line}-${idx}`} className="whitespace-pre-wrap">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-gray-300">
          <div className="rounded border border-gray-700 bg-gray-900/40 px-3 py-2">
            <div className="text-[11px] text-gray-500">Current Stage</div>
            <div className="font-semibold text-gray-100">{status?.currentStage || 'pending'}</div>
            <div className="text-[11px] text-gray-500">
              {typeof status?.stageIndex === 'number' && typeof status?.stageCount === 'number'
                ? `Stage ${status.stageIndex + 1} of ${status.stageCount}`
                : 'Stage count unavailable'}
            </div>
          </div>
          <div className="rounded border border-gray-700 bg-gray-900/40 px-3 py-2">
            <div className="text-[11px] text-gray-500">Progress</div>
            <div className="font-semibold text-gray-100">
              {typeof status?.progress === 'number' ? `${status.progress}%` : '-'}
            </div>
            {typeof status?.progress === 'number' && (
              <div className="mt-2 h-1.5 w-full rounded-full bg-gray-800">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, status.progress))}%` }}
                />
              </div>
            )}
            <div className="mt-1 text-[11px] text-gray-500">Updated {formatTime(status?.updatedAt) || '-'}</div>
          </div>
          <div className="rounded border border-gray-700 bg-gray-900/40 px-3 py-2">
            <div className="text-[11px] text-gray-500">Risk</div>
            <div className="font-semibold text-gray-100">{status?.risk?.level || 'unknown'}</div>
            {status?.risk?.reasons?.length ? (
              <div className="text-[11px] text-gray-500">{status.risk.reasons.join('; ')}</div>
            ) : (
              <div className="text-[11px] text-gray-500">No risk reasons recorded</div>
            )}
          </div>
        </div>

        <div className="rounded border border-gray-800 bg-gray-950/40 px-3 py-2 text-[11px] text-gray-300">
          <div className="font-semibold text-gray-200">Legend</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full border px-2 py-0.5 ${phaseStatusClass('running')}`}>running</span>
            <span className={`inline-flex rounded-full border px-2 py-0.5 ${phaseStatusClass('pass')}`}>pass</span>
            <span className={`inline-flex rounded-full border px-2 py-0.5 ${phaseStatusClass('fail')}`}>fail</span>
            <span className="inline-flex rounded-full border border-gray-800 bg-gray-950/40 px-2 py-0.5 text-gray-200">info</span>
            <span className="inline-flex rounded-full border border-amber-800/80 bg-amber-950/30 px-2 py-0.5 text-amber-100">warn</span>
            <span className="inline-flex rounded-full border border-rose-800/80 bg-rose-950/40 px-2 py-0.5 text-rose-100">error</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
          <span className="text-gray-500">Filters:</span>
          {selectedPhaseId ? (
            <span className="rounded border border-indigo-700/60 bg-indigo-900/30 px-2 py-0.5 text-indigo-100">
              phase: {selectedPhaseId}
            </span>
          ) : null}
          {selectedAgentId ? (
            <span className="rounded border border-sky-700/60 bg-sky-900/30 px-2 py-0.5 text-sky-100">
              agent: {selectedAgentId}
            </span>
          ) : null}
          {hasFilters ? (
            <button
              type="button"
              className={`rounded border border-gray-700 bg-gray-900 px-2 py-0.5 text-gray-200 hover:bg-gray-800 ${FOCUS_RING}`}
              onClick={clearFilters}
            >
              Clear filters
            </button>
          ) : (
            <span className="text-gray-500">none</span>
          )}
        </div>

        <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-gray-300">Phase Board</div>
            <div className="text-[11px] text-gray-500">
              active: {telemetry.activePhaseId || 'pending'}
              {telemetry.activeAgentId ? ` · ${telemetry.activeAgentId}` : ''}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
            {viewState.phaseCards.map((phase) => (
              <button
                key={phase.phaseId}
                type="button"
                disabled={!phase.isKnown}
                aria-disabled={!phase.isKnown}
                aria-pressed={phase.isKnown ? phase.isSelected : undefined}
                className={`text-left rounded border px-3 py-2 transition-colors ${FOCUS_RING} ${
                  !phase.isKnown
                    ? 'border-gray-800 bg-gray-900/20 text-gray-500 cursor-not-allowed'
                    : phase.isSelected
                      ? 'border-indigo-500 bg-indigo-900/30'
                      : phase.isActive
                        ? 'border-sky-600/60 bg-sky-900/20'
                        : phase.dimmed
                          ? 'border-gray-800 bg-gray-900/20 opacity-70'
                          : 'border-gray-700 bg-gray-900/50 hover:bg-gray-800/60'
                }`}
                onClick={() => {
                  if (!phase.isKnown) return
                  onPhaseClick(phase.phaseId)
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold truncate">{phase.label}</div>
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${phaseStatusClass(phase.status)}`}>
                    {phase.status}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-gray-400">
                  {phase.completeCount}/{phase.totalCount} complete
                  {phase.blocked ? ' · blocked' : ''}
                </div>
                {!phase.isKnown ? (
                  <div className="mt-1 text-[11px] text-gray-500">Unknown telemetry</div>
                ) : phase.activeAgentId ? (
                  <div className="mt-1 text-[11px] text-sky-200 truncate">active: {phase.activeAgentId}</div>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-gray-300">Agent Board</div>
            <div className="text-[11px] text-gray-500">{viewState.agentGroups.reduce((sum, group) => sum + group.agents.length, 0)} shown</div>
          </div>
          {viewState.agentGroups.length ? (
            <div className="mt-3 space-y-3">
              {viewState.agentGroups.map((group) => (
                <div key={group.id} className="space-y-2">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500">
                    {group.label} ({group.agents.length})
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                    {group.agents.map((agent) => {
                      const warningCount = viewState.agentSignals[agent.id]?.warningCount || 0
                      const errorCount = viewState.agentSignals[agent.id]?.errorCount || 0
                      const gateFailCount = viewState.agentSignals[agent.id]?.gateFailCount || 0
                      const isSelected = selectedAgentId === agent.id
                      const isActive = telemetry.activeAgentId === agent.id
                      const repairTarget = viewState.repairTargets[agent.id]
                      const repairCanOpenArtifact = Boolean(
                        repairTarget?.artifactPath && onOpenArtifact && canOpenArtifact(repairTarget.artifactPath),
                      )
                      const repairCanJump = Boolean(repairTarget?.eventId)
                      const repairAvailable = repairCanOpenArtifact || repairCanJump

                      return (
                        <div
                          key={agent.id}
                          className={`text-left rounded border px-3 py-2 transition-colors ${FOCUS_RING} ${
                            isSelected
                              ? 'border-sky-500 bg-sky-900/30'
                              : isActive
                                ? 'border-indigo-500 bg-indigo-900/20'
                                : 'border-gray-700 bg-gray-900/50 hover:bg-gray-800/60'
                          }`}
                        >
                          <button
                            type="button"
                            aria-pressed={isSelected}
                            className={`w-full text-left ${FOCUS_RING}`}
                            onClick={() => onAgentClick(agent.id)}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs font-semibold text-gray-100 truncate">{agent.displayName}</div>
                              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${agentStatusClass(agent.status)}`}>
                                {agent.status}
                              </span>
                            </div>
                            <div className="mt-1 text-[11px] text-gray-400 truncate">
                              {agent.currentActivity || 'No telemetry yet'}
                            </div>
                            <div className="mt-1 text-[11px] text-gray-500">
                              duration: {formatDuration(agent.durationMs)} · artifacts: {agent.artifactPaths.length}
                            </div>
                            <div className="mt-1 text-[11px] text-gray-500">
                              warnings: {warningCount} · errors: {errorCount} · gates failed: {gateFailCount}
                            </div>
                          </button>
                          {agent.repair?.attempted ? (
                            <div className="mt-1 text-[11px] text-amber-200 flex items-center gap-2">
                              <span>
                                repair {agent.repair.count}/{agent.repair.max}
                                {agent.repair.failed ? ' failed' : ''}
                              </span>
                              {repairAvailable ? (
                                <button
                                  type="button"
                                  className={`underline text-amber-100 ${FOCUS_RING}`}
                                  onClick={() => onRepairIndicatorClick(agent.id)}
                                >
                                  Open repair target
                                </button>
                              ) : (
                                <span className="text-gray-500">Not available</span>
                              )}
                            </div>
                          ) : null}
                          {agent.artifactPaths.length ? (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {agent.artifactPaths.slice(0, 2).map((artifactPath) => (
                                <span key={artifactPath} className="inline-flex rounded border border-gray-700 px-2 py-0.5 text-[10px] text-gray-300">
                                  {artifactPath}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-xs text-gray-500">No agent telemetry for this filter.</div>
          )}
        </div>

        <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3">
          <div className="text-xs font-semibold text-gray-300">Run Timeline</div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
            {viewState.timelineNodes.map((node) => (
              <button
                key={node.phaseId}
                type="button"
                aria-pressed={selectedPhaseId === node.phaseId}
                className={`rounded border px-2 py-1 text-left transition-colors ${FOCUS_RING} ${
                  selectedPhaseId === node.phaseId
                    ? 'border-indigo-500 bg-indigo-900/30'
                    : telemetry.activePhaseId === node.phaseId
                      ? 'border-sky-600/60 bg-sky-900/20'
                      : 'border-gray-700 bg-gray-900/50 hover:bg-gray-800/60'
                }`}
                onClick={() => onPhaseClick(node.phaseId)}
              >
                <div className="text-[10px] font-semibold text-gray-100">{node.label}</div>
                <div className={`mt-1 inline-flex rounded-full border px-1.5 py-0.5 text-[10px] ${phaseStatusClass(node.status)}`}>
                  {node.status}
                </div>
                {node.activeText ? (
                  <div className="mt-1 text-[10px] text-gray-400 truncate">{node.activeText}</div>
                ) : null}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {timelineRows.length ? (
              shouldVirtualizeTimeline ? (
                <div
                  ref={timelineViewportRef}
                  className="max-h-72 overflow-auto pr-1"
                  style={{ height: TIMELINE_VIEWPORT_HEIGHT_PX }}
                  onScroll={(event) => setTimelineScrollTop(event.currentTarget.scrollTop)}
                >
                  <div style={{ height: rowLayout.totalHeight, position: 'relative' }}>
                    {visibleRows.map(({ row, index }) => (
                      <div
                        key={row.key}
                        ref={(node) => measureRow(index, node)}
                        style={{
                          position: 'absolute',
                          top: rowLayout.rowOffsets[index],
                          left: 0,
                          right: 0,
                          paddingBottom: 8,
                        }}
                      >
                        {renderTimelineRow(row)}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-auto pr-1">
                  {timelineRows.map((row) => (
                    <div key={row.key}>{renderTimelineRow(row)}</div>
                  ))}
                </div>
              )
            ) : (
              <div className="text-xs text-gray-500">
                {status?.status === 'running' || status?.status === 'queued'
                  ? 'Run started, awaiting telemetry...'
                  : 'No events recorded for this run.'}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-gray-300">Artifacts</div>
              <div className="text-[11px] text-gray-500">
                total: {viewState.artifactPanel.counts.total} · in progress: {viewState.artifactPanel.counts.inProgress}
              </div>
            </div>
            {viewState.artifactPanel.counts.total ? (
              <div className="mt-2 space-y-3 text-xs text-gray-200">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500">In progress</div>
                  {viewState.artifactPanel.inProgress.length ? (
                    <ul className="mt-1 space-y-1">
                      {viewState.artifactPanel.inProgress.map((artifact) => (
                        <li key={`pending-${artifact.path}`} className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] truncate">{artifact.path}</span>
                          <span className="text-[10px] text-amber-200">pending</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-1 text-[11px] text-gray-500">None</div>
                  )}
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500">Produced</div>
                  {viewState.artifactPanel.produced.length ? (
                    <ul className="mt-1 space-y-1">
                      {viewState.artifactPanel.produced.map((artifact) => (
                        <li key={`produced-${artifact.path}`} className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] truncate">{artifact.path}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-500">{formatBytes(artifact.bytes)}</span>
                            {onOpenArtifact && canOpenArtifact(artifact.path) ? (
                              <button
                                type="button"
                                className={`text-[10px] text-indigo-300 underline ${FOCUS_RING}`}
                                onClick={() => onOpenArtifact(artifact.path)}
                              >
                                Open
                              </button>
                            ) : (
                              <span className="text-[10px] text-gray-500">Open not available</span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-1 text-[11px] text-gray-500">None</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-2 text-xs text-gray-500">No artifacts for the current filter.</div>
            )}
          </div>

          <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-gray-300">Gates</div>
              <div className="text-[11px] text-gray-500">{viewState.gates.length} shown</div>
            </div>
            {viewState.gates.length ? (
              <ul className="mt-2 space-y-2 text-xs text-gray-200">
                {viewState.gates.map((gate) => (
                  <li key={gate.id} className="rounded border border-gray-800 bg-gray-950/40 px-2 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-gray-100 truncate">{gate.label}</div>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${gateStatusClass(gate.status)}`}>
                        {gate.status}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500">
                      phase: {gate.phaseId} · started: {formatTime(gate.startedAt) || '-'} · ended: {formatTime(gate.finishedAt) || '-'}
                    </div>
                    {gate.lastMessage ? (
                      <div className="mt-1 text-[11px] text-gray-300 whitespace-pre-wrap">{gate.lastMessage}</div>
                    ) : null}
                    {gate.reportArtifactPath && onOpenArtifact && canOpenArtifact(gate.reportArtifactPath) ? (
                      <button
                        type="button"
                        className={`mt-1 text-[10px] text-indigo-300 underline ${FOCUS_RING}`}
                        onClick={() => onOpenArtifact(gate.reportArtifactPath as string)}
                      >
                        Open gate report
                      </button>
                    ) : gate.reportArtifactPath ? (
                      <div className="mt-1 text-[10px] text-gray-500">Open not available</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-2 text-xs text-gray-500">No gates for the current filter.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

export default MaintenanceRunPanel
