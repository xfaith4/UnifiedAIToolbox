'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RunEvent } from '../runs/types'

type UseRunEventsOptions = {
  /**
   * Polling interval in milliseconds. Set to 0 to disable polling.
   * @default 2000
   */
  pollInterval?: number
  /**
   * Whether to automatically poll for new events.
   * @default true
   */
  autoPoll?: boolean
  /**
   * Maximum number of events to fetch per request
   * @default 200
   */
  limit?: number
  /**
   * Whether to accumulate events or replace them
   * @default true
   */
  accumulate?: boolean
}

type UseRunEventsResult = {
  events: RunEvent[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  isPollActive: boolean
  clear: () => void
}

/**
 * Hook for polling run events from the API
 */
export function useRunEvents(
  runId: string | null | undefined,
  options: UseRunEventsOptions = {}
): UseRunEventsResult {
  const { pollInterval = 2000, autoPoll = true, limit = 200, accumulate = true } = options

  const [events, setEvents] = useState<RunEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPollActive, setIsPollActive] = useState(false)

  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastCursorRef = useRef<string | null>(null)
  const seenEventsRef = useRef<Set<string>>(new Set())

  const fetchEvents = useCallback(async () => {
    if (!runId) {
      setEvents([])
      setLoading(false)
      setError('No run ID provided')
      return
    }

    try {
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      if (accumulate && lastCursorRef.current) {
        params.set('since', lastCursorRef.current)
      }

      const response = await fetch(
        `/api/app-factory/runs/${encodeURIComponent(runId)}/events?${params.toString()}`
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData?.error?.message || `Failed to fetch events: ${response.status}`)
      }

      const data = await response.json() as { events: RunEvent[]; cursor: string | null }
      
      if (accumulate) {
        // Append new events using ref for efficient deduplication
        setEvents((prev) => {
          const newEvents = data.events.filter((e) => {
            const key = `${e.ts}:${e.message}`
            if (seenEventsRef.current.has(key)) return false
            seenEventsRef.current.add(key)
            return true
          })
          return [...prev, ...newEvents]
        })
      } else {
        // Replace all events and reset seen set
        seenEventsRef.current.clear()
        data.events.forEach((e) => {
          seenEventsRef.current.add(`${e.ts}:${e.message}`)
        })
        setEvents(data.events)
      }

      if (data.cursor) {
        lastCursorRef.current = data.cursor
      }

      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch run events')
    } finally {
      setLoading(false)
    }
  }, [runId, limit, accumulate])

  const refetch = useCallback(async () => {
    setLoading(true)
    await fetchEvents()
  }, [fetchEvents])

  const clear = useCallback(() => {
    setEvents([])
    lastCursorRef.current = null
    seenEventsRef.current.clear()
  }, [])

  // Initial fetch
  useEffect(() => {
    if (!runId) return
    void fetchEvents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]) // Only fetch when runId changes

  // Polling logic
  useEffect(() => {
    if (!runId || !autoPoll || pollInterval <= 0) {
      setIsPollActive(false)
      return
    }

    setIsPollActive(true)

    const schedulePoll = () => {
      pollTimeoutRef.current = setTimeout(() => {
        void fetchEvents().then(() => {
          schedulePoll()
        })
      }, pollInterval)
    }

    schedulePoll()

    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current)
        pollTimeoutRef.current = null
      }
    }
    // fetchEvents is intentionally not in deps to avoid restarting polling
    // when limit or accumulate options change. The effect only restarts when
    // polling configuration (runId, autoPoll, pollInterval) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, autoPoll, pollInterval])

  return {
    events,
    loading,
    error,
    refetch,
    isPollActive,
    clear,
  }
}
