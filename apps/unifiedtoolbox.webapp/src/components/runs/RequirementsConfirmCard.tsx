'use client'

import { useCallback, useEffect } from 'react'
import { CheckCircle2, Loader2, X } from 'lucide-react'
import { useCheckpointSubmit } from '@/lib/hooks/useCheckpointSubmit'
import type { RequirementsRequest } from '@/lib/types/orchestrator'

type AnswerEntry = { blocker_id: string; question: string; answer: string }

type RequirementsConfirmCardProps = {
  runId: string
  answers: AnswerEntry[]
  onSubmitted?: () => void
  onCancel?: () => void
}

export default function RequirementsConfirmCard({
  runId,
  answers: initialAnswers,
  onSubmitted,
  onCancel,
}: RequirementsConfirmCardProps) {
  const { answers, pending, error, successMessage, setAnswer, submit } = useCheckpointSubmit(runId)

  // Seed the hook's answers from the extracted payload
  useEffect(() => {
    for (const entry of initialAnswers) {
      setAnswer(entry.blocker_id, entry.answer)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = useCallback(async () => {
    // Build a minimal RequirementsRequest to pass to the hook
    const syntheticRequest: RequirementsRequest = {
      blockers: initialAnswers.map((a) => ({
        id: a.blocker_id,
        question: a.question,
        why: '',
      })),
    }
    const ok = await submit(syntheticRequest)
    if (ok) onSubmitted?.()
  }, [initialAnswers, submit, onSubmitted])

  if (successMessage) {
    return (
      <div className="rounded-xl border border-emerald-700/60 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-100">
        <div className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="h-4 w-4" />
          {successMessage}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-amber-700/60 bg-amber-950/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-100">
          <CheckCircle2 className="h-4 w-4" />
          Confirm & Submit Requirements
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="space-y-3">
        {initialAnswers.map((entry) => (
          <div key={entry.blocker_id} className="space-y-1">
            <div className="text-[11px] text-amber-200/70">{entry.question}</div>
            <textarea
              value={answers[entry.blocker_id] ?? entry.answer}
              onChange={(e) => setAnswer(entry.blocker_id, e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-amber-700/60 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-amber-500"
            />
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-800/70 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg border border-amber-600 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-50 hover:bg-amber-500/25 disabled:opacity-50"
        >
          {pending && <Loader2 className="h-3 w-3 animate-spin" />}
          {pending ? 'Submitting...' : 'Submit & Resume Run'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-600 disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
