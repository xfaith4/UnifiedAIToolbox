// ─────────────────────────────────────────────────────────────────────────────
// Tiny formatting helpers shared across the Run Console. Kept here (vs each
// component) so tests can pin formatting behavior and the runs list can reuse
// the same "5m ago" rules as the run detail page.
// ─────────────────────────────────────────────────────────────────────────────

export function formatRelativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return '—'
  const s = Math.max(0, Math.floor((now - t) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function formatDuration(
  startedAtIso: string | null | undefined,
  endedAtIso?: string | null,
  now: number = Date.now()
): string {
  if (!startedAtIso) return '—'
  const start = new Date(startedAtIso).getTime()
  if (!Number.isFinite(start)) return '—'
  const end = endedAtIso ? new Date(endedAtIso).getTime() : now
  const totalSecs = Math.max(0, Math.floor((end - start) / 1000))
  if (totalSecs < 60) return `${totalSecs}s`
  const m = Math.floor(totalSecs / 60)
  if (m < 60) return `${m}m ${totalSecs % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export function shortRunId(runId: string | null | undefined): string {
  if (!runId) return 'unknown'
  return runId.length > 16 ? `${runId.slice(0, 16)}…` : runId
}
