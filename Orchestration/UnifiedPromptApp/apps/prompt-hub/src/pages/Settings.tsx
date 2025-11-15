import { useState } from 'react'

export function Settings() {
  const [apiBase, setApiBase] = useState(import.meta.env.VITE_API_BASE || '')

  return (
    <div className="space-y-4 max-w-xl">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <label className="block">
        <div className="text-sm text-slate-600 mb-1">API Base URL</div>
        <input
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400"
          value={apiBase}
          onChange={(e) => setApiBase(e.target.value)}
          placeholder="http://localhost:5050/api"
        />
      </label>
      <p className="text-sm text-slate-500">Values from <code>.env</code> with prefix <code>VITE_</code> are exposed at build-time.</p>
    </div>
  )
}
