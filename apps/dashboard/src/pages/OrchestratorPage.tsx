import React, { useEffect, useMemo, useState } from 'react'
import type { AgentInstruction } from '../types/agents'
import type { PromptItem } from '../types/prompts'
import { fetchAgentLibrary } from '../services/agentStore'
import { fetchPromptLibrary } from '../services/promptStore'

const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'] as const

type Priority = (typeof PRIORITIES)[number]
const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

interface SupervisorPlan {
  overview: {
    task: string
    objective: string
    successCriteria?: string
    owner?: string
    priority: Priority
    dueDate?: string
    notes?: string
  }
  assignments: {
    agentId: string
    agentName: string
    assignment: string
    handoff: string
  }[]
  prompts: {
    id: string
    title?: string
    category?: string
  }[]
  autoSelections?: {
    agents: boolean
    prompts: boolean
  }
}

interface OrchestratorTask {
  id: string
  status?: 'queued' | 'running' | 'completed' | 'failed'
  supervisor?: {
    task?: string
    objective?: string
    generatedAt?: string
  }
  received_at?: string
  notes?: string
}

export default function OrchestratorPage() {
  const [agents, setAgents] = useState<AgentInstruction[]>([])
  const [prompts, setPrompts] = useState<PromptItem[]>([])
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([])
  const [selectedPromptIds, setSelectedPromptIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [submitState, setSubmitState] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [submitMessage, setSubmitMessage] = useState<string | null>(null)
  const [taskQueue, setTaskQueue] = useState<OrchestratorTask[]>([])
  const [taskQueueLoading, setTaskQueueLoading] = useState(false)
  const [form, setForm] = useState({
    taskName: 'New Orchestrator Task',
    objective: '',
    successCriteria: '',
    owner: '',
    dueDate: '',
    priority: 'Normal' as Priority,
    notes: '',
  })

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [agentPayload, promptPayload] = await Promise.all([
        fetchAgentLibrary(),
        fetchPromptLibrary(),
      ])
      setAgents(agentPayload)
      setPrompts(promptPayload)
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (!API_BASE) {
      setTaskQueue([])
      return
    }
    void refreshTaskQueue()
  }, [])

  async function refreshTaskQueue() {
    if (!API_BASE) return
    setTaskQueueLoading(true)
    try {
      const response = await fetch(`${API_BASE}/orchestrator/tasks`)
      if (!response.ok) throw new Error(`API responded with ${response.status}`)
      const payload = await response.json()
      setTaskQueue(Array.isArray(payload) ? payload.filter(isOrchestratorTask) : [])
    } catch (error) {
      console.warn('[orchestrator] Failed to fetch task queue:', error)
      setTaskQueue([])
    } finally {
      setTaskQueueLoading(false)
    }
  }

  function toggleSelection(id: string, list: string[], setter: (ids: string[]) => void) {
    setter(list.includes(id) ? list.filter((item) => item !== id) : [...list, id])
  }

  const selectedAgents = useMemo(
    () => agents.filter((agent) => selectedAgentIds.includes(agent.id)),
    [agents, selectedAgentIds]
  )

  const selectedPrompts = useMemo(
    () => prompts.filter((prompt) => selectedPromptIds.includes(prompt.id)),
    [prompts, selectedPromptIds]
  )

  const supervisorPlan = useMemo<SupervisorPlan | null>(() => {
    if (!form.objective.trim()) {
      return null
    }
    const autoAssignAgents = selectedAgents.length === 0
    const autoAssignPrompts = selectedPrompts.length === 0
    const activeAgents = autoAssignAgents ? agents.slice(0, 3) : selectedAgents
    if (activeAgents.length === 0) {
      return null
    }
    const activePrompts = autoAssignPrompts ? prompts.slice(0, 3) : selectedPrompts

    const overview = {
      task: form.taskName.trim() || 'Unnamed Task',
      objective: form.objective.trim(),
      successCriteria: form.successCriteria.trim(),
      owner: form.owner.trim() || undefined,
      priority: form.priority,
      dueDate: form.dueDate || undefined,
      notes: form.notes.trim() || undefined,
    }

    const assignments = activeAgents.map((agent) => {
      const focusAreas = agent.triggers.slice(0, 2).join('; ') || 'mission scope'
      const promptTargets = activePrompts
        .slice(0, 3)
        .map((p) => p.title || p.id)
        .join(', ')
      return {
        agentId: agent.id,
        agentName: agent.name,
        assignment: [
          agent.mission || agent.purpose || 'Execute mission scope',
          focusAreas ? `Focus areas: ${focusAreas}` : null,
          promptTargets ? `Related prompts: ${promptTargets}` : null,
        ]
          .filter(Boolean)
          .join(' | '),
        handoff: agent.handoff || 'Report back to supervisor when complete.',
      }
    })

    return {
      overview,
      assignments,
      prompts: activePrompts.map((prompt) => ({
        id: prompt.id,
        title: prompt.title,
        category: prompt.category,
      })),
      autoSelections: {
        agents: autoAssignAgents,
        prompts: autoAssignPrompts && activePrompts.length > 0,
      },
    }
  }, [form, selectedAgents, selectedPrompts, agents, prompts])

  function buildManifest() {
    if (!supervisorPlan) return null
    const generatedAt = new Date().toISOString()
    return {
      supervisor: {
        ...supervisorPlan.overview,
        generatedAt,
      },
      agents: supervisorPlan.assignments,
      prompts: supervisorPlan.prompts,
    }
  }

  function downloadManifest(manifestInput?: ReturnType<typeof buildManifest>) {
    const manifest = manifestInput ?? buildManifest()
    if (!manifest) return
    const blob = new window.Blob([JSON.stringify(manifest, null, 2)], {
      type: 'application/json',
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(form.taskName || 'orchestrator-task')
      .toLowerCase()
      .replace(/\s+/g, '-')}.manifest.json`
    link.click()
    window.URL.revokeObjectURL(url)
  }

  async function handleSubmitToOrchestrator() {
    const manifest = buildManifest()
    if (!manifest) return

    if (!API_BASE) {
      downloadManifest(manifest)
      setSubmitState('success')
      setSubmitMessage('Manifest downloaded. Set VITE_API_BASE to send directly to the orchestrator.')
      return
    }

    setSubmitState('pending')
    setSubmitMessage('Sending manifest to orchestrator…')
    try {
      const response = await fetch(`${API_BASE}/orchestrator/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manifest),
      })
      if (!response.ok) {
        throw new Error(`API responded with ${response.status}`)
      }
      const body = await response.json().catch(() => ({}))
      setSubmitState('success')
      setSubmitMessage(
        `Task queued${body.task_id ? ` as ${body.task_id}` : ''}.`
      )
      void refreshTaskQueue()
    } catch (error) {
      console.error('[orchestrator] Failed to send manifest:', error)
      setSubmitState('error')
      setSubmitMessage('Failed to reach orchestrator. Manifest downloaded locally.')
      downloadManifest(manifest)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Orchestrator Supervisor</h1>
          <p className="text-sm text-slate-600">
            Select agents and prompts, then generate a supervisor manifest that orchestrates the run.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            onClick={handleSubmitToOrchestrator}
            disabled={!supervisorPlan || submitState === 'pending'}
          >
            {API_BASE ? 'Send to Orchestrator' : 'Download Manifest'}
          </button>
          <button
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            onClick={() => downloadManifest()}
            disabled={!supervisorPlan}
          >
            Download JSON
          </button>
        </div>
      </div>
      {submitMessage && (
        <div
          className={`rounded-xl border px-3 py-2 text-sm ${
            submitState === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : submitState === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : 'border-slate-200 bg-white text-slate-600'
          }`}
        >
          {submitMessage}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <TaskDesigner
          loading={loading}
          form={form}
          onChange={(key, value) => setForm((prev) => ({ ...prev, [key]: value }))}
          agents={agents}
          prompts={prompts}
          selectedAgentIds={selectedAgentIds}
          selectedPromptIds={selectedPromptIds}
          onToggleAgent={(id) => toggleSelection(id, selectedAgentIds, setSelectedAgentIds)}
          onTogglePrompt={(id) => toggleSelection(id, selectedPromptIds, setSelectedPromptIds)}
        />
        <div className="space-y-4">
          <SupervisorPreview plan={supervisorPlan} />
          {API_BASE && (
            <TaskInbox
              tasks={taskQueue}
              loading={taskQueueLoading}
              onRefresh={refreshTaskQueue}
              onUpdate={async (taskId, status) => {
                try {
                  const response = await fetch(`${API_BASE}/orchestrator/tasks/${taskId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status }),
                  })
                  if (!response.ok) throw new Error(`API responded with ${response.status}`)
                  await refreshTaskQueue()
                } catch (error) {
                  console.warn('[orchestrator] Failed to update task:', error)
                  setSubmitState('error')
                  setSubmitMessage('Failed to update orchestrator task status.')
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function TaskDesigner({
  loading,
  form,
  onChange,
  agents,
  prompts,
  selectedAgentIds,
  selectedPromptIds,
  onToggleAgent,
  onTogglePrompt,
}: {
  loading: boolean
  form: {
    taskName: string
    objective: string
    successCriteria: string
    owner: string
    dueDate: string
    priority: Priority
    notes: string
  }
  onChange: <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => void
  agents: AgentInstruction[]
  prompts: PromptItem[]
  selectedAgentIds: string[]
  selectedPromptIds: string[]
  onToggleAgent: (id: string) => void
  onTogglePrompt: (id: string) => void
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <InputField
            label="Task Name"
            value={form.taskName}
            onChange={(value) => onChange('taskName', value)}
          />
          <InputField
            label="Owner"
            value={form.owner}
            onChange={(value) => onChange('owner', value)}
            placeholder="team@company.com"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <TextAreaField
            label="Objective"
            value={form.objective}
            onChange={(value) => onChange('objective', value)}
            rows={3}
          />
          <TextAreaField
            label="Success Criteria"
            value={form.successCriteria}
            onChange={(value) => onChange('successCriteria', value)}
            rows={3}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <SelectField
            label="Priority"
            value={form.priority}
            onChange={(value) => onChange('priority', value as Priority)}
            options={PRIORITIES.map((priority) => ({
              value: priority,
              label: priority,
            }))}
          />
          <InputField
            label="Due Date"
            type="date"
            value={form.dueDate}
            onChange={(value) => onChange('dueDate', value)}
          />
          <TextAreaField
            label="Supervisor Notes"
            value={form.notes}
            onChange={(value) => onChange('notes', value)}
            rows={1}
          />
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <SelectionList
          title="Agents"
          loading={loading}
          items={agents}
          selectedIds={selectedAgentIds}
          onToggle={onToggleAgent}
          renderDescription={(agent) =>
            agent.tags.length > 0 ? agent.tags.slice(0, 3).join(', ') : agent.status
          }
        />
        <SelectionList
          title="Prompts"
          loading={loading}
          items={prompts}
          selectedIds={selectedPromptIds}
          onToggle={onTogglePrompt}
          renderDescription={(prompt) => prompt.category || 'Uncategorized'}
        />
      </div>
    </div>
  )
}

function SelectionList<T extends { id: string; name?: string; title?: string }>({
  title,
  loading,
  items,
  selectedIds,
  onToggle,
  renderDescription,
}: {
  title: string
  loading: boolean
  items: T[]
  selectedIds: string[]
  onToggle: (id: string) => void
  renderDescription: (item: T) => string
}) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-slate-600">{title}</div>
      <div className="space-y-2 rounded-xl border border-slate-200 p-3 max-h-80 overflow-y-auto">
        {loading && <div className="text-sm text-slate-500">Loading…</div>}
        {!loading && items.length === 0 && (
          <div className="text-sm text-slate-500">No records available.</div>
        )}
        {!loading &&
          items.map((item) => {
            const label = item.name || (item as unknown as { title: string }).title || 'Untitled'
            return (
              <label
                key={item.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 text-sm ${
                  selectedIds.includes(item.id)
                    ? 'border-indigo-400 bg-indigo-50'
                    : 'border-transparent hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(item.id)}
                  onChange={() => onToggle(item.id)}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-slate-800">{label}</div>
                  <div className="text-xs text-slate-500">{renderDescription(item)}</div>
                </div>
              </label>
            )
          })}
      </div>
    </div>
  )
}

function SupervisorPreview({ plan }: { plan: SupervisorPlan | null }) {
  if (!plan) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
        Configure a task to see the supervisor plan. If you skip agent or prompt selection we will
        auto-pick recommended options.
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {(plan.autoSelections?.agents || plan.autoSelections?.prompts) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {[
            plan.autoSelections?.agents
              ? 'No agents were selected; the supervisor will auto-assign recommended operators.'
              : null,
            plan.autoSelections?.prompts
              ? 'No prompts were pinned; default launch-ready prompts were attached.'
              : null,
          ]
            .filter(Boolean)
            .join(' ')}
        </div>
      )}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Task Overview
        </div>
        <div className="mt-2 space-y-1 text-sm text-slate-700">
          <div>
            <span className="font-medium">Name: </span>
            {plan.overview.task}
          </div>
          <div>
            <span className="font-medium">Objective: </span>
            {plan.overview.objective || '—'}
          </div>
          {plan.overview.successCriteria && (
            <div>
              <span className="font-medium">Success Criteria: </span>
              {plan.overview.successCriteria}
            </div>
          )}
          <div className="flex gap-4">
            {plan.overview.owner && (
              <div>
                <span className="font-medium">Owner: </span>
                {plan.overview.owner}
              </div>
            )}
            {plan.overview.dueDate && (
              <div>
                <span className="font-medium">Due: </span>
                {plan.overview.dueDate}
              </div>
            )}
            <div>
              <span className="font-medium">Priority: </span>
              {plan.overview.priority}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Agent Assignments
        </div>
        <div className="mt-2 space-y-2">
          {plan.assignments.map((assignment) => (
            <div
              key={assignment.agentId}
              className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"
            >
              <div className="font-semibold text-slate-800">{assignment.agentName}</div>
              <div className="mt-1 text-slate-600">{assignment.assignment}</div>
              <div className="mt-2 text-xs text-slate-500">Handoff: {assignment.handoff}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Prompt Coverage
        </div>
        {plan.prompts.length === 0 ? (
          <div className="mt-2 text-sm text-slate-500">No prompts selected.</div>
        ) : (
          <ul className="mt-2 list-inside list-disc text-sm text-slate-600">
            {plan.prompts.map((prompt) => (
              <li key={prompt.id}>
                {prompt.title || prompt.id}
                {prompt.category ? ` — ${prompt.category}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function InputField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <label className="block text-sm font-medium text-slate-600">
      {label}
      <input
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
        type={type}
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
  rows = 2,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
}) {
  return (
    <label className="block text-sm font-medium text-slate-600">
      {label}
      <textarea
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

function isOrchestratorTask(value: unknown): value is OrchestratorTask {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as { id?: unknown }
  return typeof candidate.id === 'string'
}

function TaskInbox({
  tasks,
  loading,
  onRefresh,
  onUpdate,
}: {
  tasks: OrchestratorTask[]
  loading: boolean
  onRefresh: () => void
  onUpdate: (taskId: string, status: OrchestratorTask['status']) => Promise<void>
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-700">Task Inbox</div>
          <div className="text-xs text-slate-500">
            Latest supervisor manifests received by the orchestrator
          </div>
        </div>
        <button
          className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          onClick={onRefresh}
          disabled={loading}
        >
          Refresh
        </button>
      </div>
      {loading && <div className="text-sm text-slate-500">Loading tasks…</div>}
      {!loading && tasks.length === 0 && (
        <div className="text-sm text-slate-500">No tasks yet. Submit from the left panel.</div>
      )}
      <div className="space-y-3">
        {tasks.slice().reverse().map((task) => (
          <div key={task.id} className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between text-sm">
              <div>
                <div className="font-semibold text-slate-800">{task.supervisor?.task || task.id}</div>
                <div className="text-xs text-slate-500">
                  {task.supervisor?.objective || 'No objective provided.'}
                </div>
              </div>
              <select
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                value={task.status || 'queued'}
                onChange={(e) => void onUpdate(task.id, e.target.value as OrchestratorTask['status'])}
              >
                <option value="queued">Queued</option>
                <option value="running">Running</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Received{' '}
              {new Date(
                task.received_at || task.supervisor?.generatedAt || Date.now()
              ).toLocaleString()}
            </div>
            {task.notes && <div className="text-xs text-slate-500">Notes: {task.notes}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="block text-sm font-medium text-slate-600">
      {label}
      <select
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}





