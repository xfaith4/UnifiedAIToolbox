'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RunStatusResponse } from '@/lib/app-factory/runs/types'
import type { SwarmConnectionStatus, SwarmRawEventPayload, SwarmRunEvent, UseRunEventsResult } from '../types'

type UseRunEventsOptions = {
  limit?: number
  attemptId?: string
}

const DEFAULT_LIMIT = 400
const MAX_EVENTS = 1500
const MAX_BACKOFF_MS = 15000

function toIso(ts: unknown): string {
  if (typeof ts === 'string' && ts.trim()) {
    const parsed = new Date(ts)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  return new Date().toISOString()
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function normalizeEvent(payload: unknown, runId: string): SwarmRunEvent | null {
  if (!payload || typeof payload !== 'object') return null
  const raw = payload as SwarmRawEventPayload
  const message = typeof raw.message === 'string' && raw.message.trim() ? raw.message.trim() : ''
  if (!message) return null

  const ts = toIso(raw.ts)
  const type = typeof raw.type === 'string' && raw.type.trim() ? raw.type.trim() : 'info'
  const phase = typeof raw.phase === 'string' && raw.phase.trim() ? raw.phase.trim() : undefined
  const stage = typeof raw.stage === 'string' && raw.stage.trim() ? raw.stage.trim() : undefined
  const agent = typeof raw.agent === 'string' && raw.agent.trim() ? raw.agent.trim() : undefined
  const status = typeof raw.status === 'string' && raw.status.trim() ? raw.status.trim() : undefined

  const attemptId = typeof raw.attemptId === 'string' && raw.attemptId.trim() ? raw.attemptId.trim() : undefined
  const id = `${ts}|${type}|${phase || ''}|${agent || ''}|${status || ''}|${attemptId || ''}|${message}`

  return {
    id,
    ts,
    runId: typeof raw.runId === 'string' && raw.runId.trim() ? raw.runId : runId,
    type,
    stage,
    phase,
    agent,
    status,
    message,
    details: toRecord(raw.details),
    data: toRecord(raw.data),
    attemptId,
  }
}

function sortEvents(events: SwarmRunEvent[]): SwarmRunEvent[] {
  return [...events].sort((a, b) => {
    if (a.ts === b.ts) return a.id.localeCompare(b.id)
    return a.ts.localeCompare(b.ts)
  })
}

export function useRunEvents(runId: string | null | undefined, options: UseRunEventsOptions = {}): UseRunEventsResult {
  const { limit = DEFAULT_LIMIT, attemptId } = options

  const [events, setEvents] = useState<SwarmRunEvent[]>([])
  const [runStatus, setRunStatus] = useState<RunStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<SwarmConnectionStatus>('connecting')
  const [lastEventTs, setLastEventTs] = useState<string | null>(null)
  const [reconnectCount, setReconnectCount] = useState(0)
  const [reloadToken, setReloadToken] = useState(0)

  const seenRef = useRef<Set<string>>(new Set())
  const lastEventTsRef = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    setReloadToken((prev) => prev + 1)
  }, [])

  useEffect(() => {
    if (!runId) {
      setEvents([])
      setRunStatus(null)
      setLoading(false)
      setError('No run ID provided')
      setConnectionStatus('closed')
      setLastEventTs(null)
      setReconnectCount(0)
      seenRef.current.clear()
      lastEventTsRef.current = null
      return
    }

    let active = true
    let source: EventSource | null = null
    let reconnectTimer: number | null = null
    let reconnectAttempts = 0

    const closeStream = () => {
      if (source) {
        source.close()
        source = null
      }
    }

    const appendEvents = (incoming: SwarmRunEvent[]) => {
      if (!active || incoming.length === 0) return

      const fresh = incoming.filter((event) => {
        if (seenRef.current.has(event.id)) return false
        seenRef.current.add(event.id)
        return true
      })

      if (fresh.length === 0) return

      const newest = fresh[fresh.length - 1]
      lastEventTsRef.current = newest.ts
      setLastEventTs(newest.ts)

      setEvents((prev) => {
        const merged = sortEvents([...prev, ...fresh])
        if (merged.length <= MAX_EVENTS) return merged
        return merged.slice(merged.length - MAX_EVENTS)
      })
    }

    const loadRunStatus = async () => {
      const statusParams = new URLSearchParams()
      if (attemptId) statusParams.set('attempt_id', attemptId)
      const statusQuery = statusParams.toString() ? `?${statusParams.toString()}` : ''
      const response = await fetch(`/api/app-factory/runs/${encodeURIComponent(runId)}/status${statusQuery}`, { cache: 'no-store' })
      if (!response.ok) {
        const json = await response.json().catch(() => null)
        const message = json?.error?.message || `Failed to fetch run status (${response.status})`
        throw new Error(message)
      }
      const payload = (await response.json()) as RunStatusResponse
      if (active) setRunStatus(payload)
    }

    const loadHistory = async () => {
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      if (lastEventTsRef.current) {
        params.set('since', lastEventTsRef.current)
      }
      if (attemptId) params.set('attempt_id', attemptId)

      const response = await fetch(`/api/app-factory/runs/${encodeURIComponent(runId)}/events?${params.toString()}`, {
        cache: 'no-store',
      })

      if (!response.ok) {
        const json = await response.json().catch(() => null)
        const message = json?.error?.message || `Failed to fetch run events (${response.status})`
        throw new Error(message)
      }

      const payload = (await response.json()) as { events?: unknown[]; cursor?: string | null }
      const normalized = (Array.isArray(payload.events) ? payload.events : [])
        .map((event) => normalizeEvent(event, runId))
        .filter((event): event is SwarmRunEvent => Boolean(event))

      appendEvents(normalized)

      if (typeof payload.cursor === 'string' && payload.cursor.trim()) {
        lastEventTsRef.current = toIso(payload.cursor)
        setLastEventTs(lastEventTsRef.current)
      }
    }

    const connect = () => {
      if (!active) return
      closeStream()

      const params = new URLSearchParams()
      params.set('stream', '1')
      params.set('limit', String(limit))
      if (lastEventTsRef.current) {
        params.set('since', lastEventTsRef.current)
      }
      if (attemptId) params.set('attempt_id', attemptId)

      setConnectionStatus(reconnectAttempts > 0 ? 'reconnecting' : 'connecting')
      source = new EventSource(`/api/app-factory/runs/${encodeURIComponent(runId)}/events?${params.toString()}`)

      source.onopen = () => {
        if (!active) return
        reconnectAttempts = 0
        setReconnectCount(0)
        setConnectionStatus('open')
        setError(null)
      }

      const handleMessage = (rawData: string) => {
        const parsed = JSON.parse(rawData)
        const event = normalizeEvent(parsed, runId)
        if (event) appendEvents([event])
      }

      source.addEventListener('run', (rawEvent) => {
        if (!active) return
        try {
          handleMessage((rawEvent as MessageEvent<string>).data)
        } catch {
          // Ignore malformed event payloads.
        }
      })

      source.onmessage = (rawEvent) => {
        if (!active) return
        try {
          handleMessage(rawEvent.data)
        } catch {
          // Ignore non-run default frames.
        }
      }

      source.onerror = () => {
        if (!active) return
        closeStream()
        reconnectAttempts += 1
        setReconnectCount(reconnectAttempts)
        setConnectionStatus('reconnecting')

        const delay = Math.min(MAX_BACKOFF_MS, 1000 * (2 ** (reconnectAttempts - 1)))
        if (reconnectTimer) {
          window.clearTimeout(reconnectTimer)
          reconnectTimer = null
        }
        reconnectTimer = window.setTimeout(() => {
          if (!active) return
          void loadHistory()
            .catch((err) => {
              if (!active) return
              setError(err instanceof Error ? err.message : 'Failed to reload run events')
            })
            .finally(() => connect())
        }, delay)
      }
    }

    const bootstrap = async () => {
      setLoading(true)
      setError(null)
      setConnectionStatus('connecting')
      setReconnectCount(0)
      seenRef.current.clear()
      lastEventTsRef.current = null
      setLastEventTs(null)
      setEvents([])

      try {
        await Promise.all([loadRunStatus(), loadHistory()])
        if (!active) return
        connect()
      } catch (err) {
        if (!active) return
        setConnectionStatus('error')
        setError(err instanceof Error ? err.message : 'Failed to initialize run stream')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void bootstrap()

    return () => {
      active = false
      closeStream()
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer)
      }
    }
  }, [runId, limit, attemptId, reloadToken])

  return {
    events,
    runStatus,
    loading,
    error,
    connectionStatus,
    lastEventTs,
    reconnectCount,
    refresh,
    attempts: runStatus?.attempts ?? [],
  }
}
