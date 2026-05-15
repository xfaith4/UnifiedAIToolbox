'use client'

// ─────────────────────────────────────────────────────────────────────────────
// BlockersPanel — severity-coded list of active blockers. CTA appears only
// when `needed_from === "user"` AND status is `waiting_on_input` (per the
// A2A contract). Render-only otherwise.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react'
import type {
  BlockerSeverity,
  FinalBlocker,
} from '@/lib/app-factory/runs/finalSummary'
import type {
  CanonicalRunStatus,
  ManifestBlocker,
} from '@/lib/app-factory/runs/manifest'
import EmptyState from './EmptyState'

const SEVERITY_CFG: Record<BlockerSeverity, { label: string; cls: string }> = {
  hard_blocker:         { label: 'Hard Blocker',         cls: 'border-rose-800 bg-rose-950/30 text-rose-200' },
  soft_blocker:         { label: 'Soft Blocker',         cls: 'border-amber-800 bg-amber-950/30 text-amber-200' },
  clarification_needed: { label: 'Clarification Needed', cls: 'border-amber-800 bg-amber-950/30 text-amber-200' },
  non_blocking_gap:     { label: 'Non-blocking Gap',     cls: 'border-slate-700 bg-slate-900/40 text-slate-300' },
}

export interface RichBlocker {
  id?: string
  severity: BlockerSeverity
  summary: string
  agent?: string
  /** Optional contract field (see A2A_CONTRACT.md): who must act. */
  needed_from?: 'user' | 'agent' | 'system'
  /** Optional: what's already been tried. */
  tried?: string[]
  /** Optional: what can still continue while blocked. */
  can_continue?: string[]
  /** Optional: recommended action. */
  recommended_action?: string
}

export interface BlockersPanelProps {
  /** Mixed blockers from manifest + final summary. */
  blockers: Array<ManifestBlocker | FinalBlocker | RichBlocker>
  /** Current canonical status; CTA only renders when this is `waiting_on_input`. */
  runStatus?: CanonicalRunStatus | string | null
  /** Optional CTA renderer; receives the actionable blocker. */
  renderCta?: (blocker: RichBlocker) => ReactNode
  className?: string
}

function normalize(b: ManifestBlocker | FinalBlocker | RichBlocker): RichBlocker {
  const rich = b as RichBlocker
  return {
    id: b.id,
    severity: b.severity,
    summary: b.summary,
    agent: b.agent,
    needed_from: rich.needed_from,
    tried: rich.tried,
    can_continue: rich.can_continue,
    recommended_action: rich.recommended_action,
  }
}

export default function BlockersPanel({ blockers, runStatus, renderCta, className = '' }: BlockersPanelProps) {
  if (!blockers || blockers.length === 0) {
    return (
      <EmptyState
        reason="generic"
        title="No active blockers"
        body="Nothing is preventing the run from making progress."
        className={className}
      />
    )
  }
  const rich = blockers.map(normalize)
  return (
    <div className={`space-y-2 ${className}`} aria-label="Active blockers">
      {rich.map((b, idx) => {
        const cfg = SEVERITY_CFG[b.severity] ?? SEVERITY_CFG.hard_blocker
        const ctaEligible =
          runStatus === 'waiting_on_input' && b.needed_from === 'user' && Boolean(renderCta)
        return (
          <div
            key={b.id ?? `${b.severity}-${idx}`}
            data-severity={b.severity}
            data-cta-eligible={ctaEligible ? 'true' : 'false'}
            className={`rounded-xl border p-3 ${cfg.cls}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-current/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                {cfg.label}
              </span>
              {b.agent && (
                <span className="text-[11px] opacity-80">Agent: <span className="font-medium">{b.agent}</span></span>
              )}
              {b.needed_from && (
                <span className="text-[11px] opacity-80">Needs: <span className="font-medium">{b.needed_from}</span></span>
              )}
            </div>
            <p className="mt-2 text-xs leading-relaxed">{b.summary}</p>
            {b.tried && b.tried.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[11px] opacity-80">Already tried ({b.tried.length})</summary>
                <ul className="mt-1 list-disc pl-5 text-[11px] opacity-80">
                  {b.tried.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </details>
            )}
            {b.can_continue && b.can_continue.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-[11px] opacity-80">Can continue without ({b.can_continue.length})</summary>
                <ul className="mt-1 list-disc pl-5 text-[11px] opacity-80">
                  {b.can_continue.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </details>
            )}
            {b.recommended_action && (
              <p className="mt-2 text-[11px] opacity-90">
                <span className="font-semibold">Recommended:</span> {b.recommended_action}
              </p>
            )}
            {ctaEligible && renderCta && (
              <div className="mt-3">{renderCta(b)}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
