'use client'

import React, { useState } from 'react'

interface LocalRepoPathPickerProps {
  path: string
  onChange: (path: string) => void
  disabled?: boolean
}

/**
 * Shown in "Maintain Existing App" mode.
 * Lets the user type or browse-pick a local folder / file path that the
 * orchestration pipeline will use as the repo root.
 */
export default function LocalRepoPathPicker({ path, onChange, disabled }: LocalRepoPathPickerProps) {
  const [picking, setPicking] = useState(false)
  const [pickError, setPickError] = useState<string | null>(null)

  const handleBrowse = async () => {
    if (picking || disabled) return
    setPicking(true)
    setPickError(null)
    try {
      const res = await fetch('/api/app-factory/browse-folder', { method: 'POST' })
      const json = await res.json().catch(() => null)

      if (!res.ok) {
        setPickError(json?.error ?? `Browse failed (${res.status})`)
        return
      }
      if (json?.cancelled) return        // user dismissed dialog — keep current value
      if (json?.path) onChange(json.path)
    } catch (err) {
      setPickError(err instanceof Error ? err.message : 'Browse failed.')
    } finally {
      setPicking(false)
    }
  }

  return (
    <div className="border-b border-gray-700 bg-gray-900/20 px-4 py-3">
      <div className="max-w-6xl mx-auto space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-amber-400">
          Local Repo / Project Path
          <span className="ml-1.5 normal-case font-normal text-gray-500">(optional — leave blank to use default repo root)</span>
        </label>
        <div className="flex gap-2 items-center">
          <input
            type="text"
            className="flex-1 rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
            placeholder="e.g. C:\Projects\my-app  or  /home/user/projects/my-app"
            value={path}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => void handleBrowse()}
            disabled={picking || disabled}
            className="flex items-center gap-1.5 rounded-lg border border-amber-700/60 bg-amber-900/20 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {picking ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
                Picking…
              </>
            ) : (
              <>
                <FolderIcon />
                Browse
              </>
            )}
          </button>
          {path && (
            <button
              type="button"
              onClick={() => { onChange(''); setPickError(null) }}
              disabled={disabled}
              className="rounded-lg border border-gray-700 px-2 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:border-gray-500 disabled:opacity-40 transition-colors"
              title="Clear path"
            >
              ✕
            </button>
          )}
        </div>

        {path && (
          <div className="flex items-center gap-1.5 text-[11px] text-amber-300/80">
            <span className="font-mono truncate max-w-[60ch]">{path}</span>
            <span className="text-gray-600">— will be used as repo root</span>
          </div>
        )}

        {pickError && (
          <div className="text-[11px] text-rose-400">{pickError}</div>
        )}
      </div>
    </div>
  )
}

function FolderIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  )
}
