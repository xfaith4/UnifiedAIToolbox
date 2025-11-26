import React, { useEffect, useState } from 'react'
import { addRun, listRuns, type OrchestrationRun } from '../services/orchestratorStore'
import { fetchPromptLibrary, PROMPT_API_BASE, type PromptItem } from '../services/promptStore'
import { loadDatasets, type DatasetEntry } from '../services/datasetStore'
import { listAgents, upsertAgent, type AgentDefinition } from '../services/agentStore'
import { createRunApi, fetchRunApi, fetchRunsApi, fetchRunLogApi } from '../services/orchestratorApi'
import { Sparkles, Plus, X, Check, Lightbulb, Users } from 'lucide-react'

export default function OrchestratorPage() {
  const [runs, setRuns] = useState<OrchestrationRun[]>([])
  const [prompts, setPrompts] = useState<PromptItem[]>([])
  const [datasets, setDatasets] = useState<DatasetEntry[]>([])
  const [agents, setAgents] = useState<AgentDefinition[]>([])
  const [logRun, setLogRun] = useState<OrchestrationRun | null>(null)
  const [logText, setLogText] = useState<string>('')
  const [logError, setLogError] = useState<string>('')
  const [logLoading, setLogLoading] = useState(false)
  const [logEvents, setLogEvents] = useState<OrchestrationRun['events']>([])
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [showAgentCreator, setShowAgentCreator] = useState(false)
  const [newAgent, setNewAgent] = useState<AgentDefinition>({
    name: '',
    role: 'system',
    prompt: '',
    description: '',
  })
  const [form, setForm] = useState<OrchestrationRun>({
    prompt_id: '',
    version: '',
    review_policy: 'standard',
    status: 'queued',
    dataset_id: '',
    dataset_name: '',
    goal: '',
    run_mode: 'multi-agent',
  })

  useEffect(() => {
    const loadAll = async () => {
      if (PROMPT_API_BASE) {
        try {
          const apiRuns = await fetchRunsApi()
          setRuns(apiRuns)
        } catch {
          setRuns(listRuns())
        }
      } else {
        setRuns(listRuns())
      }
      fetchPromptLibrary().then(setPrompts).catch(() => setPrompts([]))
      setDatasets(loadDatasets())
      setAgents(listAgents())
    }
    void loadAll()

    const id = window.setInterval(() => {
      if (PROMPT_API_BASE) {
        fetchRunsApi()
          .then(setRuns)
          .catch(() => setRuns(listRuns()))
      } else {
        setRuns(listRuns())
      }
    }, 4000)
    return () => window.clearInterval(id)
  }, [])

  const handlePromptSelect = (promptId: string) => {
    const selected = prompts.find((p) => p.id === promptId)
    setForm((f) => ({
      ...f,
      prompt_id: promptId,
      version: selected?.version || f.version,
    }))
  }

  const handleDatasetSelect = (datasetId: string) => {
    const ds = datasets.find((d) => d.id === datasetId)
    setForm((f) => ({
      ...f,
      dataset_id: datasetId || undefined,
      dataset_name: ds?.name || '',
    }))
  }

  const toggleAgentSelection = (agentName: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentName)
        ? prev.filter((n) => n !== agentName)
        : [...prev, agentName]
    )
  }

  const recommendAgents = (goal: string): string[] => {
    if (!goal.trim()) return []
    const goalLower = goal.toLowerCase()
    const recommendations: string[] = []
    
    // Basic keyword matching for agent recommendation
    if (goalLower.includes('research') || goalLower.includes('analyze') || goalLower.includes('investigate')) {
      recommendations.push('Researcher')
    }
    if (goalLower.includes('implement') || goalLower.includes('code') || goalLower.includes('build')) {
      recommendations.push('Engineer')
    }
    if (goalLower.includes('review') || goalLower.includes('test') || goalLower.includes('validate')) {
      recommendations.push('Critic')
    }
    if (goalLower.includes('combine') || goalLower.includes('merge') || goalLower.includes('integrate')) {
      recommendations.push('Synthesizer')
    }
    if (goalLower.includes('evaluate') || goalLower.includes('assess') || goalLower.includes('judge')) {
      recommendations.push('Commissioner')
    }
    
    // If no specific keywords, suggest a basic workflow
    if (recommendations.length === 0) {
      recommendations.push('Researcher', 'Engineer', 'Critic', 'Synthesizer')
    }
    
    return recommendations.filter((name) => agents.some((a) => a.name === name))
  }

  const handleSuggestAgents = () => {
    const suggested = recommendAgents(form.goal || '')
    setSelectedAgents(suggested)
  }

  const handleCreateAgent = () => {
    if (!newAgent.name.trim() || !newAgent.prompt?.trim()) {
      alert('Agent name and prompt are required')
      return
    }
    const updated = upsertAgent(newAgent)
    setAgents(updated)
    setSelectedAgents((prev) => [...prev, newAgent.name])
    setNewAgent({ name: '', role: 'system', prompt: '', description: '' })
    setShowAgentCreator(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.goal?.trim() && !form.prompt_id.trim()) {
      alert('Please provide either a goal or select a prompt')
      return
    }
    const entry: OrchestrationRun = {
      run_id: form.run_mode === 'codex-swarm' ? `codex-${Date.now()}` : `multi-agent-${Date.now()}`,
      ...form,
      status: 'queued', // always system-managed
      requested_at: new Date().toISOString(),
      agents: selectedAgents.length > 0 ? selectedAgents : undefined,
    }

    const launch = async () => {
      if (PROMPT_API_BASE) {
        try {
          const apiRun = await createRunApi(entry)
          setRuns((prev) => [apiRun, ...prev])
        } catch (err) {
          console.warn('API launch failed, falling back to local', err)
          const merged = addRun(entry)
          setRuns(merged)
          // simulate completion in local mode
          window.setTimeout(() => {
            setRuns((prev) =>
              prev.map((r) =>
                r.run_id === entry.run_id ? { ...r, status: 'completed', mode: 'simulated' } : r
              )
            )
          }, 2500)
        }
      } else {
        const merged = addRun(entry)
        setRuns(merged)
        // simulate completion in local mode
        window.setTimeout(() => {
          setRuns((prev) =>
            prev.map((r) =>
              r.run_id === entry.run_id ? { ...r, status: 'completed', mode: 'simulated' } : r
            )
          )
        }, 2500)
      }
      setForm({
        prompt_id: '',
        version: '',
        review_policy: 'standard',
        status: 'queued',
        dataset_id: '',
        dataset_name: '',
        goal: '',
        run_mode: 'multi-agent',
      })
      setSelectedAgents([])
    }
    void launch()
  }

  const fetchLogBundle = async (run: OrchestrationRun, silent = false) => {
    if (!run) return
    if (!silent) setLogLoading(true)
    setLogError('')
    try {
      if (run.run_id && PROMPT_API_BASE) {
        const latest = await fetchRunApi(run.run_id)
        setLogRun(latest)
        setLogEvents(latest.events ?? [])

        let manifestText = JSON.stringify(latest, null, 2)
        try {
          const logResp = await fetchRunLogApi(run.run_id)
          if (logResp?.log) {
            manifestText = `${manifestText}\n\n--- LOG ---\n${logResp.log}`
          }
        } catch {
          // log fetch can fail independently; keep manifest text
        }
        setLogText(manifestText)
      } else {
        setLogText(JSON.stringify(run, null, 2))
        setLogEvents(run.events ?? [])
      }
    } catch (err) {
      setLogError(err instanceof Error ? err.message : 'Failed to fetch run')
      setLogText(JSON.stringify(run, null, 2))
      setLogEvents(run.events ?? [])
    } finally {
      if (!silent) setLogLoading(false)
    }
  }

  const handleLogs = async (run: OrchestrationRun) => {
    setLogRun(run)
    setLogText('')
    setLogEvents([])
    await fetchLogBundle(run)
  }

  useEffect(() => {
    if (!logRun || !PROMPT_API_BASE) return
    const id = window.setInterval(() => {
      void fetchLogBundle(logRun, true)
    }, 4000)
    return () => {
      window.clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logRun?.run_id])

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-blue-400" />
            <h1 className="text-2xl font-bold">AI Orchestration</h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Transform high-level ideas into results through intelligent multi-agent collaboration
          </p>
          {!PROMPT_API_BASE && (
            <p className="text-xs text-amber-400">
              No API configured; runs are stored locally. Set VITE_API_URL to trigger backend execution.
            </p>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border-2 border-blue-500/30 bg-slate-900/60 p-6 shadow-lg"
        >
          {/* High-Level Goal Input */}
          <div className="space-y-2">
            <label className="text-base font-semibold text-slate-200 flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-yellow-400" />
              What do you want to accomplish?
            </label>
            <textarea
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              rows={4}
              placeholder="Describe your goal in natural language. Example: 'I need to analyze user feedback and generate a summary report with key insights and recommendations'"
              value={form.goal || ''}
              onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))}
              required
            />
            <p className="text-xs text-slate-400">
              The orchestrator will analyze your goal and automatically select or create the right agents to help you achieve it.
            </p>
          </div>

          {/* Agent Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-base font-semibold text-slate-200 flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-400" />
                Agent Team ({selectedAgents.length} selected)
              </label>
              <button
                type="button"
                onClick={handleSuggestAgents}
                className="flex items-center gap-1 rounded-lg border border-blue-700 bg-blue-800/30 px-3 py-1.5 text-xs font-medium text-blue-200 hover:bg-blue-700/40"
              >
                <Sparkles className="h-3 w-3" />
                Auto-suggest agents
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
              {agents.map((agent) => (
                <button
                  key={agent.name}
                  type="button"
                  onClick={() => toggleAgentSelection(agent.name)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    selectedAgents.includes(agent.name)
                      ? 'border-blue-500 bg-blue-900/40 text-blue-100'
                      : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <span className="truncate">{agent.name}</span>
                  {selectedAgents.includes(agent.name) && <Check className="h-4 w-4 text-blue-400" />}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowAgentCreator(true)}
                className="flex items-center gap-1 rounded-lg border border-green-700 bg-green-800/30 px-3 py-1.5 text-xs font-medium text-green-200 hover:bg-green-700/40"
              >
                <Plus className="h-3 w-3" />
                Create ad-hoc agent
              </button>
            </div>
          </div>

          {/* Advanced Options (Collapsible) */}
          <details className="space-y-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-300 hover:text-slate-100">
              Advanced Options
            </summary>
            <div className="grid gap-3 pt-2 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Prompt (optional)</label>
                <select
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                  value={form.prompt_id}
                  onChange={(e) => handlePromptSelect(e.target.value)}
                >
                  <option value="">None</option>
                  {prompts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title || p.id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Dataset</label>
                <select
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                  value={form.dataset_id || ''}
                  onChange={(e) => handleDatasetSelect(e.target.value)}
                >
                  <option value="">None</option>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Engine</label>
                <select
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                  value={form.run_mode || 'multi-agent'}
                  onChange={(e) => setForm((f) => ({ ...f, run_mode: e.target.value }))}
                >
                  <option value="multi-agent">Multi-Agent</option>
                  <option value="codex-swarm">Codex Swarm</option>
                  <option value="default">Default</option>
                </select>
              </div>
            </div>
          </details>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-500 transition-colors shadow-lg"
            >
              <Sparkles className="h-4 w-4" />
              Launch Orchestration
            </button>
            <button
              type="button"
              onClick={() => {
                setForm({
                  prompt_id: '',
                  version: '',
                  review_policy: 'standard',
                  status: 'queued',
                  dataset_id: '',
                  dataset_name: '',
                  goal: '',
                  run_mode: 'multi-agent',
                })
                setSelectedAgents([])
              }}
              className="rounded-lg border border-slate-700 px-6 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800"
            >
              Reset
            </button>
          </div>
        </form>

        {/* Orchestration History */}
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-200">Recent Orchestrations</h2>
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 shadow">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-800/70 text-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left">Goal</th>
                  <th className="px-4 py-3 text-left">Agents</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Engine</th>
                  <th className="px-4 py-3 text-left">Requested</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run, idx) => (
                  <tr
                    key={run.run_id || `${run.prompt_id}-${run.version || ''}-${idx}`}
                    className="border-t border-slate-800 hover:bg-slate-800/30"
                  >
                    <td className="px-4 py-3 text-slate-100 max-w-xs">
                      <div className="truncate" title={run.goal || run.prompt_id}>
                        {run.goal || run.prompt_id}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {run.agents && run.agents.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {run.agents.slice(0, 3).map((agent) => (
                            <span key={agent} className="rounded bg-blue-900/40 px-1.5 py-0.5 text-xs text-blue-200">
                              {agent}
                            </span>
                          ))}
                          {run.agents.length > 3 && (
                            <span className="text-xs text-slate-400">+{run.agents.length - 3}</span>
                          )}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-200">
                        {run.status || 'unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs">
                      {run.run_mode || 'default'}
                      {run.mode === 'simulated' && <span className="text-amber-400"> (sim)</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs">
                      {run.requested_at ? new Date(run.requested_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
                        onClick={() => handleLogs(run)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
                {runs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      No orchestrations yet. Start your first one above!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Ad-hoc Agent Creator Modal */}
      {showAgentCreator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-800 bg-slate-900 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                <Plus className="h-5 w-5 text-green-400" />
                Create Ad-Hoc Agent
              </h3>
              <button
                onClick={() => setShowAgentCreator(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Agent Name</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g., Data Analyst"
                  value={newAgent.name}
                  onChange={(e) => setNewAgent((a) => ({ ...a, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Role</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="system"
                  value={newAgent.role || 'system'}
                  onChange={(e) => setNewAgent((a) => ({ ...a, role: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">System Prompt / Instructions</label>
                <textarea
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  rows={6}
                  placeholder="Describe the agent's role, capabilities, and instructions..."
                  value={newAgent.prompt || ''}
                  onChange={(e) => setNewAgent((a) => ({ ...a, prompt: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Description (optional)</label>
                <textarea
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  rows={2}
                  placeholder="Brief description of what this agent does..."
                  value={newAgent.description || ''}
                  onChange={(e) => setNewAgent((a) => ({ ...a, description: e.target.value }))}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleCreateAgent}
                  className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500"
                >
                  <Check className="h-4 w-4" />
                  Create & Add to Team
                </button>
                <button
                  onClick={() => setShowAgentCreator(false)}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
              <p className="text-xs text-slate-400">
                This agent will be saved to your agent library and automatically added to the current orchestration team.
              </p>
            </div>
          </div>
        </div>
      )}

      {logRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
        <div className="w-full max-w-6xl rounded-xl border border-slate-800 bg-slate-900 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <div className="text-sm font-semibold text-slate-100 flex flex-col gap-1">
              <span>
                Run logs: {logRun.prompt_id} ({logRun.run_mode || 'default'})
              </span>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-100">
                  {logRun.status || 'unknown'}
                </span>
                {logRun.model && (
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-100">
                    Model: {logRun.model}
                  </span>
                )}
                {logRun.goal && (
                  <span className="line-clamp-1 text-slate-400">Goal: {logRun.goal}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {logRun.mode === 'simulated' && (
                <span className="text-[11px] text-amber-400">Simulated (orchestrator missing)</span>
              )}
              {logRun.run_id && PROMPT_API_BASE && (
                <button
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
                  onClick={() => fetchLogBundle(logRun)}
                  disabled={logLoading}
                >
                  {logLoading ? 'Refreshing…' : 'Refresh log'}
                </button>
              )}
              <button
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
                onClick={() => setLogRun(null)}
              >
                Close
              </button>
            </div>
          </div>
          <div className="px-4 py-3 text-xs text-slate-300 flex flex-col md:flex-row gap-4">
            <div className="w-full md:w-1/3">
              <div className="font-semibold text-slate-100 mb-2">Events</div>
              <div className="max-h-[60vh] overflow-auto space-y-2">
                {logEvents && logEvents.length > 0 ? (
                  logEvents.map((ev, idx) => (
                    <div key={idx} className="rounded border border-slate-800 bg-slate-950 p-2">
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>{ev.type}</span>
                        <span>{ev.ts}</span>
                      </div>
                      <div className="text-slate-100 text-xs whitespace-pre-wrap">{ev.message}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-500">No events.</div>
                )}
              </div>
            </div>
            <div className="w-full md:w-2/3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-100 mb-2">Manifest / Logs</div>
                <div className="text-xs text-slate-400">
                  {logLoading ? 'Loading…' : logError ? logError : ''}
                </div>
              </div>
              <pre className="max-h-[60vh] overflow-auto bg-slate-950 px-4 py-3 text-xs text-slate-200 whitespace-pre-wrap">
                {logText}
              </pre>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
