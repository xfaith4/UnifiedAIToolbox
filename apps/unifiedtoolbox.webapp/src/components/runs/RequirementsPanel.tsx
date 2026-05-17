'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2 } from 'lucide-react'
import { useCheckpointSubmit } from '@/lib/hooks/useCheckpointSubmit'
import type { RequirementsRequest } from '@/lib/types/orchestrator'

type RequirementsPanelProps = {
  runId: string
  requirementsRequest: RequirementsRequest
  onSubmitted?: () => void
  variant?: 'panel' | 'card'
  className?: string
}

export default function RequirementsPanel({
  runId,
  requirementsRequest,
  onSubmitted,
  variant = 'panel',
  className = '',
}: RequirementsPanelProps) {
  const { answers, pending, error, successMessage, setAnswer, initAnswers, submit } = useCheckpointSubmit(runId)
  const [showTests, setShowTests] = useState(false)

  const blockers = requirementsRequest.blockers ?? []
  const tests = requirementsRequest.proposed_acceptance_tests ?? []

  useEffect(() => {
    initAnswers(blockers)
  }, [blockers.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    const ok = await submit(requirementsRequest)
    if (ok) onSubmitted?.()
  }

  if (successMessage) {
    return (
      <div className={`rounded-2xl border border-emerald-700/60 bg-emerald-950/20 p-4 text-sm text-emerald-100 ${className}`}>
        <div className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="h-4 w-4" />
          {successMessage}
        </div>
        <p className="mt-1 text-xs opacity-80">The run is now queued to resume with your answers.</p>
      </div>
    )
  }

  const isCard = variant === 'card'

  return (
    <div className={`rounded-2xl border border-amber-700/60 bg-amber-950/20 ${isCard ? 'p-3' : 'p-4'} text-amber-100 ${className}`}>
      <div className="flex items-center gap-2 font-semibold text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Requirements needed to continue
        <span className="ml-auto rounded-full border border-amber-700/50 bg-amber-900/30 px-2 py-0.5 text-[10px]">
          {blockers.length} question{blockers.length !== 1 ? 's' : ''}
        </span>
      </div>

      {requirementsRequest.summary && (
        <p className={`mt-2 text-amber-100/90 ${isCard ? 'text-xs' : 'text-sm'}`}>
          {requirementsRequest.summary}
        </p>
      )}

      <div className={`mt-3 space-y-4 ${isCard ? 'space-y-3' : ''}`}>
        {blockers.map((blocker, idx) => (
          <div key={blocker.id} className="rounded-xl border border-amber-700/50 bg-amber-950/30 p-3 space-y-2">
            <div className={`font-medium text-amber-50 ${isCard ? 'text-xs' : 'text-sm'}`}>
              {blockers.length > 1 ? `Q${idx + 1}: ` : ''}{blocker.question}
            </div>
            {blocker.why && (
              <div className="text-[11px] text-amber-200/70">Why: {blocker.why}</div>
            )}

            {blocker.defaults && blocker.defaults.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {blocker.defaults.map((d) => {
                  const isSelected = answers[blocker.id] === d
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setAnswer(blocker.id, isSelected ? '' : d)}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        isSelected
                          ? 'border-amber-500 bg-amber-500/20 text-amber-50 font-medium'
                          : 'border-slate-600 bg-slate-900/60 text-slate-300 hover:border-amber-600 hover:text-amber-100'
                      }`}
                    >
                      {d}
                    </button>
                  )
                })}
              </div>
            )}

            {blocker.schema_hint && (
              <details className="pt-1" data-testid={`schema-hint-${blocker.id}`}>
                <summary className="cursor-pointer text-[11px] font-semibold text-amber-50">
                  Expected output shape (click to view)
                </summary>
                <p className="mt-1 text-[11px] text-amber-200/80">
                  Your answer must match this JSON shape. String fields stay strings; array fields must be arrays of structured objects — the validator rejects type mismatches.
                </p>
                <pre className="mt-2 max-h-80 overflow-auto rounded-lg border border-amber-700/50 bg-slate-950/80 p-2 text-[11px] leading-snug text-amber-50 whitespace-pre-wrap break-words font-mono">
{blocker.schema_hint}
                </pre>
              </details>
            )}

            <textarea
              value={answers[blocker.id] ?? ''}
              onChange={(e) => setAnswer(blocker.id, e.target.value)}
              rows={isCard ? 2 : 3}
              className="w-full rounded-lg border border-amber-700/60 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-amber-500"
              placeholder={
                blocker.defaults?.[0]
                  ? `Select an option above or type your own answer...`
                  : 'Type your answer...'
              }
            />
          </div>
        ))}
      </div>

      {tests.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowTests(!showTests)}
            className="flex items-center gap-1 text-[11px] text-amber-200/70 hover:text-amber-100"
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${showTests ? 'rotate-180' : ''}`} />
            Proposed acceptance tests ({tests.length})
          </button>
          {showTests && (
            <ul className="mt-1 space-y-1 pl-4 text-[11px] text-amber-200/60 list-disc">
              {tests.map((test, idx) => (
                <li key={idx}>{test}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-rose-800/70 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl border border-amber-600 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-50 hover:bg-amber-500/25 disabled:opacity-50"
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {pending ? 'Submitting...' : 'Submit Answers & Resume Run'}
        </button>
      </div>
    </div>
  )
}
