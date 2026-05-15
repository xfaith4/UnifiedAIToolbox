'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ValidationChecklist — pure presentation of manifest.validation +/-
// FinalValidationResult[] rows.
// ─────────────────────────────────────────────────────────────────────────────

import type { ManifestValidationSnapshot } from '@/lib/app-factory/runs/manifest'
import type { FinalValidationResult } from '@/lib/app-factory/runs/finalSummary'

const STATUS_CLS: Record<string, string> = {
  passed:      'text-emerald-300',
  failed:      'text-rose-300',
  deferred:    'text-amber-300',
  partial:     'text-amber-300',
  in_progress: 'text-blue-300',
  not_started: 'text-slate-500',
}

const STATUS_LABEL: Record<string, string> = {
  passed: 'Passed',
  failed: 'Failed',
  deferred: 'Deferred',
  partial: 'Partial',
  in_progress: 'In progress',
  not_started: 'Not started',
}

export interface ValidationChecklistProps {
  snapshot?: ManifestValidationSnapshot | null
  results?: FinalValidationResult[]
  className?: string
}

export default function ValidationChecklist({ snapshot, results, className = '' }: ValidationChecklistProps) {
  const hasResults = results && results.length > 0
  const hasSnapshot = snapshot && (snapshot.passed || snapshot.failed || snapshot.deferred || snapshot.status !== 'not_started')

  if (!hasResults && !hasSnapshot) {
    return null
  }

  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-900/40 p-3 ${className}`} aria-label="Validation checklist">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-xs font-semibold text-slate-200">Validation</h3>
        {snapshot && (
          <span className={`text-[10px] uppercase tracking-wide ${STATUS_CLS[snapshot.status] ?? 'text-slate-500'}`}>
            {STATUS_LABEL[snapshot.status] ?? snapshot.status}
          </span>
        )}
        {snapshot && (
          <span className="ml-auto flex items-center gap-2 text-[10px] text-slate-500">
            {typeof snapshot.passed === 'number' && <span className="text-emerald-400">{snapshot.passed} passed</span>}
            {typeof snapshot.failed === 'number' && <span className="text-rose-400">{snapshot.failed} failed</span>}
            {typeof snapshot.deferred === 'number' && <span className="text-amber-400">{snapshot.deferred} deferred</span>}
          </span>
        )}
      </div>
      {hasResults && (
        <ul className="space-y-1">
          {results!.map((r, i) => (
            <li key={`${r.name}-${i}`} className="flex items-start gap-2 text-xs">
              <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                r.status === 'passed' ? 'bg-emerald-400' :
                r.status === 'failed' ? 'bg-rose-400' :
                r.status === 'deferred' ? 'bg-amber-400' : 'bg-slate-500'
              }`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-2">
                  <span className="text-slate-200">{r.name}</span>
                  <span className={`text-[10px] uppercase tracking-wide ${STATUS_CLS[r.status] ?? 'text-slate-500'}`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
                {r.detail && <p className="text-[11px] text-slate-500">{r.detail}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
