/**
 * Unit tests for CurrentRunCard utilities and store integration.
 *
 * Full React rendering is not available in the Node vitest environment; we
 * therefore test:
 *  1. The runContextStore → CurrentRunCard data contract (entry shape).
 *  2. The pure helper logic that drives the card's display (duration, time).
 *  3. A smoke import — ensuring the module can be resolved without errors.
 */

import { describe, it, expect, beforeEach } from 'vitest'

// ── localStorage stub ──────────────────────────────────────────────────────────
const storage: Record<string, string> = {}
const localStorageMock = {
  getItem:    (key: string) => storage[key] ?? null,
  setItem:    (key: string, value: string) => { storage[key] = value },
  removeItem: (key: string) => { delete storage[key] },
  clear:      () => { for (const k in storage) delete storage[k] },
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })

import {
  saveRunContext,
  getLastRunContext,
  listRecentRunContexts,
  updateRunContextStatus,
} from '@/lib/services/runContextStore'
import type { RunContextEntry } from '@/lib/services/runContextStore'

// ── Duration/time helpers (mirrored from CurrentRunCard for isolated testing) ─
function formatDuration(startedAt: string, endedAt?: string): string {
  const start = new Date(startedAt).getTime()
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  const totalSecs = Math.max(0, Math.floor((end - start) / 1000))
  if (totalSecs < 60) return `${totalSecs}s`
  const m = Math.floor(totalSecs / 60)
  if (m < 60) return `${m}m ${totalSecs % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function formatRelativeTime(isoTs: string): string {
  const ms = Date.now() - new Date(isoTs).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<Omit<RunContextEntry, 'updatedAt'>> = {}): Omit<RunContextEntry, 'updatedAt'> {
  return {
    runId:      `run_card_${Math.random().toString(36).slice(2, 8)}`,
    goal:       'Build the feature',
    startedAt:  new Date().toISOString(),
    mode:       'multi-agent',
    status:     'queued',
    proposalId: `proposal_${Date.now()}`,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CurrentRunCard — store integration', () => {
  beforeEach(() => localStorageMock.clear())

  it('stores a run entry and the card can read it back', () => {
    const entry = makeEntry({ goal: 'My important run', status: 'running' })
    saveRunContext(entry)
    const retrieved = getLastRunContext()
    expect(retrieved?.runId).toBe(entry.runId)
    expect(retrieved?.goal).toBe('My important run')
    expect(retrieved?.status).toBe('running')
  })

  it('card receives status updates after updateRunContextStatus', () => {
    const entry = makeEntry({ status: 'queued' })
    saveRunContext(entry)
    updateRunContextStatus(entry.runId, 'running')
    expect(getLastRunContext()?.status).toBe('running')
  })

  it('only shows entries within 24h by default (fresh entry is visible)', () => {
    saveRunContext(makeEntry())
    expect(listRecentRunContexts().length).toBeGreaterThan(0)
  })

  it('does not show stale entries older than the TTL', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    saveRunContext(makeEntry({ startedAt: twoDaysAgo }))
    expect(listRecentRunContexts(24 * 60 * 60 * 1000).length).toBe(0)
  })

  it('entry has proposalId for "Back to Concierge" link', () => {
    const pid = 'proposal_back_link_test'
    saveRunContext(makeEntry({ proposalId: pid }))
    expect(getLastRunContext()?.proposalId).toBe(pid)
  })
})

describe('CurrentRunCard — formatDuration helper', () => {
  it('formats sub-minute durations in seconds', () => {
    const start = new Date(Date.now() - 45_000).toISOString()
    const result = formatDuration(start)
    expect(result).toMatch(/^\d+s$/)
  })

  it('formats minute-range durations as "Xm Ys"', () => {
    const start = new Date(Date.now() - 90_000).toISOString() // 1m 30s
    const result = formatDuration(start)
    expect(result).toMatch(/^1m \d+s$/)
  })

  it('formats hour-range durations as "Xh Ym"', () => {
    const start = new Date(Date.now() - 3_700_000).toISOString() // ~1h 1m
    const result = formatDuration(start)
    expect(result).toMatch(/^1h \d+m$/)
  })

  it('calculates duration between two timestamps', () => {
    const start = '2024-01-01T10:00:00.000Z'
    const end   = '2024-01-01T10:02:30.000Z' // 150s = 2m 30s
    expect(formatDuration(start, end)).toBe('2m 30s')
  })

  it('returns 0s for same start and end', () => {
    const ts = new Date().toISOString()
    expect(formatDuration(ts, ts)).toBe('0s')
  })
})

describe('CurrentRunCard — formatRelativeTime helper', () => {
  it('returns "just now" for very recent timestamps', () => {
    const ts = new Date().toISOString()
    expect(formatRelativeTime(ts)).toBe('just now')
  })

  it('returns "Xm ago" for minute-old timestamps', () => {
    const ts = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    expect(formatRelativeTime(ts)).toBe('5m ago')
  })

  it('returns "Xh ago" for hour-old timestamps', () => {
    const ts = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    expect(formatRelativeTime(ts)).toBe('3h ago')
  })

  it('returns "Xd ago" for day-old timestamps', () => {
    const ts = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    expect(formatRelativeTime(ts)).toBe('2d ago')
  })
})

describe('CurrentRunCard — smoke import', () => {
  it('the component module can be imported without errors', async () => {
    // Dynamic import to exercise module resolution
    // (React components cannot be rendered in node env, but the module
    // should load and export a default function)
    const mod = await import('@/components/runs/CurrentRunCard')
    expect(typeof mod.default).toBe('function')
  })
})
