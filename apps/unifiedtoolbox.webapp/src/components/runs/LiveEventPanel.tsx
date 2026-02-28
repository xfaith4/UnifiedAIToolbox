'use client'

// ─────────────────────────────────────────────────────────────────────────────
// LiveEventPanel — docked side-panel showing live events for an active run.
// Polls the orchestrator API with exponential back-off. Designed to be
// composed into the Concierge page as a right-side drawer.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  X,
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
  ExternalLink,
  WifiOff,
} from 'lucide-react'
import { fetchOrchestrationRun, isOrchestratorApiHttpError } from '@/lib/services/orchestratorApi'
import type { OrchestrationRunEvent } from '@/lib/types/orchestrator'
import { TERMINAL_RUN_STATUSES } from '@/lib/services/conciergeRunService'

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE_POLL_MS = 3_000
const BACKOFF_MAX_MS = 30_000
const MAX_BUFFERED_EVENTS = 400

// ── Event row ─────────────────────────────────────────────────────────────────

function eventTextClass(type?: string): string {
  switch ((type ?? 'info').toLowerCase()) {
    case 'error':  return 'text-rose-400'
    case 'warn':   return 'text-amber-400'
    case 'status': return 'text-blue-300 font-medium'
    default:       return 'text-gray-300'
  }
}

function EventRow({ ev }: { ev: OrchestrationRunEvent }) {
  const d = new Date(ev.timestamp)
  const timeStr = isNaN(d.getTime())
    ? ev.timestamp
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-gray-800/40 last:border-0">
      <span className="shrink-0 font-mono text-[10px] text-gray-600 mt-0.5 tabular-nums">
        {timeStr}
      </span>
      <span className={`text-xs leading-snug flex-1 break-words ${eventTextClass(ev.type)}`}>
        {ev.type && ev.type !== 'info' && (
          <span className="mr-1 uppercase text-[10px] opacity-60">[{ev.type}]</span>
        )}
        {ev.message}
      </span>
    </div>
  )
}

// ── "Last updated" text ───────────────────────────────────────────────────────

function RelativeTime({ updatedAt }: { updatedAt: Date | null }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5_000)
    return () => clearInterval(id)
  }, [])

  if (!updatedAt) return null
  const s = Math.round((Date.now() - updatedAt.getTime()) / 1000)
  const label = s < 5 ? 'just now' : `${s}s ago`
  return <span className="text-[10px] text-gray-600 tabular-nums">{label}</span>
}

// ── Panel ─────────────────────────────────────────────────────────────────────

type Props = {
  runId?: string | null
  onClose: () => void
}

export default function LiveEventPanel({ runId, onClose }: Props) {
  const safeRunId = runId?.trim() ?? ''
  const runHref = safeRunId ? `/runs/${encodeURIComponent(safeRunId)}` : '/runs'
  const runIdLabel = safeRunId ? `${safeRunId.slice(0, 14)}…` : 'unknown-run'
  const [events, setEvents] = useState<OrchestrationRunEvent[]>([])
  const [isTerminal, setIsTerminal] = useState(false)
  const [connected, setConnected] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [copied, setCopied] = useState(false)

  const seenRef    = useRef<Set<string>>(new Set())
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const backoffRef = useRef(BASE_POLL_MS)
  const mountedRef = useRef(true)
  const bottomRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const fetchEvents = useCallback(async () => {
    if (!mountedRef.current) return
    if (!safeRunId) {
      setConnected(false)
      setIsTerminal(true)
      return
    }

    if (process.env.NODE_ENV === 'development') {
      console.debug(`[LiveEventPanel] fetchEvents → orchestrator fetchOrchestrationRun(${safeRunId})`)
    }

    try {
      const run = await fetchOrchestrationRun(safeRunId)

      if (!mountedRef.current) return

      // Merge de-duplicated new events
      const incoming = run.events ?? []
      const novel = incoming.filter((e) => {
        const key = `${e.timestamp}:${e.message}`
        if (seenRef.current.has(key)) return false
        seenRef.current.add(key)
        return true
      })

      if (novel.length) {
        setEvents((prev) => [...prev, ...novel].slice(-MAX_BUFFERED_EVENTS))
      }

      if (process.env.NODE_ENV === 'development') {
        console.debug(`[LiveEventPanel] fetchEvents ← status: ${run.status}, total events: ${incoming.length} (${novel.length} new)`)
      }

      setConnected(true)
      setLastUpdated(new Date())
      backoffRef.current = BASE_POLL_MS

      const terminal = run.status && TERMINAL_RUN_STATUSES.has(run.status)
      if (terminal) {
        setIsTerminal(true)
        return // Stop scheduling polls
      }
    } catch (error) {
      if (!mountedRef.current) return
      if (isOrchestratorApiHttpError(error) && error.status === 404) {
        setConnected(false)
        setIsTerminal(true)
        return
      }
      setConnected(false)
      // Exponential back-off capped at BACKOFF_MAX_MS
      backoffRef.current = Math.min(backoffRef.current * 2, BACKOFF_MAX_MS)
    }

    // Schedule next poll
    if (mountedRef.current) {
      timerRef.current = setTimeout(() => void fetchEvents(), backoffRef.current)
    }
  }, [safeRunId])

  useEffect(() => {
    void fetchEvents()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeRunId])

  // Auto-scroll to newest event
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  const handleCopy = async () => {
    const text = events
      .map((e) => `[${e.timestamp}] [${e.type ?? 'info'}] ${e.message}`)
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard unavailable — silent fail
    }
  }

  const handleRefresh = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    void fetchEvents()
  }

  return (
    <div className="flex h-full flex-col bg-gray-950 border-l border-gray-800">
      {/* ── Header ── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-800 px-3 py-2.5">
        {/* Connection indicator */}
        <div
          className={`h-2 w-2 shrink-0 rounded-full ${
            connected
              ? isTerminal
                ? 'bg-gray-500'
                : 'bg-emerald-400 animate-pulse'
              : 'bg-rose-400'
          }`}
          title={connected ? (isTerminal ? 'Finished' : 'Streaming') : 'Disconnected'}
        />
        <span className="flex-1 min-w-0 text-xs font-semibold text-gray-200 truncate">
          Live Events
        </span>
        <span className="shrink-0 font-mono text-[10px] text-gray-600">
          {runIdLabel}
        </span>

        <RelativeTime updatedAt={lastUpdated} />

        {!connected && (
          <span className="shrink-0 flex items-center gap-1 text-[10px] text-rose-400">
            <WifiOff size={10} aria-hidden="true" />
            Reconnecting…
          </span>
        )}

        {/* Refresh */}
        <button
          type="button"
          title="Refresh"
          onClick={handleRefresh}
          className="shrink-0 rounded p-1 text-gray-500 hover:text-gray-200 transition-colors"
        >
          <RefreshCw size={12} aria-hidden="true" />
        </button>

        {/* Copy logs */}
        <button
          type="button"
          title="Copy logs"
          onClick={handleCopy}
          className="shrink-0 rounded p-1 text-gray-500 hover:text-gray-200 transition-colors"
        >
          {copied
            ? <Check size={12} className="text-emerald-400" aria-hidden="true" />
            : <Copy size={12} aria-hidden="true" />
          }
        </button>

        {/* Open full logs */}
        <Link
          href={runHref}
          title="Open full logs in Run Details"
          className="shrink-0 rounded p-1 text-gray-500 hover:text-gray-200 transition-colors"
        >
          <ExternalLink size={12} aria-hidden="true" />
        </Link>

        {/* Close */}
        <button
          type="button"
          aria-label="Close live event panel"
          onClick={onClose}
          className="shrink-0 rounded p-1 text-gray-500 hover:text-gray-200 transition-colors"
        >
          <X size={12} aria-hidden="true" />
        </button>
      </div>

      {/* ── Events list ── */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0">
        {events.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            {connected ? (
              <>
                <RefreshCw size={18} className="text-gray-700 mb-2 animate-spin" aria-hidden="true" />
                <p className="text-xs text-gray-600">Waiting for events…</p>
              </>
            ) : (
              <>
                <AlertCircle size={18} className="text-rose-700 mb-2" aria-hidden="true" />
                <p className="text-xs text-gray-600">Connection lost — retrying…</p>
              </>
            )}
          </div>
        )}

        {events.map((ev, i) => (
          <EventRow key={`${ev.timestamp}-${i}`} ev={ev} />
        ))}

        <div ref={bottomRef} />
      </div>

      {/* ── Footer ── */}
      <div className="shrink-0 border-t border-gray-800 px-3 py-2 flex items-center justify-between gap-2">
        {isTerminal ? (
          <span className="text-[11px] text-gray-500">Run finished — stream closed.</span>
        ) : (
          <span className="text-[11px] text-gray-600">
            {events.length} event{events.length !== 1 ? 's' : ''}
          </span>
        )}
        <Link
          href={runHref}
          className="text-[11px] text-blue-400 hover:underline"
        >
          Open full logs →
        </Link>
      </div>
    </div>
  )
}
