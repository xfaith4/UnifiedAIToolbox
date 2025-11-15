import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  createAgentTemplate,
  fetchAgentLibrary,
  normalizeAgent,
  persistAgentLibrary,
} from '../services/agentStore'
import type { AgentInstruction, AgentStatus } from '../types/agents'

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

export default function AgentLibraryPage() {
  const [agents, setAgents] = useState<AgentInstruction[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const data = await fetchAgentLibrary()
      setAgents(data)
      setSelectedId(data[0]?.id ?? null)
      setLoading(false)
    }
    load()
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
    const newAgent = createAgentTemplate()
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
    try {
      const text = await file.text()
      const payload = JSON.parse(text)
      if (!Array.isArray(payload)) {
        throw new Error('Expected an array of agents')
      }
      const normalized = payload.map((item) => normalizeAgent(item))
      setAgents(normalized)
      setSelectedId(normalized[0]?.id ?? null)
      await persist(normalized)
    } catch (error) {
      console.error('[agentLibrary] Failed to import agents:', error)
      window.alert('Import failed. Please verify the JSON structure.')
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
          <p className="text-sm text-slate-600">
            Curate orchestrator-ready agents with missions, triggers, and playbooks.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-xs text-slate-500">Saving&hellip;</span>
          )}
          <button
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
            onClick={handleExport}
          >
            Export JSON
          </button>
          <button
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
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
          />
          <button
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            onClick={handleAddAgent}
          >
            New Agent
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[320px_1fr] gap-6">
        <div className="space-y-3">
          <input
            type="search"
            placeholder="Search name, tags, mission"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-2 max-h-[calc(100vh-220px)]">
            {loading && <div className="p-4 text-sm text-slate-500">Loading agents…</div>}
            {!loading && filteredAgents.length === 0 && (
              <div className="p-4 text-sm text-slate-500">No agents match your search.</div>
            )}
            {!loading &&
              filteredAgents.map((agent) => (
                <button
                  key={agent.id}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                    agent.id === selectedId
                      ? 'border-indigo-400 bg-indigo-50'
                      : 'border-transparent hover:bg-slate-50'
                  }`}
                  onClick={() => handleSelectAgent(agent.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-slate-800">{agent.name}</div>
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {statusLabels[agent.status]}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {agent.tags.slice(0, 3).join(', ') || 'No tags'}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    Updated {new Date(agent.updatedAt).toLocaleString()}
                  </div>
                </button>
              ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          {!selectedAgent && (
            <div className="text-sm text-slate-500">Select an agent to view details.</div>
          )}
          {selectedAgent && (
            <AgentDetailForm
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
  function update<K extends keyof AgentInstruction>(key: K, value: AgentInstruction[K]) {
    onChange((current) => ({
      ...current,
      [key]: value,
      updatedAt: new Date().toISOString(),
    }))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Agent Name
          </div>
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-lg font-semibold focus:border-indigo-400 focus:outline-none"
            value={agent.name}
            onChange={(e) => update('name', e.target.value)}
          />
        </div>
        <button
          className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm text-rose-600 hover:bg-rose-50"
          onClick={onDelete}
        >
          Delete
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-500">Status</label>
          <select
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={agent.status}
            onChange={(e) => update('status', e.target.value as AgentStatus)}
          >
            <option value="draft">Draft</option>
            <option value="ready">Ready</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Owner</label>
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
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
          value={agent.mission}
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
    <label className="block text-sm font-medium text-slate-600">
      {label}
      <input
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
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
    <label className="block text-sm font-medium text-slate-600">
      {label}
      <textarea
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <div className="text-xs text-slate-400">{hint}</div>}
    </label>
  )
}





