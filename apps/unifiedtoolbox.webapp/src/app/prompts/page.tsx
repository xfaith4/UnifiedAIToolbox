'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  PromptHistoryEntry,
  PromptItem,
  PromptQualitySubscores,
} from '@/lib/types/prompts'
import { computeDiff, computeHash, type DiffLine } from '@/lib/utils/textHelpers'
import {
  evaluatePromptQuality,
  generateRefinementDraft,
} from '@/lib/utils/promptQuality'
import { containsSecretIndicators } from '@/lib/utils/promptRefiner'
import {
  fetchPromptLibrary,
  normalizePrompt,
  persistPromptLibrary,
} from '@/lib/services/promptStore'
import { runPromptLibrarySelfChecks } from '@/lib/services/promptSelfCheck'

export default function PromptsPage() {
  const [items, setItems] = useState<PromptItem[]>([])
  const [query, setQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [editing, setEditing] = useState<PromptItem | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const initialized = useRef(false)

  useEffect(() => {
    runPromptLibrarySelfChecks()
  }, [])

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const list = await fetchPromptLibrary()
      setItems(list)
      setActiveId(list[0]?.id ?? null)
      initialized.current = true
      setIsLoading(false)
    }
    void load()
  }, [])

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
      const textHit = !q || haystacks.some((h) => h.toLowerCase().includes(q))
      const categoryHit = !filterCategory || (p.category ?? '') === filterCategory
      return textHit && categoryHit
    })
  }, [items, query, filterCategory])

  function persistPrompt(next: PromptItem, options?: { closeEditor?: boolean }) {
    const updated = {
      ...normalizePrompt(next),
      updatedAt: new Date().toISOString(),
    }
    setItems((prev) => {
      const exists = prev.some((item) => item.id === updated.id)
      if (exists) {
        return prev.map((item) => (item.id === updated.id ? updated : item))
      }
      return [updated, ...prev]
    })
    setActiveId(updated.id)
    setEditing(options?.closeEditor ? null : updated)
    return updated
  }

  function handleSave(next: PromptItem) {
    persistPrompt(next, { closeEditor: true })
  }

  function handlePersist(next: PromptItem) {
    persistPrompt(next)
  }

  function newPrompt() {
    const draft = normalizePrompt({
      title: 'New Prompt',
      template: 'You are a helpful AI.\nTask: {{task}}\nConstraints: {{constraints}}',
      variables: [
        { name: 'task', label: 'Task', type: 'multiline' },
        { name: 'constraints', label: 'Constraints', type: 'string' },
      ],
    })
    persistPrompt(draft)
  }

  function deletePrompt(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id))
    if (activeId === id) setActiveId(null)
    if (editing?.id === id) setEditing(null)
  }

  function clonePrompt(p: PromptItem) {
    const clone = normalizePrompt({
      ...p,
      id: undefined,
      title: `${p.title} (Copy)`,
    })
    persistPrompt(clone)
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
            Create, test, and manage your reusable AI prompts with guided refinements.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.25fr]">
        <div className="space-y-2 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/50 p-2 max-h-[calc(100vh-220px)]">
          {isLoading && <div className="p-4 text-sm text-slate-400">Loading prompts…</div>}
          {!isLoading && filtered.length === 0 && (
            <div className="p-4 text-sm text-slate-400">No prompts found.</div>
          )}
          {!isLoading &&
            filtered.map((p) => (
              <PromptCard
                key={p.id}
                prompt={p}
                active={activeId === p.id}
                onEdit={() => {
                  setActiveId(p.id)
                  setEditing(p)
                }}
                onClone={() => clonePrompt(p)}
                onDelete={() => deletePrompt(p.id)}
              />
            ))}
        </div>

        <div className="space-y-4">
          {editing ? (
            <PromptEditor value={editing} onPersist={handlePersist} onSave={handleSave} />
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center text-slate-400">
              Select a prompt to edit or create a new one.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PromptCard({
  prompt,
  active,
  onEdit,
  onClone,
  onDelete,
}: {
  prompt: PromptItem
  active: boolean
  onEdit: () => void
  onClone: () => void
  onDelete: () => void
}) {
  const score = prompt.quality?.overallScore ?? 0
  const isRated = Boolean(prompt.quality?.lastRatedAt)
  const badge = qualityBadgeColor(score)

  return (
    <div
      className={`rounded-xl border p-3 transition ${
        active ? 'border-blue-500 bg-slate-800' : 'border-transparent hover:border-slate-700'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-white">{prompt.title}</div>
          <div className="mt-1 text-xs text-slate-400">{prompt.context || prompt.description}</div>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <span
            className={`rounded-full px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.bg} ${badge.text}`}
            title={isRated ? `Rated ${score.toFixed(1)} · ${formatDate(prompt.quality!.lastRatedAt)}` : 'Not rated yet'}
          >
            {isRated ? score.toFixed(1) : 'NR'}
          </span>
          {prompt.category && (
            <span className="text-[10px] rounded bg-slate-700 px-2 py-0.5">{prompt.category}</span>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="rounded-lg bg-slate-700/80 px-2 py-1 text-xs hover:bg-slate-700"
          onClick={onEdit}
        >
          Edit
        </button>
        <button
          className="rounded-lg bg-slate-800/50 px-2 py-1 text-xs hover:bg-slate-700/50"
          onClick={onClone}
        >
          Clone
        </button>
        <button
          className="rounded-lg bg-rose-500/10 px-2 py-1 text-xs text-rose-400 hover:bg-rose-500/20"
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
    </div>
  )
}

function PromptEditor({
  value,
  onPersist,
  onSave,
}: {
  value: PromptItem
  onPersist: (prompt: PromptItem) => void
  onSave: (prompt: PromptItem) => void
}) {
  const [prompt, setPrompt] = useState(value)
  const [searchTerm, setSearchTerm] = useState('')
  const [draftDiffVisible, setDraftDiffVisible] = useState(true)
  const [historyDiffVisible, setHistoryDiffVisible] = useState(true)
  const [copied, setCopied] = useState(false)
  const [historySelection, setHistorySelection] = useState<string | null>(null)
  const [canonicalHash, setCanonicalHash] = useState('')
  const [renderedHash, setRenderedHash] = useState('')
  const [refinerMode, setRefinerMode] = useState<'local' | 'ai'>('local')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiCritique, setAiCritique] = useState<string[]>([])
  const [aiSummary, setAiSummary] = useState<string[]>([])
  const [aiTokens, setAiTokens] = useState<{ prompt?: number; completion?: number; total?: number } | null>(null)
  const [aiCost, setAiCost] = useState<number | null>(null)
  const [aiDelta, setAiDelta] = useState<number | null>(null)
  const [aiRubric, setAiRubric] = useState<PromptQualitySubscores | null>(null)
  const [aiSecretConsent, setAiSecretConsent] = useState(false)
  const [keyVersion, setKeyVersion] = useState(0)

  useEffect(() => {
    setPrompt(value)
  }, [value])

  useEffect(() => {
    setHistorySelection(value.history?.[0]?.versionId ?? null)
  }, [value.history])

  const secretDetected = useMemo(() => containsSecretIndicators(prompt.template), [prompt.template])

  useEffect(() => {
    if (!secretDetected) {
      setAiSecretConsent(false)
    }
  }, [secretDetected])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = () => setKeyVersion((prev) => prev + 1)
    window.addEventListener('storage', handler)
    window.addEventListener('ai-toolbox-api-key-change', handler)
    return () => {
      window.removeEventListener('storage', handler)
      window.removeEventListener('ai-toolbox-api-key-change', handler)
    }
  }, [])

  const getStoredApiKey = () => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('ai-toolbox-api-key')
  }

  const aiAvailable = Boolean(getStoredApiKey() || process.env.NEXT_PUBLIC_OPENAI_API_KEY)

  useEffect(() => {
    if (!aiAvailable && refinerMode === 'ai') {
      setRefinerMode('local')
    }
  }, [aiAvailable, refinerMode])

  const renderedPrompt = useMemo(
    () => [prompt.context, prompt.template].filter(Boolean).join('\n\n'),
    [prompt.context, prompt.template]
  )

  useEffect(() => {
    let active = true
    void computeHash(prompt.template).then((hash) => {
      if (active) setCanonicalHash(hash)
    })
    return () => {
      active = false
    }
  }, [prompt.template])

  useEffect(() => {
    let active = true
    void computeHash(renderedPrompt).then((hash) => {
      if (active) setRenderedHash(hash)
    })
    return () => {
      active = false
    }
  }, [renderedPrompt])

  const draftText = prompt.refine?.draftText ?? prompt.template
  const diffLines = useMemo(() => computeDiff(prompt.template, draftText), [prompt.template, draftText])

  const selectedHistory = useMemo(
    () =>
      historySelection
        ? prompt.history?.find((entry) => entry.versionId === historySelection) ?? null
        : null,
    [prompt.history, historySelection]
  )

  const historyDiffLines = useMemo(
    () => (selectedHistory ? computeDiff(selectedHistory.promptText, prompt.template) : []),
    [selectedHistory, prompt.template]
  )

  const searchMatches = useMemo(() => {
    if (!searchTerm.trim()) return []
    return prompt.template
      .split('\n')
      .map((line, index) => ({ line: index + 1, text: line }))
      .filter((line) => line.text.toLowerCase().includes(searchTerm.toLowerCase()))
  }, [prompt.template, searchTerm])

  const quality = prompt.quality
  const subscores = quality?.subscores ?? {
    clarity: 0,
    constraints: 0,
    outputFormat: 0,
    examples: 0,
    safety: 0,
    reusability: 0,
  }

  const qualityDefinitions: Record<keyof typeof subscores, string> = {
    clarity: 'Defines the role and objective clearly.',
    constraints: 'Specifies rules, limits, or forbidden behavior.',
    outputFormat: 'Describes the expected structure or format.',
    examples: 'Provides sample input/output pairs or test cases.',
    safety: 'Includes guardrails and respectful directives.',
    reusability: 'Allows placeholders and generalization cues.',
  }

  const sortedHistory = useMemo(
    () => [...(prompt.history ?? [])].sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
    [prompt.history]
  )

  function handleField<K extends keyof PromptItem>(key: K, value: PromptItem[K]) {
    setPrompt((prev) => ({ ...prev, [key]: value }))
  }

  function handleTemplateChange(value: string) {
    setPrompt((prev) => ({ ...prev, template: value }))
  }

  function handleCopyPrompt() {
    if (!navigator.clipboard) return
    navigator.clipboard.writeText(prompt.template).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  function handleEvaluate() {
    const result = evaluatePromptQuality(prompt.template, prompt.context)
    const updated = {
      ...prompt,
      quality: result,
    }
    setPrompt(updated)
    onPersist(updated)
  }

  function handleGenerateLocalImprovements() {
    const draft = generateRefinementDraft(prompt.template, prompt.context)
    const updated = {
      ...prompt,
      refine: {
        ...prompt.refine,
        draftText: draft,
        lastRefinedAt: new Date().toISOString(),
      },
    }
    setPrompt(updated)
    onPersist(updated)
    setAiError(null)
    setAiCritique([])
    setAiSummary([])
    setAiTokens(null)
    setAiCost(null)
    setAiDelta(null)
    setAiRubric(null)
  }

  async function handleGenerateAIImprovements() {
    setAiLoading(true)
    setAiError(null)
    if (!aiAvailable) {
      setAiError('AI refinement is not configured.')
      setAiLoading(false)
      return
    }
    if (secretDetected && !aiSecretConsent) {
      setAiError('Confirm secret sharing before using AI refinements.')
      setAiLoading(false)
      return
    }
    const storedKey = getStoredApiKey()

    try {
      const response = await fetch('/api/prompt/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: prompt.title,
          category: prompt.category,
          context: prompt.context,
          template: prompt.template,
          goals: prompt.description,
          constraints: prompt.context,
          outputFormat: prompt.outputFormat,
          apiKey: storedKey ?? undefined,
        }),
      })
      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail || 'AI refinement failed.')
      }
      const payload = await response.json()
      const aiDraft = (payload.refinedTemplate ?? prompt.template).trim()
      const updated = {
        ...prompt,
        refine: {
          ...prompt.refine,
          draftText: aiDraft,
          lastRefinedAt: new Date().toISOString(),
        },
      }
      setPrompt(updated)
      onPersist(updated)
      setAiCritique(payload.critiqueBullets ?? [])
      setAiSummary(payload.changeSummary ?? [])
      setAiTokens(payload.tokens ?? null)
      setAiCost(payload.cost ?? null)
      setAiDelta(typeof payload.qualityScoreDelta === 'number' ? payload.qualityScoreDelta : null)
      setAiRubric(payload.rubricBreakdown ?? null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI refinement failed.'
      setAiError(message)
      handleGenerateLocalImprovements()
    } finally {
      setAiLoading(false)
    }
  }

  function handleGenerateImprovements() {
    if (refinerMode === 'ai') {
      void handleGenerateAIImprovements()
    } else {
      handleGenerateLocalImprovements()
    }
  }

  function handleApplyDraft() {
    const draft = prompt.refine?.draftText ?? prompt.template
    if (!draft) return
    const updated = {
      ...prompt,
      template: draft,
      refine: {
        ...prompt.refine,
        lastRefinedAt: new Date().toISOString(),
      },
    }
    setPrompt(updated)
    onPersist(updated)
  }

  function handleSaveVersion() {
    const entry: PromptHistoryEntry = {
      versionId: `${prompt.id}-${Date.now()}`,
      savedAt: new Date().toISOString(),
      title: prompt.title,
      promptText: prompt.template,
      context: prompt.context,
      qualitySnapshot: prompt.quality,
    }
    const updated = {
      ...prompt,
      history: [entry, ...(prompt.history ?? [])],
    }
    setPrompt(updated)
    onPersist(updated)
  }

  function handleRestoreVersion(entry: PromptHistoryEntry) {
    const updated = {
      ...prompt,
      template: entry.promptText,
      refine: {
        ...prompt.refine,
        draftText: entry.promptText,
        lastRefinedAt: new Date().toISOString(),
      },
    }
    setPrompt(updated)
    onPersist(updated)
  }

  function handleNotesChange(value: string) {
    const updated = {
      ...prompt,
      refine: {
        ...prompt.refine,
        notes: value,
      },
    }
    setPrompt(updated)
    onPersist(updated)
  }

  function handleDraftChange(value: string) {
    const updated = {
      ...prompt,
      refine: {
        ...prompt.refine,
        draftText: value,
      },
    }
    setPrompt(updated)
  }

  return (
    <div className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Prompt details</h2>
            <p className="text-xs text-slate-400">
              {prompt.updatedAt ? `Updated ${formatDate(prompt.updatedAt)}` : 'No updates yet.'}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Hash: {canonicalHash ? canonicalHash.slice(0, 8) : '—'}</span>
            <span>Rendered: {renderedHash ? renderedHash.slice(0, 8) : '—'}</span>
          </div>
        </div>
        <Field
          label="Title"
          value={prompt.title}
          onChange={(value) => handleField('title', value)}
          placeholder="e.g., Welcome Message"
        />
        <Field
          label="Category"
          value={prompt.category ?? ''}
          onChange={(value) => handleField('category', value)}
          placeholder="e.g., Support, Sales"
        />
        <TextAreaField
          label="Context / Usage Notes"
          value={prompt.context ?? ''}
          onChange={(value) => handleField('context', value)}
        />
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-300">Template</span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search in prompt"
                className="w-full max-w-[200px] rounded-lg border border-slate-700 bg-slate-800/60 px-2 py-1 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
              />
              {searchTerm && (
                <button
                  className="text-xs text-slate-400 underline underline-offset-2"
                  onClick={() => setSearchTerm('')}
                >
                  Clear
                </button>
              )}
              <button
                className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-1 text-xs font-semibold text-white"
                onClick={handleCopyPrompt}
              >
                {copied ? 'Copied' : 'Copy Prompt'}
              </button>
            </div>
          </div>
          <textarea
            className="min-h-[160px] w-full rounded-2xl border border-slate-700 bg-slate-900/80 p-3 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            value={prompt.template}
            onChange={(e) => handleTemplateChange(e.target.value)}
          />
          {searchTerm && (
            <div className="text-xs text-slate-500">
              {searchMatches.length > 0
                ? `${searchMatches.length} match(es) at lines ${searchMatches
                    .map((match) => match.line)
                    .join(', ')}`
                : 'No matches found.'}
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400">
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>Rendered prompt preview</span>
            <span>
              Hash: {renderedHash ? renderedHash.slice(0, 8) : '—'}
            </span>
          </div>
          <pre className="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap text-[12px] leading-relaxed text-slate-100">
            {renderedPrompt || 'No prompt content yet.'}
          </pre>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Prompt Refiner</div>
            <div className="text-3xl font-semibold text-white">{quality?.overallScore.toFixed(1) ?? '—'}</div>
            <div className="text-xs text-slate-500">
              {quality?.lastRatedAt ? `Rated ${formatDate(quality.lastRatedAt)}` : 'Not rated yet'}
            </div>
            {aiDelta !== null && (
              <div
                className={`text-xs ${
                  aiDelta >= 0 ? 'text-emerald-300' : 'text-rose-300'
                }`}
              >
                AI score delta: {aiDelta >= 0 ? '+' : ''}
                {aiDelta?.toFixed(1)}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="uppercase tracking-wide">Refiner mode</span>
              <div
                className="flex overflow-hidden rounded-full border border-slate-700 bg-slate-900/50 text-[11px]"
                title="AI refinement sends prompt text to OpenAI. Do not include secrets unless you explicitly consent."
              >
                <button
                  className={`px-3 py-1 transition ${
                    refinerMode === 'local'
                      ? 'bg-blue-500 text-white'
                      : 'bg-transparent text-slate-300 hover:bg-slate-800'
                  }`}
                  onClick={() => setRefinerMode('local')}
                >
                  Local
                </button>
                <button
                  className={`px-3 py-1 transition ${
                    refinerMode === 'ai'
                      ? 'bg-blue-500 text-white'
                      : 'bg-transparent text-slate-300 hover:bg-slate-800'
                  }`}
                  onClick={() => {
                    if (!aiAvailable) {
                      setAiError('AI refinement requires an API key.')
                      return
                    }
                    setRefinerMode('ai')
                  }}
                >
                  AI
                </button>
              </div>
              <span className="text-[11px]" title="AI mode uses OpenAI to enhance prompts with a Critic -> Engineer -> Commissioner workflow">
                ⓘ
              </span>
            </div>
            {secretDetected && refinerMode === 'ai' && (
              <label className="text-[11px] text-amber-200 flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border border-slate-500 bg-slate-900/70 text-blue-400 focus:ring-blue-400"
                  checked={aiSecretConsent}
                  onChange={(e) => setAiSecretConsent(e.target.checked)}
                />
                Potential secret detected (API_KEY/password/token). Confirm before sending to AI.
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700"
                onClick={handleEvaluate}
              >
                Evaluate
              </button>
              <button
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300"
                onClick={() => setDraftDiffVisible((prev) => !prev)}
              >
                {draftDiffVisible ? 'Hide draft diff' : 'Show draft diff'}
              </button>
            </div>
            <div className="min-h-[1rem] text-[11px] text-rose-300">
              {aiError || (refinerMode === 'ai' && !aiAvailable ? 'AI key is not configured yet.' : '')}
            </div>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Subscores</div>
            <div className="grid gap-2 lg:grid-cols-2">
              {(Object.keys(subscores) as Array<keyof typeof subscores>).map((key) => (
                <div key={key} className="space-y-1 text-sm">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span title={qualityDefinitions[key]}>{key}</span>
                    <span>{subscores[key].toFixed(1)}</span>
                  </div>
                  <div className="h-1 w-full rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${subscores[key] * 10}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Findings</div>
            {quality?.findings.length ? (
              <ul className="list-disc space-y-1 pl-4 text-xs text-slate-200">
                {quality.findings.map((finding, index) => (
                  <li key={`${finding}-${index}`}>{finding}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">No issues detected.</p>
            )}
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Suggestions</div>
            <ul className="list-disc space-y-1 pl-4 text-xs text-slate-200">
              {quality?.suggestions.length ? (
                quality.suggestions.map((suggestion, index) => (
                  <li key={`${suggestion}-${index}`}>{suggestion}</li>
                ))
              ) : (
                <li>Score validated.</li>
              )}
            </ul>
          </div>
        </div>
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Refinement draft</h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>
                Last revision: {prompt.refine?.lastRefinedAt ? formatDate(prompt.refine.lastRefinedAt) : 'N/A'}
              </span>
              <button
                className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px]"
                onClick={handleGenerateImprovements}
                disabled={
                  refinerMode === 'ai'
                    ? aiLoading ||
                      !aiAvailable ||
                      (secretDetected && !aiSecretConsent)
                    : aiLoading
                }
              >
                {refinerMode === 'ai'
                  ? aiLoading
                    ? 'Generating improvements…'
                    : 'Generate improvements (AI)'
                  : 'Generate improvements'}
              </button>
              {aiLoading && <span className="text-[11px] text-slate-500">AI refining…</span>}
            </div>
          </div>
          <textarea
            className="min-h-[140px] w-full rounded-2xl border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            value={draftText}
            onChange={(e) => handleDraftChange(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
              onClick={handleApplyDraft}
            >
              Apply draft to template
            </button>
            <button
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-500"
              onClick={handleSaveVersion}
            >
              Save as new version
            </button>
            <button
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300"
              onClick={() => setHistoryDiffVisible((prev) => !prev)}
            >
              {historyDiffVisible ? 'Hide history diff' : 'Show history diff'}
            </button>
          </div>
          <Field
            label="Refinement notes"
            value={prompt.refine?.notes ?? ''}
            onChange={(value) => handleNotesChange(value)}
            placeholder="Capture reasoning behind this draft"
          />
          {refinerMode === 'ai' && (
            <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-200">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>AI Critique</span>
                {aiTokens && (
                  <span>
                    Tokens: {aiTokens.total ?? '—'} (prompt {aiTokens.prompt ?? '—'},{' '}
                    completion {aiTokens.completion ?? '—'})
                  </span>
                )}
              </div>
              <ul className="list-disc space-y-1 pl-4 text-[11px]">
                {aiCritique.length > 0 ? (
                  aiCritique.map((item, index) => (
                    <li key={`critique-${index}`}>{item}</li>
                  ))
                ) : (
                  <li className="text-slate-500">No critique yet. Run AI refinement to generate insights.</li>
                )}
              </ul>
              <div className="text-[11px] text-slate-400">Change summary</div>
              <ul className="list-disc space-y-1 pl-4 text-[11px]">
                {aiSummary.length > 0 ? (
                  aiSummary.map((item, index) => (
                    <li key={`summary-${index}`}>{item}</li>
                  ))
                ) : (
                  <li className="text-slate-500">Awaiting AI draft.</li>
                )}
              </ul>
              {aiRubric && (
                <div className="text-[11px] text-slate-400">
                  Rubric: clarity {aiRubric.clarity.toFixed(1)}, constraints{' '}
                  {aiRubric.constraints.toFixed(1)}, output format {aiRubric.outputFormat.toFixed(1)},
                  examples {aiRubric.examples.toFixed(1)}, safety {aiRubric.safety.toFixed(1)},
                  reusability {aiRubric.reusability.toFixed(1)}
                </div>
              )}
              {aiCost !== null && (
                <div className="text-[11px] text-emerald-200">Estimated cost: ${aiCost.toFixed(5)}</div>
              )}
            </div>
          )}
          {draftDiffVisible && <DiffTable lines={diffLines} />}
        </div>

        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">History</h3>
            <span className="text-xs text-slate-500">{sortedHistory.length} version(s)</span>
          </div>
          <div className="space-y-2 text-xs text-slate-200">
            {sortedHistory.length === 0 && <p>No history yet.</p>}
            {sortedHistory.map((entry) => (
              <div
                key={entry.versionId}
                className={`flex items-center justify-between rounded-xl border border-slate-700 px-3 py-2 ${
                  entry.versionId === historySelection ? 'bg-slate-800' : ''
                }`}
              >
                <div>
                  <div className="font-semibold">{entry.title}</div>
                  <div className="text-[10px] text-slate-500">
                    {formatDate(entry.savedAt)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 text-xs">
                  <button
                    className="text-blue-400 underline underline-offset-2"
                    onClick={() => setHistorySelection(entry.versionId)}
                  >
                    Preview
                  </button>
                  <button
                    className="rounded-lg border border-slate-700 px-2 py-0.5 text-[10px]"
                    onClick={() => handleRestoreVersion(entry)}
                  >
                    Restore
                  </button>
                </div>
              </div>
            ))}
          </div>
          {historyDiffVisible && selectedHistory && (
            <div>
              <div className="text-[10px] text-slate-500">Diff vs current template</div>
              <DiffTable lines={historyDiffLines} />
            </div>
          )}
        </div>
      </div>

      <button
        className="w-full rounded-2xl border border-blue-500 bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
        onClick={() => onSave(prompt)}
      >
        Save Prompt
      </button>
    </div>
  )
}

function DiffTable({ lines }: { lines: DiffLine[] }) {
  if (!lines.length) {
    return <div className="text-xs text-slate-500">No differences detected.</div>
  }

  return (
    <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/40 text-xs">
      <div className="grid grid-cols-[30px_1fr_1fr] text-[11px] text-slate-400">
        <div className="border-b border-slate-800 p-2 text-center font-semibold">#</div>
        <div className="border-b border-slate-800 p-2 font-semibold">Template</div>
        <div className="border-b border-slate-800 p-2 font-semibold">Draft</div>
      </div>
      {lines.map((line) => (
        <div
          key={`${line.index}-${line.canonical}-${line.rendered}`}
          className={`grid grid-cols-[30px_1fr_1fr] border-b border-slate-900 text-[11px] ${
            line.status === 'changed' ? 'bg-slate-800/40' : ''
          }`}
        >
          <div className="border-r border-slate-800 p-2 text-center text-slate-400">{line.index}</div>
          <div className="border-r border-slate-800 p-2 text-slate-200">{line.canonical || '—'}</div>
          <div className="p-2 text-slate-200">{line.rendered || '—'}</div>
        </div>
      ))}
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

function qualityBadgeColor(score: number) {
  if (score >= 8) {
    return { bg: 'bg-emerald-500/20', text: 'text-emerald-300' }
  }
  if (score >= 5) {
    return { bg: 'bg-amber-500/20', text: 'text-amber-200' }
  }
  return { bg: 'bg-rose-500/20', text: 'text-rose-300' }
}

function formatDate(iso: string | undefined) {
  if (!iso) return 'Unknown time'
  const date = new Date(iso)
  return date.toLocaleString()
}
