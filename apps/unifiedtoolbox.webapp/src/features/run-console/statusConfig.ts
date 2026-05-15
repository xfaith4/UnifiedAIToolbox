// ─────────────────────────────────────────────────────────────────────────────
// Canonical status → display config. Centralized so RunStatusBadge,
// AgentCards, RunHeader, and the runs list all agree on label + color.
//
// Labels and color buckets are derived from RUN_LIFECYCLE.md §7 (Agent 1
// contract) and the existing Tailwind palette already used elsewhere in
// `apps/unifiedtoolbox.webapp` (e.g. CurrentRunCard, runs/page StatusBadge).
// We do NOT add new color tokens — these are all built-in Tailwind shades.
// ─────────────────────────────────────────────────────────────────────────────

import type { CanonicalRunStatus } from '@/lib/app-factory/runs/manifest'

export interface StatusConfig {
  /** Visible label, e.g. "Waiting on Input". */
  label: string
  /** Tailwind classes for the badge background/border/text. */
  badgeCls: string
  /** Single-color dot class for compact use (e.g. AgentCards). */
  dotCls: string
  /** One-sentence operator hint, surfaced as a tooltip. */
  tooltip: string
  /** Whether this status is a terminal state. */
  terminal: boolean
}

const CONFIG: Record<CanonicalRunStatus, StatusConfig> = {
  queued: {
    label: 'Queued',
    badgeCls: 'bg-amber-950/40 text-amber-300 border-amber-800',
    dotCls: 'bg-amber-400',
    tooltip: 'Run accepted; waiting for a worker to pick it up.',
    terminal: false,
  },
  running: {
    label: 'Running',
    badgeCls: 'bg-blue-950/40 text-blue-300 border-blue-800',
    dotCls: 'bg-blue-400',
    tooltip: 'At least one agent is actively working on this run.',
    terminal: false,
  },
  waiting_on_input: {
    label: 'Waiting on Input',
    badgeCls: 'bg-amber-950/40 text-amber-200 border-amber-700',
    dotCls: 'bg-amber-400',
    tooltip: 'The run is paused until you answer a clarification or unblock decision.',
    terminal: false,
  },
  recovering: {
    label: 'Recovering',
    badgeCls: 'bg-cyan-950/40 text-cyan-300 border-cyan-800',
    dotCls: 'bg-cyan-400',
    tooltip: 'A previous failure is being retried automatically.',
    terminal: false,
  },
  blocked: {
    label: 'Blocked',
    badgeCls: 'bg-amber-950/40 text-amber-300 border-amber-700',
    dotCls: 'bg-amber-500',
    tooltip: 'An agent reported a blocker. No automatic recovery is in progress.',
    terminal: false,
  },
  validating: {
    label: 'Validating',
    badgeCls: 'bg-indigo-950/40 text-indigo-300 border-indigo-800',
    dotCls: 'bg-indigo-400',
    tooltip: 'The orchestrator is checking acceptance gates and validations.',
    terminal: false,
  },
  completed: {
    label: 'Complete',
    badgeCls: 'bg-emerald-950/40 text-emerald-300 border-emerald-700',
    dotCls: 'bg-emerald-400',
    tooltip: 'The run finished. Review the final summary and artifacts.',
    terminal: true,
  },
  failed: {
    label: 'Failed',
    badgeCls: 'bg-rose-950/40 text-rose-300 border-rose-800',
    dotCls: 'bg-rose-400',
    tooltip: 'The run ended without producing the expected outcome.',
    terminal: true,
  },
}

const FALLBACK: StatusConfig = {
  label: 'Running',
  badgeCls: 'bg-slate-800 text-slate-300 border-slate-700',
  dotCls: 'bg-slate-400',
  tooltip: 'Unknown status — treating as Running. Check the event stream.',
  terminal: false,
}

/**
 * Look up the visual config for a status. If the value isn't one of the eight
 * canonical statuses we defensively fall back to a "Running"-styled badge and
 * console.warn — per Agent 1's contract guidance.
 */
export function getStatusConfig(status: string | null | undefined): StatusConfig {
  if (!status) return FALLBACK
  if (status in CONFIG) {
    return CONFIG[status as CanonicalRunStatus]
  }
  if (typeof console !== 'undefined') {
    // Surface so we notice contract drift in dev, but don't break the UI.
    // eslint-disable-next-line no-console
    console.warn(`[run-console] Unknown canonical run status: "${status}" — falling back to "running".`)
  }
  return FALLBACK
}

/** All known statuses in canonical order — handy for filter chips and tests. */
export const ALL_STATUSES: CanonicalRunStatus[] = [
  'queued',
  'running',
  'waiting_on_input',
  'recovering',
  'blocked',
  'validating',
  'completed',
  'failed',
]
