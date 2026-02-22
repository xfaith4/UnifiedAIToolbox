'use client'

import React, { useState, useMemo, useEffect } from 'react'
import type { PromptItem, PromptVariable } from '@/lib/types/prompts'

interface PromptPickerProps {
  prompts: PromptItem[]
  disabled?: boolean
  onUse: (resolvedText: string) => void
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Build the full variable list for a prompt.
 * Uses explicit `variables` array when available, then auto-detects any
 * additional {{varName}} tokens that aren't already covered.
 */
function buildVarList(prompt: PromptItem): PromptVariable[] {
  const explicit = prompt.variables ?? []
  const knownNames = new Set(explicit.map(v => v.name))
  const matches = [...prompt.template.matchAll(/\{\{(\w+)\}\}/g)]
  const detected = [...new Set(matches.map(m => m[1]))]
  const extra = detected
    .filter(name => !knownNames.has(name))
    .map(name => ({ name, label: name, type: 'string' as const }))
  return [...explicit, ...extra]
}

/**
 * Substitute {{varName}} tokens in a template.
 * Unresolved tokens (empty or missing value) are left as {{varName}}.
 */
function resolveTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    values[key] !== undefined && values[key] !== '' ? values[key] : match
  )
}

// ── Preview renderer ──────────────────────────────────────────────────────────

function PreviewText({
  template,
  values,
}: {
  template: string
  values: Record<string, string>
}) {
  const parts = template.split(/(\{\{\w+\}\})/)
  return (
    <pre className="whitespace-pre-wrap break-words text-[11px] font-mono leading-relaxed text-slate-300">
      {parts.map((part, i) => {
        const m = part.match(/^\{\{(\w+)\}\}$/)
        if (m) {
          const key = m[1]
          const val = values[key]
          const isFilled = val !== undefined && val !== ''
          return isFilled ? (
            <span key={i} className="text-emerald-300">{val}</span>
          ) : (
            <span key={i} className="rounded bg-amber-900/40 px-0.5 text-amber-300">{part}</span>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </pre>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PromptPicker({ prompts, disabled, onUse }: PromptPickerProps) {
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<PromptItem | null>(null)
  const [varValues, setVarValues] = useState<Record<string, string>>({})
  const [showPreview, setShowPreview] = useState(false)

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return prompts
    return prompts.filter(
      p =>
        p.title.toLowerCase().includes(q) ||
        (p.category ?? '').toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        (p.tags ?? []).some(t => t.toLowerCase().includes(q))
    )
  }, [prompts, filter])

  const varList = useMemo(
    () => (selected ? buildVarList(selected) : []),
    [selected]
  )

  // Initialise variable values (with defaults) whenever a new prompt is selected
  useEffect(() => {
    if (!selected) return
    const initial: Record<string, string> = {}
    for (const v of buildVarList(selected)) {
      initial[v.name] = v.default ?? ''
    }
    setVarValues(initial)
    setShowPreview(false)
  }, [selected])

  const resolved = useMemo(
    () => (selected ? resolveTemplate(selected.template, varValues) : ''),
    [selected, varValues]
  )

  const hasUnfilled = useMemo(() => /\{\{\w+\}\}/.test(resolved), [resolved])

  const handleUse = () => {
    if (!selected) return
    onUse(resolved)
    setSelected(null)
    setFilter('')
  }

  const closeModal = () => setSelected(null)

  return (
    <>
      {/* ── Prompt list panel ──────────────────────────────────────────────── */}
      <div className="rounded-lg border border-slate-700/60 bg-slate-800/20 px-3 py-2.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Instruction — load from Prompt Library
          </label>
          <span className="text-[11px] text-slate-500">{prompts.length} prompts</span>
        </div>

        <input
          className="w-full rounded border border-slate-700 bg-slate-800/60 px-2 py-1 text-xs text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
          placeholder="Filter by title, category, or tag…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          disabled={disabled}
        />

        <div className="max-h-44 overflow-y-auto rounded border border-slate-800 bg-slate-900/60 divide-y divide-slate-800/60">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">No prompts match.</div>
          ) : (
            filtered.map(p => {
              const vars = buildVarList(p)
              return (
                <button
                  key={p.id}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-800/50 transition-colors disabled:opacity-50 group"
                  onClick={() => setSelected(p)}
                  disabled={disabled}
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-slate-100 font-medium truncate block group-hover:text-white transition-colors">
                      {p.title}
                    </span>
                    {p.description && (
                      <span className="text-[11px] text-slate-500 truncate block leading-tight">
                        {p.description}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {p.category && (
                      <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-400">
                        {p.category}
                      </span>
                    )}
                    {vars.length > 0 && (
                      <span className="rounded bg-blue-900/40 border border-blue-800/60 px-1.5 py-0.5 text-[10px] text-blue-300">
                        {vars.length} var{vars.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-600 group-hover:text-slate-400 transition-colors">
                      →
                    </span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Variable configuration modal ───────────────────────────────────── */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">

            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-semibold text-slate-100">{selected.title}</h2>
                  {selected.category && (
                    <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-400">
                      {selected.category}
                    </span>
                  )}
                </div>
                {selected.description && (
                  <p className="mt-1 text-sm text-slate-400 leading-relaxed">{selected.description}</p>
                )}
              </div>
              <button
                className="flex-shrink-0 rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors"
                onClick={closeModal}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {/* Variable inputs */}
              {varList.length > 0 ? (
                <div className="space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Variables ({varList.length})
                  </div>
                  {varList.map(v => (
                    <label key={v.name} className="block space-y-1.5">
                      <span className="text-xs font-medium text-slate-300">
                        {v.label ?? v.name}
                        {v.default && (
                          <span className="ml-1.5 text-slate-500 font-normal">
                            default: {v.default}
                          </span>
                        )}
                      </span>
                      {v.type === 'multiline' ? (
                        <textarea
                          className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y min-h-[80px]"
                          placeholder={`Enter ${(v.label ?? v.name).toLowerCase()}…`}
                          value={varValues[v.name] ?? ''}
                          onChange={e =>
                            setVarValues(prev => ({ ...prev, [v.name]: e.target.value }))
                          }
                          rows={4}
                        />
                      ) : (
                        <input
                          type="text"
                          className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder={v.default ? `Default: ${v.default}` : `Enter ${(v.label ?? v.name).toLowerCase()}…`}
                          value={varValues[v.name] ?? ''}
                          onChange={e =>
                            setVarValues(prev => ({ ...prev, [v.name]: e.target.value }))
                          }
                        />
                      )}
                    </label>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-slate-800 bg-slate-800/20 px-3 py-2 text-xs text-slate-500">
                  No variables — this prompt will be used as-is.
                </div>
              )}

              {/* Unfilled warning */}
              {hasUnfilled && (
                <div className="rounded-lg border border-amber-700/40 bg-amber-900/20 px-3 py-2 text-xs text-amber-300">
                  Some variables are still empty — they will appear as{' '}
                  <code className="font-mono text-amber-200">{'{{name}}'}</code> in the goal text.
                  You can fill them in the goal text field before running.
                </div>
              )}

              {/* Resolved preview */}
              <div>
                <button
                  className="text-[11px] text-slate-500 hover:text-slate-300 underline transition-colors"
                  onClick={() => setShowPreview(v => !v)}
                >
                  {showPreview ? 'Hide resolved preview' : 'Show resolved preview'}
                </button>
                {showPreview && (
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                    <PreviewText template={selected.template} values={varValues} />
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 border-t border-slate-800 px-5 py-3">
              <div className="text-[11px] text-slate-500">
                {varList.length > 0 && !hasUnfilled
                  ? '✓ All variables filled'
                  : varList.length > 0 && hasUnfilled
                  ? `${varList.filter(v => !varValues[v.name]).length} variable${varList.filter(v => !varValues[v.name]).length !== 1 ? 's' : ''} empty`
                  : ''}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors rounded-lg hover:bg-slate-800"
                  onClick={closeModal}
                >
                  Cancel
                </button>
                <button
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white transition-colors"
                  onClick={handleUse}
                >
                  Use this prompt →
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  )
}
