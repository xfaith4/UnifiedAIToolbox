/**
 * conciergePreferences.ts
 * User-configurable interaction modes for the Concierge AI.
 *
 * Modes adjust how aggressively the AI asks clarifying questions before
 * generating a proposal. Preference persists in localStorage via
 * userPreferencesStore.
 */

export type ConciergeMode = 'guided' | 'confident' | 'hands-off'

export const CONCIERGE_MODES: {
  value: ConciergeMode
  label: string
  description: string
}[] = [
  {
    value: 'guided',
    label: 'Guided',
    description: 'Asks 2–3 clarifying questions before proposing. Best for new or complex tasks.',
  },
  {
    value: 'confident',
    label: 'Confident',
    description: 'One clarifying turn then a proposal. Balanced default.',
  },
  {
    value: 'hands-off',
    label: 'Hands-off',
    description: 'Generates a proposal immediately. Best for experienced users with clear goals.',
  },
]

export interface UserPreferences {
  conciergeMode: ConciergeMode
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  conciergeMode: 'confident',
}
