import { useEffect, useState } from 'react'
import type { RunStatusResponse } from '@/lib/app-factory/runs/types'

type UseRunStatusOptions = {
  enabled?: boolean
  pollIntervalMs?: number
}

export function useRunStatus(runId: string | null, options: UseRunStatusOptions = {}) {
  const { enabled = true, pollIntervalMs = 1500 } = options
  const [status, setStatus] = useState<RunStatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled || !runId) {
      setStatus(null)
      setError(null)
      setLoading(false)
      return
    }

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
          if (!cancelled) setStatus(json as RunStatusResponse)
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
        const nextDelay =
          state === 'queued' || state === 'running' || !state
            ? pollIntervalMs
            : 5000
        scheduleNext(nextDelay)
      }, delayMs)
    }

    void fetchStatus().then((state) => {
      if (cancelled) return
      const delay = state === 'queued' || state === 'running' || !state ? pollIntervalMs : 5000
      scheduleNext(delay)
    })

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [enabled, runId, pollIntervalMs])

  return { status, error, loading }
}
