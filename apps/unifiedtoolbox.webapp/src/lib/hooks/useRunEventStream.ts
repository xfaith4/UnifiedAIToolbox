'use client'

// ─────────────────────────────────────────────────────────────────────────────
// useRunEventStream — client-only SSE consumer for the canonical event stream.
//
// Owner: Agent 2 (WebUI). This is a UI-only hook with NO IO/persistence — it
// only opens an EventSource and exposes the buffered events + connection
// status to React components. The producer side (the route handler that
// writes SSE frames) is owned by Agent 3.
//
// Endpoint: GET /api/runs/[runId]/events/canonical?stream=1
//   - Frames carry `id: <event_id>` so the browser auto-includes
//     `Last-Event-ID` on reconnect.
//   - `event: stream-end` signals "backlog complete" — NOT a disconnect.
//   - `: heartbeat <iso>` keepalive frames are silently absorbed by the
//     browser's EventSource implementation.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import type {
  CanonicalEvent,
  CanonicalEventType,
} from '@/lib/app-factory/runs/canonicalEvents'

export type RunEventStreamStatus =
  | 'idle'
  | 'connecting'
  | 'live'
  | 'replaying'
  | 'snapshot_complete'
  | 'disconnected'

export interface UseRunEventStreamOptions {
  /** Skip opening the stream entirely. */
  disabled?: boolean
  /** Cap the buffered events kept in memory. Defaults to 500. */
  bufferLimit?: number
}

export interface UseRunEventStreamResult {
  events: CanonicalEvent[]
  status: RunEventStreamStatus
  error: string | null
  /** Timestamp (ms) of the last event we received, useful for "stale" banners. */
  lastEventAt: number | null
}

const DEFAULT_BUFFER_LIMIT = 500

function safeParseEvent(raw: string): CanonicalEvent | null {
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.event_id !== 'string' || typeof parsed.event_type !== 'string') return null
    return parsed as CanonicalEvent
  } catch {
    return null
  }
}

/**
 * Open an EventSource against the canonical SSE endpoint for a run and expose
 * its state to React. Returns a stable shape even when `runId` is empty or
 * EventSource isn't available (SSR).
 */
export function useRunEventStream(
  runId: string | null | undefined,
  options: UseRunEventStreamOptions = {}
): UseRunEventStreamResult {
  const { disabled = false, bufferLimit = DEFAULT_BUFFER_LIMIT } = options

  const [events, setEvents] = useState<CanonicalEvent[]>([])
  const [status, setStatus] = useState<RunEventStreamStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastEventAt, setLastEventAt] = useState<number | null>(null)

  // Track seen event_ids so we don't double-count on reconnect replay.
  const seenRef = useRef<Set<string>>(new Set())
  const sourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (disabled || !runId) {
      setStatus('idle')
      return
    }
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      setStatus('disconnected')
      setError('EventSource is not available in this environment.')
      return
    }

    setEvents([])
    seenRef.current = new Set()
    setError(null)
    setStatus('connecting')

    const url = `/api/runs/${encodeURIComponent(runId)}/events/canonical?stream=1`
    const es = new EventSource(url)
    sourceRef.current = es

    const pushEvent = (event: CanonicalEvent) => {
      if (seenRef.current.has(event.event_id)) return
      seenRef.current.add(event.event_id)
      setEvents((prev) => {
        const next = prev.length >= bufferLimit ? prev.slice(prev.length - bufferLimit + 1) : prev
        return [...next, event]
      })
      setLastEventAt(Date.now())
    }

    const handleMessage = (msg: MessageEvent<string>) => {
      // The browser will only fire this for events WITHOUT a custom `event:`
      // line. Our canonical frames always use `event: <event_type>`, so the
      // unnamed handler is mostly a safety net for legacy frames.
      const event = safeParseEvent(msg.data)
      if (event) {
        pushEvent(event)
        setStatus((s) => (s === 'snapshot_complete' ? 'live' : s === 'connecting' ? 'replaying' : s))
      }
    }

    const handleTyped = (msg: MessageEvent<string>) => {
      const event = safeParseEvent(msg.data)
      if (!event) return
      pushEvent(event)
      // Promote status: connecting -> replaying once we get backlog,
      // snapshot_complete -> live once we get a fresh event.
      setStatus((s) => {
        if (s === 'connecting') return 'replaying'
        if (s === 'snapshot_complete') return 'live'
        return s
      })
    }

    const handleStreamEnd = () => {
      setStatus('snapshot_complete')
    }

    es.onopen = () => {
      setError(null)
      setStatus((s) => (s === 'idle' ? 'connecting' : s))
    }
    es.onerror = () => {
      // EventSource auto-reconnects; surface a soft state until it succeeds.
      setStatus('disconnected')
    }
    es.onmessage = handleMessage
    es.addEventListener('stream-end', handleStreamEnd as EventListener)

    // Register listeners for every canonical event type so the browser routes
    // them to our handler. Listing them explicitly keeps us aligned with the
    // event taxonomy contract.
    const TYPES: CanonicalEventType[] = [
      'run_created',
      'run_queued',
      'run_started',
      'agent_started',
      'agent_progress',
      'agent_blocked',
      'agent_completed',
      'artifact_created',
      'validation_started',
      'validation_completed',
      'run_completed',
      'run_failed',
      'run_recovered',
    ]
    for (const type of TYPES) {
      es.addEventListener(type, handleTyped as EventListener)
    }

    return () => {
      es.removeEventListener('stream-end', handleStreamEnd as EventListener)
      for (const type of TYPES) {
        es.removeEventListener(type, handleTyped as EventListener)
      }
      es.close()
      sourceRef.current = null
    }
  }, [runId, disabled, bufferLimit])

  return { events, status, error, lastEventAt }
}
