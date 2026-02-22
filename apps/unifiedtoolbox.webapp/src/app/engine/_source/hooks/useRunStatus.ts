import { useEffect, useRef, useState } from 'react'
import type { RunStatusResponse } from '@/lib/app-factory/runs/types'

type UseRunStatusOptions = {
  enabled?: boolean
  pollIntervalMs?: number
}

const TERMINAL_STATES = new Set<string>(['failed', 'completed', 'cancelled', 'error'])

export function useRunStatus(runId: string | null, options: UseRunStatusOptions = {}) {
  const { enabled = true, pollIntervalMs = 1500 } = options
  const [status, setStatus] = useState<RunStatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const lastEventTsRef = useRef<string | null>(null)
  const seenEventKeysRef = useRef<Set<string>>(new Set())
  // Shared flag so both effects stop work once a terminal state is detected
  const isTerminalRef = useRef(false)

  useEffect(() => {
    if (!enabled || !runId) {
      setStatus(null)
      setError(null)
      setLoading(false)
      lastEventTsRef.current = null
      seenEventKeysRef.current.clear()
      isTerminalRef.current = false
      return
    }

    isTerminalRef.current = false
    let cancelled = false
    let timer: NodeJS.Timeout | null = null

    const fetchStatus = async (): Promise<RunStatusResponse['status'] | null> => {
      if (cancelled) return null
      setLoading(true)
      try {
        const res = await fetch(`/api/app-factory/runs/${encodeURIComponent(runId)}/status`, { cache: 'no-store' })
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          const msg = json?.error?.message || `Failed to load run status (${res.status})`
          if (!cancelled) setError(msg)
          if (!cancelled) setStatus(null)
          return null
        } else {
          if (!cancelled) {
            const next = json as RunStatusResponse
            setStatus(next)
            for (const event of next.events || []) {
              seenEventKeysRef.current.add(`${event.ts}:${event.message}`)
              lastEventTsRef.current = event.ts
            }
          }
          if (!cancelled) setError(null)
          return (json as RunStatusResponse).status
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load run status')
        if (!cancelled) setStatus(null)
        return null
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    const scheduleNext = (delayMs: number) => {
      if (cancelled) return
      timer = setTimeout(async () => {
        const state = await fetchStatus()
        if (cancelled) return
        if (state && TERMINAL_STATES.has(state)) {
          isTerminalRef.current = true
          return
        }
        const nextDelay =
          state === 'queued' || state === 'running' || !state
            ? pollIntervalMs
            : 5000
        scheduleNext(nextDelay)
      }, delayMs)
    }

    void fetchStatus().then((state) => {
      if (cancelled) return
      if (state && TERMINAL_STATES.has(state)) {
        isTerminalRef.current = true
        return
      }
      const delay = state === 'queued' || state === 'running' || !state ? pollIntervalMs : 5000
      scheduleNext(delay)
    })

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [enabled, runId, pollIntervalMs])



  useEffect(() => {
    if (!enabled || !runId) return
    let source: EventSource | null = null
    let disposed = false

    const connect = () => {
      if (disposed || isTerminalRef.current) return
      const since = lastEventTsRef.current ? `?since=${encodeURIComponent(lastEventTsRef.current)}` : ''
      source = new EventSource(`/api/app-factory/runs/${encodeURIComponent(runId)}/events${since}`)

      source.addEventListener('run', (raw) => {
        const evt = raw as MessageEvent<string>
        try {
          const event = JSON.parse(evt.data) as RunStatusResponse['events'][number]
          const key = `${event.ts}:${event.message}`
          if (seenEventKeysRef.current.has(key)) return
          seenEventKeysRef.current.add(key)
          lastEventTsRef.current = event.ts
          setStatus((current) => {
            if (!current) return current
            return { ...current, events: [...(current.events || []), event] }
          })
        } catch {
          // ignore malformed event payloads
        }
      })

      source.onerror = () => {
        if (source) source.close()
        source = null
        if (!disposed && !isTerminalRef.current) {
          window.setTimeout(connect, 1200)
        }
      }
    }

    connect()

    return () => {
      disposed = true
      if (source) source.close()
    }
  }, [enabled, runId])

  return { status, error, loading }
}
