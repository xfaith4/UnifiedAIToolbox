'use client'

/**
 * userPreferencesStore.ts
 * Persists user preferences in localStorage (key: utb.preferences.v1).
 * Pattern mirrors proposalStore.ts — load/save with try/catch, silent no-op on error.
 */

import type { UserPreferences, ConciergeMode } from '@/lib/types/conciergePreferences'
import { DEFAULT_PREFERENCES } from '@/lib/types/conciergePreferences'

const PREFS_KEY = 'utb.preferences.v1'

// ── Internal helpers ──────────────────────────────────────────────────────────

function load(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...DEFAULT_PREFERENCES }
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as Partial<UserPreferences>) }
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

function save(prefs: UserPreferences): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // localStorage unavailable (SSR, private mode quota exceeded) — ignore
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Return persisted preferences, falling back to DEFAULT_PREFERENCES on error. */
export function getPreferences(): UserPreferences {
  return load()
}

/** Persist the full preferences object and return it. */
export function savePreferences(prefs: UserPreferences): UserPreferences {
  save(prefs)
  return prefs
}

/** Shorthand: get the stored Concierge mode (defaults to 'confident'). */
export function getConciergeMode(): ConciergeMode {
  return load().conciergeMode
}

/** Shorthand: update only the Concierge mode, preserving other preferences. */
export function setConciergeMode(mode: ConciergeMode): void {
  save({ ...load(), conciergeMode: mode })
}
