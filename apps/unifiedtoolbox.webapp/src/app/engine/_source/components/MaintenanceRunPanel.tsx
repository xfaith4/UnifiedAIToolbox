import React from 'react'
import type { RunStatusResponse } from '@/lib/app-factory/runs/types'

type Props = {
  runId: string | null
  status: RunStatusResponse | null
  loading?: boolean
  error?: string | null
}

function badgeClass(state: string) {
  switch (state) {
    case 'queued':
      return 'border-slate-600 bg-slate-800/60 text-slate-200'
    case 'running':
      return 'border-amber-500/40 bg-amber-900/30 text-amber-100'
    case 'succeeded':
      return 'border-emerald-500/40 bg-emerald-900/30 text-emerald-100'
    case 'failed':
      return 'border-rose-500/40 bg-rose-900/30 text-rose-100'
    default:
      return 'border-slate-700 bg-slate-900 text-slate-200'
  }
}

function stageClass(status: string) {
  switch (status) {
    case 'running':
      return 'bg-amber-500'
    case 'succeeded':
      return 'bg-emerald-500'
    case 'failed':
      return 'bg-rose-500'
    case 'skipped':
      return 'bg-slate-600'
    default:
      return 'bg-slate-500'
  }
}

function formatTime(value?: string) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleTimeString()
}

const MaintenanceRunPanel: React.FC<Props> = ({ runId, status, loading, error }) => {
  if (!runId) {
    return (
      <section className="p-4 border-b border-gray-700 bg-gray-900/20">
        <div className="max-w-6xl mx-auto text-sm text-gray-400">
          No maintenance run started yet. Start a run to see live status and artifacts.
        </div>
      </section>
    )
  }

  return (
    <section className="p-4 border-b border-gray-700 bg-gray-900/30">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-gray-200">Maintenance Run</div>
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${badgeClass(status?.state || 'queued')}`}>
              {status?.state || 'queued'}
            </span>
            <span className="text-[11px] text-gray-500 font-mono">run: {runId}</span>
          </div>
          {loading && <div className="text-xs text-gray-400">Refreshing…</div>}
        </div>

        {error && (
          <div className="rounded border border-rose-800 bg-rose-900/30 px-3 py-2 text-xs text-rose-100">
            {error}
          </div>
        )}

        {status?.error?.message && (
          <div className="rounded border border-rose-800 bg-rose-900/30 px-3 py-2 text-xs text-rose-100">
            {status.error.message}
          </div>
        )}

        {status?.prError && (
          <div className="rounded border border-rose-800 bg-rose-900/40 px-3 py-2 text-xs text-rose-100 whitespace-pre-wrap">
            {status.prError}
          </div>
        )}

        {status?.pr?.url && (
          <div className="rounded border border-emerald-700 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-100">
            PR created:{' '}
            <a className="underline" href={status.pr.url} target="_blank" rel="noreferrer">
              {status.pr.url}
            </a>
          </div>
        )}

        {status?.changeset && (
          <div className="rounded border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs text-slate-200">
            <div>
              Files changed: {status.changeset.filesChanged ?? 0} · LOC +{status.changeset.locAdded ?? 0} / -{status.changeset.locRemoved ?? 0}
            </div>
            {status.changeset.files?.length ? (
              <div className="mt-2">
                <div className="text-[11px] text-slate-400">Files touched</div>
                <ul className="mt-1 space-y-1 text-[11px] text-slate-300">
                  {status.changeset.files.slice(0, 8).map((file) => (
                    <li key={file} className="truncate font-mono">
                      {file}
                    </li>
                  ))}
                </ul>
                {status.changeset.files.length > 8 && (
                  <div className="text-[10px] text-slate-400">+{status.changeset.files.length - 8} more</div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {status?.stages?.length ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {status.stages.map((stage) => (
              <div key={stage.id} className="flex items-center gap-2 min-w-0">
                <div className={`h-2.5 w-2.5 rounded-full ${stageClass(stage.status)}`} />
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate text-gray-200">{stage.name || stage.id}</div>
                  <div className="text-[10px] text-gray-500">
                    {formatTime(stage.finishedAt || stage.startedAt) || stage.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-gray-400">No stage data yet.</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3">
            <div className="text-xs font-semibold text-gray-300">Events</div>
            {status?.events?.length ? (
              <ul className="mt-2 space-y-2 max-h-48 overflow-auto text-xs text-gray-200">
                {status.events.map((ev, idx) => (
                  <li key={`${ev.ts}-${idx}`} className="rounded border border-gray-800 bg-gray-950/40 px-2 py-1">
                    <div className="flex items-center justify-between text-[11px] text-gray-400">
                      <span>{ev.stage || 'run'}</span>
                      <span>{formatTime(ev.ts) || ev.ts}</span>
                    </div>
                    <div className="text-gray-200 whitespace-pre-wrap">{ev.message}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-2 text-xs text-gray-500">No events yet.</div>
            )}
          </div>

          <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3">
            <div className="text-xs font-semibold text-gray-300">Artifacts</div>
            {status?.artifacts?.length ? (
              <ul className="mt-2 space-y-2 text-xs text-gray-200">
                {status.artifacts.map((artifact) => (
                  <li key={artifact.path} className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] truncate">{artifact.path}</span>
                    <span className="text-[10px] text-gray-500">{artifact.type || 'file'}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-2 text-xs text-gray-500">No artifacts yet.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

export default MaintenanceRunPanel
