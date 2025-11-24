import React, { useEffect, useState } from 'react'
import { deleteAgent, listAgents, upsertAgent, type AgentDefinition } from '../services/agentStore'

export default function AgentLibraryPage() {
  const [agents, setAgents] = useState<AgentDefinition[]>([])
  const [form, setForm] = useState<AgentDefinition>({
    name: '',
    role: 'system',
    prompt: '',
    description: '',
  })
  const [editingName, setEditingName] = useState<string | null>(null)

  useEffect(() => {
    setAgents(listAgents())
  }, [])

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    const updated = upsertAgent(form)
    setAgents(updated)
    setForm({ name: '', role: 'system', prompt: '', description: '' })
    setEditingName(null)
  }

  const handleEdit = (agent: AgentDefinition) => {
    setEditingName(agent.name)
    setForm(agent)
  }

  const handleDelete = (name: string) => {
    const updated = deleteAgent(name)
    setAgents(updated)
    if (editingName === name) {
      setForm({ name: '', role: 'system', prompt: '', description: '' })
      setEditingName(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Agent Library</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Bundled agent definitions from repository data (merged from multiple sources). Add, edit,
          or remove agents below.
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow md:grid-cols-2 lg:grid-cols-3"
      >
        <div className="space-y-1">
          <label className="text-sm text-slate-300">Name</label>
          <input
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
            placeholder="Agent name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-slate-300">Role</label>
          <input
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
            placeholder="system / user / assistant"
            value={form.role || ''}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
          />
        </div>
        <div className="space-y-1 md:col-span-2 lg:col-span-3">
          <label className="text-sm text-slate-300">Prompt / Instructions</label>
          <textarea
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
            rows={3}
            placeholder="System message or guidance for this agent"
            value={form.prompt || ''}
            onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
          />
        </div>
        <div className="space-y-1 md:col-span-2 lg:col-span-3">
          <label className="text-sm text-slate-300">Description</label>
          <textarea
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
            rows={2}
            placeholder="Optional short description"
            value={form.description || ''}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div className="md:col-span-2 lg:col-span-3 flex items-center gap-3">
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            {editingName ? 'Update agent' : 'Add agent'}
          </button>
          {editingName && (
            <button
              type="button"
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-800"
              onClick={() => {
                setEditingName(null)
                setForm({ name: '', role: 'system', prompt: '', description: '' })
              }}
            >
              Cancel edit
            </button>
          )}
        </div>
      </form>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => (
          <article
            key={agent.name}
            className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow"
          >
            <header className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">{agent.name}</h2>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  {agent.role || 'system'}
                </p>
              </div>
              <span className="text-[11px] rounded-full bg-slate-800 px-2 py-1 text-slate-300">
                {agent.meta ? 'Custom/Local' : 'Local'}
              </span>
            </header>
            <p className="mt-3 text-sm text-slate-200 whitespace-pre-line line-clamp-6">
              {agent.prompt || 'No prompt provided.'}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
                onClick={() => handleEdit(agent)}
              >
                Edit
              </button>
              <button
                className="rounded-lg border border-red-600 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-600/20"
                onClick={() => handleDelete(agent.name)}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
