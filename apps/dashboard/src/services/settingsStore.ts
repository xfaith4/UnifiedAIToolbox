export type ProviderKeyset = {
  openAiApiKey: string
  geminiApiKey: string
}

export type Settings = {
  apiBaseUrl: string
  adminToken: string
  defaultModel: string
  enableOpenAi: boolean
  enableGemini: boolean
  featureFlags: {
    useLocalPrompts: boolean
    enableAuth: boolean
  }
  providers: ProviderKeyset
}

const STORAGE_KEY = 'dashboard.settings.v1'
const envApi = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE || ''

const defaultSettings: Settings = {
  apiBaseUrl: envApi || 'http://localhost:8000',
  adminToken: '',
  defaultModel: 'gpt-4o-mini',
  enableOpenAi: true,
  enableGemini: false,
  featureFlags: {
    useLocalPrompts: true,
    enableAuth: false,
  },
  providers: {
    openAiApiKey: '',
    geminiApiKey: '',
  },
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultSettings
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      ...defaultSettings,
      ...parsed,
      featureFlags: { ...defaultSettings.featureFlags, ...(parsed?.featureFlags || {}) },
      providers: { ...defaultSettings.providers, ...(parsed?.providers || {}) },
    }
  } catch {
    return defaultSettings
  }
}

export function saveSettings(settings: Settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function resetSettings(): Settings {
  localStorage.removeItem(STORAGE_KEY)
  return defaultSettings
}

export function getDefaultSettings(): Settings {
  return defaultSettings
}
