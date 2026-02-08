'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import type { AgentInstruction } from '@/lib/types/agents'
import type { PromptItem } from '@/lib/types/prompts'
import type {
  OrchestrationRun,
  OrchestrationForm,
  OrchestratorAgent,
  RepoOrchestrationEvent,
  RepoOrchestrationRequest,
  RepoOrchestrationResult,
} from '@/lib/types/orchestrator'
import { fetchAgentLibrary } from '@/lib/services/agentStore'
import { fetchPromptLibrary } from '@/lib/services/promptStore'
import { getChatCompletion } from '@/lib/services/ai'
import { calculateCost } from '@/lib/config/modelPricing'
import {
  createOrchestrationRun,
  fetchOrchestrationRuns,
  fetchOrchestrationRun,
  fetchOrchestrationRunLog,
  validateApiConnection,
  ORCHESTRATOR_API_BASE,
  ORCHESTRATOR_API_USING_DEFAULT_BASE,
  startRepoOrchestration,
  cancelRepoOrchestration,
} from '@/lib/services/orchestratorApi'
import {
  listLocalRuns,
  addLocalRun,
  updateLocalRun,
  createNewRun,
} from '@/lib/services/orchestratorStore'
import { runLocalSwarm } from '@/lib/services/swarmRunner'
import AgentActivityTally from '@/components/orchestration/AgentActivityTally'

// Default agents for multi-agent orchestration
const DEFAULT_ORCHESTRATOR_AGENTS: OrchestratorAgent[] = [
  { name: 'Supervisor', role: 'system', description: 'Directs the swarm and enforces quality gates' },
  { name: 'Researcher', role: 'system', description: 'Investigates and gathers information' },
  { name: 'Engineer', role: 'system', description: 'Implements solutions and writes code' },
  { name: 'Critic', role: 'system', description: 'Reviews and validates work' },
  { name: 'Synthesizer', role: 'system', description: 'Combines outputs into coherent results' },
  { name: 'Commissioner', role: 'system', description: 'Evaluates and makes final decisions' },
  { name: 'Historian', role: 'system', description: 'Captures durable run knowledge for reuse' },
]

const CARD_SHELL =
  'rounded-3xl border border-slate-800 bg-slate-900/60 shadow-[0_25px_45px_rgba(2,6,23,0.75)]'
const CARD_PADDING = 'p-5'
const HIGHLIGHT_CARD =
  'rounded-3xl border border-blue-500/40 bg-gradient-to-br from-blue-900/70 to-slate-950/80 shadow-[0_30px_55px_rgba(15,23,42,0.7)] p-6'
const MODAL_PANEL = 'w-full max-w-3xl rounded-3xl border border-slate-800 bg-slate-900/90 shadow-2xl'
const OVERLAY = 'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4'

const SWARM_WORKFLOW_STEPS = [
  {
    title: 'Supervisor frames the swarm objective',
    detail: 'Convert the user goal into a focused swarm plan with success criteria and guardrails.',
  },
  {
    title: 'Parallel specialist swarm',
    detail: 'Research, engineering, and critique agents work concurrently on scoped tasks.',
  },
  {
    title: 'Synthesis and validation',
    detail: 'The supervisor consolidates outputs, resolves conflicts, and validates quality.',
  },
]

const SWARM_SAMPLE_RUN = {
  goal: 'Draft a release note and migration checklist for the new swarming feature.',
  agents: ['Supervisor', 'Researcher', 'Engineer', 'Critic', 'Synthesizer'],
  status: 'completed',
  duration: '2m 18s',
  inputTokens: 5200,
  outputTokens: 3000,
  engine: 'codex-swarm',
  model: '',
}

const SWARM_SUPERVISOR_USES = [
  'Trigger swarm mode when tasks are parallelizable or need independent opinions.',
  'Set round limits and stop conditions to prevent over-spend.',
  'Assign a synthesizer pass to unify tone and reduce contradictions.',
]

const SWARM_USE_CASES = [
  'Rapid design reviews with multiple perspectives',
  'Research synthesis across disparate sources',
  'Large refactor planning with risk checks',
  'Policy or compliance drafting with critique loops',
]

const SWARM_COST_BASELINE = {
  label: 'Small swarm baseline',
  agents: 4,
  rounds: 2,
  inputTokens: 6000,
  outputTokens: 2000,
}

const SWARM_COST_MODELS = ['gpt-4o-mini', 'gpt-4-turbo', 'claude-3.5-sonnet'] as const
const SWARM_LAUNCH_NOTE = 'Launching swarm via scripts/swarms…'

export default function OrchestratorPage() {
  // Libraries
  const [agents, setAgents] = useState<AgentInstruction[]>([])
  const [orchestratorAgents, setOrchestratorAgents] = useState<OrchestratorAgent[]>(DEFAULT_ORCHESTRATOR_AGENTS)
  const [prompts, setPrompts] = useState<PromptItem[]>([])

  // Form state
  const [form, setForm] = useState<OrchestrationForm>({
    goal: '',
    promptId: '',
    version: '',
    reviewPolicy: 'standard',
    datasetId: '',
    datasetName: '',
    runMode: 'multi-agent',
    agents: [],
    model: '',
  })
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])

  // Run state
  const [runs, setRuns] = useState<OrchestrationRun[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [repoForm, setRepoForm] = useState<RepoOrchestrationRequest>({
    repo: '',
    goal: '',
    options: { allowed_paths: ['.'] },
  })
  const [repoEvents, setRepoEvents] = useState<RepoOrchestrationEvent[]>([])
  const [repoResult, setRepoResult] = useState<RepoOrchestrationResult | null>(null)
  const [repoRunId, setRepoRunId] = useState<string | null>(null)
  const [repoRunning, setRepoRunning] = useState(false)
  const [cancelRepoHandler, setCancelRepoHandler] = useState<(() => void) | null>(null)
  const [repoError, setRepoError] = useState<string>('')
  const [swarmStatus, setSwarmStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle')
  const [swarmOutput, setSwarmOutput] = useState('')
  const [swarmError, setSwarmError] = useState('')
  const [swarmSessionAgents, setSwarmSessionAgents] = useState<string[]>([])
  const [swarmSessionModel, setSwarmSessionModel] = useState<string>('')

  // Modal state
  const [showAgentCreator, setShowAgentCreator] = useState(false)
  const [newAgent, setNewAgent] = useState<OrchestratorAgent>({ name: '', role: 'system', prompt: '', description: '' })
  const [logRun, setLogRun] = useState<OrchestrationRun | null>(null)
  const [logText, setLogText] = useState('')
  const [logLoading, setLogLoading] = useState(false)
  const [logError, setLogError] = useState('')

  // Legacy mode state
  const [legacyMode, setLegacyMode] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null)
  const [inputs, setInputs] = useState<Record<string, string>>({})

  // Connection state
  const [apiConnected, setApiConnected] = useState<boolean | null>(null) // null = checking, true = connected, false = disconnected
  const [apiError, setApiError] = useState<string>('')

  const checkConnection = useCallback(async () => {
    setApiConnected(null)
    const result = await validateApiConnection()
    setApiConnected(result.ok)
    if (!result.ok) {
      setApiError(result.error || 'Unknown error')
      console.error('[Orchestrator] API connection failed:', result.error)
    } else {
      setApiError('')
    }
  }, [])

  // Check API connection on mount
  useEffect(() => {
    void checkConnection()
  }, [checkConnection])

  // Load libraries on mount
  useEffect(() => {
    async function loadAll() {
      const [agentData, promptData] = await Promise.all([
        fetchAgentLibrary(),
        fetchPromptLibrary(),
      ])
      setAgents(agentData)
      setPrompts(promptData)
      if (agentData.length > 0) setSelectedAgentId(agentData[0].id)
      if (promptData.length > 0) setSelectedPromptId(promptData[0].id)

      // Load runs
      if (ORCHESTRATOR_API_BASE && apiConnected === true) {
        try {
          const apiRuns = await fetchOrchestrationRuns()
          setRuns(apiRuns)
        } catch {
          setRuns(listLocalRuns())
        }
      } else {
        setRuns(listLocalRuns())
      }
    }
    void loadAll()
  }, [apiConnected, fetchAgentLibrary, fetchPromptLibrary, fetchOrchestrationRuns, listLocalRuns])

  // Polling for run updates
  useEffect(() => {
    if (!ORCHESTRATOR_API_BASE || apiConnected !== true) {
      setRuns(listLocalRuns())
      return
    }
    const interval = setInterval(() => {
      fetchOrchestrationRuns()
        .then(setRuns)
        .catch(() => setRuns(listLocalRuns()))
    }, 5000)
    return () => clearInterval(interval)
  }, [apiConnected, fetchOrchestrationRuns, listLocalRuns])

  // Memoized selections
  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedAgentId),
    [agents, selectedAgentId]
  )

  const selectedPrompt = useMemo(
    () => prompts.find((p) => p.id === selectedPromptId),
    [prompts, selectedPromptId]
  )

  const swarmRun = useMemo(() => {
    const swarms = runs.filter((run) => run.runMode === 'codex-swarm')
    if (swarms.length === 0) return null
    return [...swarms].sort((a, b) => {
      const aTime = Date.parse(a.completedAt || a.startedAt || a.requestedAt || '') || 0
      const bTime = Date.parse(b.completedAt || b.startedAt || b.requestedAt || '') || 0
      return bTime - aTime
    })[0]
  }, [runs])

  const swarmRunDisplay = useMemo(() => {
    if (!swarmRun) return SWARM_SAMPLE_RUN
    const inputTokens = swarmRun.tokens?.prompt ?? 0
    const outputTokens = swarmRun.tokens?.completion ?? 0
    return {
      goal: swarmRun.goal || SWARM_SAMPLE_RUN.goal,
      agents: swarmRun.agents && swarmRun.agents.length > 0 ? swarmRun.agents : SWARM_SAMPLE_RUN.agents,
      status: swarmRun.status || 'completed',
      duration: swarmRun.completedAt && swarmRun.startedAt
        ? `${Math.max(1, Math.round((Date.parse(swarmRun.completedAt) - Date.parse(swarmRun.startedAt)) / 1000 / 60))}m`
        : SWARM_SAMPLE_RUN.duration,
      inputTokens: inputTokens || SWARM_SAMPLE_RUN.inputTokens,
      outputTokens: outputTokens || SWARM_SAMPLE_RUN.outputTokens,
      engine: swarmRun.runMode || SWARM_SAMPLE_RUN.engine,
      model: swarmRun.model,
    }
  }, [swarmRun])

  const handleRunSampleSwarm = async () => {
    const availableAgents = new Set(orchestratorAgents.map((agent) => agent.name))
    const selected = swarmRunDisplay.agents.filter((agent) => availableAgents.has(agent))
    setLegacyMode(false)
    setForm((prev) => ({
      ...prev,
      goal: swarmRunDisplay.goal,
      runMode: 'codex-swarm',
      agents: [],
      model: swarmRunDisplay.model || '',
    }))
    setSelectedAgents(selected)

    const runModel = swarmRunDisplay.model || form.model || ''
    const seededRun: OrchestrationRun = {
      ...createNewRun(swarmRunDisplay.goal, {
        runMode: 'codex-swarm',
        agents: selected,
        model: runModel,
      }),
      status: 'running',
      startedAt: new Date().toISOString(),
    }
    setSwarmStatus('running')
    setSwarmOutput(SWARM_LAUNCH_NOTE)
    setSwarmError('')
    setSwarmSessionAgents(selected)
    setSwarmSessionModel(runModel)
    addLocalRun(seededRun)
    setRuns((prev) => [seededRun, ...prev])

    try {
      const result = await runLocalSwarm({
        goal: swarmRunDisplay.goal,
        agents: selected,
        model: runModel || undefined,
      })
      const completedAt = result.completedAt || new Date().toISOString()
      const fallbackOutput = 'Swarm completed successfully'
      const output =
        typeof result.output === 'string'
          ? result.output
          : JSON.stringify(result.output ?? result.status ?? fallbackOutput, null, 2)
      const completedRun: OrchestrationRun = {
        ...seededRun,
        status: result.status || 'completed',
        completedAt,
        output,
        mode: 'executed',
      }
      updateLocalRun(seededRun.id, completedRun)
      setRuns((prev) => prev.map((r) => (r.id === seededRun.id ? completedRun : r)))
      setSwarmStatus(result.status === 'failed' ? 'failed' : 'completed')
      setSwarmOutput(output)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to run swarm'
      const failedRun: OrchestrationRun = {
        ...seededRun,
        status: 'failed',
        completedAt: new Date().toISOString(),
        output: message,
        mode: 'executed',
      }
      updateLocalRun(seededRun.id, failedRun)
      setRuns((prev) => prev.map((r) => (r.id === seededRun.id ? failedRun : r)))
      setSwarmStatus('failed')
      setSwarmError(message)
    }
  }

  const swarmCostEstimates = useMemo(() => {
    return SWARM_COST_MODELS.map((model) => ({
      model,
      cost: calculateCost(model, SWARM_COST_BASELINE.inputTokens, SWARM_COST_BASELINE.outputTokens),
    }))
  }, [])

  const hasSwarmRun = Boolean(swarmRun)

  const runningRuns = useMemo(() => {
    const liveStates = new Set(['queued', 'running'])
    return runs.filter((run) => liveStates.has((run.status || '').toLowerCase()))
  }, [runs])

  type SessionStats = {
    totalAgents: number
    modelCounts: { model: string; count: number }[]
    agentModels: { agent: string; model: string }[]
  }

  const computeSessionStats = (agentNames: string[] | undefined, defaultModel: string | undefined): SessionStats => {
    const agents = Array.from(new Set((agentNames ?? []).filter(Boolean)))
    const resolvedDefaultModel = defaultModel?.trim() || 'unknown'

    const agentModels = agents
      .map((agent) => ({ agent, model: resolvedDefaultModel }))
      .sort((a, b) => a.agent.localeCompare(b.agent))

    const byModel = new Map<string, number>()
    for (const entry of agentModels) {
      byModel.set(entry.model, (byModel.get(entry.model) ?? 0) + 1)
    }
    const modelCounts = Array.from(byModel.entries())
      .map(([model, count]) => ({ model, count }))
      .sort((a, b) => b.count - a.count || a.model.localeCompare(b.model))

    return {
      totalAgents: agentModels.length,
      modelCounts,
      agentModels,
    }
  }

  const SessionStatisticsPanel = ({
    agents,
    model,
  }: {
    agents: string[] | undefined
    model: string | undefined
  }) => {
    const stats = computeSessionStats(agents, model)

    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-100">Session Statistics</div>
          <div className="text-[11px] text-slate-400">
            Total agents: <span className="font-semibold text-slate-200">{stats.totalAgents}</span>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Count per model</div>
            <div className="mt-1 space-y-1 text-xs text-slate-200">
              {stats.modelCounts.length > 0 ? (
                stats.modelCounts.map((row) => (
                  <div key={row.model} className="flex items-center justify-between gap-3 rounded-lg bg-slate-900/60 px-2 py-1">
                    <span className="font-mono text-[11px] text-slate-100">{row.model}</span>
                    <span className="text-slate-300">{row.count} agent{row.count === 1 ? '' : 's'}</span>
                  </div>
                ))
              ) : (
                <div className="text-slate-400">—</div>
              )}
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Model per agent</div>
            <div className="mt-1 max-h-28 overflow-auto space-y-1 text-xs text-slate-200">
              {stats.agentModels.length > 0 ? (
                stats.agentModels.map((row) => (
                  <div key={row.agent} className="flex items-center justify-between gap-3 rounded-lg bg-slate-900/60 px-2 py-1">
                    <span className="text-slate-200">{row.agent}</span>
                    <span className="font-mono text-[11px] text-slate-300">{row.model}</span>
                  </div>
                ))
              ) : (
                <div className="text-slate-400">—</div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Template rendering for legacy mode
  function renderTemplate(): string {
    if (!selectedPrompt) return ''
    let tpl = selectedPrompt.template
    for (const v of selectedPrompt.variables ?? []) {
      const value = inputs[v.name] ?? v.default ?? ''
      tpl = tpl.replaceAll(`{{${v.name}}}`, value)
    }
    return tpl
  }

  // Recommend agents based on goal keywords
  const recommendAgents = useCallback((goal: string): string[] => {
    if (!goal.trim()) return []
    const goalLower = goal.toLowerCase()
    const recommendations: string[] = []

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
    if (goalLower.includes('score') || goalLower.includes('quality') || goalLower.includes('postmortem')) {
      recommendations.push('Supervisor')
    }
    if (goalLower.includes('summary') || goalLower.includes('summarize') || goalLower.includes('history') || goalLower.includes('brief')) {
      recommendations.push('Historian')
    }

    // Default workflow if no specific keywords
    if (recommendations.length === 0) {
      recommendations.push('Researcher', 'Engineer', 'Critic', 'Synthesizer')
    }

    return recommendations.filter((name) => orchestratorAgents.some((a) => a.name === name))
  }, [orchestratorAgents])

  const handleSuggestAgents = () => {
    const suggested = recommendAgents(form.goal)
    setSelectedAgents(suggested)
  }

  const toggleAgentSelection = (agentName: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentName)
        ? prev.filter((n) => n !== agentName)
        : [...prev, agentName]
    )
  }

  // Create ad-hoc agent
  const handleCreateAgent = () => {
    if (!newAgent.name.trim() || !newAgent.prompt?.trim()) return

    setOrchestratorAgents((prev) => [...prev, newAgent])
    setSelectedAgents((prev) => [...prev, newAgent.name])
    setNewAgent({ name: '', role: 'system', prompt: '', description: '' })
    setShowAgentCreator(false)
  }

  // Launch repo orchestration (clone -> intake -> plan -> execute -> PR)
  const handleStartRepoOrchestration = async () => {
    if (!repoForm.repo.trim() || !repoForm.goal.trim()) {
      setRepoError('Repository and goal are required')
      return
    }

    setRepoRunning(true)
    setRepoError('')
    setRepoEvents([])
    setRepoResult(null)
    setRepoRunId(null)

    const payload: RepoOrchestrationRequest = {
      repo: repoForm.repo.trim(),
      goal: repoForm.goal.trim(),
      options: {
        ...repoForm.options,
        allowed_paths: repoForm.options?.allowed_paths?.map((p) => p.trim()).filter(Boolean),
      },
    }

    try {
      const { cancel } = await startRepoOrchestration(payload, (event) => {
        setRepoEvents((prev) => [...prev, event])
        if (event.run_id) setRepoRunId(event.run_id)
        if (event.result) {
          setRepoResult({
            runId: event.result.run_id || event.result.runId,
            prUrl: event.result.pr_url || event.result.prUrl,
            status: event.result.status,
            artifacts: event.result.artifacts,
          })
        }
        if (event.final || event.type === 'error') {
          setRepoRunning(false)
          setCancelRepoHandler(null)
        }
      })
      setCancelRepoHandler(() => cancel)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start repo orchestration'
      setRepoError(message)
      setRepoRunning(false)
    }
  }

  const handleCancelRepo = async () => {
    if (!repoRunId) return
    try {
      await cancelRepoOrchestration(repoRunId)
      cancelRepoHandler?.()
      setRepoRunning(false)
      setRepoEvents((prev) => [...prev, { type: 'status', message: 'Cancelled by user', run_id: repoRunId }])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cancel run'
      setRepoError(message)
    }
  }

  // Launch multi-agent orchestration
  async function handleMultiAgentRun(e: React.FormEvent) {
    e.preventDefault()
    if (!form.goal.trim()) return

    setIsRunning(true)
    const run = createNewRun(form.goal, {
      promptId: form.promptId,
      version: form.version,
      reviewPolicy: form.reviewPolicy,
      datasetId: form.datasetId,
      datasetName: form.datasetName,
      runMode: form.runMode,
      agents: selectedAgents.length > 0 ? selectedAgents : undefined,
      model: form.model,
    })

    try {
      if (ORCHESTRATOR_API_BASE) {
        const apiRun = await createOrchestrationRun(run)
        setRuns((prev) => [apiRun, ...prev])
      } else {
        // Local simulation
        addLocalRun(run)
        setRuns((prev) => [run, ...prev])

        // Simulate completion
        setTimeout(() => {
          updateLocalRun(run.id, { status: 'completed', mode: 'simulated' })
          setRuns((prev) =>
            prev.map((r) =>
              r.id === run.id ? { ...r, status: 'completed', mode: 'simulated' } : r
            )
          )
        }, 2500)
      }

      // Reset form
      setForm({
        goal: '',
        promptId: '',
        version: '',
        reviewPolicy: 'standard',
        datasetId: '',
        datasetName: '',
        runMode: 'multi-agent',
        agents: [],
        model: '',
      })
      setSelectedAgents([])
    } catch (error) {
      console.error('Orchestration failed:', error)
      const message =
        error instanceof Error ? error.message : 'Unknown error launching orchestration'
      window.alert(`Orchestration failed: ${message}`)
    } finally {
      setIsRunning(false)
    }
  }

  // Legacy single-agent run
  async function handleLegacyRun() {
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
        status: 'completed',
      }
      setRuns((prev) => [run, ...prev])
    } catch (error) {
      console.error('Orchestration failed:', error)
      window.alert('Failed to run orchestration. Check console for details.')
    } finally {
      setIsRunning(false)
    }
  }

  // Fetch log details
  const fetchLogBundle = async (run: OrchestrationRun, silent = false) => {
    if (!run) return
    if (!silent) setLogLoading(true)
    setLogError('')

    try {
      if (run.id && ORCHESTRATOR_API_BASE) {
        const latest = await fetchOrchestrationRun(run.id)
        setLogRun(latest)

        let manifestText = JSON.stringify(latest, null, 2)
        try {
          const logResp = await fetchOrchestrationRunLog(run.id)
          if (logResp?.log) {
            manifestText = `${manifestText}\n\n--- LOG ---\n${logResp.log}`
          }
        } catch {
          // Log fetch can fail independently
        }
        setLogText(manifestText)
      } else {
        setLogText(JSON.stringify(run, null, 2))
      }
    } catch (err) {
      setLogError(err instanceof Error ? err.message : 'Failed to fetch run')
      setLogText(JSON.stringify(run, null, 2))
    } finally {
      if (!silent) setLogLoading(false)
    }
  }

  const handleViewLogs = (run: OrchestrationRun) => {
    setLogRun(run)
    setLogText('')
    void fetchLogBundle(run)
  }

  // Polling for log updates
  useEffect(() => {
    if (!logRun || !ORCHESTRATOR_API_BASE) return
    const interval = setInterval(() => {
      void fetchLogBundle(logRun, true)
    }, 4000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logRun?.id])

  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <svg className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <h1 className="text-2xl font-semibold">AI Orchestration</h1>
          </div>
          <p className="text-sm text-slate-400">
            Transform high-level ideas into results through intelligent multi-agent collaboration
          </p>
        </div>
        <button
          onClick={() => setLegacyMode(!legacyMode)}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
        >
          {legacyMode ? 'Multi-Agent Mode' : 'Classic Mode'}
        </button>
      </div>

      {ORCHESTRATOR_API_USING_DEFAULT_BASE && (
        <div className="rounded-lg border border-amber-700 bg-amber-900/20 px-4 py-3 text-sm text-amber-300">
          <div className="flex items-start gap-2">
            <svg className="h-5 w-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <div className="font-semibold">Using default API configuration</div>
              <div className="mt-1 text-xs">
                Currently defaulting to <code className="rounded bg-amber-950 px-1 py-0.5 font-mono">{ORCHESTRATOR_API_BASE}</code> because <code className="rounded bg-amber-950 px-1 py-0.5 font-mono">NEXT_PUBLIC_API_BASE</code> is unset.
                <br />
                To configure a different API endpoint, create a <code className="rounded bg-amber-950 px-1 py-0.5 font-mono">.env.local</code> file in the webapp directory with:
                <pre className="mt-2 rounded bg-amber-950 px-2 py-1 font-mono text-[11px]">NEXT_PUBLIC_API_BASE=http://localhost:8000</pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {apiConnected === false && (
        <div className="rounded-lg border border-red-700 bg-red-900/20 px-4 py-3 text-sm text-red-300">
          <div className="flex items-start gap-2">
            <svg className="h-5 w-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <div className="font-semibold">Cannot connect to Prompt API</div>
              <div className="mt-1 text-xs">
                {apiError}
                <br />
                <strong>Troubleshooting:</strong>
                <ul className="mt-1 ml-4 list-disc space-y-1">
                  <li>Verify the Prompt API is running: <code className="rounded bg-red-950 px-1 py-0.5 font-mono">curl {ORCHESTRATOR_API_BASE}/health</code></li>
                  <li>Check that the API URL is correct in <code className="rounded bg-red-950 px-1 py-0.5 font-mono">.env.local</code></li>
                  <li>For Docker: Ensure both services are on the same network</li>
                </ul>
                <div className="mt-2 rounded-lg border border-red-800 bg-red-950/40 p-2 font-mono text-[11px] text-red-100">
                  <div className="text-red-200/90">Local start (Windows):</div>
                  <div>cd apps\\UnifiedPromptApp\\services\\prompt-api</div>
                  <div>.\\.venv\\Scripts\\python.exe -m uvicorn app:app --reload --host 0.0.0.0 --port 8000</div>
                </div>
                <div className="mt-2">
                  <strong>Note:</strong> Orchestrations will run in simulation mode until the API connection is restored.
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void checkConnection()}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
                  >
                    Retry connection
                  </button>
                  <a
                    href="/settings"
                    className="rounded-lg border border-red-700 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-900/30"
                  >
                    Check settings
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {runningRuns.length > 0 && (
        <div className="space-y-3">
          {runningRuns.slice(0, 3).map((run) => (
            <AgentActivityTally key={run.id} run={run} title="Live Agent Tally" />
          ))}
        </div>
      )}

      {/* Repo orchestration */}
      <div className={`${CARD_SHELL} ${CARD_PADDING} space-y-4`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="text-lg font-semibold text-slate-100">Repo Orchestration (clone → plan → PR)</h2>
            </div>
            <p className="text-sm text-slate-400">
              Streams clone, intake, supervisor planning, Codex swarm task execution, merge coordination, and PR creation.
            </p>
          </div>
          <div className="flex gap-2">
            {repoRunId && repoRunning && (
              <button
                onClick={handleCancelRepo}
                className="rounded-lg border border-red-700 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-900/30"
              >
                Cancel run
              </button>
            )}
            <button
              onClick={handleStartRepoOrchestration}
              disabled={repoRunning || !repoForm.repo.trim() || !repoForm.goal.trim()}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {repoRunning ? 'Running…' : 'Start repo orchestration'}
            </button>
          </div>
        </div>
        {repoError && (
          <div className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {repoError}
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400">Repository (owner/repo or URL)</label>
              <input
                type="text"
                value={repoForm.repo}
                onChange={(e) => setRepoForm((prev) => ({ ...prev, repo: e.target.value }))}
                placeholder="my-org/my-repo or https://github.com/my-org/my-repo"
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400">Goal</label>
              <textarea
                rows={3}
                value={repoForm.goal}
                onChange={(e) => setRepoForm((prev) => ({ ...prev, goal: e.target.value }))}
                placeholder="Describe what you want the orchestrator to accomplish"
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400">Source branch</label>
                <input
                  type="text"
                  value={repoForm.options?.branch ?? ''}
                  onChange={(e) =>
                    setRepoForm((prev) => ({
                      ...prev,
                      options: { ...prev.options, branch: e.target.value },
                    }))
                  }
                  placeholder="main (optional)"
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400">Integration branch</label>
                <input
                  type="text"
                  value={repoForm.options?.integration_branch ?? ''}
                  onChange={(e) =>
                    setRepoForm((prev) => ({
                      ...prev,
                      options: { ...prev.options, integration_branch: e.target.value },
                    }))
                  }
                  placeholder="auto-generated if empty"
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400">Allowed paths (comma separated)</label>
              <input
                type="text"
                value={(repoForm.options?.allowed_paths || ['.']).join(', ')}
                onChange={(e) =>
                  setRepoForm((prev) => ({
                    ...prev,
                    options: {
                      ...prev.options,
                      allowed_paths: e.target.value
                        .split(',')
                        .map((p) => p.trim())
                        .filter(Boolean),
                    },
                  }))
                }
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-200">Live progress</div>
              {repoResult?.prUrl && (
                <a
                  className="text-xs text-emerald-400 underline"
                  href={repoResult.prUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  View PR
                </a>
              )}
            </div>
            <div className="h-40 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-xs text-slate-200">
              {repoEvents.length === 0 && <div className="text-slate-500">No events yet.</div>}
              {repoEvents.map((ev, idx) => (
                <div key={`${ev.type}-${idx}`} className="mb-1 border-b border-slate-800 pb-1 last:border-b-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                      {ev.type}
                    </span>
                    {ev.run_id && <span className="text-[10px] text-slate-500">run {ev.run_id}</span>}
                  </div>
                  {ev.message && <div className="text-slate-200">{ev.message}</div>}
                  {ev.progress?.message && typeof ev.progress.message === 'string' ? (
                    <div className="text-slate-300">{ev.progress.message}</div>
                  ) : null}
                  {ev.log_line && <div className="font-mono text-[11px] text-slate-400">{ev.log_line}</div>}
                  {ev.result?.pr_url && typeof ev.result.pr_url === 'string' ? (
                    <div className="text-emerald-300">PR: {ev.result.pr_url}</div>
                  ) : null}
                </div>
              ))}
            </div>
            {repoResult && (
              <div className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 p-2 text-xs text-emerald-100">
                <div className="font-semibold">Final result</div>
                <div>Status: {repoResult.status || 'unknown'}</div>
                {repoResult.prUrl && (
                  <div>
                    PR URL:{' '}
                    <a className="underline" href={repoResult.prUrl} target="_blank" rel="noreferrer">
                      {repoResult.prUrl}
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {apiConnected === true && !ORCHESTRATOR_API_USING_DEFAULT_BASE && (
        <div className="rounded-lg border border-green-700 bg-green-900/20 px-4 py-3 text-sm text-green-300">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <span className="font-semibold">Connected to Prompt API</span> at <code className="rounded bg-green-950 px-1 py-0.5 font-mono">{ORCHESTRATOR_API_BASE}</code>
            </div>
          </div>
        </div>
      )}

      {legacyMode ? (
        /* Legacy Single-Agent Mode */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr_1fr]">
          <div className={`space-y-4 ${CARD_SHELL} ${CARD_PADDING}`}>
            <h2 className="font-semibold">1. Select Components</h2>
            <div>
              <label className="text-sm font-medium text-slate-300">Agent</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm"
                value={selectedAgentId ?? ''}
                onChange={(e) => setSelectedAgentId(e.target.value)}
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
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
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={`space-y-4 ${CARD_SHELL} ${CARD_PADDING}`}>
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
              onClick={handleLegacyRun}
              disabled={isRunning || !selectedAgent || !selectedPrompt}
            >
              {isRunning ? 'Running...' : 'Run Orchestration'}
            </button>
          </div>

          <div className={`space-y-4 ${CARD_SHELL} ${CARD_PADDING}`}>
            <h2 className="font-semibold">3. View Results</h2>
            {runs.length === 0 && (
              <p className="text-sm text-slate-400">No runs yet. Configure and run an orchestration.</p>
            )}
            <div className="space-y-4 max-h-[calc(100vh-250px)] overflow-y-auto">
              {runs.map((run) => (
                <div key={run.id} className="rounded-xl bg-slate-800/50 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">{run.prompt?.title || run.goal || run.id}</div>
                    <div className="text-xs text-slate-400">{run.tokens?.total || 0} tokens</div>
                  </div>
                  <p className="mt-2 text-sm text-slate-200 line-clamp-3">{run.output}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span className="rounded bg-slate-700 px-1.5 py-0.5">{run.status}</span>
                    <span>{run.completedAt ? new Date(run.completedAt).toLocaleTimeString() : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Multi-Agent Orchestration Mode */
        <>
          <form onSubmit={handleMultiAgentRun} className={`space-y-4 ${HIGHLIGHT_CARD}`}>
            {/* Goal Input */}
            <div className="space-y-2">
              <label className="text-base font-semibold text-slate-200 flex items-center gap-2">
                <svg className="h-5 w-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                What do you want to accomplish?
              </label>
              <textarea
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                rows={4}
                placeholder="Describe your goal in natural language. Example: 'I need to analyze user feedback and generate a summary report with key insights and recommendations'"
                value={form.goal}
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
                  <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Agent Team ({selectedAgents.length} selected)
                </label>
                <button
                  type="button"
                  onClick={handleSuggestAgents}
                  className="flex items-center gap-1 rounded-lg border border-blue-700 bg-blue-800/30 px-3 py-1.5 text-xs font-medium text-blue-200 hover:bg-blue-700/40"
                >
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Auto-suggest agents
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
                {orchestratorAgents.map((agent) => (
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
                    {selectedAgents.includes(agent.name) && (
                      <svg className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowAgentCreator(true)}
                className="flex items-center gap-1 rounded-lg border border-green-700 bg-green-800/30 px-3 py-1.5 text-xs font-medium text-green-200 hover:bg-green-700/40"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create ad-hoc agent
              </button>
            </div>

            {/* Advanced Options */}
            <details className="space-y-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-300 hover:text-slate-100">
                Advanced Options
              </summary>
              <div className="grid gap-3 pt-2 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Prompt (optional)</label>
                  <select
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                    value={form.promptId}
                    onChange={(e) => {
                      const p = prompts.find((pr) => pr.id === e.target.value)
                      setForm((f) => ({ ...f, promptId: e.target.value, version: p?.version || '' }))
                    }}
                  >
                    <option value="">None</option>
                    {prompts.map((p) => (
                      <option key={p.id} value={p.id}>{p.title || p.id}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Engine</label>
                  <select
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                    value={form.runMode}
                    onChange={(e) => setForm((f) => ({ ...f, runMode: e.target.value as 'default' | 'codex-swarm' | 'multi-agent' }))}
                  >
                    <option value="multi-agent">Multi-Agent</option>
                    <option value="codex-swarm">Codex Swarm</option>
                    <option value="default">Default</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Model (optional)</label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                    placeholder="gpt-4o-mini"
                    value={form.model}
                    onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                  />
                </div>
              </div>
            </details>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={isRunning}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-500 transition-colors shadow-lg disabled:opacity-50"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {isRunning ? 'Launching...' : 'Launch Orchestration'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm({
                    goal: '',
                    promptId: '',
                    version: '',
                    reviewPolicy: 'standard',
                    datasetId: '',
                    datasetName: '',
                    runMode: 'multi-agent',
                    agents: [],
                    model: '',
                  })
                  setSelectedAgents([])
                }}
                className="rounded-lg border border-slate-700 px-6 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                Reset
              </button>
            </div>
          </form>

          {/* Swarming Preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-200">Swarming Fit and Sample Run</h2>
                <p className="text-sm text-slate-400">
                  Position swarming as a high-parallelism execution mode that the supervisor can invoke when speed and
                  cross-checking matter most.
                </p>
              </div>
              <span className="rounded-full border border-blue-700 bg-blue-900/40 px-3 py-1 text-xs text-blue-200">
                Preview only
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
              <div className={`${CARD_SHELL} ${CARD_PADDING} space-y-4`}>
                <div>
                  <div className="text-sm font-semibold text-slate-200">Where swarming fits</div>
                  <p className="mt-2 text-sm text-slate-300">
                    Use swarming when the goal can be split into parallel tracks and you want diversity of ideas before
                    converging. The supervisor agent acts as the swarm conductor, enforcing quality gates and merging
                    outputs into a single deliverable.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-slate-200">Example workflow</div>
                  <div className="space-y-2">
                    {SWARM_WORKFLOW_STEPS.map((step, index) => (
                      <div key={step.title} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                        <div className="text-xs font-semibold text-blue-300">Step {index + 1}</div>
                        <div className="text-sm font-semibold text-slate-100">{step.title}</div>
                        <div className="text-xs text-slate-400">{step.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className={`${CARD_SHELL} ${CARD_PADDING} space-y-4`}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-200">
                    {hasSwarmRun ? 'Latest swarming run' : 'Sample run'}
                  </div>
                  <span className="text-[11px] uppercase tracking-wide text-slate-500">
                    {hasSwarmRun ? 'Live data' : 'Example'}
                  </span>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Goal</div>
                    <div className="text-sm text-slate-100">{swarmRunDisplay.goal}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {swarmRunDisplay.agents.map((agent, index) => (
                      <span key={`${agent}-${index}`} className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200">
                        {agent}
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs text-slate-400">
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Status</div>
                      <div className="text-slate-200">{swarmRunDisplay.status}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Engine</div>
                      <div className="text-slate-200">{swarmRunDisplay.engine}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Duration</div>
                      <div className="text-slate-200">{swarmRunDisplay.duration}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Tokens</div>
                      <div className="text-slate-200">
                        {swarmRunDisplay.inputTokens + swarmRunDisplay.outputTokens} total
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-blue-900/50 bg-blue-950/60 px-3 py-2 text-xs text-blue-200">
                    Estimated cost (gpt-4o-mini): $
                    {calculateCost('gpt-4o-mini', swarmRunDisplay.inputTokens, swarmRunDisplay.outputTokens).toFixed(4)}
                  </div>
                  <button
                    type="button"
                    onClick={handleRunSampleSwarm}
                    className="w-full rounded-lg border border-blue-700 bg-blue-800/40 px-3 py-2 text-xs font-semibold text-blue-100 hover:bg-blue-700/50"
                  >
                    Run this swarm
                  </button>
                  {swarmStatus !== 'idle' && (
                    <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs text-slate-200">
                      <div className="flex items-center justify-between">
                        <span>Status: {swarmStatus}</span>
                        {swarmRunDisplay.model && (
                          <span className="text-slate-400">Model: {swarmRunDisplay.model}</span>
                        )}
                      </div>
                      {swarmError && <div className="mt-1 text-red-300">{swarmError}</div>}
                      <div className="mt-2">
                        <SessionStatisticsPanel
                          agents={swarmSessionAgents.length > 0 ? swarmSessionAgents : swarmRunDisplay.agents}
                          model={swarmSessionModel || swarmRunDisplay.model || ''}
                        />
                      </div>
                      {swarmOutput && (
                        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] text-slate-100">
                          {swarmOutput}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className={`${CARD_SHELL} ${CARD_PADDING}`}>
                <div className="text-sm font-semibold text-slate-200">Supervisor agent playbook</div>
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  {SWARM_SUPERVISOR_USES.map((item, index) => (
                    <li key={`supervisor-${index}`} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={`${CARD_SHELL} ${CARD_PADDING}`}>
                <div className="text-sm font-semibold text-slate-200">Best-fit use cases</div>
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  {SWARM_USE_CASES.map((item, index) => (
                    <li key={`usecase-${index}`} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className={`${CARD_SHELL} ${CARD_PADDING} space-y-3`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-200">Small-scale cost estimate</div>
                  <div className="text-xs text-slate-400">
                    {SWARM_COST_BASELINE.agents} agents, {SWARM_COST_BASELINE.rounds} rounds, {SWARM_COST_BASELINE.inputTokens} input
                    / {SWARM_COST_BASELINE.outputTokens} output tokens
                  </div>
                </div>
                <span className="text-xs text-slate-500">Estimates based on model pricing config</span>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-800">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-800/70 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left">Model</th>
                      <th className="px-3 py-2 text-right">Per run</th>
                      <th className="px-3 py-2 text-right">10 runs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {swarmCostEstimates.map((estimate) => (
                      <tr key={estimate.model} className="border-t border-slate-800 text-slate-200">
                        <td className="px-3 py-2">{estimate.model}</td>
                        <td className="px-3 py-2 text-right">${estimate.cost.toFixed(4)}</td>
                        <td className="px-3 py-2 text-right">${(estimate.cost * 10).toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Recent Orchestrations */}
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-200">Recent Orchestrations</h2>
            <div className={`${CARD_SHELL} overflow-hidden`}>
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
                    <tr key={run.id || `run-${idx}`} className="border-t border-slate-800 hover:bg-slate-800/30">
                      <td className="px-4 py-3 text-slate-100 max-w-xs">
                        <div className="truncate" title={run.goal || run.promptId}>
                          {run.goal || run.promptId || run.id}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {run.agents && run.agents.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {run.agents.slice(0, 3).map((agent, index) => (
                              <span key={`${agent}-${index}`} className="rounded bg-blue-900/40 px-1.5 py-0.5 text-xs text-blue-200">
                                {agent}
                              </span>
                            ))}
                            {run.agents.length > 3 && (
                              <span className="text-xs text-slate-400">+{run.agents.length - 3}</span>
                            )}
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-200">
                          {run.status || 'unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300 text-xs">
                        {run.runMode || 'default'}
                        {run.mode === 'simulated' && <span className="text-amber-400"> (sim)</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-300 text-xs">
                        {run.requestedAt ? new Date(run.requestedAt).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
                          onClick={() => handleViewLogs(run)}
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
        </>
      )}

      {/* Ad-hoc Agent Creator Modal */}
      {showAgentCreator && (
        <div className={OVERLAY}>
          <div className={MODAL_PANEL}>
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                <svg className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Ad-Hoc Agent
              </h3>
              <button
                onClick={() => setShowAgentCreator(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Agent Name</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g., Data Analyst"
                  value={newAgent.name}
                  onChange={(e) => setNewAgent((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Role</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="system"
                  value={newAgent.role || 'system'}
                  onChange={(e) => setNewAgent((prev) => ({ ...prev, role: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">System Prompt / Instructions</label>
                <textarea
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  rows={6}
                  placeholder="Describe the agent's role, capabilities, and instructions..."
                  value={newAgent.prompt ?? ''}
                  onChange={(e) => setNewAgent((prev) => ({ ...prev, prompt: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Description (optional)</label>
                <textarea
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  rows={2}
                  placeholder="Brief description of what this agent does..."
                  value={newAgent.description ?? ''}
                  onChange={(e) => setNewAgent((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleCreateAgent}
                  className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Create & Add to Team
                </button>
                <button
                  onClick={() => setShowAgentCreator(false)}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Log Viewer Modal */}
      {logRun && (
        <div className={OVERLAY}>
          <div className={`${MODAL_PANEL} max-w-4xl max-h-[90vh] flex flex-col`}>
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div className="text-sm font-semibold text-slate-100 flex flex-col gap-1">
                <span>Run: {logRun.goal || logRun.promptId || logRun.id}</span>
                <div className="flex items-center gap-2 text-[11px] text-slate-300">
                  <span className="rounded-full bg-slate-800 px-2 py-1">{logRun.status || 'unknown'}</span>
                  {logRun.runMode && (
                    <span className="rounded-full bg-slate-800 px-2 py-1">Engine: {logRun.runMode}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {logRun.mode === 'simulated' && (
                  <span className="text-[11px] text-amber-400">Simulated</span>
                )}
                {ORCHESTRATOR_API_BASE && (
                  <button
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
                    onClick={() => fetchLogBundle(logRun)}
                    disabled={logLoading}
                  >
                    {logLoading ? 'Refreshing…' : 'Refresh'}
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
            <div className="flex-1 overflow-auto px-4 py-3">
              {logError && (
                <p className="text-xs text-red-400 mb-2">{logError}</p>
              )}
              <div className="space-y-3">
                <SessionStatisticsPanel agents={logRun.agents ?? []} model={logRun.model ?? ''} />
                {logRun.output && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-100 mb-2">Result</h4>
                    <pre className="bg-slate-950 p-4 rounded-lg text-xs text-slate-200 whitespace-pre-wrap overflow-auto max-h-60">
                      {logRun.output}
                    </pre>
                  </div>
                )}
                {logRun.events && logRun.events.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-100 mb-2">Events</h4>
                    <div className="space-y-2">
                      {logRun.events.map((ev, idx) => (
                        <div key={`${ev.timestamp || 'no-time'}-${ev.type || 'no-type'}-${idx}`} className="rounded border border-slate-800 bg-slate-950 p-2">
                          <div className="flex justify-between text-[11px] text-slate-400">
                            <span>{ev.type}</span>
                            <span>{ev.timestamp}</span>
                          </div>
                          <div className="text-slate-100 text-xs whitespace-pre-wrap">{ev.message}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <h4 className="text-sm font-semibold text-slate-100 mb-2">Manifest / Logs</h4>
                  <pre className="bg-slate-950 p-4 rounded-lg text-xs text-slate-200 whitespace-pre-wrap overflow-auto max-h-96">
                    {logText}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

