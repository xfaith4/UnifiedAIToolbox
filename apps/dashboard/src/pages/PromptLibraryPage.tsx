// ### BEGIN FILE: src/pages/PromptLibraryPage.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { PromptItem, PromptVariable, FewShotExample, PromptVarType } from '../types/prompts'
import {
  fetchPromptLibrary,
  normalizePrompt,
  parseImportedPrompt,
  persistPromptLibrary,
  nowIso,
  renderPromptViaApi,
  PROMPT_API_BASE,
} from '../services/promptStore'

const SIMPLE_IMPORT_SAMPLE = `[
  {
    "title": "Sales Discovery Opener",
    "category": "Sales",
    "context": "Use at the top of calls to warm up new prospects.",
    "prompt": "You are a friendly SDR. Ask three qualifying questions tailored to {{industry}}.",
    "tags": ["sales", "discovery"],
    "variables": [
      { "name": "industry", "type": "string", "required": true }
    ]
  },
  {
    "title": "Incident Postmortem Outline",
    "category": "Operations",
    "context": "Draft the follow up message after a Sev-1 production incident.",
    "prompt": "Create a postmortem outline for incident {{incident_id}} and highlight three customer-facing risks.",
    "variables": [
      { "name": "incident_id", "type": "string", "required": true }
    ]
  }
]`

// ---------------- Types & Schema ----------------
export type Provider = 'openai' | 'anthropic' | 'google' | 'ollama'

// ---------------- Utilities ----------------

// Simple mustache-like templater with {{var}} support and safe defaults.
function renderTemplate(tpl: string, map: Record<string, unknown>) {
  if (!tpl) return ''
  const resolve = (rawKey: string) => {
    const key = rawKey.trim()
    const value = (map ?? {})[key]
    return value === undefined || value === null ? '' : String(value)
  }

  return tpl
    .replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) =>
      resolve(key)
    )
    .replace(/\$\{\s*([a-zA-Z0-9_.-]+)\s*\}/g, (_, key: string) =>
      resolve(key)
    )
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// Build outbound payloads for major providers
function buildPayload(provider: Provider, item: PromptItem, rendered: string) {
  const role = item.role ?? 'system'
  const style = item.style?.trim()
  const fewShot = item.fewShot ?? []

  const systemShots = fewShot.filter((shot) => shot.role === 'system')
  const nonSystemShots = fewShot.filter((shot) => shot.role !== 'system')
  const systemPrompt =
    role === 'system'
      ? [style, rendered].filter(Boolean).join('\n').trim() || rendered
      : (style ?? '')

  switch (provider) {
    case 'openai': {
      const messages = [
        ...systemShots.map((shot) => ({
          role: 'system',
          content: shot.content,
        })),
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...(role === 'system' ? [] : [{ role, content: rendered }]),
        ...nonSystemShots.map((shot) => ({
          role: shot.role,
          content: shot.content,
        })),
      ]

      if (messages.length === 0) {
        messages.push({ role: 'user', content: rendered })
      }

      return {
        model: 'gpt-4o-mini', // change per your env
        temperature: item.temperature ?? 0.2,
        top_p: item.top_p ?? 1,
        messages,
        stop: item.stop ?? undefined,
      }
    }

    case 'anthropic':
      return {
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        temperature: item.temperature ?? 0.2,
        system:
          [...systemShots.map((shot) => shot.content), systemPrompt]
            .filter(Boolean)
            .join('\n\n') || undefined,
        messages: [
          ...nonSystemShots.map((shot) => ({
            role: shot.role,
            content: shot.content,
          })),
          ...(role === 'system' ? [] : [{ role, content: rendered }]),
        ],
        stop_sequences: item.stop ?? undefined,
      }

    case 'google': // Gemini
      return {
        model: 'gemini-1.5-flash',
        generationConfig: {
          temperature: item.temperature ?? 0.2,
          topP: item.top_p ?? 1,
          stopSequences: item.stop ?? undefined,
        },
        contents: [
          ...fewShot.map((shot) => ({
            role: shot.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: shot.content }],
          })),
          ...(role === 'system'
            ? [{ role: 'user', parts: [{ text: systemPrompt || rendered }] }]
            : [
                {
                  role: role === 'assistant' ? 'model' : 'user',
                  parts: [{ text: rendered }],
                },
              ]),
        ],
      }

    case 'ollama':
      return {
        model: 'qwen2.5:7b', // example
        options: {
          temperature: item.temperature ?? 0.2,
          top_p: item.top_p ?? 1,
          stop: item.stop ?? undefined,
        },
        prompt: (() => {
          const parts: string[] = []
          if (systemPrompt) parts.push(systemPrompt)
          parts.push(
            ...systemShots.map((shot) => `SYSTEM: ${shot.content}`),
            ...nonSystemShots.map(
              (shot) => `${shot.role.toUpperCase()}: ${shot.content}`
            )
          )
          if (role !== 'system') {
            parts.push(`${role.toUpperCase()}: ${rendered}`)
          } else if (!systemPrompt) {
            parts.push(rendered)
          }
          return parts.filter(Boolean).join('\n\n').trim()
        })(),
      }
  }

  throw new Error(`Unsupported provider: ${provider satisfies never}`)
}

// Extract a simple variable map with defaults
function buildVarMap(item: PromptItem | null, uiVars: Record<string, string>) {
  const map: Record<string, unknown> = {}
  if (!item) return map
  for (const v of item.variables ?? []) {
    const key = v.name
    const uiVal = uiVars[key]
    const defVal = v.default ?? ''
    map[key] = uiVal ?? defVal
  }
  return map
}

// ---------------- Main Page ----------------

export default function PromptLibraryPage() {
  const [items, setItems] = useState<PromptItem[]>([])
  const [query, setQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [quickAdd, setQuickAdd] = useState({
    title: '',
    category: '',
    context: '',
    prompt: '',
  })

  const [editing, setEditing] = useState<PromptItem | null>(null)
  const [renderVars, setRenderVars] = useState<Record<string, string>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [provider, setProvider] = useState<Provider>('openai')
  const [isLoading, setIsLoading] = useState(true)
  const [apiRendered, setApiRendered] = useState<string>('')
  const [apiRenderError, setApiRenderError] = useState<string | null>(null)
  const [apiRenderLoading, setApiRenderLoading] = useState(false)
  const initialized = useRef(false)
  const apiAvailable = Boolean(PROMPT_API_BASE)

  useEffect(() => {
    let alive = true
    fetchPromptLibrary().then((list) => {
      if (!alive) return
      setItems(list)
      initialized.current = true
      setIsLoading(false)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    setApiRendered('')
    setApiRenderError(null)
    setApiRenderLoading(false)
  }, [activeId])
  useEffect(() => {
    if (!initialized.current) return
    void persistPromptLibrary(items)
  }, [items])

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
      const textHit =
        !q ||
        haystacks.some((h) => h.toLowerCase().includes(q))

      const categoryHit =
        !filterCategory || (p.category ?? '') === filterCategory

      return textHit && categoryHit
    })
  }, [items, query, filterCategory])

  const active = useMemo(
    () => items.find((i) => i.id === activeId) ?? null,
    [items, activeId]
  )

  function newPrompt() {
    const timestamp = nowIso()
    const draft = normalizePrompt({
      id: uid(),
      title: 'New Prompt',
      category: '',
      context: '',
      description: '',
      tags: [],
      role: 'system',
      style: '',
      template:
        'You are a helpful AI.\nTask: {{task}}\nConstraints: {{constraints}}',
      variables: [
        { name: 'task', label: 'Task', type: 'multiline', default: '' },
        {
          name: 'constraints',
          label: 'Constraints',
          type: 'string',
          default: '',
        },
      ],
      fewShot: [],
      outputFormat: '',
      stop: [],
      temperature: 0.2,
      top_p: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    setItems((prev) => [draft, ...prev])
    setActiveId(draft.id)
    setRenderVars({})
    setEditing(draft)
  }

  function savePrompt(next: PromptItem) {
    const updated = {
      ...normalizePrompt(next),
      updatedAt: nowIso(),
    }
    setItems((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item))
    )
    setEditing(null)
  }

  function deletePrompt(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id))
    if (activeId === id) setActiveId(null)
  }

  function clonePrompt(p: PromptItem) {
    const timestamp = nowIso()
    const clone = normalizePrompt({
      ...p,
      id: uid(),
      title: `${p.title} (Copy)`,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    setItems((prev) => [clone, ...prev])
    setActiveId(clone.id)
    setRenderVars({})
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
        if (!Array.isArray(parsed))
          throw new Error('Invalid format: expected an array of prompts.')
        const map = new Map<string, PromptItem>(items.map((i) => [i.id, i]))
        let importedCount = 0
        let skippedCount = 0

        for (const raw of parsed) {
          const prompt = parseImportedPrompt(raw)
          if (!prompt) {
            skippedCount += 1
            continue
          }
          map.set(prompt.id, prompt)
          importedCount += 1
        }
        if (importedCount === 0) {
          throw new Error('No valid prompts found in file.')
        }
        const merged = Array.from(map.values()).sort((a, b) =>
          (b.updatedAt || '').localeCompare(a.updatedAt || '')
        )
        setItems(merged)
        if (skippedCount > 0) {
          window.alert(
            `Imported ${importedCount} prompts. Skipped ${skippedCount} entries missing required fields.`
          )
        }
      } catch (e) {
        window.alert('Import failed: ' + (e as Error).message)
      }
    }
    reader.readAsText(file)
  }

  // Render preview
  const varMap = useMemo(
    () => buildVarMap(active, renderVars),
    [active, renderVars]
  )
  const compiledTemplate = useMemo(() => {
    if (!active) return ''
    const sections = [
      active.blocks?.system
        ? `SYSTEM:\n${active.blocks.system.trim()}`
        : null,
      active.template,
      active.blocks?.constraints
        ? `CONSTRAINTS:\n${active.blocks.constraints.trim()}`
        : null,
      active.blocks?.style
        ? `STYLE:\n${active.blocks.style.trim()}`
        : null,
    ].filter((section): section is string => Boolean(section && section.trim()))
    return sections.join('\n\n').trim()
  }, [active])

  const rendered = useMemo(
    () => (compiledTemplate ? renderTemplate(compiledTemplate, varMap) : ''),
    [compiledTemplate, varMap]
  )
  const payload = useMemo(() => {
    if (!active) return null
    try {
      return buildPayload(provider, active, rendered)
    } catch (err) {
      console.error('failed to build provider payload', err)
      return null
    }
  }, [active, provider, rendered])

  function setQuickField<K extends keyof typeof quickAdd>(
    key: K,
    value: string
  ) {
    setQuickAdd((prev) => ({ ...prev, [key]: value }))
  }

  function handleQuickAddSubmit(event: React.FormEvent) {
    event.preventDefault()
    const promptText = quickAdd.prompt.trim()
    if (!promptText) {
      window.alert('Prompt text is required.')
      return
    }
    const normalized = normalizePrompt({
      id: uid(),
      title: quickAdd.title.trim() || 'New Prompt',
      category: quickAdd.category.trim(),
      context: quickAdd.context.trim(),
      description: quickAdd.context.trim(),
      template: promptText,
      tags: quickAdd.category.trim()
        ? [quickAdd.category.trim()]
        : undefined,
    })
    setItems((prev) => [normalized, ...prev])
    setActiveId(normalized.id)
    setRenderVars({})
    setEditing(normalized)
    setQuickAdd({
      title: '',
      category: '',
      context: '',
      prompt: '',
    })
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch (err) {
      console.error('clipboard write failed', err)
      window.alert('Copy failed. Please copy manually.')
    }
  }

  async function handleApiRender() {
    if (!active) return
    if (!apiAvailable) {
      window.alert('Set VITE_API_BASE in your .env to call the Prompt API.')
      return
    }
    setApiRenderLoading(true)
    setApiRenderError(null)
    try {
      const response = await renderPromptViaApi(active.id, varMap)
      const renderedBlocks =
        response.rendered_blocks ?? response.output ?? response
      setApiRendered(JSON.stringify(renderedBlocks, null, 2))
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Render request failed.'
      setApiRenderError(message)
      setApiRendered('')
    } finally {
      setApiRenderLoading(false)
    }
  }

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Prompt Library</h1>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500"
            onClick={newPrompt}
          >
            New
          </button>
          <button
            className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
            onClick={exportJson}
          >
            Export
          </button>
          <label className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 cursor-pointer">
            Import
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
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr,1fr]">
        <div className="p-4 border rounded-xl border-neutral-800 bg-neutral-950 space-y-3">
          <div className="font-semibold">Import prompt files</div>
          <p className="text-sm opacity-80">
            Upload a JSON file that contains an array of prompt objects. Each
            object can use the full editor schema or the simple format shown
            below. At minimum, include a <code>prompt</code> field; providing{' '}
            <code>title</code>, <code>category</code>, and <code>context</code>{' '}
            keeps everything organised.
          </p>
          <div className="text-xs opacity-70">
            Optional fields such as <code>tags</code>, <code>variables</code>,{' '}
            <code>style</code>, <code>stop</code>, and{' '}
            <code>outputFormat</code> are respected on import.
          </div>
          <pre className="bg-neutral-900 border border-neutral-800 rounded p-3 text-xs whitespace-pre overflow-auto max-h-56">
{SIMPLE_IMPORT_SAMPLE}
          </pre>
        </div>

        <form
          className="p-4 border rounded-xl border-neutral-800 bg-neutral-950 space-y-2"
          onSubmit={handleQuickAddSubmit}
        >
          <div className="font-semibold">Quick add prompt</div>
          <div className="text-xs opacity-70">
            Save a single prompt with the essentials. You can refine it in the
            editor afterwards.
          </div>
          <input
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
            value={quickAdd.title}
            onChange={(e) => setQuickField('title', e.target.value)}
            placeholder="Title (e.g. Welcome Message)"
          />
          <input
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
            value={quickAdd.category}
            onChange={(e) => setQuickField('category', e.target.value)}
            placeholder="Category (e.g. Support, Sales)"
          />
          <textarea
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 h-20"
            value={quickAdd.context}
            onChange={(e) => setQuickField('context', e.target.value)}
            placeholder="Context / usage notes"
          />
          <textarea
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 h-24"
            value={quickAdd.prompt}
            onChange={(e) => setQuickField('prompt', e.target.value)}
            placeholder="Prompt template (use {{variables}} if needed)"
            required
          />
          <button
            type="submit"
            className="w-full px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500"
          >
            Create &amp; edit
          </button>
        </form>
      </div>

      {/* Search + Filters */}
      <div className="mt-4 flex gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, category, context, prompt text…"
          className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 rounded bg-neutral-900 border border-neutral-800"
        >
          <option value="">All categories</option>
          {allCategories.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* List + Editor + Preview */}
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* List */}
        <div className="col-span-1 space-y-2">
          {isLoading ? (
            <div className="text-sm opacity-70">Loading prompt library…</div>
          ) : (
            <>
              {filtered.map((p) => (
                <div
                  key={p.id}
                  className={`p-3 border rounded-xl ${activeId === p.id ? 'border-emerald-600' : 'border-neutral-800'}`}
                >
                  <div className="flex justify-between items-center gap-2">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold">{p.title}</div>
                      {p.category ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-800">
                          {p.category}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs opacity-60">
                      {new Date(p.updatedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-xs opacity-80 mt-1">
                    {p.context || p.description}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(p.tags ?? [])
                      .filter((t) => t && t !== p.category)
                      .map((t) => (
                        <span
                          key={t}
                          className="text-[10px] px-2 py-0.5 rounded bg-neutral-800"
                        >
                          {t}
                        </span>
                      ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
                      onClick={() => {
                        setActiveId(p.id)
                        setEditing(p)
                        setRenderVars({})
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
                      onClick={() => {
                        setActiveId(p.id)
                        setRenderVars({})
                      }}
                    >
                      Select
                    </button>
                    <button
                      className="px-2 py-1 rounded bg-neutral-900 hover:bg-neutral-800"
                      onClick={() => clonePrompt(p)}
                    >
                      Clone
                    </button>
                    <button
                      className="px-2 py-1 rounded bg-rose-700 hover:bg-rose-600"
                      onClick={() => deletePrompt(p.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="text-sm opacity-70">
              No prompts yet. Click “New”.
            </div>
          )}
        </div>

        {/* Editor */}
        <div className="col-span-1">
          {editing ? (
            <PromptEditor
              value={editing}
              onChange={setEditing}
              onSave={savePrompt}
            />
          ) : active ? (
            <div className="p-3 border rounded-xl border-neutral-800">
              <div className="flex items-center gap-2 mb-2">
                <div className="font-semibold">{active.title}</div>
                {active.category ? (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-800">
                    {active.category}
                  </span>
                ) : null}
              </div>
              {active.context || active.description ? (
                <div className="text-xs opacity-80 mb-3">
                  {active.context || active.description}
                </div>
              ) : null}
              {(active.tags ?? [])
                .filter((t) => t && t !== active.category)
                .length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1">
                  {(active.tags ?? [])
                    .filter((t) => t && t !== active.category)
                    .map((t) => (
                      <span
                        key={t}
                        className="text-[10px] px-2 py-0.5 rounded bg-neutral-800"
                      >
                        {t}
                      </span>
                    ))}
                </div>
              )}
              {(active.version || active.source) && (
                <div className="text-xs opacity-70 mb-3 flex flex-wrap gap-3">
                  {active.version && <span>Version {active.version}</span>}
                  {active.source && <span>Source: {active.source}</span>}
                </div>
              )}
              {active.blocks?.system && (
                <details className="mb-3">
                  <summary className="cursor-pointer text-sm font-semibold">
                    System prompt
                  </summary>
                  <pre className="mt-2 bg-neutral-950 border border-neutral-800 rounded p-2 text-xs whitespace-pre-wrap">
                    {active.blocks.system}
                  </pre>
                </details>
              )}
              {active.blocks?.instructions && (
                <details className="mb-3" open>
                  <summary className="cursor-pointer text-sm font-semibold">
                    Instructions
                  </summary>
                  <pre className="mt-2 bg-neutral-950 border border-neutral-800 rounded p-2 text-xs whitespace-pre-wrap">
                    {active.blocks.instructions}
                  </pre>
                </details>
              )}
              {active.blocks?.constraints && (
                <details className="mb-3">
                  <summary className="cursor-pointer text-sm font-semibold">
                    Constraints
                  </summary>
                  <pre className="mt-2 bg-neutral-950 border border-neutral-800 rounded p-2 text-xs whitespace-pre-wrap">
                    {active.blocks.constraints}
                  </pre>
                </details>
              )}
              {active.blocks?.style && (
                <details className="mb-3">
                  <summary className="cursor-pointer text-sm font-semibold">
                    Style
                  </summary>
                  <pre className="mt-2 bg-neutral-950 border border-neutral-800 rounded p-2 text-xs whitespace-pre-wrap">
                    {active.blocks.style}
                  </pre>
                </details>
              )}
              {active.outputs?.schema && (
                <details className="mb-3">
                  <summary className="cursor-pointer text-sm font-semibold">
                    Output schema
                  </summary>
                  <pre className="mt-2 bg-neutral-950 border border-neutral-800 rounded p-2 text-xs whitespace-pre-wrap">
                    {active.outputs.schema}
                  </pre>
                </details>
              )}
              <button
                className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
                onClick={() => setEditing(active!)}
              >
                Edit
              </button>
            </div>
          ) : (
            <div className="text-sm opacity-70">Select a prompt to edit.</div>
          )}
        </div>

        {/* Render & Payload */}
        <div className="col-span-1">
          {active ? (
            <div className="p-3 border rounded-xl border-neutral-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Render & Test</div>
                <select
                  className="px-2 py-1 rounded bg-neutral-900 border border-neutral-800"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as Provider)}
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="google">Google (Gemini)</option>
                  <option value="ollama">Ollama</option>
                </select>
              </div>

              {/* Variable inputs */}
              <div className="space-y-2">
                {(active.variables ?? []).map((v) => (
                  <div key={v.name} className="text-sm">
                    <div className="mb-1">{v.label ?? v.name}</div>
                    {v.type === 'multiline' ? (
                      <textarea
                        className="w-full h-28 bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
                        value={renderVars[v.name] ?? ''}
                        onChange={(e) =>
                          setRenderVars({
                            ...renderVars,
                            [v.name]: e.target.value,
                          })
                        }
                      />
                    ) : (
                      <input
                        className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
                        value={renderVars[v.name] ?? ''}
                        onChange={(e) =>
                          setRenderVars({
                            ...renderVars,
                            [v.name]: e.target.value,
                          })
                        }
                      />
                    )}
                  </div>
                ))}
              </div>

              <div>
                <div className="text-xs opacity-70 mb-1">Rendered Prompt</div>
                <pre className="bg-neutral-950 border border-neutral-800 rounded p-3 whitespace-pre-wrap text-xs max-h-72 overflow-auto">
                  {rendered}
                </pre>
                <div className="mt-2 flex gap-2">
                  <button
                    className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
                    onClick={() => {
                      void copy(rendered)
                    }}
                  >
                    Copy Prompt
                  </button>
                  <button
                    className="px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={!apiAvailable || apiRenderLoading}
                    onClick={() => {
                      void handleApiRender()
                    }}
                  >
                    {apiRenderLoading ? 'Calling API…' : 'Render via API'}
                  </button>
                </div>
                {!apiAvailable && (
                  <div className="text-[11px] mt-1 opacity-70">
                    Set <code>VITE_API_BASE</code> to enable live renders.
                  </div>
                )}
              </div>

              <div>
                <div className="text-xs opacity-70 mb-1">Provider Payload</div>
                <pre className="bg-neutral-950 border border-neutral-800 rounded p-3 whitespace-pre-wrap text-xs max-h-72 overflow-auto">
                  {payload
                    ? JSON.stringify(payload, null, 2)
                    : '// select a prompt'}
                </pre>
                <div className="mt-2 flex gap-2">
                  <button
                    className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
                    onClick={() => {
                      if (payload) void copy(JSON.stringify(payload))
                    }}
                  >
                    Copy JSON
                  </button>
                </div>
              </div>

              {apiAvailable && (
                <div>
                  <div className="text-xs opacity-70 mb-1">
                    Prompt API Output
                  </div>
                  {apiRenderError ? (
                    <div className="text-xs text-rose-400 mb-1">
                      {apiRenderError}
                    </div>
                  ) : null}
                  <pre className="bg-neutral-950 border border-neutral-800 rounded p-3 whitespace-pre-wrap text-xs max-h-72 overflow-auto">
                    {apiRendered || '// click “Render via API”'}
                  </pre>
                  <div className="mt-2 flex gap-2">
                    <button
                      className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed"
                      disabled={!apiRendered}
                      onClick={() => {
                        if (apiRendered) void copy(apiRendered)
                      }}
                    >
                      Copy Output
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm opacity-70">Select a prompt to render.</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------- Editor Component ----------------
function PromptEditor({
  value,
  onChange,
  onSave,
}: {
  value: PromptItem
  onChange: (p: PromptItem) => void
  onSave: (p: PromptItem) => void
}) {
  const [p, setP] = useState<PromptItem>(value)
  useEffect(() => setP(value), [value])

  function update<K extends keyof PromptItem>(key: K, val: PromptItem[K]) {
    const next = { ...p, [key]: val }
    setP(next)
    onChange(next)
  }

  function updateMany(next: Partial<PromptItem>) {
    const merged = { ...p, ...next }
    setP(merged)
    onChange(merged)
  }

  function updateVar(
    index: number,
    key: keyof PromptVariable,
    value: string | PromptVarType | boolean | undefined
  ) {
    const nextVars = [...(p.variables ?? [])]
    nextVars[index] = { ...nextVars[index], [key]: value }
    update('variables', nextVars)
  }

  function addVar() {
    update('variables', [
      ...(p.variables ?? []),
      {
        name: 'var' + ((p.variables?.length ?? 0) + 1),
        type: 'string',
        default: '',
      },
    ])
  }

  function removeVar(i: number) {
    const next = [...(p.variables ?? [])]
    next.splice(i, 1)
    update('variables', next)
  }

  function addTag(t: string) {
    if (!t) return
    update('tags', Array.from(new Set([...(p.tags ?? []), t])))
  }

  const tagInput = useRef<HTMLInputElement>(null)

  return (
    <div className="p-3 border rounded-xl border-neutral-800 space-y-2">
      <div className="font-semibold">Editor</div>
      <input
        className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
        value={p.title}
        onChange={(e) => update('title', e.target.value)}
        placeholder="Title"
      />
      <input
        className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
        value={p.category ?? ''}
        onChange={(e) => {
          const raw = e.target.value
          const prevCategory = (p.category ?? '').trim()
          const trimmed = raw.trim()
          const nextTags = (p.tags ?? []).filter(
            (tag) => tag !== p.category && tag !== prevCategory
          )
          if (trimmed) nextTags.unshift(trimmed)
          const deduped = nextTags.filter(
            (tag, index) => nextTags.indexOf(tag) === index
          )
          updateMany({
            category: raw,
            tags: deduped,
          })
        }}
        placeholder="Category"
      />
      <textarea
        className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 h-16"
        value={p.context ?? ''}
        onChange={(e) =>
          updateMany({
            context: e.target.value,
            description: e.target.value,
          })
        }
        placeholder="Context / usage notes"
      />

      {/* tags */}
      <div className="flex items-center gap-2">
        <input
          ref={tagInput}
          className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
          placeholder="Add tag…"
        />
        <button
          className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
          onClick={() => {
            const v = tagInput.current?.value.trim() ?? ''
            addTag(v)
            if (tagInput.current) tagInput.current.value = ''
          }}
        >
          Add
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {(p.tags ?? []).map((t) => (
          <span
            key={t}
            className="text-[10px] px-2 py-0.5 rounded bg-neutral-800 cursor-pointer"
            onClick={() =>
              update(
                'tags',
                (p.tags ?? []).filter((x) => x !== t)
              )
            }
          >
            {t} ✕
          </span>
        ))}
      </div>

      {/* meta */}
      <div className="grid grid-cols-2 gap-2">
        <select
          className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
          value={p.role ?? 'system'}
          onChange={(e) => update('role', e.target.value as PromptItem['role'])}
        >
          <option value="system">role: system</option>
          <option value="user">role: user</option>
          <option value="assistant">role: assistant</option>
        </select>
        <input
          className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
          value={p.style ?? ''}
          onChange={(e) => update('style', e.target.value)}
          placeholder="Style/Tone hints"
        />
        <input
          type="number"
          step="0.1"
          className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
          value={p.temperature ?? 0.2}
          onChange={(e) => update('temperature', Number(e.target.value))}
          placeholder="temperature"
        />
        <input
          type="number"
          step="0.01"
          className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
          value={p.top_p ?? 1}
          onChange={(e) => update('top_p', Number(e.target.value))}
          placeholder="top_p"
        />
      </div>

      {/* template */}
      <div className="text-xs opacity-70">Template (use {'{{var}}'})</div>
      <textarea
        className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 h-48"
        value={p.template}
        onChange={(e) => update('template', e.target.value)}
      />

      {/* variables */}
      <div className="mt-2">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Variables</div>
          <button
            className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
            onClick={addVar}
          >
            Add Var
          </button>
        </div>
        <div className="space-y-2 mt-2">
          {(p.variables ?? []).map((v, i) => (
            <div key={i} className="grid grid-cols-5 gap-2">
              <input
                className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
                value={v.name}
                onChange={(e) => updateVar(i, 'name', e.target.value)}
                placeholder="name"
              />
              <input
                className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
                value={v.label ?? ''}
                onChange={(e) => updateVar(i, 'label', e.target.value)}
                placeholder="label"
              />
              <select
                className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
                value={v.type ?? 'string'}
                onChange={(e) => updateVar(i, 'type', e.target.value as PromptVarType)}
              >
                <option value="string">string</option>
                <option value="multiline">multiline</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
              </select>
              <input
                className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
                value={v.default ?? ''}
                onChange={(e) => updateVar(i, 'default', e.target.value)}
                placeholder="default"
              />
              <div className="flex items-center gap-2">
                <label className="text-xs opacity-80">
                  <input
                    type="checkbox"
                    className="mr-1"
                    checked={!!v.required}
                    onChange={(e) => updateVar(i, 'required', e.target.checked)}
                  />{' '}
                  required
                </label>
                <button
                  className="px-2 py-1 rounded bg-rose-700 hover:bg-rose-600"
                  onClick={() => removeVar(i)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* few-shot */}
      <FewShotEditor
        value={p.fewShot ?? []}
        onChange={(fs) => update('fewShot', fs)}
      />

      {/* stop / output format */}
      <div className="grid grid-cols-2 gap-2 mt-2">
        <input
          className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
          value={(p.stop ?? []).join(',')}
          onChange={(e) =>
            update(
              'stop',
              e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            )
          }
          placeholder="stop sequences (comma separated)"
        />
        <input
          className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
          value={p.outputFormat ?? ''}
          onChange={(e) => update('outputFormat', e.target.value)}
          placeholder="Output format hint (optional)"
        />
      </div>

      {/* actions */}
      <div className="flex gap-2 mt-3">
        <button
          className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500"
          onClick={() => onSave(p)}
        >
          Save
        </button>
      </div>
    </div>
  )
}

function FewShotEditor({
  value,
  onChange,
}: {
  value: FewShotExample[]
  onChange: (v: FewShotExample[]) => void
}) {
  function upd(
    index: number,
    key: keyof FewShotExample,
    val: string | 'system' | 'user' | 'assistant'
  ) {
    const next = [...value]
    next[index] = { ...next[index], [key]: val }
    onChange(next)
  }
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Few-shot Examples</div>
        <button
          className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
          onClick={() =>
            onChange([...(value ?? []), { role: 'user', content: '' }])
          }
        >
          Add Example
        </button>
      </div>
      <div className="mt-2 space-y-2">
        {(value ?? []).map((fs, i) => (
          <div key={i} className="grid grid-cols-5 gap-2">
            <select
              className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
              value={fs.role}
              onChange={(e) => upd(i, 'role', e.target.value as 'system' | 'user' | 'assistant')}
            >
              <option value="system">system</option>
              <option value="user">user</option>
              <option value="assistant">assistant</option>
            </select>
            <textarea
              className="col-span-4 bg-neutral-900 border border-neutral-800 rounded px-2 py-1 h-20"
              value={fs.content}
              onChange={(e) => upd(i, 'content', e.target.value)}
            />
            <div className="col-span-5 text-right">
              <button
                className="px-2 py-1 rounded bg-rose-700 hover:bg-rose-600"
                onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        {(value ?? []).length === 0 && (
          <div className="text-xs opacity-70">No examples</div>
        )}
      </div>
    </div>
  )
}
// ### END FILE: src/pages/PromptLibraryPage.tsx
