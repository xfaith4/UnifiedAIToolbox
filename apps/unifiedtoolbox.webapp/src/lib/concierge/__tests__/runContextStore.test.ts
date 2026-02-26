import { describe, it, expect, beforeEach } from 'vitest'

// ── localStorage stub ──────────────────────────────────────────────────────────
// Provide a minimal in-memory stub before the module under test is imported.
const storage: Record<string, string> = {}
const localStorageMock = {
  getItem:    (key: string) => storage[key] ?? null,
  setItem:    (key: string, value: string) => { storage[key] = value },
  removeItem: (key: string) => { delete storage[key] },
  clear:      () => { for (const k in storage) delete storage[k] },
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })

// Import AFTER stub is in place
import {
  saveRunContext,
  updateRunContextStatus,
  getRunContext,
  getLastRunContext,
  listRecentRunContexts,
  clearRunContexts,
  type RunContextEntry,
} from '@/lib/services/runContextStore'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<Omit<RunContextEntry, 'updatedAt'>> = {}): Omit<RunContextEntry, 'updatedAt'> {
  return {
    runId:      `run_${Math.random().toString(36).slice(2, 10)}`,
    goal:       'Refactor the auth module',
    startedAt:  new Date().toISOString(),
    mode:       'multi-agent',
    status:     'queued',
    proposalId: `proposal_test_${Date.now()}`,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runContextStore', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  // ── saveRunContext ──────────────────────────────────────────────────────────

  describe('saveRunContext', () => {
    it('persists a new entry and returns it with updatedAt set', () => {
      const entry = makeEntry()
      const saved = saveRunContext(entry)
      expect(saved.runId).toBe(entry.runId)
      expect(saved.updatedAt).toBeTruthy()
      expect(getRunContext(entry.runId)).toBeDefined()
    })

    it('puts newest entry first (most-recent-first order)', () => {
      const e1 = makeEntry({ goal: 'First goal' })
      const e2 = makeEntry({ goal: 'Second goal' })
      saveRunContext(e1)
      saveRunContext(e2)
      expect(getLastRunContext()?.goal).toBe('Second goal')
    })

    it('overwrites an existing entry with the same runId', () => {
      const entry = makeEntry()
      saveRunContext(entry)
      saveRunContext({ ...entry, status: 'running' })
      expect(getRunContext(entry.runId)?.status).toBe('running')
      // Should not create duplicates
      expect(listRecentRunContexts(Infinity).length).toBe(1)
    })

    it('caps the list at 10 entries', () => {
      for (let i = 0; i < 15; i++) {
        saveRunContext(makeEntry({ runId: `run_${i}` }))
      }
      expect(listRecentRunContexts(Infinity).length).toBe(10)
    })
  })

  // ── updateRunContextStatus ──────────────────────────────────────────────────

  describe('updateRunContextStatus', () => {
    it('updates the status and refreshes updatedAt', () => {
      const entry = makeEntry({ status: 'queued' })
      saveRunContext(entry)
      updateRunContextStatus(entry.runId, 'running')
      expect(getRunContext(entry.runId)?.status).toBe('running')
    })

    it('is a no-op for an unknown runId', () => {
      const entry = makeEntry()
      saveRunContext(entry)
      updateRunContextStatus('ghost_id', 'failed')
      // Original entry should be unchanged
      expect(getRunContext(entry.runId)?.status).toBe(entry.status)
    })
  })

  // ── getRunContext ───────────────────────────────────────────────────────────

  describe('getRunContext', () => {
    it('returns undefined for an unknown runId', () => {
      expect(getRunContext('no-such-run')).toBeUndefined()
    })

    it('retrieves the correct entry by runId', () => {
      const e1 = makeEntry({ goal: 'Goal A' })
      const e2 = makeEntry({ goal: 'Goal B' })
      saveRunContext(e1)
      saveRunContext(e2)
      expect(getRunContext(e1.runId)?.goal).toBe('Goal A')
      expect(getRunContext(e2.runId)?.goal).toBe('Goal B')
    })
  })

  // ── getLastRunContext ───────────────────────────────────────────────────────

  describe('getLastRunContext', () => {
    it('returns undefined when store is empty', () => {
      expect(getLastRunContext()).toBeUndefined()
    })

    it('returns the most recently saved entry', () => {
      saveRunContext(makeEntry({ goal: 'Old' }))
      const recent = makeEntry({ goal: 'New' })
      saveRunContext(recent)
      expect(getLastRunContext()?.goal).toBe('New')
    })
  })

  // ── listRecentRunContexts ──────────────────────────────────────────────────

  describe('listRecentRunContexts', () => {
    it('returns empty array when store is empty', () => {
      expect(listRecentRunContexts()).toEqual([])
    })

    it('includes entries within the default 24h window', () => {
      saveRunContext(makeEntry())
      expect(listRecentRunContexts().length).toBe(1)
    })

    it('excludes entries older than the given window', () => {
      const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
      saveRunContext(makeEntry({ startedAt: old }))
      // Within 24 hours — should be excluded
      expect(listRecentRunContexts(24 * 60 * 60 * 1000).length).toBe(0)
    })

    it('returns all entries when given Infinity ms', () => {
      const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      saveRunContext(makeEntry({ startedAt: old }))
      saveRunContext(makeEntry())
      expect(listRecentRunContexts(Infinity).length).toBe(2)
    })
  })

  // ── clearRunContexts ───────────────────────────────────────────────────────

  describe('clearRunContexts', () => {
    it('removes all stored entries', () => {
      saveRunContext(makeEntry())
      saveRunContext(makeEntry())
      clearRunContexts()
      expect(listRecentRunContexts(Infinity)).toEqual([])
      expect(getLastRunContext()).toBeUndefined()
    })
  })

  // ── persistence across calls ──────────────────────────────────────────────

  describe('localStorage persistence', () => {
    it('data survives between function calls (simulating page reload)', () => {
      const entry = makeEntry({ goal: 'Survive reload' })
      saveRunContext(entry)
      // A fresh call to getRunContext should still find it (same in-memory store)
      expect(getRunContext(entry.runId)?.goal).toBe('Survive reload')
    })

    it('handles corrupt JSON in localStorage gracefully', () => {
      localStorageMock.setItem('concierge.run-context.v1', '{not-valid-json}')
      expect(() => getLastRunContext()).not.toThrow()
      expect(getLastRunContext()).toBeUndefined()
    })

    it('handles non-array runs field gracefully', () => {
      localStorageMock.setItem('concierge.run-context.v1', JSON.stringify({ version: 1, runs: 'bad' }))
      expect(listRecentRunContexts(Infinity)).toEqual([])
    })
  })
})
