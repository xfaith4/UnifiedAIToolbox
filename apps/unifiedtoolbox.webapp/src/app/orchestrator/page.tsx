'use client'

import { useEffect, useMemo, useState } from 'react'
import type { AgentInstruction } from '@/lib/types/agents' // This path is already correct, but good to confirm
import type { PromptItem } from '@/lib/types/prompts'
import type { OrchestrationRun } from '@/lib/types/orchestrator'
import { fetchAgentLibrary } from '@/lib/services/agentStore'
import { fetchPromptLibrary } from '@/lib/services/promptStore'
import { getChatCompletion } from '@/lib/services/ai'

export default function OrchestratorPage() {
  const [agents, setAgents] = useState<AgentInstruction[]>([])
  const [prompts, setPrompts] = useState<PromptItem[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null)
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [runs, setRuns] = useState<OrchestrationRun[]>([])
  const [isRunning, setIsRunning] = useState(false)

  useEffect(() => {
    async function loadLibraries() {
      const [agentData, promptData] = await Promise.all([
        fetchAgentLibrary(),
        fetchPromptLibrary(),
      ])
      setAgents(agentData)
      setPrompts(promptData)
      if (agentData.length > 0) setSelectedAgentId(agentData[0].id)
      if (promptData.length > 0) setSelectedPromptId(promptData[0].id)
    }
    void loadLibraries()
  }, [])

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedAgentId),
    [agents, selectedAgentId]
  )

  const selectedPrompt = useMemo(
    () => prompts.find((p) => p.id === selectedPromptId),
    [prompts, selectedPromptId]
  )

  function renderTemplate(): string {
    if (!selectedPrompt) return ''
    let tpl = selectedPrompt.template
    for (const v of selectedPrompt.variables ?? []) {
      const value = inputs[v.name] ?? v.default ?? ''
      tpl = tpl.replaceAll(`{{${v.name}}}`, value)
    }
    return tpl
  }

  async function handleRun() {
    if (!selectedAgent || !selectedPrompt) return

    setIsRunning(true)
    const finalPrompt = renderTemplate()
    const apiKey = localStorage.getItem('ai-toolbox-api-key') ?? undefined

    try {
      const result = await getChatCompletion(finalPrompt, apiKey)
      const run: OrchestrationRun = {
        id: `run_${Date.now()}`,
        agent: selectedAgent,
        prompt: selectedPrompt,
        inputs,
        output: result.output,
        tokens: result.tokens,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      }
      setRuns((prev) => [run, ...prev])
    } catch (error) {
      console.error('Orchestration failed:', error)
      window.alert('Failed to run orchestration. Check console for details.')
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Orchestrator</h1>
        <p className="text-sm text-slate-400">
          Combine agents and prompts to execute complex AI tasks.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr_1fr]">
        {/* Column 1: Selections */}
        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="font-semibold">1. Select Components</h2>
          <div>
            <label className="text-sm font-medium text-slate-300">Agent</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm"
              value={selectedAgentId ?? ''}
              onChange={(e) => setSelectedAgentId(e.target.value)}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300">Prompt</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm"
              value={selectedPromptId ?? ''}
              onChange={(e) => setSelectedPromptId(e.target.value)}
            >
              {prompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Column 2: Inputs */}
        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="font-semibold">2. Provide Inputs</h2>
          {(selectedPrompt?.variables ?? []).length === 0 && (
            <p className="text-sm text-slate-400">This prompt has no variables.</p>
          )}
          {selectedPrompt?.variables?.map((v) => (
            <div key={v.name}>
              <label className="text-sm font-medium text-slate-300">{v.label || v.name}</label>
              <textarea
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm"
                rows={v.type === 'multiline' ? 4 : 2}
                value={inputs[v.name] ?? v.default ?? ''}
                onChange={(e) => setInputs((p) => ({ ...p, [v.name]: e.target.value }))}
              />
            </div>
          ))}
          <button
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            onClick={handleRun}
            disabled={isRunning || !selectedAgent || !selectedPrompt}
          >
            {isRunning ? 'Running...' : 'Run Orchestration'}
          </button>
        </div>

        {/* Column 3: Results */}
        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="font-semibold">3. View Results</h2>
          {runs.length === 0 && (
            <p className="text-sm text-slate-400">No runs yet. Configure and run an orchestration.</p>
          )}
          <div className="space-y-4 max-h-[calc(100vh-250px)] overflow-y-auto">
            {runs.map((run) => (
              <div key={run.id} className="rounded-xl bg-slate-800/50 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{run.prompt.title}</div>
                  <div className="text-xs text-slate-400">
                    {run.tokens?.total} tokens
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-200">{run.output}</p>
                <div className="mt-2 text-right text-xs text-slate-500">
                  {new Date(run.completedAt).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
