'use client'

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ORCHESTRATOR_API_BASE, fetchOrchestrationRun, fetchOrchestrationRunLog } from '@/lib/services/orchestratorApi'
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
                if (run.status === 'fulfilled') setOrchRun(run.value)
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
          <a className="underline" href={toFileUrl(artifact.filePath)} target="_blank" rel="noreferrer">
            Open file
          </a>
        )}
      </div>
    )
  }

  // ── Orchestrator run fallback view ────────────────────────────────────────────
  if (!loading && orchRun) {
    const isError = orchRun.status?.startsWith('error') || orchRun.status === 'failed'
    const isRunning = orchRun.status && !['completed', 'failed', 'cancelled'].includes(orchRun.status) && !isError
    const statusCls = orchRun.status === 'completed'
      ? 'border-emerald-700 bg-emerald-900/30 text-emerald-100'
      : isError
        ? 'border-rose-700 bg-rose-900/30 text-rose-100'
        : 'border-blue-700 bg-blue-900/30 text-blue-100'

    // Separate agent activity events from run lifecycle events
    const agentEvents = (orchRun.events ?? []).filter((ev) => ev.type.startsWith('agent:'))
    const lifecycleEvents = (orchRun.events ?? []).filter((ev) => !ev.type.startsWith('agent:') && ev.type !== 'debug')

    const synthesisHtml = orchRun.runDir
      ? toFileUrl(`${orchRun.runDir.replace(/\\/g, '/')}/Final_Synthesis.html`)
      : null

    return (
      <main className="max-w-4xl space-y-6">
        <div>
          <Link href="/runs" className="text-xs text-slate-400 hover:text-slate-200">← Back to Runs</Link>
          <h1 className="mt-2 text-2xl font-semibold">Run Detail</h1>
          {orchRun.goal && <p className="mt-1 text-sm text-slate-400">{orchRun.goal}</p>}
        </div>

        <div className={`flex flex-wrap items-center gap-3 rounded-2xl border p-4 ${statusCls}`}>
          <span className="text-sm font-semibold capitalize">{orchRun.status ?? 'unknown'}</span>
          {isRunning && <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />}
          <div className="ml-auto flex items-center gap-2">
            {synthesisHtml && (
              <a
                href={synthesisHtml}
                target="_blank"
                rel="noreferrer"
                className="rounded border border-current px-2 py-1 text-xs opacity-80 hover:opacity-100"
              >
                View Output →
              </a>
            )}
            <span className="font-mono text-xs opacity-50">{orchRun.id.slice(0, 20)}</span>
          </div>
        </div>

        {isError && orchRun.errorDetail && (
          <div className="rounded-2xl border border-rose-800 bg-rose-950/30 p-4 text-xs text-rose-200 space-y-1">
            <div className="font-semibold text-rose-100">Error detail</div>
            <pre className="whitespace-pre-wrap break-all opacity-80">{orchRun.errorDetail}</pre>
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
        </div>

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

        {lifecycleEvents.length > 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Timeline</div>
            {lifecycleEvents.map((ev, idx) => (
              <div key={idx} className="flex items-start gap-3 text-xs">
                <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono ${
                  ev.type === 'error' ? 'bg-rose-900/60 text-rose-200'
                  : ev.type === 'warn' ? 'bg-amber-900/60 text-amber-200'
                  : ev.type === 'status' ? 'bg-blue-900/60 text-blue-200'
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
              <a className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800/60" href={toFileUrl(runDir)} target="_blank" rel="noreferrer">
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
