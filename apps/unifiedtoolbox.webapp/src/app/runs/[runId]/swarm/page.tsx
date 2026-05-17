'use client'

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Activity, AlertTriangle, ArrowLeft, ChevronDown, ChevronUp, ClipboardCopy, FolderOpen, Network, RefreshCw } from 'lucide-react'
import ActivityLog from '@/features/swarm-viz/components/ActivityLog'
import ControlPanel from '@/features/swarm-viz/components/ControlPanel'
import SwarmCanvas from '@/features/swarm-viz/components/SwarmCanvas'
import RequirementsPanel from '@/components/runs/RequirementsPanel'
import { useRunEvents } from '@/features/swarm-viz/hooks/useRunEvents'
import { buildSwarmModel } from '@/features/swarm-viz/model/swarmModel'
import { fetchOrchestrationRun, forceCancelOrchestrationRun, requeueOrchestrationRun } from '@/lib/services/orchestratorApi'
import { getRunContext } from '@/lib/services/runContextStore'
import type { OrchestrationRun } from '@/lib/types/orchestrator'
import { summarizeRunMessage } from '@/lib/runs/runFailureSummary'

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function toggleSelection(current: string[], allValues: string[], target: string): string[] {
  if (current.length === 0) {
    return allValues.filter((value) => value !== target)
  }
  if (current.includes(target)) {
    const next = current.filter((value) => value !== target)
    return next.length === 0 ? [] : next
  }
  return [...current, target]
}

function statusBadge(status: string | undefined): string {
  const value = (status || '').toLowerCase()
  if (value === 'succeeded' || value === 'completed') return 'border-emerald-700 bg-emerald-950/40 text-emerald-200'
  if (value === 'running' || value === 'queued') return 'border-blue-700 bg-blue-950/40 text-blue-200'
  if (value === 'blocked_requirements' || value === 'needs_requirements') return 'border-amber-700 bg-amber-950/40 text-amber-200'
  if (value === 'failed' || value === 'error' || value.startsWith('error:')) return 'border-rose-700 bg-rose-950/40 text-rose-200'
  if (value === 'stuck') return 'border-amber-700 bg-amber-950/40 text-amber-200'
  return 'border-slate-700 bg-slate-900/60 text-slate-200'
}

export default function RunSwarmPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId: rawRunId } = use(params)
  const runId = safeDecode(rawRunId)
  const [runSummary, setRunSummary] = useState<OrchestrationRun | null>(null)
  const [proposalId, setProposalId] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState<'retry' | 'cancel' | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)
  const [requirementsPanelOpen, setRequirementsPanelOpen] = useState(true)

  const { events, runStatus, loading, error, connectionStatus, lastEventTs, reconnectCount, refresh } = useRunEvents(runId, {
    limit: 600,
  })

  useEffect(() => {
    let active = true
    const context = getRunContext(runId)
    setProposalId(context?.proposalId ?? null)

    const syncRunSummary = async () => {
      try {
        const run = await fetchOrchestrationRun(runId)
        if (active) setRunSummary(run)
      } catch {
        if (active) setRunSummary(null)
      }
    }

    void syncRunSummary()
    const interval = window.setInterval(() => {
      void syncRunSummary()
    }, 5000)

    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [runId, runStatus?.status])

  const model = useMemo(() => buildSwarmModel(events, runStatus), [events, runStatus])

  const [showCompleted, setShowCompleted] = useState(true)
  const [groupByPhase, setGroupByPhase] = useState(true)
  const [followLive, setFollowLive] = useState(true)
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [selectedPhases, setSelectedPhases] = useState<string[]>([])
  const [resetSignal, setResetSignal] = useState(0)

  const displayStatus = (runSummary?.status || runStatus?.status || '').toLowerCase()
  const isTerminalError = displayStatus === 'stuck' || displayStatus.startsWith('error:') || displayStatus === 'failed'
  const isCompleted = displayStatus === 'succeeded' || displayStatus === 'completed'
  const isTerminal = isTerminalError || isCompleted
  const requirementsRequest = runSummary?.requirementsRequest ?? runSummary?.sandboxReport?.requirementsRequest
  const latestRequirementSignal = useMemo(() => {
    const requirementEvents = [...events].reverse().filter((event) => {
      const token = `${event.type} ${event.status || ''} ${event.message}`.toLowerCase()
      return token.includes('blocked_requirements')
        || token.includes('needs_requirements')
        || token.includes('clarification_request')
        || token.includes('requirements')
    })
    return requirementEvents[0] || null
  }, [events])

  const inferredRequirementsBlocked = Boolean(
    latestRequirementSignal
    || model.nodes.some((node) => {
      if (node.status !== 'blocked') return false
      const token = `${node.label} ${node.message || ''}`.toLowerCase()
      return token.includes('requirement') || token.includes('decision lock') || token.includes('conceptualmodelcontract')
    }),
  )

  const isRequirementsBlocked =
    displayStatus === 'blocked_requirements'
    || displayStatus === 'needs_requirements'
    || runSummary?.verificationStatus === 'needs_requirements'
    || inferredRequirementsBlocked
  const isRunning = !isTerminal && !isRequirementsBlocked && events.length > 0
  const runDetailHref = `/runs/${encodeURIComponent(runId)}#requirements-request`
  const conciergeHref = proposalId
    ? `/concierge?proposal=${encodeURIComponent(proposalId)}&run=${encodeURIComponent(runId)}`
    : `/concierge?run=${encodeURIComponent(runId)}`
  const runDirPath = runSummary?.runDir
  const blockerContextSummary = requirementsRequest?.summary
    || latestRequirementSignal?.message
    || runSummary?.errorDetail
    || null
  const blockerContextAvailable = Boolean(blockerContextSummary)

  const copyAllContext = async () => {
    const sections: string[] = []
    sections.push(`# Swarm Context Export`)
    sections.push(`Run ID: ${runId}`)
    sections.push(`Status: ${runSummary?.status || runStatus?.status || 'unknown'}`)
    sections.push(`Goal: ${runSummary?.goal || '—'}`)
    sections.push(`Timestamp: ${new Date().toISOString()}`)
    sections.push('')

    if (model.agents.length > 0) {
      sections.push(`## Agents`)
      for (const agent of model.agents) {
        sections.push(`- ${agent.name} [${agent.status}]${agent.lastMessage ? ` — ${agent.lastMessage}` : ''}`)
      }
      sections.push('')
    }

    const errorNodes = model.nodes.filter((n) => n.status === 'error' || n.status === 'blocked')
    if (errorNodes.length > 0) {
      sections.push(`## Failed / Blocked Nodes`)
      for (const node of errorNodes) {
        sections.push(`### ${node.label} [${node.status}]`)
        sections.push(`- Kind: ${node.kind}`)
        sections.push(`- Phase: ${node.phase || '—'}`)
        sections.push(`- Agent: ${node.agent || '—'}`)
        sections.push(`- Events: ${node.eventCount}`)
        sections.push(`- Last updated: ${node.lastTs}`)
        if (node.message) sections.push(`- Message: ${node.message}`)
        sections.push('')
      }
    }

    if (model.activity.length > 0) {
      sections.push(`## Activity Log (last 50)`)
      for (const item of model.activity.slice(0, 50)) {
        const parts = [item.ts, item.type, item.phase, item.agent, item.status].filter(Boolean).join(' | ')
        sections.push(`[${parts}] ${item.message}`)
      }
    }

    try {
      await navigator.clipboard.writeText(sections.join('\n'))
      setCopiedAll(true)
      setTimeout(() => setCopiedAll(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  const handleRetry = async () => {
    setActionPending('retry')
    try {
      await requeueOrchestrationRun(runId)
      await refresh()
    } catch {
      // Refresh anyway to reflect current state
      await refresh()
    } finally {
      setActionPending(null)
    }
  }

  const handleForceCancel = async () => {
    setActionPending('cancel')
    try {
      await forceCancelOrchestrationRun(runId)
      await refresh()
    } catch {
      await refresh()
    } finally {
      setActionPending(null)
    }
  }

  const handleRequirementsSubmitted = async () => {
    try {
      const run = await fetchOrchestrationRun(runId)
      setRunSummary(run)
    } catch { /* keep existing state */ }
    await refresh()
  }

  const availableAgents = useMemo(() => model.agents.map((agent) => agent.name), [model.agents])
  const availablePhases = model.phases

  const selectedAgentSet = useMemo(() => {
    const effective = selectedAgents.length === 0 ? availableAgents : selectedAgents
    return new Set(effective)
  }, [selectedAgents, availableAgents])

  const selectedPhaseSet = useMemo(() => {
    const effective = selectedPhases.length === 0 ? availablePhases : selectedPhases
    return new Set(effective)
  }, [selectedPhases, availablePhases])

  const nodeIdsBySelectedAgents = useMemo(() => {
    if (selectedAgents.length === 0) return new Set<string>()
    const next = new Set<string>()
    for (const edge of model.edges) {
      if (edge.kind !== 'assignment') continue
      const agentName = edge.from.startsWith('agent:') ? edge.from.slice('agent:'.length) : edge.from
      if (selectedAgentSet.has(agentName)) {
        next.add(edge.to)
      }
    }
    return next
  }, [model.edges, selectedAgents.length, selectedAgentSet])

  const visibleNodes = useMemo(() => {
    return model.nodes.filter((node) => {
      if (!showCompleted && node.status === 'complete') return false
      if (!selectedPhaseSet.has(node.phase || 'misc')) return false
      if (selectedAgents.length === 0) return true
      if (node.agent && selectedAgentSet.has(node.agent)) return true
      return nodeIdsBySelectedAgents.has(node.id)
    })
  }, [model.nodes, showCompleted, selectedPhaseSet, selectedAgents.length, selectedAgentSet, nodeIdsBySelectedAgents])

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes])

  const visibleEdges = useMemo(() => {
    return model.edges.filter((edge) => {
      const fromIsAgent = edge.from.startsWith('agent:')
      if (fromIsAgent) {
        const agentName = edge.from.slice('agent:'.length)
        if (selectedAgents.length > 0 && !selectedAgentSet.has(agentName)) return false
        return visibleNodeIds.has(edge.to)
      }
      return visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to)
    })
  }, [model.edges, visibleNodeIds, selectedAgents.length, selectedAgentSet])

  const visibleAgents = useMemo(() => {
    if (selectedAgents.length === 0) return model.agents
    return model.agents.filter((agent) => selectedAgentSet.has(agent.name))
  }, [model.agents, selectedAgents.length, selectedAgentSet])

  const visiblePhases = useMemo(() => {
    const seen = new Set<string>()
    for (const node of visibleNodes) {
      seen.add(node.phase || 'misc')
    }
    return model.phases.filter((phase) => seen.has(phase))
  }, [model.phases, visibleNodes])

  return (
    <main className="mx-auto h-[calc(100vh-3rem)] max-w-[1600px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/55 p-4">
        <div>
          <Link href={`/runs/${encodeURIComponent(runId)}`} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Run Detail
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-slate-100">Swarm View</h1>
          <p className="mt-1 text-sm text-slate-400">Live orchestration graph for run <span className="font-mono">{runId}</span> sourced from real run SSE telemetry.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full border px-2.5 py-1 font-medium ${statusBadge(runSummary?.status || runStatus?.status)}`}>
            {runSummary?.status || runStatus?.status || 'unknown'}
          </span>
          {runSummary?.model && (
            <span className="rounded-full border border-slate-700 bg-slate-900/80 px-2.5 py-1 font-mono text-slate-300">
              {runSummary.model}
            </span>
          )}
          <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-slate-200">
            events: {events.length}
          </span>
          <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-slate-200">
            nodes: {visibleNodes.length}
          </span>
          <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-slate-200">
            agents: {visibleAgents.length}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-slate-200 hover:border-slate-600"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          {runDirPath && (
            <a
              href={`file:///${runDirPath.replace(/\\/g, '/')}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-slate-200 hover:border-slate-600"
              onClick={(e) => {
                e.preventDefault()
                void fetch('/api/open-path', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ path: runDirPath }),
                }).catch(() => navigator.clipboard?.writeText(runDirPath))
              }}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Run Files
            </a>
          )}
          <button
            type="button"
            onClick={() => void copyAllContext()}
            className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-slate-200 hover:border-slate-600"
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
            {copiedAll ? 'Copied!' : 'Copy Context'}
          </button>
          {isTerminalError && (
            <>
              <button
                type="button"
                onClick={() => void handleRetry()}
                disabled={actionPending !== null}
                className="inline-flex items-center gap-1 rounded-full border border-blue-700 bg-blue-900/40 px-2.5 py-1 text-blue-200 hover:bg-blue-900/70 disabled:opacity-50"
              >
                {actionPending === 'retry' ? 'Retrying…' : 'Retry'}
              </button>
              <button
                type="button"
                onClick={() => void handleForceCancel()}
                disabled={actionPending !== null}
                className="inline-flex items-center gap-1 rounded-full border border-rose-800 bg-rose-950/40 px-2.5 py-1 text-rose-300 hover:bg-rose-950/70 disabled:opacity-50"
              >
                {actionPending === 'cancel' ? 'Cancelling…' : 'Force Cancel'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid h-[calc(100%-5.5rem)] grid-cols-1 gap-4 xl:grid-cols-[290px_minmax(0,1fr)_360px]">
        <ControlPanel
          connectionStatus={connectionStatus}
          loading={loading}
          error={runSummary ? null : error}
          reconnectCount={reconnectCount}
          lastEventTs={lastEventTs}
          showCompleted={showCompleted}
          groupByPhase={groupByPhase}
          followLive={followLive}
          availableAgents={availableAgents}
          availablePhases={availablePhases}
          selectedAgents={selectedAgents}
          selectedPhases={selectedPhases}
          onToggleShowCompleted={() => setShowCompleted((prev) => !prev)}
          onToggleGroupByPhase={() => setGroupByPhase((prev) => !prev)}
          onToggleFollowLive={() => setFollowLive((prev) => !prev)}
          onToggleAgent={(agent) => setSelectedAgents((prev) => toggleSelection(prev, availableAgents, agent))}
          onTogglePhase={(phase) => setSelectedPhases((prev) => toggleSelection(prev, availablePhases, phase))}
          onSelectAllAgents={() => setSelectedAgents([])}
          onSelectAllPhases={() => setSelectedPhases([])}
          onResetView={() => setResetSignal((prev) => prev + 1)}
          onRefresh={() => void refresh()}
        />

        <div className="flex min-h-0 flex-col gap-4">
          {(isRequirementsBlocked || isTerminalError) && (
            <div className={`rounded-2xl border p-4 text-sm space-y-3 ${
              isRequirementsBlocked
                ? 'border-amber-700/60 bg-amber-950/20 text-amber-100'
                : 'border-rose-700/60 bg-rose-950/20 text-rose-100'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">
                  {isRequirementsBlocked ? 'Execution blocked: missing requirements' : 'Execution failed: remediation required'}
                </div>
                <span className="rounded-full border border-current/40 bg-black/20 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                  {runSummary?.status || runStatus?.status || 'unknown'}
                </span>
              </div>

              <div className="text-xs leading-relaxed">
                {blockerContextAvailable
                  ? summarizeRunMessage(blockerContextSummary)
                  : 'No structured blocker context was returned by the backend. Use Copy Context and Concierge to capture missing requirements, then resume this run.'}
              </div>

              {latestRequirementSignal && (
                <div className="text-[11px] opacity-80">
                  Last blocking signal at {new Date(latestRequirementSignal.ts).toLocaleTimeString()} from {latestRequirementSignal.agent || 'workflow'}.
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Link
                  href={runDetailHref}
                  className="rounded-lg border border-current/50 bg-black/20 px-3 py-1.5 font-medium hover:bg-black/35"
                >
                  Open Run Detail
                </Link>
                <Link
                  href={conciergeHref}
                  className="rounded-lg border border-current/50 bg-black/20 px-3 py-1.5 font-medium hover:bg-black/35"
                >
                  Open Concierge
                </Link>
                <button
                  type="button"
                  onClick={() => void copyAllContext()}
                  className="rounded-lg border border-current/50 bg-black/20 px-3 py-1.5 font-medium hover:bg-black/35"
                >
                  {copiedAll ? 'Copied!' : 'Copy Context'}
                </button>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="rounded-lg border border-current/50 bg-black/20 px-3 py-1.5 font-medium hover:bg-black/35"
                >
                  Refresh Status
                </button>
                <button
                  type="button"
                  onClick={() => void handleRetry()}
                  disabled={actionPending !== null}
                  className="rounded-lg border border-current/50 bg-black/20 px-3 py-1.5 font-medium hover:bg-black/35 disabled:opacity-50"
                >
                  {actionPending === 'retry' ? 'Requeueing…' : 'Requeue Run'}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-amber-700/50 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
              Events unavailable. Showing run summary with agents marked as not started until telemetry returns.
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/55 px-3 py-2 text-xs text-slate-300">
              <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-slate-500">
                <Network className="h-3.5 w-3.5" />
                Current Stage
              </div>
              <div className="mt-1 text-sm font-medium text-slate-100">{runStatus?.currentStage || '—'}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/55 px-3 py-2 text-xs text-slate-300">
              <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-slate-500">
                <Activity className="h-3.5 w-3.5" />
                Started
              </div>
              <div className="mt-1 text-sm font-medium text-slate-100">
                {(runSummary?.startedAt || runStatus?.startedAt) ? new Date(runSummary?.startedAt || runStatus?.startedAt || '').toLocaleString() : '—'}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/55 px-3 py-2 text-xs text-slate-300">
              <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-slate-500">Updated</div>
              <div className="mt-1 text-sm font-medium text-slate-100">
                {(runSummary?.lastEventAt || runStatus?.updatedAt) ? new Date(runSummary?.lastEventAt || runStatus?.updatedAt || '').toLocaleString() : '—'}
              </div>
            </div>
          </div>

          {isRequirementsBlocked && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-700/60 bg-amber-950/20 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setRequirementsPanelOpen(!requirementsPanelOpen)}
                  className="flex items-center gap-2 text-sm font-semibold text-amber-100"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Requirements needed to continue
                  <span className="rounded-full border border-amber-700/50 bg-amber-900/30 px-2 py-0.5 text-[10px]">
                    {requirementsRequest?.blockers?.length ?? 0} question{(requirementsRequest?.blockers?.length ?? 0) !== 1 ? 's' : ''}
                  </span>
                  {requirementsPanelOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                <div className="flex items-center gap-2 text-xs">
                  <Link href={`/runs/${encodeURIComponent(runId)}`} className="text-amber-200/70 underline hover:text-amber-100">
                    Run Detail
                  </Link>
                  <Link href={conciergeHref} className="text-amber-200/70 underline hover:text-amber-100">
                    Concierge
                  </Link>
                </div>
              </div>

              {requirementsPanelOpen && requirementsRequest && (
                <div className="max-h-[40vh] overflow-y-auto">
                  <RequirementsPanel
                    runId={runId}
                    requirementsRequest={requirementsRequest}
                    variant="panel"
                    onSubmitted={() => void handleRequirementsSubmitted()}
                  />
                </div>
              )}
            </div>
          )}

          {isTerminal && !isRequirementsBlocked && (
            <div className={`rounded-2xl border p-4 text-sm ${
              isCompleted
                ? 'border-emerald-700/60 bg-emerald-950/20 text-emerald-100'
                : 'border-rose-700/60 bg-rose-950/20 text-rose-100'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-semibold">
                  {isCompleted ? (
                    <>
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                      Orchestration Complete
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4" />
                      Orchestration {displayStatus === 'stuck' ? 'Stuck' : 'Failed'}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Link
                    href={`/runs/${encodeURIComponent(runId)}`}
                    className={`rounded-lg border px-3 py-1.5 font-medium ${
                      isCompleted
                        ? 'border-emerald-600 bg-emerald-500/15 text-emerald-50 hover:bg-emerald-500/25'
                        : 'border-rose-600 bg-rose-500/15 text-rose-50 hover:bg-rose-500/25'
                    }`}
                  >
                    View Full Report
                  </Link>
                  {runDirPath && (
                    <a
                      href={`file:///${runDirPath.replace(/\\/g, '/')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-1.5 font-medium text-slate-100 hover:border-slate-600"
                      onClick={(e) => {
                        e.preventDefault()
                        void fetch('/api/open-path', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ path: runDirPath }),
                        }).catch(() => navigator.clipboard?.writeText(runDirPath))
                      }}
                    >
                      Open Run Files
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => void copyAllContext()}
                    className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-1.5 font-medium text-slate-100 hover:border-slate-600"
                  >
                    {copiedAll ? 'Copied!' : 'Copy All Context'}
                  </button>
                </div>
              </div>
              {isTerminalError && (
                <p className="mt-2 text-xs opacity-80">
                  {model.nodes.filter((n) => n.status === 'error').length} node(s) with errors,{' '}
                  {model.nodes.filter((n) => n.status === 'blocked').length} blocked.
                  Click any red node below to copy its context.
                </p>
              )}
              {isCompleted && (
                <p className="mt-2 text-xs opacity-80">
                  {model.nodes.filter((n) => n.status === 'complete').length} node(s) completed,{' '}
                  {model.agents.filter((a) => a.status === 'complete').length} agent(s) finished.
                </p>
              )}
            </div>
          )}

          <div className="min-h-0 flex-1">
            <SwarmCanvas
              agents={visibleAgents}
              nodes={visibleNodes}
              edges={visibleEdges}
              phases={visiblePhases}
              groupByPhase={groupByPhase}
              followLive={followLive}
              resetSignal={resetSignal}
            />
          </div>
        </div>

        <ActivityLog items={model.activity} />
      </div>
    </main>
  )
}
