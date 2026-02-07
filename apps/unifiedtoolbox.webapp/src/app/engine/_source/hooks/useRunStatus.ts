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

    const fetchStatus = async () => {
      if (cancelled) return
      setLoading(true)
      try {
        const res = await fetch(`/api/app-factory/runs/${encodeURIComponent(runId)}/status`, { cache: 'no-store' })
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          const msg = json?.error?.message || `Failed to load run status (${res.status})`
          if (!cancelled) setError(msg)
          if (!cancelled) setStatus(null)
        } else {
          if (!cancelled) setStatus(json as RunStatusResponse)
          if (!cancelled) setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load run status')
        if (!cancelled) setStatus(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    const schedule = () => {
      if (cancelled) return
      timer = setInterval(() => {
        if (cancelled) return
        const state = status?.state
        if (!state || state === 'queued' || state === 'running') {
          void fetchStatus()
        }
      }, pollIntervalMs)
    }

    void fetchStatus()
    schedule()

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [enabled, runId, pollIntervalMs, status?.state])

  return { status, error, loading }
}
