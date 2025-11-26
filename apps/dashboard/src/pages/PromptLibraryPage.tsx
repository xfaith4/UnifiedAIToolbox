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
import { loadDatasets, previewDataset, type DatasetEntry } from '../services/datasetStore'

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
  const [remoteResults, setRemoteResults] = useState<PromptItem[] | null>(null)
  const [apiRendered, setApiRendered] = useState<string>('')
  const [apiRenderError, setApiRenderError] = useState<string | null>(null)
  const [apiRenderLoading, setApiRenderLoading] = useState(false)
  const [datasets, setDatasets] = useState<DatasetEntry[]>([])
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('')
  const [selectedDatasetPreview, setSelectedDatasetPreview] = useState<string>('')
  const [refineOutput, setRefineOutput] = useState<string>('')
  const [refineLoading, setRefineLoading] = useState(false)
  const [refineStatus, setRefineStatus] = useState<string>('')
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
    setDatasets(loadDatasets())
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

  // Optional remote search via API when available
  useEffect(() => {
    const q = query.trim()
    if (!apiAvailable || q.length < 2) {
      setRemoteResults(null)
      return
    }
    let alive = true
    fetch(`${PROMPT_API_BASE}/prompts/search?q=${encodeURIComponent(q)}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((res) => {
        if (!alive) return
        const results = Array.isArray(res.results) ? res.results : []
        setRemoteResults(results as PromptItem[])
      })
      .catch(() => {
        if (alive) setRemoteResults(null)
      })
    return () => { alive = false }
  }, [query, apiAvailable])

  const displayList = remoteResults ?? filtered

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

  function handleDatasetSelect(id: string) {
    setSelectedDatasetId(id)
    if (!id) {
      setSelectedDatasetPreview('')
      return
    }
    setSelectedDatasetPreview(previewDataset(id, 20))
  }

  async function handleRefine() {
    if (!active) return
    setRefineLoading(true)
    const sample = selectedDatasetPreview || compiledTemplate
    const varHints =
      (active.variables ?? []).map((v) => `- ${v.name}: ${v.type ?? 'string'}`).join('\n') ||
      '- (no variables defined)'

    const rewritten = [
      '### Refined Prompt (suggested)',
      'You are a precise assistant. Follow the constraints strictly.',
      '',
      'INSTRUCTIONS:',
      active.blocks?.instructions || active.template || '',
      '',
      'CONSTRAINTS:',
      active.blocks?.constraints || '- Keep responses concise and fact-based.',
      '',
      'STYLE:',
      active.blocks?.style || '- Clear, bullet-first, no fluff.',
      '',
      'OUTPUT:',
      'Return JSON with keys that match the requested fields. Avoid extra keys.',
      '',
      'VARIABLES:',
      varHints,
      '',
      sample ? 'DATA SAMPLE:\n' + sample : '',
    ]
      .filter(Boolean)
      .join('\n')

    setTimeout(() => {
      setRefineOutput(rewritten)
      setRefineLoading(false)
    }, 120)
  }

  function applyRefinement() {
    if (!active || !refineOutput.trim()) return
    const updated = normalizePrompt({
      ...active,
      template: refineOutput,
      updatedAt: nowIso(),
    })
    setItems((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    setEditing(updated)
    setActiveId(updated.id)
    setRefineStatus('Applied and saved to prompt')
    setTimeout(() => setRefineStatus(''), 2000)
  }

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-2xl font-bold">Prompt Library</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Create, manage, and refine AI prompts with standardized templates and best practices
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 flex items-center gap-1"
            onClick={newPrompt}
            title="Create a new prompt from scratch"
          >
            <span>✨</span> New
          </button>
          <button
            className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
            onClick={exportJson}
            title="Export all prompts as JSON"
          >
            Export
          </button>
          <label className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 cursor-pointer" title="Import prompts from JSON file">
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

      {/* Best Practices Guide */}
      <div className="mt-4 p-4 border rounded-xl border-blue-900/50 bg-blue-950/20 space-y-3">
        <div className="flex items-start gap-3">
          <span className="text-2xl">💡</span>
          <div className="flex-1">
            <div className="font-semibold text-blue-300 mb-2">Prompt Best Practices</div>
            <div className="text-sm text-neutral-300 space-y-2">
              <p><strong>Standardized Format:</strong> A good prompt includes clear instructions, constraints, desired output format, and examples.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                <div className="p-2 bg-neutral-900/50 rounded border border-neutral-800">
                  <div className="text-xs font-semibold text-emerald-400 mb-1">✓ Good Prompt</div>
                  <div className="text-xs text-neutral-400">
                    "You are a helpful assistant. Task: {'{'}{'{'}{'}'}task{'}'}{'}'}<br/>
                    Constraints: Keep response under 100 words<br/>
                    Output: JSON with 'summary' and 'actions' keys"
                  </div>
                </div>
                <div className="p-2 bg-neutral-900/50 rounded border border-neutral-800">
                  <div className="text-xs font-semibold text-rose-400 mb-1">✗ Vague Prompt</div>
                  <div className="text-xs text-neutral-400">
                    "Help me with {'{'}{'{'}{'}'}task{'}'}{'}'}."
                  </div>
                </div>
              </div>
              <p className="text-xs mt-2">
                <strong>Tip:</strong> Use the <span className="px-1 py-0.5 bg-emerald-600/20 text-emerald-400 rounded">Refine prompt</span> tool below to improve your prompts with AI assistance.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr,1fr]">
        <div className="p-4 border rounded-xl border-neutral-800 bg-neutral-950 space-y-3">
          <div className="font-semibold flex items-center gap-2">
            <span>📁</span> Import prompt files
          </div>
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
          <div className="font-semibold flex items-center gap-2">
            <span>⚡</span> Quick add prompt
          </div>
          <div className="text-xs opacity-70">
            Save a single prompt with the essentials. You can refine it in the
            editor afterwards.
          </div>
          <input
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 placeholder:text-neutral-600"
            value={quickAdd.title}
            onChange={(e) => setQuickField('title', e.target.value)}
            placeholder="Title (e.g., 'Customer Support Response Template')"
            title="A descriptive name for your prompt that explains its purpose"
          />
          <input
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 placeholder:text-neutral-600"
            value={quickAdd.category}
            onChange={(e) => setQuickField('category', e.target.value)}
            placeholder="Category (e.g., 'Support', 'Sales', 'Engineering')"
            title="Group similar prompts together for easy filtering"
          />
          <textarea
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 h-20 placeholder:text-neutral-600"
            value={quickAdd.context}
            onChange={(e) => setQuickField('context', e.target.value)}
            placeholder="When to use this prompt and what problem it solves..."
            title="Describe when and how to use this prompt effectively"
          />
          <textarea
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 h-24 placeholder:text-neutral-600"
            value={quickAdd.prompt}
            onChange={(e) => setQuickField('prompt', e.target.value)}
            placeholder="You are a [role]. Task: {{task}} Constraints: [specify limits] Output: [desired format]"
            title="Use {{variable_name}} for dynamic values. Include role, task, constraints, and output format."
            required
          />
          <button
            type="submit"
            className="w-full px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center gap-2"
            title="Create prompt and open in editor for further refinement"
          >
            <span>✨</span> Create &amp; edit
          </button>
        </form>
      </div>

      {/* PromptRefiner Tool Integration */}
      <div className="mt-4 p-4 border rounded-xl border-purple-900/50 bg-purple-950/20 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1">
            <span className="text-2xl">🔧</span>
            <div className="flex-1">
              <div className="font-semibold text-purple-300 mb-2">PromptRefiner Tool</div>
              <div className="text-sm text-neutral-300 space-y-2">
                <p>Use the PromptRefiner PowerShell tool to iteratively improve prompts with AI assistance before adding them to your library.</p>
                <div className="text-xs space-y-1 text-neutral-400">
                  <p><strong>Features:</strong> Multi-iteration refinement • Token tracking • Cost estimation • Session logging</p>
                  <p><strong>Location:</strong> <code className="px-1 py-0.5 bg-neutral-900 rounded">UnifiedAIToolbox/apps/PromptRefiner/</code></p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              className="px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-sm whitespace-nowrap"
              onClick={() => {
                window.open('/help#prompt-refiner', '_blank')
              }}
              title="View documentation on how to use the PromptRefiner tool"
            >
              📖 View Docs
            </button>
            <button
              className="px-3 py-1.5 rounded bg-purple-700/50 hover:bg-purple-600/50 text-sm whitespace-nowrap"
              onClick={() => {
                window.alert('To use PromptRefiner:\n\n1. Navigate to: UnifiedAIToolbox/apps/PromptRefiner/\n2. Run: powershell.exe -NoProfile -sta -File .\\OpenAI_Refiner.Wpf.ps1\n\nOr for CLI: .\\OpenAI_Refiner.ps1\n\nSee the README.md in that directory for full instructions.')
              }}
              title="Show quick instructions for launching PromptRefiner"
            >
              ⚙️ Launch Info
            </button>
          </div>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="mt-4 flex gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔍 Search by title, category, context, prompt text, or tags..."
          className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800 placeholder:text-neutral-600"
          title="Search across all prompt fields including title, description, template text, and tags"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 rounded bg-neutral-900 border border-neutral-800 min-w-[180px]"
          title="Filter prompts by category"
        >
          <option value="">All categories</option>
          {allCategories.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* Dataset attach */}
      <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-3 space-y-2">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold">Attach dataset (optional)</div>
            <div className="text-xs text-neutral-400">
              Select a dataset to copy a sample into your prompt or few-shot examples.
            </div>
          </div>
          <select
            className="px-3 py-2 rounded bg-neutral-900 border border-neutral-800 text-sm text-slate-100"
            value={selectedDatasetId}
            onChange={(e) => handleDatasetSelect(e.target.value)}
          >
            <option value="">No dataset</option>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.type})
              </option>
            ))}
          </select>
        </div>
        {selectedDatasetPreview && (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>Preview (first lines/sample)</span>
              <button
                className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs text-slate-100"
                onClick={() => {
                  navigator.clipboard.writeText(selectedDatasetPreview).catch(() => {
                    window.alert('Copy failed; please copy manually.')
                  })
                }}
              >
                Copy
              </button>
            </div>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-slate-200">
              {selectedDatasetPreview}
            </pre>
          </div>
        )}
      </div>

      {/* List + Editor + Preview */}
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* List */}
        <div className="col-span-1 space-y-2 min-w-0">
          {isLoading ? (
            <div className="text-sm opacity-70">Loading prompt library…</div>
          ) : (
            <>
              {displayList.map((p) => (
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
          {!isLoading && displayList.length === 0 && (
            <div className="text-sm opacity-70">
              No prompts yet. Click “New”.
            </div>
          )}
        </div>

        {/* Editor */}
        <div className="col-span-1 min-w-0">
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
        <div className="col-span-1 min-w-0">
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
                  <div key={v.name} className="text-sm space-y-1">
                    <div className="mb-1 truncate">{v.label ?? v.name}</div>
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

              {/* Refinement */}
              <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-sm flex items-center gap-2">
                    <span>✨</span> AI Prompt Refinement
                  </div>
                  <div className="text-xs text-neutral-500" title="If a dataset is selected above, its sample data will be included in the refinement">
                    Uses dataset sample if selected
                  </div>
                </div>
                <div className="text-xs text-neutral-400 mb-2">
                  Generate an improved version of your prompt with better structure, clarity, and adherence to best practices.
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <button
                    className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-sm text-white flex items-center gap-1.5"
                    onClick={handleRefine}
                    disabled={refineLoading}
                    title="Use AI to generate an improved version of this prompt"
                  >
                    {refineLoading ? (
                      <>
                        <span className="animate-spin">⟳</span> Refining…
                      </>
                    ) : (
                      <>
                        <span>✨</span> Generate suggestion
                      </>
                    )}
                  </button>
                  {refineOutput && (
                    <button
                      className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm text-slate-100"
                      onClick={applyRefinement}
                      title="Replace the current template with the refined version"
                    >
                      ✓ Apply to template
                    </button>
                  )}
                {refineStatus && (
                  <div className="text-sm text-emerald-400 flex items-center gap-1">
                    ✓ {refineStatus}
                  </div>
                )}
                </div>
                {refineOutput && (
                  <div>
                    <div className="text-xs text-neutral-400 mb-1">Refined version:</div>
                    <pre className="bg-neutral-950 border border-neutral-800 rounded p-2 whitespace-pre-wrap text-xs max-h-48 overflow-auto">
                      {refineOutput}
                    </pre>
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
      <div className="font-semibold flex items-center gap-2">
        <span>✏️</span> Editor
      </div>
      <div className="text-xs text-neutral-400 mb-2">
        💡 Tip: Hover over fields for guidance on best practices
      </div>
      <input
        className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 placeholder:text-neutral-600"
        value={p.title}
        onChange={(e) => update('title', e.target.value)}
        placeholder="e.g., 'Email Response Generator' or 'Bug Report Analyzer'"
        title="Give your prompt a clear, descriptive name that explains its purpose"
      />
      <input
        className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 placeholder:text-neutral-600"
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
        placeholder="e.g., 'Support', 'Sales', 'Engineering', 'Analytics'"
        title="Organize prompts into categories for easier filtering and discovery"
      />
      <textarea
        className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 h-16 placeholder:text-neutral-600"
        value={p.context ?? ''}
        onChange={(e) =>
          updateMany({
            context: e.target.value,
            description: e.target.value,
          })
        }
        placeholder="Describe when to use this prompt, what problems it solves, and any important usage notes..."
        title="Provide context about when and how this prompt should be used to help others understand its purpose"
      />

      {/* tags */}
      <div>
        <div className="text-xs text-neutral-400 mb-1 flex items-center gap-2">
          Tags
          <span className="text-[10px] px-1.5 py-0.5 bg-neutral-800 text-neutral-500 rounded" title="Add keywords to help find this prompt later">
            🏷️ For searchability
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={tagInput}
            className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-2 py-1 placeholder:text-neutral-600"
            placeholder="e.g., 'email', 'customer-facing', 'urgent'"
            title="Add keywords that describe this prompt's use case or domain"
          />
          <button
            className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
            onClick={() => {
              const v = tagInput.current?.value.trim() ?? ''
              addTag(v)
              if (tagInput.current) tagInput.current.value = ''
            }}
            title="Add tag"
          >
            + Add
          </button>
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {(p.tags ?? []).length === 0 ? (
            <div className="text-[11px] text-neutral-500 italic">No tags yet. Add tags to improve searchability.</div>
          ) : (
            (p.tags ?? []).map((t) => (
              <span
                key={t}
                className="text-[10px] px-2 py-0.5 rounded bg-neutral-800 cursor-pointer hover:bg-neutral-700"
                onClick={() =>
                  update(
                    'tags',
                    (p.tags ?? []).filter((x) => x !== t)
                  )
                }
                title="Click to remove this tag"
              >
                {t} ✕
              </span>
            ))
          )}
        </div>
      </div>

      {/* meta */}
      <div className="grid grid-cols-2 gap-2">
        <select
          className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
          value={p.role ?? 'system'}
          onChange={(e) => update('role', e.target.value as PromptItem['role'])}
          title="System: Instructions for the AI. User: Messages from the user. Assistant: AI responses."
        >
          <option value="system">role: system</option>
          <option value="user">role: user</option>
          <option value="assistant">role: assistant</option>
        </select>
        <input
          className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 placeholder:text-neutral-600"
          value={p.style ?? ''}
          onChange={(e) => update('style', e.target.value)}
          placeholder="e.g., 'Professional', 'Casual', 'Technical'"
          title="Specify the tone and style of responses (e.g., formal, friendly, concise)"
        />
        <input
          type="number"
          step="0.1"
          className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
          value={p.temperature ?? 0.2}
          onChange={(e) => update('temperature', Number(e.target.value))}
          placeholder="temperature (0-2)"
          title="Temperature: 0 = deterministic/focused, 1 = balanced, 2 = creative/random"
        />
        <input
          type="number"
          step="0.01"
          className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
          value={p.top_p ?? 1}
          onChange={(e) => update('top_p', Number(e.target.value))}
          placeholder="top_p (0-1)"
          title="Top-p (nucleus sampling): 1 = all tokens considered, lower = more focused"
        />
      </div>

      {/* template */}
      <div className="text-xs opacity-70 flex items-center gap-2">
        <span>Template (use {'{{var}}'} for variables)</span>
        <span className="text-[10px] px-1.5 py-0.5 bg-blue-900/30 text-blue-300 rounded" title="Best practice: Include role, task, constraints, and output format">
          📋 Structure Guide
        </span>
      </div>
      <textarea
        className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 h-48 placeholder:text-neutral-600"
        value={p.template}
        onChange={(e) => update('template', e.target.value)}
        placeholder="You are a [role/expert in X].&#10;&#10;Task: {{task_description}}&#10;&#10;Constraints:&#10;- Keep responses under [N] words&#10;- Use [tone/style]&#10;- Focus on [specific aspects]&#10;&#10;Output format: [JSON/Markdown/Plain text with specific structure]"
        title="Structure your prompt with: Role definition, Clear task, Explicit constraints, Desired output format. Use {{variable_name}} for dynamic values."
      />

      {/* variables */}
      <div className="mt-2">
        <div className="flex items-center justify-between">
          <div className="font-semibold flex items-center gap-2">
            <span>Variables</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-neutral-800 text-neutral-400 rounded" title="Define dynamic values that users can customize when using the prompt">
              Use {'{'}{'{'}{'}'}name{'}'}{'}'} in template
            </span>
          </div>
          <button
            className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-sm"
            onClick={addVar}
            title="Add a new variable to make your prompt customizable"
          >
            + Add Var
          </button>
        </div>
        {(p.variables ?? []).length === 0 && (
          <div className="text-xs text-neutral-500 italic mt-2 p-2 bg-neutral-900/50 rounded border border-neutral-800">
            No variables defined. Add variables to make your prompt dynamic and reusable.
          </div>
        )}
        <div className="space-y-2 mt-2">
          {(p.variables ?? []).map((v, i) => (
            <div key={i} className="grid grid-cols-5 gap-2">
              <input
                className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 placeholder:text-neutral-600 text-sm"
                value={v.name}
                onChange={(e) => updateVar(i, 'name', e.target.value)}
                placeholder="e.g., 'user_name'"
                title="Variable name (use in template as {{variable_name}})"
              />
              <input
                className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 placeholder:text-neutral-600 text-sm"
                value={v.label ?? ''}
                onChange={(e) => updateVar(i, 'label', e.target.value)}
                placeholder="e.g., 'User Name'"
                title="Display label shown to users when filling in this variable"
              />
              <select
                className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-sm"
                value={v.type ?? 'string'}
                onChange={(e) => updateVar(i, 'type', e.target.value as PromptVarType)}
                title="Type of input field: string (single line), multiline (textarea), number, or boolean (checkbox)"
              >
                <option value="string">string</option>
                <option value="multiline">multiline</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
              </select>
              <input
                className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 placeholder:text-neutral-600 text-sm"
                value={v.default ?? ''}
                onChange={(e) => updateVar(i, 'default', e.target.value)}
                placeholder="default value"
                title="Default value if user doesn't provide one"
              />
              <div className="flex items-center gap-2">
                <label className="text-xs opacity-80" title="Check if this variable must be provided by the user">
                  <input
                    type="checkbox"
                    className="mr-1"
                    checked={!!v.required}
                    onChange={(e) => updateVar(i, 'required', e.target.checked)}
                  />{' '}
                  required
                </label>
                <button
                  className="px-2 py-1 rounded bg-rose-700 hover:bg-rose-600 text-xs"
                  onClick={() => removeVar(i)}
                  title="Remove this variable"
                >
                  ✕
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
          className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 placeholder:text-neutral-600 text-sm"
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
          placeholder="e.g., '\n\n', 'END', '---'"
          title="Stop sequences: text patterns that tell the AI to stop generating (comma-separated)"
        />
        <input
          className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 placeholder:text-neutral-600 text-sm"
          value={p.outputFormat ?? ''}
          onChange={(e) => update('outputFormat', e.target.value)}
          placeholder="e.g., 'JSON', 'Markdown', 'Plain text'"
          title="Desired output format for the AI response"
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
