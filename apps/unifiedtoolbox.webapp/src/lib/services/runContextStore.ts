'use client'

// ─────────────────────────────────────────────────────────────────────────────
// runContextStore — persists lightweight run metadata across page navigations
// so Concierge can restore the "Current / Last Run" card even after the user
// leaves and comes back.
// ─────────────────────────────────────────────────────────────────────────────

const STORE_KEY = 'concierge.run-context.v1'
const MAX_ENTRIES = 10
const RECENT_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export type RunContextStatus =
  | 'initializing'
  | 'queued'
  | 'running'
  | 'gating'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | string

export type RunContextEntry = {
  runId: string
  /** Human-readable goal / title  */
  goal: string
  /** ISO timestamp when the run was requested */
  startedAt: string
  /** 'multi-agent' | 'codex-swarm' | etc. */
  mode?: string
  status: RunContextStatus
  /** Links back to the originating proposal (for "Back to Concierge" nav) */
  proposalId?: string
  /** ISO timestamp of last local update */
  updatedAt: string
}

type StorePayload = {
  version: 1
  runs: RunContextEntry[]
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function normalizeIsoTimestamp(value: unknown, fallback: string): string {
  const candidate = asNonEmptyString(value)
  if (!candidate) return fallback
  const ms = new Date(candidate).getTime()
  if (Number.isNaN(ms)) return fallback
  return new Date(ms).toISOString()
}

function normalizeRunContextEntry(raw: unknown): RunContextEntry | undefined {
  if (!raw || typeof raw !== 'object') return undefined

  const row = raw as Record<string, unknown>
  const now = new Date().toISOString()
  const runId = asNonEmptyString(row.runId) ?? asNonEmptyString(row.run_id)
  if (!runId) return undefined

  return {
    runId,
    goal: asNonEmptyString(row.goal) ?? 'Untitled run',
    startedAt: normalizeIsoTimestamp(row.startedAt ?? row.started_at, now),
    mode: asNonEmptyString(row.mode),
    status: asNonEmptyString(row.status) ?? 'queued',
    proposalId: asNonEmptyString(row.proposalId) ?? asNonEmptyString(row.proposal_id),
    updatedAt: normalizeIsoTimestamp(row.updatedAt ?? row.updated_at, now),
  }
}

function loadStore(): StorePayload {
  if (typeof localStorage === 'undefined') return { version: 1, runs: [] }
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return { version: 1, runs: [] }
    const parsed = JSON.parse(raw) as { runs?: unknown }
    if (!Array.isArray(parsed?.runs)) return { version: 1, runs: [] }
    const seen = new Set<string>()
    const normalized: RunContextEntry[] = []
    for (const item of parsed.runs) {
      const entry = normalizeRunContextEntry(item)
      if (!entry || seen.has(entry.runId)) continue
      seen.add(entry.runId)
      normalized.push(entry)
    }
    return { version: 1, runs: normalized.slice(0, MAX_ENTRIES) }
  } catch {
    return { version: 1, runs: [] }
  }
}

function persistStore(store: StorePayload): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch {
    // Storage quota exceeded — ignore
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Persist a new run context entry (or overwrite an existing one with the same runId).
 * The entry is pushed to the front of the list; only the latest MAX_ENTRIES are kept.
 */
export function saveRunContext(entry: Omit<RunContextEntry, 'updatedAt'>): RunContextEntry {
  const store = loadStore()
  const now = new Date().toISOString()
  const full: RunContextEntry = { ...entry, updatedAt: now }
  const withoutDup = store.runs.filter((r) => r.runId !== entry.runId)
  const updated: StorePayload = {
    version: 1,
    runs: [full, ...withoutDup].slice(0, MAX_ENTRIES),
  }
  persistStore(updated)
  return full
}

/**
 * Update the status of an existing run context entry.
 * No-ops if the runId is not found.
 */
export function updateRunContextStatus(runId: string, status: RunContextStatus): void {
  const store = loadStore()
  const now = new Date().toISOString()
  const updated: StorePayload = {
    version: 1,
    runs: store.runs.map((r) =>
      r.runId === runId ? { ...r, status, updatedAt: now } : r
    ),
  }
  persistStore(updated)
}

/**
 * Retrieve a specific run context entry by runId.
 */
export function getRunContext(runId: string): RunContextEntry | undefined {
  return loadStore().runs.find((r) => r.runId === runId)
}

/**
 * Retrieve the most recently saved run context entry (regardless of age).
 */
export function getLastRunContext(): RunContextEntry | undefined {
  return loadStore().runs[0]
}

/**
 * List run context entries whose startedAt is within the given time window.
 * Defaults to the last 24 hours.
 */
export function listRecentRunContexts(withinMs: number = RECENT_TTL_MS): RunContextEntry[] {
  const cutoff = Date.now() - withinMs
  return loadStore().runs.filter(
    (r) => new Date(r.startedAt).getTime() > cutoff
  )
}

/**
 * Remove all stored run context entries.
 */
export function clearRunContexts(): void {
  persistStore({ version: 1, runs: [] })
}
