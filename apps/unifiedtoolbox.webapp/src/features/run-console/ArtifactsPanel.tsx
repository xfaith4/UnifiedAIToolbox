'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ArtifactsPanel — table of ArtifactIndexEntry rows. Per-row link wraps the
// "view in app" route — Agent 2 does not own artifact-fetch endpoints.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link'
import type { ArtifactIndexEntry } from '@/lib/app-factory/runs/artifactIndex'
import { formatRelativeTime } from './formatters'
import EmptyState from './EmptyState'

export interface ArtifactsPanelProps {
  runId: string
  artifacts: ArtifactIndexEntry[]
  className?: string
}

export default function ArtifactsPanel({ runId, artifacts, className = '' }: ArtifactsPanelProps) {
  if (!artifacts.length) {
    return <EmptyState reason="no-artifacts" className={className} />
  }
  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-900/40 ${className}`} aria-label="Run artifacts">
      <div className="border-b border-slate-800 px-3 py-2 flex items-center gap-2">
        <h3 className="text-xs font-semibold text-slate-200">Artifacts</h3>
        <span className="text-[10px] text-slate-500">{artifacts.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
              <th className="px-3 py-1.5 font-medium">Title</th>
              <th className="px-3 py-1.5 font-medium">Type</th>
              <th className="px-3 py-1.5 font-medium">Agent</th>
              <th className="px-3 py-1.5 font-medium">Created</th>
              <th className="px-3 py-1.5 font-medium">Path</th>
            </tr>
          </thead>
          <tbody>
            {artifacts.map((a) => (
              <tr key={a.artifact_id} className="border-t border-slate-800/60">
                <td className="px-3 py-1.5 text-slate-200">
                  <Link
                    href={`/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(a.artifact_id)}`}
                    className="hover:text-blue-300 hover:underline"
                  >
                    {a.title}
                  </Link>
                </td>
                <td className="px-3 py-1.5 text-slate-400">{a.type}</td>
                <td className="px-3 py-1.5 text-slate-400">{a.producing_agent ?? '—'}</td>
                <td className="px-3 py-1.5 text-slate-500" title={a.created_at}>
                  {formatRelativeTime(a.created_at)}
                </td>
                <td className="px-3 py-1.5 font-mono text-[10px] text-slate-500 truncate max-w-xs" title={a.path}>
                  {a.path}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
