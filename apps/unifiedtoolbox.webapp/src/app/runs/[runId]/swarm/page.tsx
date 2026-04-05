'use client'

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Activity, AlertTriangle, ArrowLeft, Network, RefreshCw } from 'lucide-react'
import ActivityLog from '@/features/swarm-viz/components/ActivityLog'
import ControlPanel from '@/features/swarm-viz/components/ControlPanel'
import SwarmCanvas from '@/features/swarm-viz/components/SwarmCanvas'
import { useRunEvents } from '@/features/swarm-viz/hooks/useRunEvents'
import { buildSwarmModel } from '@/features/swarm-viz/model/swarmModel'
import { fetchOrchestrationRun, forceCancelOrchestrationRun, requeueOrchestrationRun } from '@/lib/services/orchestratorApi'
import { getRunContext } from '@/lib/services/runContextStore'
import type { OrchestrationRun } from '@/lib/types/orchestrator'

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

  const { events, runStatus, loading, error, connectionStatus, lastEventTs, reconnectCount, refresh } = useRunEvents(runId, {
    limit: 600,
  })
  useEffect(() => {
    let active = true
    const context = getRunContext(runId)
    setProposalId(context?.proposalId ?? null)
    void fetchOrchestrationRun(runId)
      .then((run) => {
        if (active) setRunSummary(run)
      })
      .catch(() => {
        if (active) setRunSummary(null)
      })
    return () => {
      active = false
    }
  }, [runId])

  const model = useMemo(() => buildSwarmModel(events, runStatus), [events, runStatus])

  const [showCompleted, setShowCompleted] = useState(true)
  const [groupByPhase, setGroupByPhase] = useState(true)
  const [followLive, setFollowLive] = useState(true)
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [selectedPhases, setSelectedPhases] = useState<string[]>([])
  const [resetSignal, setResetSignal] = useState(0)

  const displayStatus = (runSummary?.status || runStatus?.status || '').toLowerCase()
  const isTerminalError = displayStatus === 'stuck' || displayStatus.startsWith('error:') || displayStatus === 'failed'
  const requirementsRequest = runSummary?.requirementsRequest ?? runSummary?.sandboxReport?.requirementsRequest
  const isRequirementsBlocked =
    displayStatus === 'blocked_requirements'
    || displayStatus === 'needs_requirements'
    || runSummary?.verificationStatus === 'needs_requirements'
  const runDetailHref = `/runs/${encodeURIComponent(runId)}#requirements-request`
  const conciergeHref = proposalId
    ? `/concierge?proposal=${encodeURIComponent(proposalId)}&run=${encodeURIComponent(runId)}`
    : `/concierge?run=${encodeURIComponent(runId)}`

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
            <div className="rounded-2xl border border-amber-700/60 bg-amber-950/20 p-4 text-sm text-amber-100">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-3xl space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-amber-100">
                    <AlertTriangle className="h-4 w-4" />
                    Requirements needed to continue this run
                  </div>
                  <p className="text-amber-100/90">
                    Swarm View shows where execution stopped. Answer the blocker questions in Run Detail or Concierge, and the same run will be queued to resume with those answers.
                  </p>
                  {requirementsRequest?.summary && (
                    <p className="text-amber-50/90">{requirementsRequest.summary}</p>
                  )}
                  {(requirementsRequest?.blockers?.length ?? 0) > 0 && (
                    <div className="space-y-2 pt-1 text-xs">
                      {requirementsRequest?.blockers?.slice(0, 2).map((blocker) => (
                        <div key={blocker.id} className="rounded-xl border border-amber-700/50 bg-amber-950/30 p-3">
                          <div><span className="font-semibold">Question:</span> {blocker.question}</div>
                          {blocker.why && <div className="mt-1 text-amber-100/80"><span className="font-semibold">Why:</span> {blocker.why}</div>}
                        </div>
                      ))}
                      {(requirementsRequest?.blockers?.length ?? 0) > 2 && (
                        <div className="text-amber-200/80">
                          Open Run Detail to review the remaining {(requirementsRequest?.blockers?.length ?? 0) - 2} question(s).
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex min-w-[220px] flex-col gap-2">
                  <Link
                    href={runDetailHref}
                    className="inline-flex items-center justify-center rounded-xl border border-amber-600 bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-50 hover:bg-amber-500/25"
                  >
                    Review Questions in Run Detail
                  </Link>
                  <Link
                    href={conciergeHref}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm font-medium text-slate-100 hover:border-slate-600 hover:bg-slate-800/80"
                  >
                    Answer in Concierge
                  </Link>
                  <div className="text-xs text-amber-200/80">
                    Concierge will restate the blocker packet so you can answer it without reconstructing context by hand.
                  </div>
                  {(runSummary?.checkpoints?.length ?? 0) > 0 && (
                    <div className="text-xs text-slate-400">
                      Run Detail also shows the checkpoint history and any learning-agent instruction adjustments captured for the next run.
                    </div>
                  )}
                </div>
              </div>
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
