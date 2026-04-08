'use client'

import { useCallback, useState } from 'react'
import type { RequirementsRequest } from '@/lib/types/orchestrator'

export interface CheckpointSubmitState {
  answers: Record<string, string>
  pending: boolean
  error: string | null
  successMessage: string | null
  setAnswer: (blockerId: string, answer: string) => void
  initAnswers: (blockers: RequirementsRequest['blockers']) => void
  submit: (requirementsRequest: RequirementsRequest) => Promise<boolean>
  reset: () => void
}

export function useCheckpointSubmit(runId: string): CheckpointSubmitState {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const setAnswer = useCallback((blockerId: string, answer: string) => {
    setAnswers((prev) => ({ ...prev, [blockerId]: answer }))
  }, [])

  const initAnswers = useCallback((blockers: RequirementsRequest['blockers']) => {
    setAnswers((current) => {
      const next: Record<string, string> = {}
      for (const blocker of blockers) {
        next[blocker.id] = current[blocker.id] ?? blocker.defaults?.[0] ?? ''
      }
      return next
    })
  }, [])

  const submit = useCallback(async (requirementsRequest: RequirementsRequest): Promise<boolean> => {
    const blockers = requirementsRequest.blockers ?? []
    const payload = blockers.map((blocker) => ({
      blocker_id: blocker.id,
      question: blocker.question,
      answer: String(answers[blocker.id] || '').trim(),
    }))

    const missing = payload.filter((item) => !item.answer)
    if (missing.length > 0) {
      setError('Answer every blocker question before resuming the run.')
      return false
    }

    setPending(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/checkpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: 'ConceptualModelContract',
          answers: payload,
        }),
      })
      const result = (await res.json()) as { message?: string; error?: { message?: string } }
      if (!res.ok) {
        throw new Error(result.error?.message || result.message || 'Failed to submit checkpoint answers.')
      }
      setSuccessMessage(result.message || 'Requirements accepted. The run is queued to resume.')
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit checkpoint answers.')
      return false
    } finally {
      setPending(false)
    }
  }, [runId, answers])

  const reset = useCallback(() => {
    setAnswers({})
    setPending(false)
    setError(null)
    setSuccessMessage(null)
  }, [])

  return { answers, pending, error, successMessage, setAnswer, initAnswers, submit, reset }
}
