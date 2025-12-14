'use client'

import { useState } from 'react'

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState(() =>
    typeof window === 'undefined' ? '' : localStorage.getItem('ai-toolbox-api-key') ?? ''
  )
  const [isSaved, setIsSaved] = useState(false)

  const handleSave = () => {
    localStorage.setItem('ai-toolbox-api-key', apiKey)
    window.dispatchEvent(new Event('ai-toolbox-api-key-change'))
    setIsSaved(true)
    // Reset the saved message after a few seconds
    setTimeout(() => setIsSaved(false), 3000)
  }

  return (
    <main>
      <div className="max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight">Settings</h1>
        <p className="mt-2 text-slate-400">
          Configure your AI Toolbox preferences and API keys.
        </p>

        <div className="mt-8 space-y-6">
          <div className="space-y-2">
            <label htmlFor="api-key" className="text-sm font-medium text-slate-300">
              Primary API Key
            </label>
            <input
              id="api-key"
              type="password"
              className="w-full rounded-xl border-slate-700 bg-slate-800/60 px-3 py-2 text-slate-100 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value)
                setIsSaved(false) // Reset saved status on change
              }}
              placeholder="sk-..."
            />
            <p className="text-xs text-slate-500">
              Your API key is stored locally and never sent to our servers.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Save Settings
          </button>
          {isSaved && (
            <span className="ml-4 text-sm text-green-400">
              Settings saved successfully!
            </span>
          )}
        </div>
      </div>
    </main>
  )
}
