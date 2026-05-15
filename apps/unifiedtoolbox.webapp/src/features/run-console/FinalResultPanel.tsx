'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FinalResultPanel — operator-facing summary of a terminal run.
// Renders all 8 FinalRunSummary fields:
//   objective, outcome, completed_work, changed_files, created_artifacts,
//   validation_results, blockers, warnings, next_steps
// (The 9th, generated_at, is shown as a footnote.)
// ─────────────────────────────────────────────────────────────────────────────

import type {
  FinalRunSummary,
  FinalOutcome,
} from '@/lib/app-factory/runs/finalSummary'
import ValidationChecklist from './ValidationChecklist'
import BlockersPanel from './BlockersPanel'
import { formatRelativeTime } from './formatters'

const OUTCOME_CFG: Record<FinalOutcome, { label: string; cls: string; description: string }> = {
  completed:                { label: 'Completed',                cls: 'border-emerald-700 bg-emerald-950/30 text-emerald-200', description: 'The run finished cleanly with no outstanding blockers.' },
  completed_with_warnings:  { label: 'Completed with warnings',  cls: 'border-amber-700 bg-amber-950/30 text-amber-200',     description: 'The run finished, but with non-blocking gaps you should review.' },
  failed:                   { label: 'Failed',                   cls: 'border-rose-700 bg-rose-950/30 text-rose-200',        description: 'The run did not produce the expected outcome.' },
  partial:                  { label: 'Partial',                  cls: 'border-amber-700 bg-amber-950/30 text-amber-200',     description: 'Some work landed but the run did not reach a clean terminal state.' },
}

export interface FinalResultPanelProps {
  summary: FinalRunSummary
  className?: string
}

function Section({ title, items, emptyHint }: { title: string; items: string[]; emptyHint?: string }) {
  if (!items?.length) {
    if (!emptyHint) return null
    return (
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
        <p className="mt-1 text-xs text-slate-500">{emptyHint}</p>
      </section>
    )
  }
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <ul className="mt-1 list-disc pl-5 space-y-0.5 text-xs text-slate-200">
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    </section>
  )
}

export default function FinalResultPanel({ summary, className = '' }: FinalResultPanelProps) {
  const outcome = OUTCOME_CFG[summary.outcome] ?? OUTCOME_CFG.partial
  return (
    <article
      data-outcome={summary.outcome}
      className={`rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-4 ${className}`}
      aria-label="Final run result"
    >
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${outcome.cls}`}>
            {outcome.label}
          </span>
          <span className="text-[11px] text-slate-500">
            Generated {formatRelativeTime(summary.generated_at)}
          </span>
        </div>
        <h2 className="mt-2 text-base font-semibold text-slate-100">Final Result</h2>
        {summary.objective && (
          <p className="mt-1 text-xs text-slate-400">{summary.objective}</p>
        )}
        <p className="mt-2 text-xs text-slate-500">{outcome.description}</p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Section
          title="Completed Work"
          items={summary.completed_work}
          emptyHint="No completed work was recorded."
        />
        <Section
          title="Changed Files"
          items={summary.changed_files}
        />
        <Section
          title="Created Artifacts"
          items={summary.created_artifacts}
        />
        <Section
          title="Warnings"
          items={summary.warnings}
        />
        <Section
          title="Next Recommended Steps"
          items={summary.next_steps}
          emptyHint="No follow-ups recommended."
        />
      </div>

      {summary.validation_results?.length > 0 && (
        <ValidationChecklist results={summary.validation_results} />
      )}

      {summary.blockers?.length > 0 && (
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Known Gaps</h3>
          <BlockersPanel blockers={summary.blockers} />
        </div>
      )}
    </article>
  )
}
