'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RunStatusResponse } from '../runs/types'

type UseRunStatusOptions = {
  /**
   * Polling interval in milliseconds. Set to 0 to disable polling.
   * @default 2000
   */
  pollInterval?: number
  /**
   * Whether to automatically poll when the run is in a non-terminal state.
   * @default true
   */
  autoPoll?: boolean
  /**
   * Callback fired when status changes
   */
  onStatusChange?: (status: RunStatusResponse) => void
}

type UseRunStatusResult = {
  status: RunStatusResponse | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  isPollActive: boolean
}

const TERMINAL_STATES = new Set(['succeeded', 'failed'])

/**
 * Hook for polling run status from the API
 */
export function useRunStatus(
  runId: string | null | undefined,
  options: UseRunStatusOptions = {}
): UseRunStatusResult {
  const { pollInterval = 2000, autoPoll = true, onStatusChange } = options

  const [status, setStatus] = useState<RunStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPollActive, setIsPollActive] = useState(false)

  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const prevStatusRef = useRef<RunStatusResponse | null>(null)
  const isMountedRef = useRef(true)

  const fetchStatus = useCallback(async () => {
    if (!runId || !isMountedRef.current) {
      setStatus(null)
      setLoading(false)
      setError('No run ID provided')
      return
    }

    try {
      const response = await fetch(`/api/app-factory/runs/${encodeURIComponent(runId)}/status`)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData?.error?.message || `Failed to fetch status: ${response.status}`)
      }

      const data = await response.json() as RunStatusResponse
      
      if (!isMountedRef.current) return
      
      setStatus(data)
      setError(null)

      // Fire change callback if status changed (including initial load)
      if (onStatusChange && (!prevStatusRef.current || prevStatusRef.current.status !== data.status)) {
        onStatusChange(data)
      }
      prevStatusRef.current = data
    } catch (err) {
      if (!isMountedRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to fetch run status')
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
      }
    }
  }, [runId, onStatusChange])

  const refetch = useCallback(async () => {
    setLoading(true)
    await fetchStatus()
  }, [fetchStatus])

  // Initial fetch
  useEffect(() => {
    if (!runId) return
    void fetchStatus()
    return () => {
      isMountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]) // Only fetch when runId changes

  // Polling logic
  useEffect(() => {
    if (!runId || !autoPoll || pollInterval <= 0) {
      setIsPollActive(false)
      return
    }

    // Don't poll if we're in a terminal state
    if (status && TERMINAL_STATES.has(status.status)) {
      setIsPollActive(false)
      return
    }

    setIsPollActive(true)

    const schedulePoll = () => {
      if (!isMountedRef.current) return
      pollTimeoutRef.current = setTimeout(async () => {
        if (!isMountedRef.current) return
        await fetchStatus()
        // Check the updated status after fetch
        const currentStatus = prevStatusRef.current
        if (isMountedRef.current && currentStatus && !TERMINAL_STATES.has(currentStatus.status)) {
          schedulePoll()
        } else {
          setIsPollActive(false)
        }
      }, pollInterval)
    }

    schedulePoll()

    return () => {
      isMountedRef.current = false
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current)
        pollTimeoutRef.current = null
      }
    }
    // fetchStatus is intentionally not in deps to avoid restarting polling
    // when onStatusChange changes. The effect only restarts when polling
    // configuration (runId, status, autoPoll, pollInterval) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, status, autoPoll, pollInterval])

  return {
    status,
    loading,
    error,
    refetch,
    isPollActive,
  }
}
