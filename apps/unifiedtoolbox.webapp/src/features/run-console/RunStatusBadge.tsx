'use client'

// ─────────────────────────────────────────────────────────────────────────────
// RunStatusBadge — single source of truth for the 8 canonical status pills.
// Pure presentation: no fetching, no state. Renders a label + color +
// accessible tooltip.
// ─────────────────────────────────────────────────────────────────────────────

import { getStatusConfig } from './statusConfig'

export interface RunStatusBadgeProps {
  status: string | null | undefined
  /** Compact variant for use in dense tables / agent cards. */
  compact?: boolean
  className?: string
}

export default function RunStatusBadge({ status, compact, className = '' }: RunStatusBadgeProps) {
  const cfg = getStatusConfig(status)
  const sizeCls = compact
    ? 'px-1.5 py-0.5 text-[10px]'
    : 'px-2 py-0.5 text-[11px]'
  return (
    <span
      role="status"
      aria-label={`Run status: ${cfg.label}`}
      title={cfg.tooltip}
      data-status={status ?? 'unknown'}
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${cfg.badgeCls} ${sizeCls} ${className}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${cfg.dotCls}`} />
      {cfg.label}
    </span>
  )
}
