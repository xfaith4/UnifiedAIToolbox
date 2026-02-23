import { describe, it, expect, beforeEach } from 'vitest'

// ── localStorage stub ──────────────────────────────────────────────────────────
const storage: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => { storage[key] = value },
  removeItem: (key: string) => { delete storage[key] },
  clear: () => { for (const k in storage) delete storage[k] },
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })

// Import store AFTER stub is in place
import {
  getPreferences,
  savePreferences,
  getConciergeMode,
  setConciergeMode,
} from '@/lib/services/userPreferencesStore'
import { DEFAULT_PREFERENCES } from '@/lib/types/conciergePreferences'

beforeEach(() => localStorageMock.clear())

// ── getPreferences ────────────────────────────────────────────────────────────
describe('getPreferences', () => {
  it('returns DEFAULT_PREFERENCES when nothing is stored', () => {
    const prefs = getPreferences()
    expect(prefs).toEqual(DEFAULT_PREFERENCES)
  })

  it('returns saved preferences after save', () => {
    savePreferences({ conciergeMode: 'guided' })
    const prefs = getPreferences()
    expect(prefs.conciergeMode).toBe('guided')
  })
})

// ── savePreferences ───────────────────────────────────────────────────────────
describe('savePreferences', () => {
  it('persists and returns the saved object', () => {
    const result = savePreferences({ conciergeMode: 'hands-off' })
    expect(result.conciergeMode).toBe('hands-off')
    expect(getPreferences().conciergeMode).toBe('hands-off')
  })
})

// ── getConciergeMode ──────────────────────────────────────────────────────────
describe('getConciergeMode', () => {
  it("returns 'confident' (default) when nothing is stored", () => {
    expect(getConciergeMode()).toBe('confident')
  })
})

// ── setConciergeMode ──────────────────────────────────────────────────────────
describe('setConciergeMode', () => {
  it("setConciergeMode('guided') — getConciergeMode() then returns 'guided'", () => {
    setConciergeMode('guided')
    expect(getConciergeMode()).toBe('guided')
  })

  it("setConciergeMode('hands-off') — round-trips correctly", () => {
    setConciergeMode('hands-off')
    expect(getConciergeMode()).toBe('hands-off')
  })
})
