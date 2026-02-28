import { useEffect, useMemo, useRef, useState } from 'react'
import type { RunEvent } from '@/lib/app-factory/runs/types'
import { dedupeEvents, eventKey, normalizeRuntimeEvent } from '@/lib/app-factory/runs/runtimeEventUtils'

type StreamMode = 'sse' | 'file'

type RuntimeActivityState = {
  events: RunEvent[]
  mode: StreamMode
  error: string | null
  lastProgressAt: string | null
  loading: boolean
}

const SSE_IDLE_TIMEOUT_MS = 22000
const FILE_POLL_MS = 2000

function isProgressEvent(event: RunEvent): boolean {
  const type = String(event.type || '').toLowerCase()
  return type.includes('progress') || type === 'metric' || type === 'step.start' || type === 'step.complete'
}

export function useRuntimeActivity(runId: string | null | undefined, enabled = true): RuntimeActivityState {
  const [events, setEvents] = useState<RunEvent[]>([])
  const [mode, setMode] = useState<StreamMode>('sse')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const seenRef = useRef<Set<string>>(new Set())
  const offsetRef = useRef(0)
  const lastEventAtRef = useRef<number>(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled || !runId) {
      setEvents([])
      setError(null)
      setLoading(false)
      offsetRef.current = 0
      lastEventAtRef.current = 0
      seenRef.current.clear()
      return
    }

    let disposed = false
    let source: EventSource | null = null
    let idleTimer: NodeJS.Timeout | null = null
    let fallbackTimer: NodeJS.Timeout | null = null

    const appendEvents = (incoming: RunEvent[]) => {
      if (!incoming.length || disposed || !mountedRef.current) return
      setEvents((prev) => {
        const next = [...prev]
        for (const raw of incoming) {
          const normalized = normalizeRuntimeEvent(raw, runId)
          const key = eventKey(normalized)
          if (seenRef.current.has(key)) continue
          seenRef.current.add(key)
          next.push(normalized)
          lastEventAtRef.current = Date.now()
        }
        return dedupeEvents(next).sort((a, b) => a.ts.localeCompare(b.ts))
      })
    }

    const pollFileTail = async () => {
      if (disposed) return
      setMode('file')
      try {
        const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/events/file?offset=${offsetRef.current}`, {
          cache: 'no-store',
        })
        if (!res.ok) throw new Error(`Failed to poll events file (${res.status})`)
        const payload = (await res.json()) as {
          events?: unknown[]
          nextOffset?: number
          offset?: number
        }
        const nextEvents = Array.isArray(payload.events)
          ? payload.events.map((event) => normalizeRuntimeEvent(event, runId))
          : []
        appendEvents(nextEvents)
        if (typeof payload.nextOffset === 'number') {
          offsetRef.current = payload.nextOffset
        } else if (typeof payload.offset === 'number') {
          offsetRef.current = payload.offset
        }
        setError(null)
      } catch (err) {
        if (!disposed && mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to poll runtime events')
        }
      } finally {
        if (!disposed) {
          fallbackTimer = setTimeout(() => void pollFileTail(), FILE_POLL_MS)
        }
      }
    }

    const scheduleIdleFallback = () => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        const idleMs = Date.now() - (lastEventAtRef.current || 0)
        if (idleMs >= SSE_IDLE_TIMEOUT_MS) {
          if (source) {
            source.close()
            source = null
          }
          void pollFileTail()
        }
      }, SSE_IDLE_TIMEOUT_MS)
    }

    const connectSse = () => {
      if (disposed) return
      setMode('sse')
      source = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events/stream`)
      scheduleIdleFallback()

      source.addEventListener('run', (raw) => {
        const msg = raw as MessageEvent<string>
        try {
          const parsed = JSON.parse(msg.data)
          appendEvents([normalizeRuntimeEvent(parsed, runId)])
          setError(null)
          scheduleIdleFallback()
        } catch {
          // ignore malformed payload
        }
      })

      source.addEventListener('heartbeat', () => {
        scheduleIdleFallback()
      })

      source.onerror = () => {
        if (source) {
          source.close()
          source = null
        }
        if (!disposed) {
          void pollFileTail()
        }
      }
    }

    const loadInitial = async () => {
      setLoading(true)
      try {
        const initial = await fetch(`/api/app-factory/runs/${encodeURIComponent(runId)}/events?limit=200`, {
          cache: 'no-store',
        })
        if (initial.ok) {
          const payload = (await initial.json()) as { events?: unknown[] }
          const normalized = Array.isArray(payload.events)
            ? payload.events.map((event) => normalizeRuntimeEvent(event, runId))
            : []
          appendEvents(normalized)
        }
      } catch {
        // non-fatal; live stream/fallback still runs
      } finally {
        setLoading(false)
      }
      connectSse()
    }

    void loadInitial()

    return () => {
      disposed = true
      if (source) source.close()
      if (idleTimer) clearTimeout(idleTimer)
      if (fallbackTimer) clearTimeout(fallbackTimer)
    }
  }, [enabled, runId])

  const lastProgressAt = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      if (isProgressEvent(events[i])) return events[i].ts
    }
    return null
  }, [events])

  return {
    events,
    mode,
    error,
    lastProgressAt,
    loading,
  }
}
