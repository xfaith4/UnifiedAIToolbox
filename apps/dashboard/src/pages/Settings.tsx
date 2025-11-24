import { useEffect, useState } from 'react'
import {
  getDefaultSettings,
  loadSettings,
  resetSettings,
  saveSettings,
  type Settings,
} from '../services/settingsStore'

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [status, setStatus] = useState<string>('')

  useEffect(() => {
    setSettings(loadSettings())
  }, [])

  const handleChange = (partial: Partial<Settings>) => {
    setSettings((prev) => ({
      ...prev,
      ...partial,
      featureFlags: { ...prev.featureFlags, ...(partial.featureFlags || {}) },
      providers: { ...prev.providers, ...(partial.providers || {}) },
    }))
  }

  const handleSave = () => {
    saveSettings(settings)
    setStatus('Saved')
    setTimeout(() => setStatus(''), 2000)
  }

  const handleReset = () => {
    const defaults = resetSettings()
    setSettings(defaults)
    setStatus('Reset to defaults')
    setTimeout(() => setStatus(''), 2000)
  }

  const defaults = getDefaultSettings()

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Configure environment URLs, feature flags, provider keys, and auth defaults. Values are
          stored locally in this browser.
        </p>
      </div>

      <div className="grid gap-6">
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow">
          <h2 className="text-lg font-semibold">Endpoints</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm text-slate-300">Prompt API Base URL</label>
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                placeholder="http://localhost:8000"
                value={settings.apiBaseUrl}
                onChange={(e) => handleChange({ apiBaseUrl: e.target.value })}
              />
              <p className="text-xs text-slate-500">
                Default from env: {defaults.apiBaseUrl || 'not set'}
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-300">Admin Token (X-Admin-Token)</label>
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                placeholder="optional"
                value={settings.adminToken}
                onChange={(e) => handleChange({ adminToken: e.target.value })}
              />
              <p className="text-xs text-slate-500">Used for cost endpoints and secured routes.</p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow">
          <h2 className="text-lg font-semibold">Provider Keys</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm text-slate-300">OpenAI API Key</label>
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                placeholder="sk-..."
                value={settings.providers.openAiApiKey}
                onChange={(e) =>
                  handleChange({ providers: { ...settings.providers, openAiApiKey: e.target.value } })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-300">Gemini API Key</label>
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                placeholder="AIza..."
                value={settings.providers.geminiApiKey}
                onChange={(e) =>
                  handleChange({ providers: { ...settings.providers, geminiApiKey: e.target.value } })
                }
              />
            </div>
          </div>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <label className="text-sm text-slate-300">Default Model</label>
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                placeholder="gpt-4o-mini"
                value={settings.defaultModel}
                onChange={(e) => handleChange({ defaultModel: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={settings.enableOpenAi}
                onChange={(e) => handleChange({ enableOpenAi: e.target.checked })}
              />
              Enable OpenAI
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={settings.enableGemini}
                onChange={(e) => handleChange({ enableGemini: e.target.checked })}
              />
              Enable Gemini
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow">
          <h2 className="text-lg font-semibold">Feature Flags</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="flex items-start gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                className="mt-1"
                checked={settings.featureFlags.useLocalPrompts}
                onChange={(e) =>
                  handleChange({
                    featureFlags: { ...settings.featureFlags, useLocalPrompts: e.target.checked },
                  })
                }
              />
              <span>
                Use local prompt cache
                <div className="text-xs text-slate-500">
                  Merge API prompts with bundled/local prompts for offline fallback.
                </div>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                className="mt-1"
                checked={settings.featureFlags.enableAuth}
                onChange={(e) =>
                  handleChange({
                    featureFlags: { ...settings.featureFlags, enableAuth: e.target.checked },
                  })
                }
              />
              <span>
                Require auth
                <div className="text-xs text-slate-500">
                  Toggle when prompt-api auth is enforced; currently stubbed locally.
                </div>
              </span>
            </label>
          </div>
        </section>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          Save
        </button>
        <button
          onClick={handleReset}
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-800"
        >
          Reset to defaults
        </button>
        <span className="text-sm text-slate-400">{status}</span>
      </div>

      <p className="text-xs text-slate-500">
        Note: Keys/tokens are stored in localStorage for this browser only. For shared deployments,
        prefer server-side or secret management solutions.
      </p>
    </div>
  )
}
