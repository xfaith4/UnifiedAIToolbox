'use client'

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ORCHESTRATOR_API_BASE,
  cancelOrchestrationRun,
  forceCancelOrchestrationRun,
  fetchOrchestrationRun,
  fetchOrchestrationRunLog,
  requeueOrchestrationRun,
} from '@/lib/services/orchestratorApi'
import type { OrchestrationRun, RepoOrchestrationReport } from '@/lib/types/orchestrator'
import { nodeMatchesFilter, renderMarkdown } from '@/lib/artifacts/viewerUtils'

type ArtifactItem = {
  artifactId?: string
  fileName?: string
  filePath?: string
  mimeType?: string
  size?: number
  createdAt?: string
}

type TabKey = 'report' | 'verification' | 'findings' | 'diff' | 'raw'

const toFileUrl = (path: string) => `file:///${path.replace(/\\/g, '/')}`
const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const formatValue = (value: unknown) => {
  if (value === null) return 'null'
  if (typeof value === 'string') return `"${value}"`
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `[${value.length} items]`
  if (typeof value === 'object') return '{...}'
  return String(value)
}

const copyText = async (value: string) => {
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    return
  }
}

const openPath = async (absPath: string | undefined) => {
  if (!absPath) return
  try {
    const res = await fetch('/api/open-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: absPath }),
    })
    if (!res.ok) throw new Error(`open-path failed (${res.status})`)
  } catch {
    await copyText(absPath)
  }
}

const normalizeVerificationText = (value: string | undefined) =>
  String(value || '')
    .replace(/###\s*Contract Traceability/gi, 'Engineer.contract_traceability[]')
    .replace(/missing required section/gi, 'missing required JSON field')

const JsonNode = ({
  label,
  value,
  path,
  filter,
  onCopy,
}: {
  label: string
  value: unknown
  path: string
  filter: string
  onCopy: (path: string) => void
}) => {
  if (!nodeMatchesFilter(value, filter)) return null
  const isObject = typeof value === 'object' && value !== null
  if (!isObject) {
    return (
      <div className="flex items-center gap-3 text-xs text-slate-200">
        <span className="font-mono text-slate-300">{label}</span>
        <span className="text-slate-400">{formatValue(value)}</span>
        <button
          className="text-[11px] text-blue-300 underline"
          onClick={(event) => {
            event.stopPropagation()
            event.preventDefault()
            onCopy(path)
          }}
        >
          Copy path
        </button>
      </div>
    )
  }

  const entries = Array.isArray(value) ? value.map((item, idx) => [String(idx), item]) : Object.entries(value)
  const summaryMeta = Array.isArray(value) ? `Array(${entries.length})` : `Object(${entries.length})`

  return (
    <details open className="rounded border border-slate-800 bg-slate-950/30 px-3 py-2">
      <summary className="flex cursor-pointer items-center gap-3 text-xs text-slate-200">
        <span className="font-mono">{label}</span>
        <span className="text-slate-400">{summaryMeta}</span>
        <button
          className="text-[11px] text-blue-300 underline"
          onClick={(event) => {
            event.stopPropagation()
            event.preventDefault()
            onCopy(path)
          }}
        >
          Copy path
        </button>
      </summary>
      <div className="mt-2 space-y-2 pl-4">
        {entries.length === 0 && <div className="text-xs text-slate-500">No entries</div>}
        {entries.map(([key, val]) => {
          const nextPath = Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`
          return (
            <JsonNode
              key={`${path}-${key}`}
              label={key}
              value={val}
              path={nextPath}
              filter={filter}
              onCopy={onCopy}
            />
          )
        })}
      </div>
    </details>
  )
}

export default function RepoRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId: rawRunId } = use(params)
  const runId = safeDecode(rawRunId)

  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([])
  const [report, setReport] = useState<RepoOrchestrationReport | null>(null)
  const [reportMd, setReportMd] = useState('')
  const [verificationMd, setVerificationMd] = useState('')
  const [findingsJson, setFindingsJson] = useState<unknown>(null)
  const [patchDiff, setPatchDiff] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Fallback: orchestrator (non-repo) run
  const [orchRun, setOrchRun] = useState<OrchestrationRun | null>(null)
  const [orchLog, setOrchLog] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('report')
  const [reportFilter, setReportFilter] = useState('')
  const [findingsFilter, setFindingsFilter] = useState('')
  const [cancelPending, setCancelPending] = useState(false)
  const [forceCancelPending, setForceCancelPending] = useState(false)
  const [requeuePending, setRequeuePending] = useState(false)
  const [cancelMessage, setCancelMessage] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null)
  const [buildInfo, setBuildInfo] = useState<{
    runDir: string
    artifactsDir: string
    artifactsDirExists: boolean
    readme: string | null
    fileCount: number
    files: string[]
  } | null>(null)

  // Fetch build output location for completed App Factory (maint-) runs
  useEffect(() => {
    if (!orchRun || orchRun.status !== 'completed' || !orchRun.id.startsWith('maint-')) return
    void fetch(`/api/app-factory/runs/${encodeURIComponent(orchRun.id)}/info`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.runDir) setBuildInfo(data) })
      .catch(() => null)
  }, [orchRun?.id, orchRun?.status])

  const artifactByName = useMemo(() => {
    const map = new Map<string, ArtifactItem>()
    artifacts.forEach((artifact) => {
      if (artifact.fileName) map.set(artifact.fileName, artifact)
    })
    return map
  }, [artifacts])

  const runDir = useMemo(() => {
    const path = artifacts[0]?.filePath
    if (!path) return undefined
    const normalized = path.replace(/\\/g, '/')
    return normalized.slice(0, normalized.lastIndexOf('/'))
  }, [artifacts])

  const reportArtifact = artifactByName.get('REPORT.json')
  const reportMdArtifact = artifactByName.get('REPORT.md')
  const verificationMdArtifact = artifactByName.get('verification.md')
  const findingsArtifact = artifactByName.get('placeholder-scan.json')
  const diffArtifact = artifactByName.get('PATCH.diff')
  const legacyHtmlArtifact = artifactByName.get('Final_Synthesis.html')

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      setReport(null)
      setReportMd('')
      setVerificationMd('')
      setFindingsJson(null)
      setPatchDiff('')
      setArtifacts([])
      setActiveTab('report')
      setOrchRun(null)
      setOrchLog(null)
      setCancelMessage(null)
      setCancelError(null)
      setCancelPending(false)
      setForceCancelPending(false)
      setRequeuePending(false)

      if (!ORCHESTRATOR_API_BASE) {
        setError('Orchestrator API base is not configured.')
        setLoading(false)
        return
      }

      try {
        const listRes = await fetch(
          `${ORCHESTRATOR_API_BASE}/orchestrate/repo/${encodeURIComponent(runId)}/artifacts`
        )
        if (!listRes.ok) {
          // 404 → this is an orchestrator run, not a repo run — load it via the other endpoint
          if (listRes.status === 404) {
            try {
              const [run, logResult] = await Promise.allSettled([
                fetchOrchestrationRun(runId),
                fetchOrchestrationRunLog(runId),
              ])
              if (!cancelled) {
                if (run.status === 'fulfilled') {
                  setOrchRun(run.value)
                  setSelectedAttemptId((prev) => prev ?? run.value.currentAttemptId ?? null)
                }
                if (logResult.status === 'fulfilled') setOrchLog(logResult.value.log)
                if (run.status === 'rejected') setError('Run not found.')
              }
            } catch {
              if (!cancelled) setError('Run not found.')
            }
            if (!cancelled) setLoading(false)
            return
          }
          const text = await listRes.text().catch(() => '')
          throw new Error(text || `Failed to load artifacts (${listRes.status})`)
        }
        const listPayload = (await listRes.json()) as { artifacts?: ArtifactItem[] }
        const items = Array.isArray(listPayload.artifacts) ? listPayload.artifacts : []
        if (!cancelled) setArtifacts(items)

        const findByName = (name: string) => items.find((artifact) => artifact.fileName === name)
        const reportJsonItem = findByName('REPORT.json')
        if (reportJsonItem?.artifactId) {
          const reportRes = await fetch(
            `${ORCHESTRATOR_API_BASE}/orchestrate/repo/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(reportJsonItem.artifactId)}`
          )
          if (!reportRes.ok) {
            const text = await reportRes.text().catch(() => '')
            throw new Error(text || `Failed to load report JSON (${reportRes.status})`)
          }
          const raw = await reportRes.text()
          if (!cancelled) {
            try {
              setReport(JSON.parse(raw))
            } catch {
              throw new Error('REPORT.json is not valid JSON.')
            }
          }
        }

        const reportMdItem = findByName('REPORT.md')
        if (reportMdItem?.artifactId) {
          const res = await fetch(
            `${ORCHESTRATOR_API_BASE}/orchestrate/repo/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(reportMdItem.artifactId)}`
          )
          if (res.ok) {
            const text = await res.text()
            if (!cancelled) setReportMd(text)
          }
        }

        const verificationItem = findByName('verification.md')
        if (verificationItem?.artifactId) {
          const res = await fetch(
            `${ORCHESTRATOR_API_BASE}/orchestrate/repo/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(verificationItem.artifactId)}`
          )
          if (res.ok) {
            const text = await res.text()
            if (!cancelled) setVerificationMd(text)
          }
        }

        const findingsItem = findByName('placeholder-scan.json')
        if (findingsItem?.artifactId) {
          const res = await fetch(
            `${ORCHESTRATOR_API_BASE}/orchestrate/repo/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(findingsItem.artifactId)}`
          )
          if (res.ok) {
            const text = await res.text()
            if (!cancelled) {
              try {
                setFindingsJson(JSON.parse(text))
              } catch {
                setFindingsJson(null)
              }
            }
          }
        }

        const diffItem = findByName('PATCH.diff')
        if (diffItem?.artifactId) {
          const res = await fetch(
            `${ORCHESTRATOR_API_BASE}/orchestrate/repo/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(diffItem.artifactId)}`
          )
          if (res.ok) {
            const text = await res.text()
            if (!cancelled) setPatchDiff(text)
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load run.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [runId])

  const commands = report?.verification?.commands ?? []
  const passedCommands = commands.filter((cmd) => cmd?.exit_code === 0).length
  const failedCommands = commands.filter((cmd) => cmd?.exit_code !== 0 && cmd?.exit_code !== null && cmd?.exit_code !== undefined).length

  const outcome = report?.outcome ?? 'unknown'
  const outcomeStyles: Record<string, string> = {
    changes_applied: 'border-emerald-500/40 bg-emerald-900/30 text-emerald-100',
    no_changes_by_design: 'border-slate-600/50 bg-slate-800/60 text-slate-100',
    blocked: 'border-amber-500/40 bg-amber-900/30 text-amber-100',
    failed: 'border-rose-500/40 bg-rose-900/30 text-rose-100',
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'report', label: 'Report' },
    { key: 'verification', label: 'Verification' },
    { key: 'findings', label: 'Findings' },
    { key: 'diff', label: 'Diff' },
    { key: 'raw', label: 'Raw' },
  ]

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      return
    }
  }

  const handleCancelOrchestrationRun = async () => {
    setCancelPending(true)
    setCancelError(null)
    setCancelMessage(null)
    try {
      const result = await cancelOrchestrationRun(runId)
      const requested = Boolean(result.cancel_requested || result.cancelRequested)
      if (result.cancelled) {
        setCancelMessage(result.message || 'Run cancelled.')
        setOrchRun((prev) =>
          prev
            ? {
                ...prev,
                status: 'cancelled',
                completedAt: prev.completedAt ?? new Date().toISOString(),
                events: [
                  ...(prev.events ?? []),
                  { timestamp: new Date().toISOString(), type: 'status', message: 'cancelled' },
                ],
              }
            : prev
        )
      } else if (requested) {
        setCancelMessage(result.message || 'Cancellation requested. The run will stop shortly.')
      } else {
        setCancelMessage(result.message || 'Run could not be cancelled.')
      }

      // Best effort refresh so UI reflects actual backend state.
      try {
        const refreshed = await fetchOrchestrationRun(runId)
        setOrchRun(refreshed)
      } catch {
        // Keep optimistic state if refresh fails.
      }
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Failed to cancel run.')
    } finally {
      setCancelPending(false)
    }
  }

  const handleForceCancelOrchestrationRun = async () => {
    setForceCancelPending(true)
    setCancelError(null)
    setCancelMessage(null)
    try {
      const result = await forceCancelOrchestrationRun(runId)
      setCancelMessage(result.message || 'Force cancel completed.')
      try {
        const refreshed = await fetchOrchestrationRun(runId)
        setOrchRun(refreshed)
      } catch {
        // Keep current state when refresh fails.
      }
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Failed to force-cancel run.')
    } finally {
      setForceCancelPending(false)
    }
  }

  const handleRequeueOrchestrationRun = async () => {
    setRequeuePending(true)
    setCancelError(null)
    setCancelMessage(null)
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/requeue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerReason: 'requeue' }),
      })
      const result = (await res.json()) as { message?: string; attempt_id?: string; attempt_number?: number }
      setCancelMessage(result.message || `Run requeued (attempt ${result.attempt_number ?? ''}).`)
      if (result.attempt_id) {
        setSelectedAttemptId(result.attempt_id)
      }
      try {
        const refreshed = await fetchOrchestrationRun(runId)
        setOrchRun(refreshed)
        if (result.attempt_id) setSelectedAttemptId(result.attempt_id)
      } catch {
        setOrchRun((prev) =>
          prev
            ? {
                ...prev,
                status: 'queued',
                completedAt: undefined,
                events: [
                  ...(prev.events ?? []),
                  { timestamp: new Date().toISOString(), type: 'status', message: 'requeued', attemptId: result.attempt_id },
                ],
              }
            : prev
        )
      }
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Failed to requeue run.')
    } finally {
      setRequeuePending(false)
    }
  }

  const renderArtifactLinks = (artifact?: ArtifactItem) => {
    if (!artifact) return null
    return (
      <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
        {artifact.artifactId && (
          <Link className="underline" href={`/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifact.artifactId)}`}>
            View in app
          </Link>
        )}
        {artifact.filePath && (
          <a
            className="underline"
            href={toFileUrl(artifact.filePath)}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
              event.preventDefault()
              void openPath(artifact.filePath)
            }}
          >
            Open file
          </a>
        )}
      </div>
    )
  }

  // ── Orchestrator run fallback view ────────────────────────────────────────────
  if (!loading && orchRun) {
    const isError = orchRun.status?.startsWith('error') || orchRun.status === 'failed'
    const isRunning = orchRun.status && !['completed', 'failed', 'cancelled', 'stuck'].includes(orchRun.status) && !isError
    const statusLower = String(orchRun.status || '').toLowerCase()
    const canCancel = ['queued', 'pending', 'dispatching', 'running', 'in_progress', 'awaiting_input', 'gating', 'awaiting_gate', 'starting']
      .includes(statusLower)
    const canForceCancel = ['dispatching', 'running', 'in_progress', 'awaiting_input', 'gating', 'awaiting_gate', 'starting', 'stuck']
      .includes(statusLower)
    const canRequeue = ['failed', 'cancelled', 'stuck', 'completed', 'blocked_requirements', 'needs_requirements'].includes(statusLower)
    const statusCls = orchRun.status === 'completed'
      ? 'border-emerald-700 bg-emerald-900/30 text-emerald-100'
      : orchRun.status === 'stuck'
        ? 'border-amber-700 bg-amber-900/30 text-amber-100'
      : isError
        ? 'border-rose-700 bg-rose-900/30 text-rose-100'
        : 'border-blue-700 bg-blue-900/30 text-blue-100'

    // Separate agent activity events from run lifecycle events
    const attemptFilteredEvents = (orchRun.events ?? []).filter(
      (ev) => !selectedAttemptId || !ev.attemptId || ev.attemptId === selectedAttemptId
    )
    const agentEvents = attemptFilteredEvents.filter((ev) => ev.type.startsWith('agent:'))
    const overseerEvents = attemptFilteredEvents.filter((ev) => ev.type.startsWith('overseer:'))
    const lifecycleEvents = attemptFilteredEvents.filter(
      (ev) => !ev.type.startsWith('agent:') && !ev.type.startsWith('overseer:') && ev.type !== 'debug'
    )
    const allEventMessages = (orchRun.events ?? []).map((ev) => ev.message ?? '')
    const maintenanceContextMissing = allEventMessages.some((message) =>
      /maintenance contract context is required/i.test(message)
    )
    const maintenanceFailingAgents = Array.from(
      new Set(
        (orchRun.events ?? [])
          .map((ev) => {
            const match = ev.message?.match(/^\[([^\]]+)\]\s+agent_output_error:/i)
            return match?.[1]?.trim() ?? null
          })
          .filter((agent): agent is string => Boolean(agent))
      )
    )
    const goalLooksWpf = /\b(wpf|xaml|windows desktop|desktop app)\b/i.test(orchRun.goal ?? '')
    const contractMismatchDetected =
      goalLooksWpf &&
      allEventMessages.some((message) => /conceptualmodelcontract|dom|web probe|contract/i.test(message))
    const effectiveMaintenanceAgents = maintenanceFailingAgents.length > 0
      ? maintenanceFailingAgents
      : ['PRPublisher', 'ReviewGate']
    const failedVerificationChecks = (orchRun.sandboxReport?.checks ?? []).filter((check) => check.result === 'failed')
    const verificationFailures = failedVerificationChecks.map((check) => {
      const rawDetails = normalizeVerificationText(check.details || '')
      const isTraceabilityFailure =
        /contract traceability/i.test(rawDetails) || /contract traceability/i.test(check.check || '')
      if (isTraceabilityFailure) {
        return {
          blocker: 'Contract Traceability missing',
          expected: 'Engineer.contract_traceability[] in strict JSON',
          found: rawDetails || 'Missing from Engineer output',
          fix: 'Emit raw JSON only and include contract_traceability[] entries for each contract requirement.',
        }
      }
      return {
        blocker: normalizeVerificationText(check.check),
        expected: 'Acceptance check must pass with machine-verifiable output',
        found: rawDetails || 'Check failed',
        fix: 'Run repair/requeue and inspect failing agent output for schema mismatch.',
      }
    })
    const executionStateLabel =
      statusLower === 'completed'
        ? 'Completed'
        : statusLower === 'blocked_requirements' || statusLower === 'needs_requirements'
          ? 'Blocked requirements'
        : statusLower === 'queued' || statusLower === 'pending'
          ? 'Queued'
          : statusLower === 'dispatching'
            ? 'Dispatching'
            : statusLower === 'running' || statusLower === 'in_progress'
              ? 'Running'
              : statusLower === 'cancelled' || statusLower === 'canceled'
                ? 'Cancelled'
                : statusLower === 'stuck'
                  ? 'Stuck'
                  : isError
                    ? 'Failed to run'
                    : (orchRun.status ?? 'Unknown')
    const executionBadgeCls =
      executionStateLabel === 'Completed'
        ? 'border-emerald-700 bg-emerald-900/30 text-emerald-100'
        : executionStateLabel === 'Blocked requirements'
          ? 'border-amber-700 bg-amber-900/30 text-amber-100'
        : executionStateLabel === 'Running' || executionStateLabel === 'Dispatching' || executionStateLabel === 'Queued'
          ? 'border-blue-700 bg-blue-900/30 text-blue-100'
          : executionStateLabel === 'Stuck'
            ? 'border-amber-700 bg-amber-900/30 text-amber-100'
            : 'border-rose-700 bg-rose-900/30 text-rose-100'
    const outcomeLabel = isError
      ? 'Failed to run'
      : orchRun.sandboxReport?.verificationStatus === 'needs_requirements'
        ? 'Needs requirements'
      : orchRun.sandboxReport?.verificationStatus === 'failed'
        ? 'Failed gates'
        : orchRun.sandboxReport?.verificationStatus === 'partial' || orchRun.sandboxReport?.verificationStatus === 'deferred'
          ? 'Needs repair'
          : orchRun.sandboxReport?.verificationStatus === 'passed'
            ? 'Pass'
            : executionStateLabel === 'Completed'
              ? 'Conditional'
              : 'In progress'
    const outcomeBadgeCls =
      outcomeLabel === 'Pass'
        ? 'border-emerald-700 bg-emerald-900/30 text-emerald-100'
      : outcomeLabel === 'In progress'
          ? 'border-blue-700 bg-blue-900/30 text-blue-100'
          : outcomeLabel === 'Conditional' || outcomeLabel === 'Needs repair' || outcomeLabel === 'Needs requirements'
            ? 'border-amber-700 bg-amber-900/30 text-amber-100'
            : 'border-rose-700 bg-rose-900/30 text-rose-100'
    const failedGateCount = verificationFailures.length
    const requirementsRequest = orchRun.requirementsRequest ?? orchRun.sandboxReport?.requirementsRequest

    const synthesisHtmlPath = orchRun.runDir
      ? `${orchRun.runDir.replace(/[\\\/]+$/, '')}${orchRun.runDir.includes('\\') ? '\\' : '/'}Final_Synthesis.html`
      : null

    return (
      <main className="max-w-4xl space-y-6">
        <div>
          <Link href="/runs" className="text-xs text-slate-400 hover:text-slate-200">← Back to Runs</Link>
          <h1 className="mt-2 text-2xl font-semibold">Run Detail</h1>
          {orchRun.goal && <p className="mt-1 text-sm text-slate-400">{orchRun.goal}</p>}
        </div>

        <div className={`flex flex-wrap items-center gap-3 rounded-2xl border p-4 ${statusCls}`}>
          <span className={`rounded border px-2 py-1 text-xs font-semibold uppercase tracking-wide ${executionBadgeCls}`}>
            Run State: {executionStateLabel}
          </span>
          <span className={`rounded border px-2 py-1 text-xs font-semibold uppercase tracking-wide ${outcomeBadgeCls}`}>
            Outcome: {outcomeLabel}
          </span>
          {(executionStateLabel === 'Completed' || executionStateLabel === 'Blocked requirements') && (outcomeLabel === 'Failed gates' || outcomeLabel === 'Needs repair' || outcomeLabel === 'Conditional' || outcomeLabel === 'Needs requirements') && (
            <span className="text-xs text-amber-100">
              Verification reported blockers or missing requirements.
            </span>
          )}
          {isRunning && <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />}
          <div className="ml-auto flex items-center gap-2">
            {synthesisHtmlPath && (
              <a
                href={toFileUrl(synthesisHtmlPath)}
                target="_blank"
                rel="noreferrer"
                className="rounded border border-current px-2 py-1 text-xs opacity-80 hover:opacity-100"
                onClick={(event) => {
                  event.preventDefault()
                  void openPath(synthesisHtmlPath)
                }}
              >
                View Output →
              </a>
            )}
            <Link
              href={`/runs/${encodeURIComponent(runId)}/swarm${selectedAttemptId ? `?attempt_id=${encodeURIComponent(selectedAttemptId)}` : ''}`}
              className="rounded border border-current px-2 py-1 text-xs opacity-80 hover:opacity-100"
            >
              Swarm View
            </Link>
            {canCancel && (
              <button
                type="button"
                onClick={() => void handleCancelOrchestrationRun()}
                disabled={cancelPending}
                className="rounded border border-rose-500/70 bg-rose-900/30 px-2 py-1 text-xs text-rose-100 hover:bg-rose-900/50 disabled:opacity-50"
              >
                {cancelPending ? 'Cancelling…' : 'Cancel Run'}
              </button>
            )}
            {canForceCancel && (
              <button
                type="button"
                onClick={() => void handleForceCancelOrchestrationRun()}
                disabled={forceCancelPending}
                className="rounded border border-rose-700 bg-rose-950/60 px-2 py-1 text-xs text-rose-100 hover:bg-rose-900/60 disabled:opacity-50"
              >
                {forceCancelPending ? 'Force cancelling…' : 'Force Cancel'}
              </button>
            )}
            {canRequeue && (
              <button
                type="button"
                onClick={() => void handleRequeueOrchestrationRun()}
                disabled={requeuePending}
                className="rounded border border-amber-600/70 bg-amber-900/20 px-2 py-1 text-xs text-amber-100 hover:bg-amber-900/40 disabled:opacity-50"
              >
                {requeuePending ? 'Requeueing…' : 'Requeue'}
              </button>
            )}
            <span className="font-mono text-xs opacity-50">{orchRun.id.slice(0, 20)}</span>
          </div>
        </div>
        {orchRun.heartbeatStale && (
          <div className="rounded-xl border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
            STUCK (no heartbeat): worker lease expired. Use Force Cancel or Requeue.
          </div>
        )}
        {cancelMessage && (
          <div className="rounded-xl border border-amber-700/40 bg-amber-900/20 px-3 py-2 text-xs text-amber-100">
            {cancelMessage}
          </div>
        )}
        {cancelError && (
          <div className="rounded-xl border border-rose-700/40 bg-rose-900/20 px-3 py-2 text-xs text-rose-100">
            {cancelError}
          </div>
        )}
        {orchRun.attempts && orchRun.attempts.length > 1 && (
          <div className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs">
            <span className="text-slate-400 shrink-0">Attempt:</span>
            <select
              value={selectedAttemptId ?? orchRun.currentAttemptId ?? ''}
              onChange={(e) => setSelectedAttemptId(e.target.value || null)}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
            >
              {orchRun.attempts.map((a) => {
                const isCurrent = a.attemptId === (orchRun.currentAttemptId ?? orchRun.attempts?.at(-1)?.attemptId)
                return (
                  <option key={a.attemptId} value={a.attemptId}>
                    Attempt {a.attemptNumber}{isCurrent ? ' (current)' : ` — ${a.status}`}
                  </option>
                )
              })}
            </select>
          </div>
        )}
        {(failedGateCount > 0 || maintenanceContextMissing || contractMismatchDetected) && (
          <div className="rounded-2xl border border-rose-800 bg-rose-950/20 p-4 text-xs text-rose-100 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold text-rose-100">
                What failed {failedGateCount > 0 ? `(${failedGateCount} blocker${failedGateCount === 1 ? '' : 's'})` : ''}
              </div>
              <div className="text-[11px] text-rose-200">Completed execution != passed quality gates</div>
            </div>
            {verificationFailures.map((failure, idx) => (
              <div key={`vf-${idx}`} className="rounded-xl border border-rose-800/60 bg-rose-950/30 p-3 space-y-1">
                <div><span className="font-semibold">Blocker:</span> {failure.blocker}</div>
                <div><span className="font-semibold">Expected:</span> {failure.expected}</div>
                <div><span className="font-semibold">Found:</span> {failure.found}</div>
                <div><span className="font-semibold">Fix:</span> {failure.fix}</div>
              </div>
            ))}
            {maintenanceContextMissing && (
              <div className="rounded-xl border border-rose-800/60 bg-rose-950/30 p-3 space-y-1">
                <div><span className="font-semibold">Blocker:</span> Maintenance contract context missing</div>
                <div><span className="font-semibold">Expected:</span> `-JobType maintain_existing_app -ContractPath ...` for maintenance flow</div>
                <div><span className="font-semibold">Found:</span> failing agents: {effectiveMaintenanceAgents.join(', ')}</div>
                <div><span className="font-semibold">Fix:</span> rerun with maintenance contract path or use `build_new_app` mode.</div>
              </div>
            )}
            {contractMismatchDetected && (
              <div className="rounded-xl border border-amber-700/50 bg-amber-950/20 p-3 text-amber-100 space-y-1">
                <div><span className="font-semibold">Blocker:</span> Contract mismatch (DOM/web probes for WPF goal)</div>
                <div><span className="font-semibold">Expected:</span> App-type-specific probe schema</div>
                <div><span className="font-semibold">Fix:</span> set `AppType` explicitly before contract generation.</div>
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {orchRun.runDir && (
                <a
                  className="rounded border border-rose-700/70 bg-rose-900/20 px-2 py-1 text-[11px] hover:bg-rose-900/40"
                  href={toFileUrl(orchRun.runDir)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => {
                    event.preventDefault()
                    void openPath(orchRun.runDir)
                  }}
                >
                  Open failing artifacts
                </a>
              )}
              <button
                type="button"
                onClick={() => void handleRequeueOrchestrationRun()}
                disabled={requeuePending}
                className="rounded border border-amber-700/70 bg-amber-900/20 px-2 py-1 text-[11px] text-amber-100 hover:bg-amber-900/40 disabled:opacity-50"
              >
                {requeuePending ? 'Running repair/requeue…' : 'Run Repair (requeue)'}
              </button>
              <button
                type="button"
                onClick={() => void handleCopy('Emit strict JSON only. No markdown, no code fences, no prose. Include Engineer.contract_traceability[] with machine-verifiable mappings.')}
                className="rounded border border-slate-700 bg-slate-900/30 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800/60"
              >
                Re-run with stricter JSON (copy guidance)
              </button>
            </div>
          </div>
        )}
        {outcomeLabel === 'Needs requirements' && requirementsRequest && (
          <div className="rounded-2xl border border-amber-700/60 bg-amber-950/20 p-4 text-xs text-amber-100 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold text-amber-100">Requirements request</div>
              <div className="text-[11px] text-amber-200">Run is blocked pending requirements, not failed.</div>
            </div>
            {requirementsRequest.summary && (
              <p className="text-amber-100">{requirementsRequest.summary}</p>
            )}
            <div className="space-y-2">
              {(requirementsRequest.blockers ?? []).map((item, idx) => (
                <div key={`req-${idx}`} className="rounded-xl border border-amber-700/50 bg-amber-950/30 p-3">
                  <div><span className="font-semibold">Question:</span> {item.question}</div>
                  {item.why && <div><span className="font-semibold">Why:</span> {item.why}</div>}
                  {item.defaults && item.defaults.length > 0 && (
                    <div><span className="font-semibold">Defaults:</span> {item.defaults.join(' | ')}</div>
                  )}
                </div>
              ))}
            </div>
            {(requirementsRequest.proposed_acceptance_tests ?? []).length > 0 && (
              <div className="rounded-xl border border-amber-700/50 bg-amber-950/30 p-3 space-y-1">
                <div className="font-semibold">Proposed acceptance tests</div>
                <ul className="list-disc pl-5 space-y-1">
                  {requirementsRequest.proposed_acceptance_tests?.map((test, idx) => (
                    <li key={`accept-${idx}`}>{test}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {isError && (
          <div className="rounded-2xl border border-rose-800 bg-rose-950/30 p-4 text-xs text-rose-200 space-y-3">
            {maintenanceContextMissing && (
              <div className="space-y-1">
                <div className="font-semibold text-rose-100">Run failed: Maintenance contract context missing</div>
                <p>Failing agents: {effectiveMaintenanceAgents.join(', ')}</p>
                <p>
                  Next action: rerun with <code>-JobType maintain_existing_app -ContractPath ...</code> or run in{' '}
                  <code>build_new_app</code> mode.
                </p>
              </div>
            )}
            {contractMismatchDetected && (
              <div className="space-y-1 rounded-lg border border-amber-700/40 bg-amber-950/20 p-2 text-amber-100">
                <div className="font-semibold">Contract mismatch: DOM/web probes generated for WPF goal</div>
                <p>Contract used: ConceptualModelContract (DOM oriented)</p>
                <p>Expected: WPF-oriented contract probes</p>
              </div>
            )}
            {orchRun.errorDetail && (
              <div className="space-y-1">
                <div className="font-semibold text-rose-100">Error detail</div>
                <pre className="whitespace-pre-wrap break-all opacity-80">{orchRun.errorDetail}</pre>
              </div>
            )}
          </div>
        )}

        {buildInfo && orchRun.status === 'completed' && (
          <div className="rounded-2xl border border-emerald-700/60 bg-emerald-950/20 p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-400">Build Output</div>
            <div>
              <div className="text-[11px] text-emerald-300/70 mb-1">
                {buildInfo.fileCount} file{buildInfo.fileCount !== 1 ? 's' : ''} generated — files are ready locally
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-gray-900/60 px-2 py-1 text-xs font-mono text-emerald-100">
                  {buildInfo.artifactsDirExists ? buildInfo.artifactsDir : buildInfo.runDir}
                </code>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(buildInfo.artifactsDirExists ? buildInfo.artifactsDir : buildInfo.runDir)}
                  className="shrink-0 rounded bg-emerald-900/40 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-900/70"
                >
                  Copy path
                </button>
              </div>
            </div>
            {buildInfo.readme && (
              <details>
                <summary className="cursor-pointer text-[11px] font-semibold text-emerald-200 hover:text-emerald-100">
                  README.md
                </summary>
                <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded bg-gray-900/60 p-3 text-[11px] text-gray-300">
                  {buildInfo.readme}
                </pre>
              </details>
            )}
            {buildInfo.files.length > 0 && (
              <details>
                <summary className="cursor-pointer text-[11px] font-semibold text-slate-400 hover:text-slate-200">
                  Generated files ({buildInfo.fileCount})
                </summary>
                <ul className="mt-2 max-h-48 overflow-y-auto space-y-0.5">
                  {buildInfo.files.map((f) => (
                    <li key={f} className="font-mono text-[11px] text-slate-400 pl-2">{f}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {orchRun.startedAt && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-xs text-slate-300">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Started</div>
              {new Date(orchRun.startedAt).toLocaleString()}
            </div>
          )}
          {orchRun.completedAt && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-xs text-slate-300">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Completed</div>
              {new Date(orchRun.completedAt).toLocaleString()}
            </div>
          )}
          {orchRun.runMode && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-xs text-slate-300">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Mode</div>
              {orchRun.runMode}
            </div>
          )}
          {orchRun.model && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-xs text-slate-300">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Model</div>
              {orchRun.model}
            </div>
          )}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-xs text-slate-300">
            <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Last Heartbeat</div>
            {orchRun.lastHeartbeatAt ? new Date(orchRun.lastHeartbeatAt).toLocaleString() : '—'}
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-xs text-slate-300">
            <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Last Event</div>
            {orchRun.lastEventAt ? new Date(orchRun.lastEventAt).toLocaleString() : '—'}
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-xs text-slate-300">
            <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Current Agent / Stage</div>
            {orchRun.currentAgent ?? '—'} / {orchRun.currentStage ?? '—'}
          </div>
        </div>

        {/* ── Phase 1 Verification ── */}
        {orchRun.sandboxReport && (
          <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Verification</div>
              {(() => {
                const vs = orchRun.sandboxReport?.verificationStatus
                const cls = vs === 'passed'
                  ? 'bg-emerald-900/60 text-emerald-300 border-emerald-700'
                  : vs === 'failed'
                    ? 'bg-rose-900/60 text-rose-300 border-rose-700'
                    : vs === 'needs_requirements'
                      ? 'bg-amber-900/60 text-amber-300 border-amber-700'
                    : vs === 'partial'
                      ? 'bg-amber-900/60 text-amber-300 border-amber-700'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                return (
                  <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
                    {vs ?? 'pending'}
                  </span>
                )
              })()}
              <span className="ml-auto text-[11px] text-slate-600">
                {orchRun.sandboxReport.passedCount} passed ·{' '}
                {orchRun.sandboxReport.failedCount} failed ·{' '}
                {(orchRun.sandboxReport.needsRequirementsCount ?? 0)} needs requirements ·{' '}
                {orchRun.sandboxReport.deferredCount} deferred
              </span>
            </div>
            <div className="space-y-2">
              {orchRun.sandboxReport.checks.map((check, idx) => {
                const res = check.result
                const rowCls = res === 'passed'
                  ? 'border-emerald-900/50 bg-emerald-950/20'
                  : res === 'failed'
                    ? 'border-rose-900/50 bg-rose-950/20'
                    : 'border-slate-800 bg-slate-900/30'
                const badgeCls = res === 'passed'
                  ? 'bg-emerald-900/60 text-emerald-300'
                  : res === 'failed'
                    ? 'bg-rose-900/60 text-rose-300'
                    : 'bg-slate-800 text-slate-400'
                return (
                  <div key={idx} className={`rounded-xl border px-3 py-2 text-xs ${rowCls}`}>
                    <div className="flex items-start gap-2">
                      <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] ${badgeCls}`}>
                        {res}
                      </span>
                      <span className="text-slate-200 font-medium">{normalizeVerificationText(check.check)}</span>
                    </div>
                    <p className="mt-1 text-slate-400 pl-10">{normalizeVerificationText(check.details)}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {agentEvents.length > 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Agent Activity</div>
            <div className="space-y-1.5">
              {agentEvents.map((ev, idx) => (
                <div key={idx} className="flex items-center gap-3 text-xs">
                  <span className={`shrink-0 rounded-full w-2 h-2 ${ev.message === 'complete' ? 'bg-emerald-400' : 'bg-blue-400 animate-pulse'}`} />
                  <span className="font-medium text-slate-200">{ev.type.replace('agent:', '')}</span>
                  <span className={`rounded px-1.5 py-0.5 ${ev.message === 'complete' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-blue-900/50 text-blue-300'}`}>
                    {ev.message}
                  </span>
                  <span className="ml-auto text-slate-600">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {overseerEvents.length > 0 && (
          <div className="rounded-2xl border border-purple-900/50 bg-purple-950/20 p-4 space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-purple-400">Overseer Log</div>
              <span className="rounded-full bg-purple-900/50 border border-purple-800 px-2 py-0.5 text-[10px] text-purple-300">internal · not shown to user</span>
            </div>
            {overseerEvents.map((ev, idx) => {
              const subtype = ev.type.replace('overseer:', '')
              const badgeCls = subtype === 'critical'
                ? 'bg-rose-900/60 text-rose-200'
                : subtype === 'warn'
                  ? 'bg-amber-900/60 text-amber-200'
                  : subtype === 'action'
                    ? 'bg-purple-800/60 text-purple-200'
                    : 'bg-purple-900/40 text-purple-300'
              return (
                <div key={idx} className="flex items-start gap-3 text-xs">
                  <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono ${badgeCls}`}>{subtype}</span>
                  <span className="text-purple-200/80 break-all">{ev.message}</span>
                  <span className="ml-auto shrink-0 text-purple-900">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                </div>
              )
            })}
          </div>
        )}

        {lifecycleEvents.length > 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Timeline</div>
            {lifecycleEvents.map((ev, idx) => (
              <div key={idx} className="flex items-start gap-3 text-xs">
                <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono ${
                  ev.type === 'error' ? 'bg-rose-900/60 text-rose-200'
                  : ev.type === 'warn' ? 'bg-amber-900/60 text-amber-200'
                  : ev.type === 'status' ? 'bg-blue-900/60 text-blue-200'
                  : ev.type.startsWith('verify:') ? 'bg-teal-900/60 text-teal-200'
                  : 'bg-slate-800 text-slate-400'
                }`}>{ev.type}</span>
                <span className="text-slate-300 break-all">{ev.message.length > 200 ? ev.message.slice(0, 200) + '…' : ev.message}</span>
                <span className="ml-auto shrink-0 text-slate-600">{new Date(ev.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}

        {orchLog && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Log (tail)</div>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs text-slate-300">{orchLog}</pre>
          </div>
        )}

        {orchRun.output && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Output</div>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs text-slate-300">{orchRun.output}</pre>
          </div>
        )}
      </main>
    )
  }

  return (
    <main className="max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Run Summary</h1>
        <p className="mt-1 text-sm text-slate-400">
          Structured outcome view for repo orchestration runs, powered by REPORT.json.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-100">Run: {runId}</div>
            <div className="text-xs text-slate-400">{report?.repo?.url || 'Repo unavailable'}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800/60" href="/engine">
              Back to App Factory
            </Link>
            <Link className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800/60" href={`/runs/${encodeURIComponent(runId)}/swarm`}>
              Swarm View
            </Link>
            {runId && ORCHESTRATOR_API_BASE && (
              <a
                className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800/60"
                href={`${ORCHESTRATOR_API_BASE}/orchestrate/repo/${encodeURIComponent(runId)}/artifacts.zip`}
                target="_blank"
                rel="noreferrer"
              >
                Download ZIP
              </a>
            )}
            {runDir && (
              <a
                className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800/60"
                href={toFileUrl(runDir)}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => {
                  event.preventDefault()
                  void openPath(runDir)
                }}
              >
                Open Run Folder
              </a>
            )}
          </div>
        </div>
      </div>

      {loading && (
        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="h-4 w-32 rounded bg-slate-800/60" />
          <div className="h-3 w-64 rounded bg-slate-800/40" />
          <div className="h-48 rounded bg-slate-800/30" />
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-rose-800 bg-rose-900/30 p-4 text-sm text-rose-100">
          <div className="font-semibold">Run unavailable</div>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {!loading && !error && !report && (
        <div className="rounded-2xl border border-amber-800 bg-amber-900/30 p-4 text-sm text-amber-100 space-y-2">
          <div className="font-semibold">Legacy run — no structured report found.</div>
          <p className="text-xs text-amber-100">
            This run predates REPORT.json. Use legacy artifacts below to inspect the output.
          </p>
          {legacyHtmlArtifact && renderArtifactLinks(legacyHtmlArtifact)}
        </div>
      )}

      {!loading && !error && report && (
        <>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs uppercase tracking-wide ${outcomeStyles[outcome] || outcomeStyles.failed}`}>
                {outcome.replace(/_/g, ' ')}
              </span>
              <div className="text-sm font-semibold text-slate-100">
                {report.summary?.headline || 'Outcome summary unavailable'}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-300">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Verification</div>
                {commands.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    <div>Commands run: {commands.length}</div>
                    <div>Passed: {passedCommands}</div>
                    <div>Failed: {failedCommands}</div>
                  </div>
                ) : (
                  <div className="mt-2">No verification commands were executed in this run.</div>
                )}
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-300">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Changes</div>
                <div className="mt-2">
                  {report.changes?.patch_artifact
                    ? `Files changed: ${report.changes?.files_changed?.length ?? 0}`
                    : 'No patch produced'}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-300">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Findings</div>
                <div className="mt-2 space-y-1">
                  <div>TODOs: {report.findings?.todo_count ?? 0}</div>
                  <div>Placeholders: {report.findings?.placeholder_count ?? 0}</div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-300">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">What happened</div>
                <ul className="mt-2 space-y-1">
                  {(report.summary?.what_happened ?? []).map((item, idx) => (
                    <li key={idx} className="list-disc ml-4">{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-300">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Next actions</div>
                <ul className="mt-2 space-y-1">
                  {(report.summary?.next_actions ?? []).map((item, idx) => (
                    <li key={idx} className="list-disc ml-4">{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            {report.blockers && report.blockers.length > 0 && (
              <div className="rounded-xl border border-rose-800 bg-rose-900/20 p-3 text-xs text-rose-100 space-y-1">
                <div className="text-[11px] uppercase tracking-wide text-rose-200">Blockers</div>
                <ul className="mt-2 space-y-1">
                  {report.blockers.map((blocker, idx) => (
                    <li key={idx} className="list-disc ml-4">
                      <span className="font-semibold">{blocker.code || 'BLOCKER'}:</span> {blocker.message}
                      {blocker.suggested_fix ? ` (fix: ${blocker.suggested_fix})` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3 text-sm">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  className={`rounded-full px-3 py-1 text-xs ${
                    activeTab === tab.key ? 'bg-blue-500/20 text-blue-100' : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'report' && (
              <div className="mt-4 space-y-3">
                {renderArtifactLinks(reportMdArtifact)}
                {reportMd ? (
                  <div
                    className="prose prose-invert max-w-none rounded-xl border border-slate-800 bg-slate-950/40 p-4"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(reportMd) }}
                  />
                ) : (
                  <div className="text-sm text-slate-400">REPORT.md not found.</div>
                )}
              </div>
            )}

            {activeTab === 'verification' && (
              <div className="mt-4 space-y-3">
                {renderArtifactLinks(verificationMdArtifact)}
                {verificationMd ? (
                  <div
                    className="prose prose-invert max-w-none rounded-xl border border-slate-800 bg-slate-950/40 p-4"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(verificationMd) }}
                  />
                ) : (
                  <div className="text-sm text-slate-400">verification.md not available.</div>
                )}
              </div>
            )}

            {activeTab === 'findings' && (
              <div className="mt-4 space-y-3">
                {renderArtifactLinks(findingsArtifact)}
                {findingsJson ? (
                  <>
                    <input
                      className="w-full rounded border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-100"
                      placeholder="Search findings…"
                      value={findingsFilter}
                      onChange={(event) => setFindingsFilter(event.target.value)}
                    />
                    <JsonNode label="$" value={findingsJson} path="$" filter={findingsFilter} onCopy={handleCopy} />
                  </>
                ) : (
                  <div className="text-sm text-slate-400">placeholder-scan.json not available.</div>
                )}
              </div>
            )}

            {activeTab === 'diff' && (
              <div className="mt-4 space-y-3">
                {renderArtifactLinks(diffArtifact)}
                {patchDiff ? (
                  <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-100">
                    {patchDiff}
                  </pre>
                ) : (
                  <div className="text-sm text-slate-400">No patch produced.</div>
                )}
              </div>
            )}

            {activeTab === 'raw' && (
              <div className="mt-4 space-y-3">
                {renderArtifactLinks(reportArtifact)}
                <input
                  className="w-full rounded border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-100"
                  placeholder="Search report JSON…"
                  value={reportFilter}
                  onChange={(event) => setReportFilter(event.target.value)}
                />
                <JsonNode label="$" value={report} path="$" filter={reportFilter} onCopy={handleCopy} />
              </div>
            )}
          </div>
        </>
      )}
    </main>
  )
}
