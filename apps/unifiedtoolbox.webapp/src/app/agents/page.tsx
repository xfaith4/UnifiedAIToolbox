'use client'

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  fetchAgentLibrary,
  normalizeAgent,
  persistAgentLibrary,
} from '@/lib/services/agentStore'
import type { AgentInstruction, AgentStatus } from '@/lib/types/agents'
import { computeDiff, computeHash } from '@/lib/utils/textHelpers'
import { trackUxEvent } from '@/lib/ux/telemetry'
import { createOrUpdateRecipeFromAgent } from '@/lib/services/recipeStore'
import {
  getAgentReadinessIssues,
  getEffectiveAgentPrompt,
  validateImportedAgentLibrary,
} from './utils'

const statusLabels: Record<AgentStatus, string> = {
  draft: 'Draft',
  ready: 'Ready',
  archived: 'Archived',
}

function multilineToString(items?: string[]) {
  return (items ?? []).join('\n')
}

function stringToList(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightText(text: string, query: string): ReactNode {
  if (!query) {
    return text
  }
  const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi')
  const pieces = text.split(regex)
  return pieces.map((piece, index) =>
    piece.toLowerCase() === query.toLowerCase() ? (
      <mark key={`highlight-${index}`} className="bg-yellow-400/40 text-yellow-200">
        {piece}
      </mark>
    ) : (
      <span key={`highlight-${index}`}>{piece}</span>
    )
  )
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentInstruction[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const controller = new AbortController()

    ;(async () => {
      setLoading(true)
      setImportError(null)
      try {
        const data = await fetchAgentLibrary({ signal: controller.signal })
        setAgents(data)
        setSelectedId(data[0]?.id ?? null)
      } catch (error) {
        if (controller.signal.aborted) return
        setImportError('Failed to load agent library. Try refreshing the page or re-importing your library.')
        trackUxEvent('api_error', {
          route: '/agents',
          details: {
            url: '/api/agents',
            status: 'network_error',
            message: error instanceof Error ? error.message : String(error),
          },
        })
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [])

  const filteredAgents = useMemo(() => {
    const query = filter.toLowerCase().trim()
    if (!query) return agents
    return agents.filter((agent) => {
      const haystack = [
        agent.name,
        agent.purpose,
        agent.mission,
        agent.owner,
        agent.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [agents, filter])

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedId) ?? null,
    [agents, selectedId]
  )

  async function persist(next: AgentInstruction[]) {
    setSaving(true)
    try {
      await persistAgentLibrary(next)
    } finally {
      setSaving(false)
    }
  }

  function handleSelectAgent(id: string) {
    setSelectedId(id)
  }

  function upsertAgent(
    id: string,
    updater: (agent: AgentInstruction) => AgentInstruction
  ) {
    setAgents((prev) => {
      const next = prev.map((agent) =>
        agent.id === id ? normalizeAgent(updater(agent)) : agent
      )
      void persist(next)
      return next
    })
  }

  function handleAddAgent() {
    const newAgent = normalizeAgent({})
    setAgents((prev) => {
      const next = [newAgent, ...prev]
      void persist(next)
      setSelectedId(newAgent.id)
      return next
    })
  }

  function handleDeleteAgent(id: string) {
    setAgents((prev) => {
      const next = prev.filter((agent) => agent.id !== id)
      void persist(next)
      if (selectedId === id) {
        setSelectedId(next[0]?.id ?? null)
      }
      return next
    })
  }

  function handleExport() {
    const blob = new window.Blob([JSON.stringify(agents, null, 2)], {
      type: 'application/json',
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'agent-library.json'
    link.click()
    window.URL.revokeObjectURL(url)
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setImportError(null)
    try {
      const text = await file.text()
      const payload = JSON.parse(text)
      const validated = validateImportedAgentLibrary(payload)
      const normalized = validated.map((item) => normalizeAgent(item))
      setAgents(normalized)
      setSelectedId(normalized[0]?.id ?? null)
      await persist(normalized)
    } catch (error) {
      console.error('[agentLibrary] Failed to import agents:', error)
      const message = error instanceof Error ? error.message : 'Import failed. Please verify the JSON structure.'
      setImportError(message)
      trackUxEvent('validation_error', { route: '/agents', details: { action: 'import_agents', message } })
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Agent Instructions</h1>
          <p className="text-sm text-slate-400">
            Curate orchestrator-ready agents with missions, triggers, and playbooks.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-xs text-slate-400" aria-live="polite">
              Saving&hellip;
            </span>
          )}
          <button
            className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm hover:bg-slate-700/80"
            onClick={handleExport}
          >
            Export JSON
          </button>
          <button
            className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm hover:bg-slate-700/80"
            onClick={() => fileInputRef.current?.click()}
          >
            Import JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImport}
            aria-label="Import Agent Library JSON"
          />
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
            onClick={handleAddAgent}
          >
            New Agent
          </button>
        </div>
      </div>

      {importError && (
        <div className="rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-200">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="font-semibold">Import failed</div>
              <div className="mt-1 text-xs text-red-200/90">{importError}</div>
              <div className="mt-2 text-xs text-slate-300">
                Expected format: a JSON array of agent objects.
              </div>
            </div>
            <button
              type="button"
              className="text-xs text-slate-300 hover:text-white"
              onClick={() => setImportError(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[320px_1fr]">
        <div className="space-y-3">
          <input
            type="search"
            placeholder="Search name, tags, mission"
            className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="space-y-2 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/50 p-2 max-h-[calc(100vh-220px)]">
            {loading && <div className="p-4 text-sm text-slate-400">Loading agents…</div>}
            {!loading && filteredAgents.length === 0 && (
              <div className="p-4 text-sm text-slate-400">No agents match your search.</div>
            )}
            {!loading &&
              filteredAgents.map((agent) => (
                <button
                  key={agent.id}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                    agent.id === selectedId
                      ? 'border-blue-500 bg-slate-800'
                      : 'border-transparent hover:bg-slate-800/50'
                  }`}
                  onClick={() => handleSelectAgent(agent.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-slate-100">{agent.name}</div>
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      {statusLabels[agent.status]}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {agent.tags.slice(0, 3).join(', ') || 'No tags'}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Updated {new Date(agent.updatedAt).toLocaleString()}
                  </div>
                </button>
              ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          {!selectedAgent && (
            <div className="text-sm text-slate-400">Select an agent to view details.</div>
          )}
          {selectedAgent && (
            <AgentDetailForm
              key={selectedAgent.id} // Re-mount form on agent change
              agent={selectedAgent}
              onChange={(updater) => upsertAgent(selectedAgent.id, updater)}
              onDelete={() => handleDeleteAgent(selectedAgent.id)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function AgentDetailForm({
  agent,
  onChange,
  onDelete,
}: {
  agent: AgentInstruction
  onChange: (updater: (agent: AgentInstruction) => AgentInstruction) => void
  onDelete: () => void
}) {
  const router = useRouter()
  function update<K extends keyof AgentInstruction>(key: K, value: AgentInstruction[K]) {
    onChange((current) => ({
      ...current,
      [key]: value,
      updatedAt: new Date().toISOString(),
    }))
  }

  const canonicalPrompt = agent.prompt ?? ''
  const [draftPrompt, setDraftPrompt] = useState(getEffectiveAgentPrompt(agent))
  const [editingPrompt, setEditingPrompt] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const [recipeStatus, setRecipeStatus] = useState('')
  const [canonicalHash, setCanonicalHash] = useState('')
  const [renderedHash, setRenderedHash] = useState('')

  const finalPrompt = getEffectiveAgentPrompt(agent)
  const readinessIssues = useMemo(() => getAgentReadinessIssues(agent), [agent])
  const canUseInBuild = readinessIssues.length === 0

  useEffect(() => {
    let active = true
    computeHash(canonicalPrompt).then((hash) => active && setCanonicalHash(hash))
    computeHash(finalPrompt).then((hash) => active && setRenderedHash(hash))
    return () => {
      active = false
    }
  }, [canonicalPrompt, finalPrompt])

  const diffLines = useMemo(() => computeDiff(canonicalPrompt, finalPrompt), [
    canonicalPrompt,
    finalPrompt,
  ])

  const promptSource = agent.promptOverride ? 'Override' : 'Library'
  const promptAvailable = Boolean(finalPrompt)
  const renderablePrompt = finalPrompt

  function handleRecipeLaunch(destination: '/concierge' | '/engine') {
    const recipe = createOrUpdateRecipeFromAgent(agent, { effectivePrompt: finalPrompt })
    setRecipeStatus(
      destination === '/concierge'
        ? `Recipe saved from "${agent.name}" and sent to Concierge.`
        : `Recipe saved from "${agent.name}" and sent to App Lifecycle.`
    )
    setTimeout(() => setRecipeStatus(''), 3500)
    router.push(`${destination}?recipe=${encodeURIComponent(recipe.id)}`)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-blue-900/60 bg-blue-950/20 px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-300">
              Recipe Actions
            </p>
            <p className="mt-1 text-sm text-slate-300">
              Reuse this agent as part of a proposal or a guided build without rebuilding the cast from scratch.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-blue-700/70 bg-blue-900/30 px-3 py-1.5 text-xs font-medium text-blue-100 hover:bg-blue-800/40"
              onClick={() => handleRecipeLaunch('/concierge')}
            >
              Use in Proposal
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700/80"
              onClick={() => handleRecipeLaunch('/engine')}
              disabled={!canUseInBuild}
              title={
                canUseInBuild
                  ? 'Send this agent recipe to App Lifecycle.'
                  : `Complete before build: ${readinessIssues.join(', ')}`
              }
            >
              Use in Build
            </button>
          </div>
        </div>
        {recipeStatus && (
          <p className="mt-2 text-xs text-blue-200" aria-live="polite">
            {recipeStatus}
          </p>
        )}
        {!canUseInBuild && (
          <p className="mt-2 text-xs text-amber-200">
            Build is disabled until this agent has: {readinessIssues.join(', ')}.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <label htmlFor="agent-name" className="text-xs uppercase tracking-wide text-slate-400">
            Agent Name
          </label>
          <input
            id="agent-name"
            className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-lg font-semibold focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={agent.name}
            onChange={(e) => update('name', e.target.value)}
          />
        </div>
        <button
          className="rounded-lg border border-rose-500/50 px-3 py-1.5 text-sm text-rose-400 hover:bg-rose-500/10"
          onClick={onDelete}
        >
          Delete
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="agent-status" className="text-xs font-medium text-slate-400">Status</label>
          <select
            id="agent-status"
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm"
            value={agent.status}
            onChange={(e) => update('status', e.target.value as AgentStatus)}
          >
            <option value="draft">Draft</option>
            <option value="ready">Ready</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div>
          <label htmlFor="agent-owner" className="text-xs font-medium text-slate-400">Owner</label>
          <input
            id="agent-owner"
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm"
            value={agent.owner ?? ''}
            onChange={(e) => update('owner', e.target.value)}
            placeholder="team@company.com"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Purpose"
          value={agent.purpose}
          onChange={(value) => update('purpose', value)}
        />
        <Field
          label="Mission"
          value={agent.mission ?? ''}
          onChange={(value) => update('mission', value)}
        />
      </div>

      <Field
        label="Tags (comma separated)"
        value={agent.tags.join(', ')}
        onChange={(value) =>
          update(
            'tags',
            value
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean)
          )
        }
      />

      <div className="grid grid-cols-2 gap-3">
        <TextAreaField
          label="Triggers"
          value={multilineToString(agent.triggers)}
          onChange={(value) => update('triggers', stringToList(value))}
          hint="One trigger per line"
        />
        <TextAreaField
          label="Inputs"
          value={multilineToString(agent.inputs)}
          onChange={(value) => update('inputs', stringToList(value))}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TextAreaField
          label="Expected Outputs"
          value={multilineToString(agent.outputs)}
          onChange={(value) => update('outputs', stringToList(value))}
        />
        <TextAreaField
          label="Tools & Integrations"
          value={multilineToString(agent.tools)}
          onChange={(value) => update('tools', stringToList(value))}
        />
      </div>

      <TextAreaField
        label="Playbook"
        value={multilineToString(agent.playbook)}
        onChange={(value) => update('playbook', stringToList(value))}
        hint="Describe the sequence of steps the agent should perform."
      />

      <TextAreaField
        label="Handoff / Escalation"
        value={agent.handoff ?? ''}
        onChange={(value) => update('handoff', value)}
        hint="Describe how this agent hands work back to humans or other agents."
      />

      <TextAreaField
        label="Notes"
        value={agent.notes ?? ''}
        onChange={(value) => update('notes', value)}
      />

      <div className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Prompt</p>
            <p className="text-sm text-slate-300">
              This is the exact instruction block provided to the model for this agent.
            </p>
          </div>
          <span
            className="rounded-full border border-slate-700 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-400"
            title="Indicates whether the library prompt or a user override is active."
          >
            Source: {promptSource}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
          <button
            type="button"
            className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs hover:bg-slate-700/80"
            onClick={async () => {
              if (!renderablePrompt || typeof navigator === 'undefined') return
              try {
                await navigator.clipboard.writeText(renderablePrompt)
                setCopyStatus('Copied!')
                setTimeout(() => setCopyStatus(''), 2000)
              } catch {
                setCopyStatus('Copy failed')
              }
            }}
          >
            Copy Prompt
          </button>
          {copyStatus && <span>{copyStatus}</span>}
          <button
            type="button"
            className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs hover:bg-slate-700/80"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs hover:bg-slate-700/80"
            onClick={() => setShowDiff((prev) => !prev)}
          >
            {showDiff ? 'Hide Diff' : 'Show Diff'}
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs hover:bg-slate-700/80"
            onClick={() => {
              setEditingPrompt((prev) => {
                const next = !prev
                setDraftPrompt(finalPrompt)
                return next
              })
            }}
          >
            {editingPrompt ? 'Cancel Edit' : 'Edit Prompt'}
          </button>
          {editingPrompt && (
            <>
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
                onClick={() => {
                  update('promptOverride', draftPrompt || null)
                  setEditingPrompt(false)
                }}
              >
                Save Override
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-700/80"
                onClick={() => {
                  update('promptOverride', null)
                  setDraftPrompt(canonicalPrompt)
                  setEditingPrompt(false)
                }}
              >
                Reset to Library
              </button>
            </>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
          <span title="SHA-256 of the canonical library prompt">
            Canonical hash: <code className="text-slate-200">{canonicalHash || '–'}</code>
          </span>
          <span title="SHA-256 of the rendered prompt (after overrides)">
            Rendered hash: <code className="text-slate-200">{renderedHash || '–'}</code>
          </span>
        </div>
        <div className="mt-3 space-y-2">
          <input
            type="search"
            placeholder="Find text in prompt…"
            className="w-full rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search within prompt text"
          />
          {!promptAvailable && (
            <p className="text-xs text-rose-400">
              Prompt not present in library data for this agent.
            </p>
          )}
          {promptAvailable && (
            <pre
              className={`relative mt-1 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-3 text-xs leading-relaxed text-slate-200 ${
                expanded ? 'max-h-[none]' : 'max-h-40 overflow-auto'
              }`}
            >
              {editingPrompt ? (
                <textarea
                  className="min-h-[170px] w-full rounded-xl border border-slate-700 bg-slate-900/80 p-2 text-xs font-mono leading-relaxed text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={draftPrompt}
                  onChange={(event) => setDraftPrompt(event.target.value)}
                />
              ) : (
                <span className="whitespace-pre-wrap break-words">
                  {highlightText(renderablePrompt, searchTerm)}
                </span>
              )}
            </pre>
          )}
        </div>
        {showDiff && promptAvailable && (
          <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-[0.65rem] leading-relaxed text-slate-200">
            <div className="grid grid-cols-[40px_1fr_1fr] gap-2 text-slate-400">
              <span>Line</span>
              <span>Library</span>
              <span>Rendered</span>
            </div>
            <div className="mt-2 space-y-1">
              {diffLines.map((line) => (
                <div
                  key={`diff-line-${line.index}`}
                  className="grid grid-cols-[40px_1fr_1fr] gap-2 rounded-md px-2 py-1 transition"
                  style={{
                    background:
                      line.status === 'equal' ? 'rgba(148, 163, 184, 0.05)' : 'rgba(248, 113, 113, 0.1)',
                  }}
                >
                  <span className="text-slate-500">{line.index}</span>
                  <span className="truncate">{line.canonical || '—'}</span>
                  <span className="truncate">{line.rendered || '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mt-3 text-[0.75rem] text-slate-500">
          <p className="mb-1 font-semibold text-slate-300">Rendered Prompt Preview</p>
          <pre className="max-h-40 overflow-auto rounded-xl border border-slate-800 bg-black/50 p-2 text-[0.7rem] text-slate-100">
            {renderablePrompt || 'No prompt available.'}
          </pre>
        </div>
      </div>

      <div className="text-xs text-slate-500">
        Last updated {new Date(agent.updatedAt).toLocaleString()}
      </div>
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
}: {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
}) {
  return (
    <label className="block text-sm font-medium text-slate-300">
      {label}
      <textarea
        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </label>
  )
}
