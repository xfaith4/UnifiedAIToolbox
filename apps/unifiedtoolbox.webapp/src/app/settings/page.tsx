'use client'

import { useState } from 'react'
import { CONCIERGE_MODES } from '@/lib/types/conciergePreferences'
import type { ConciergeMode } from '@/lib/types/conciergePreferences'
import { getConciergeMode, setConciergeMode } from '@/lib/services/userPreferencesStore'

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState(() =>
    typeof window === 'undefined' ? '' : localStorage.getItem('ai-toolbox-api-key') ?? ''
  )
  const [isSaved, setIsSaved] = useState(false)
  const [conciergeMode, setConciergeModeState] = useState<ConciergeMode>(() => getConciergeMode())

  const handleSave = () => {
    localStorage.setItem('ai-toolbox-api-key', apiKey)
    window.dispatchEvent(new Event('ai-toolbox-api-key-change'))
    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 3000)
  }

  const handleModeSelect = (m: ConciergeMode) => {
    setConciergeModeState(m)
    setConciergeMode(m)
  }

  return (
    <main>
      <div className="max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight">Settings</h1>
        <p className="mt-2 text-gray-400">
          Configure your AI Toolbox preferences and API keys.
        </p>

        <div className="mt-8 space-y-8">
          {/* API Key */}
          <div className="space-y-2">
            <label htmlFor="api-key" className="text-sm font-medium text-gray-300">
              Primary API Key
            </label>
            <input
              id="api-key"
              type="password"
              className="w-full rounded-xl border border-gray-700 bg-gray-800/60 px-3 py-2 text-gray-100 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value)
                setIsSaved(false)
              }}
              placeholder="sk-..."
            />
            <p className="text-xs text-gray-500">
              Your API key is stored locally and never sent to our servers.
            </p>
          </div>

          {/* Concierge Mode */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-300">Concierge Mode</p>
              <p className="mt-0.5 text-xs text-gray-500">
                Controls how the AI guides you through proposals. You can also change this inline
                in the Concierge chat.
              </p>
            </div>
            <div className="flex gap-2">
              {CONCIERGE_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => handleModeSelect(m.value)}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-left text-xs transition-colors ${
                    conciergeMode === m.value
                      ? 'border-blue-600 bg-blue-900/30 text-blue-200'
                      : 'border-gray-700 bg-gray-800/60 text-gray-400 hover:text-gray-200 hover:border-gray-600'
                  }`}
                >
                  <div className="font-semibold">{m.label}</div>
                  <div className="mt-0.5 text-[10px] leading-tight opacity-70">{m.description}</div>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-600">
              Mode saves immediately — no need to click Save Settings.
            </p>
          </div>

          {/* Save button (API key only) */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleSave}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              Save Settings
            </button>
            {isSaved && (
              <span className="text-sm text-green-400">
                API key saved successfully!
              </span>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
