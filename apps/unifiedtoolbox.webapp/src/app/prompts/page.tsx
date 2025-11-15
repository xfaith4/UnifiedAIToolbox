'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PromptItem, PromptVariable, FewShotExample } from '@/lib/types/prompts'
import {
  fetchPromptLibrary,
  normalizePrompt,
  persistPromptLibrary,
} from '@/lib/services/promptStore'

export default function PromptsPage() {
  const [items, setItems] = useState<PromptItem[]>([])
  const [query, setQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [editing, setEditing] = useState<PromptItem | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const initialized = useRef(false)

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const list = await fetchPromptLibrary()
      setItems(list)
      initialized.current = true
      setIsLoading(false)
    }
    void load()
  }, [])

  useEffect(() => {
    if (!initialized.current) return
    void persistPromptLibrary(items)
  }, [items, initialized])

  const allCategories = useMemo(() => {
    const set = new Set<string>()
    for (const p of items) {
      if (p.category) set.add(p.category)
    }
    return Array.from(set).sort()
  }, [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((p) => {
      const haystacks = [
        p.title,
        p.category ?? '',
        p.context ?? '',
        p.description ?? '',
        p.template ?? '',
        (p.tags ?? []).join(' '),
      ]
      const textHit = !q || haystacks.some((h) => h.toLowerCase().includes(q))
      const categoryHit = !filterCategory || (p.category ?? '') === filterCategory
      return textHit && categoryHit
    })
  }, [items, query, filterCategory])

  const active = useMemo(
    () => items.find((i) => i.id === activeId) ?? null,
    [items, activeId]
  )

  function newPrompt() {
    const draft = normalizePrompt({
      title: 'New Prompt',
      template: 'You are a helpful AI.\nTask: {{task}}\nConstraints: {{constraints}}',
      variables: [
        { name: 'task', label: 'Task', type: 'multiline' },
        { name: 'constraints', label: 'Constraints', type: 'string' },
      ],
    })
    setItems((prev) => [draft, ...prev])
    setActiveId(draft.id)
    setEditing(draft)
  }

  function savePrompt(next: PromptItem) {
    const updated = {
      ...normalizePrompt(next),
      updatedAt: new Date().toISOString(),
    }
    setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    setEditing(null)
  }

  function deletePrompt(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id))
    if (activeId === id) setActiveId(null)
    if (editing?.id === id) setEditing(null)
  }

  function clonePrompt(p: PromptItem) {
    const clone = normalizePrompt({
      ...p,
      id: undefined, // let normalizePrompt create a new one
      title: `${p.title} (Copy)`,
    })
    setItems((prev) => [clone, ...prev])
    setActiveId(clone.id)
    setEditing(clone)
  }

  function exportJson() {
    const blob = new window.Blob([JSON.stringify(items, null, 2)], {
      type: 'application/json',
    })
    const link = document.createElement('a')
    const url = window.URL.createObjectURL(blob)
    link.href = url
    link.download = 'prompt-library.json'
    link.click()
    window.URL.revokeObjectURL(url)
  }

  function importJson(file: globalThis.File) {
    const reader = new window.FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        if (!Array.isArray(parsed)) throw new Error('Invalid format: expected an array of prompts.')
        const map = new Map<string, PromptItem>(items.map((i) => [i.id, i]))
        for (const raw of parsed) {
          const prompt = normalizePrompt(raw)
          map.set(prompt.id, prompt)
        }
        const merged = Array.from(map.values()).sort((a, b) =>
          (b.updatedAt || '').localeCompare(a.updatedAt || '')
        )
        setItems(merged)
      } catch (e) {
        window.alert('Import failed: ' + (e as Error).message)
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Prompt Library</h1>
          <p className="text-sm text-slate-400">
            Create, test, and manage your reusable AI prompts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm hover:bg-slate-700/80"
            onClick={exportJson}
          >
            Export JSON
          </button>
          <label className="cursor-pointer rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm hover:bg-slate-700/80">
            Import JSON
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) importJson(f)
              }}
            />
          </label>
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
            onClick={newPrompt}
          >
            New Prompt
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, category, context, prompt text…"
          className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm"
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {allCategories.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-2 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/50 p-2 max-h-[calc(100vh-250px)]">
          {isLoading && <div className="p-4 text-sm text-slate-400">Loading prompts…</div>}
          {!isLoading && filtered.length === 0 && (
            <div className="p-4 text-sm text-slate-400">No prompts found.</div>
          )}
          {!isLoading &&
            filtered.map((p) => (
              <div
                key={p.id}
                className={`rounded-xl border p-3 ${
                  activeId === p.id ? 'border-blue-500 bg-slate-800' : 'border-transparent'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold">{p.title}</div>
                  {p.category && (
                    <span className="text-[10px] rounded bg-slate-700 px-2 py-0.5">
                      {p.category}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-slate-400">{p.context || p.description}</div>
                <div className="mt-3 flex gap-2">
                  <button
                    className="rounded-lg bg-slate-700/80 px-2 py-1 text-xs hover:bg-slate-700"
                    onClick={() => {
                      setActiveId(p.id)
                      setEditing(p)
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="rounded-lg bg-slate-800/50 px-2 py-1 text-xs hover:bg-slate-700/50"
                    onClick={() => clonePrompt(p)}
                  >
                    Clone
                  </button>
                  <button
                    className="rounded-lg bg-rose-500/10 px-2 py-1 text-xs text-rose-400 hover:bg-rose-500/20"
                    onClick={() => deletePrompt(p.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          {editing ? (
            <PromptEditor key={editing.id} value={editing} onSave={savePrompt} />
          ) : (
            <div className="text-center text-slate-400">
              Select a prompt to edit or create a new one.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PromptEditor({
  value,
  onSave,
}: {
  value: PromptItem
  onSave: (p: PromptItem) => void
}) {
  const [p, setP] = useState<PromptItem>(value)

  function update<K extends keyof PromptItem>(key: K, val: PromptItem[K]) {
    setP((current) => ({ ...current, [key]: val }))
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Editor</h2>
      <Field
        label="Title"
        value={p.title}
        onChange={(val) => update('title', val)}
        placeholder="e.g., Welcome Message"
      />
      <Field
        label="Category"
        value={p.category ?? ''}
        onChange={(val) => update('category', val)}
        placeholder="e.g., Support, Sales"
      />
      <TextAreaField
        label="Context / Usage Notes"
        value={p.context ?? ''}
        onChange={(val) => update('context', val)}
      />
      <TextAreaField
        label="Template"
        value={p.template}
        onChange={(val) => update('template', val)}
        rows={8}
        hint="Use {{variable_name}} for placeholders."
      />
      <button
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        onClick={() => onSave(p)}
      >
        Save Prompt
      </button>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <label className="block text-sm font-medium text-slate-300">
      {label}
      <input
        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

function TextAreaField({
  label,
  value,
  onChange,
  hint,
  rows = 4,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  rows?: number
}) {
  return (
    <label className="block text-sm font-medium text-slate-300">
      {label}
      <textarea
        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </label>
  )
}
