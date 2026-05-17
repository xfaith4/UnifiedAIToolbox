'use client'

// ─────────────────────────────────────────────────────────────────────────────
// RunConsole — top-level composition of the Run Console subcomponents.
// Pulls from /api/runs/[runId]/manifest, /artifacts, /events/canonical (SSE)
// and falls back gracefully when the canonical sources are empty (legacy
// runs that predate the manifest).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import RunHeader from './RunHeader'
import RunTimeline from './RunTimeline'
import AgentCards from './AgentCards'
import EventStream from './EventStream'
import BlockersPanel from './BlockersPanel'
import ArtifactsPanel from './ArtifactsPanel'
import ValidationChecklist from './ValidationChecklist'
import FinalResultPanel from './FinalResultPanel'
import EmptyState from './EmptyState'
import { useRunEventStream } from '@/lib/hooks/useRunEventStream'
import type { RunManifest, ManifestBlocker } from '@/lib/app-factory/runs/manifest'
import type { ArtifactIndexEntry } from '@/lib/app-factory/runs/artifactIndex'
import type { FinalRunSummary } from '@/lib/app-factory/runs/finalSummary'

export interface RunConsoleProps {
  runId: string
  /** Optional fallback objective to use when the manifest is empty. */
  fallbackObjective?: string
  className?: string
}

async function fetchJsonSafe<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export default function RunConsole({ runId, fallbackObjective, className = '' }: RunConsoleProps) {
  const [manifest, setManifest] = useState<RunManifest | null>(null)
  const [artifacts, setArtifacts] = useState<ArtifactIndexEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [pollTick, setPollTick] = useState(0)
  const { events, status: streamStatus } = useRunEventStream(runId)

  // Initial + periodic re-fetch for manifest + artifacts (lightweight; the
  // primary live update path is SSE). When the run is terminal we stop
  // polling.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchJsonSafe<RunManifest>(`/api/runs/${encodeURIComponent(runId)}/manifest`),
      fetchJsonSafe<{ artifacts: ArtifactIndexEntry[] }>(`/api/runs/${encodeURIComponent(runId)}/artifacts`),
    ]).then(([m, a]) => {
      if (cancelled) return
      setManifest(m)
      setArtifacts(a?.artifacts ?? [])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [runId, pollTick])

  // Periodic poll fallback (5s) for manifest+artifacts; SSE handles events.
  useEffect(() => {
    if (!manifest) return
    if (manifest.status === 'completed' || manifest.status === 'failed') return
    const id = setInterval(() => setPollTick((t) => t + 1), 5_000)
    return () => clearInterval(id)
  }, [manifest])

  const finalSummary: FinalRunSummary | null = manifest?.final_summary ?? null
  const blockersByAgent = useMemo(() => {
    const out: Record<string, ManifestBlocker> = {}
    for (const b of manifest?.blockers ?? []) {
      if (b.agent) out[b.agent] = b
    }
    return out
  }, [manifest?.blockers])

  // Legacy / empty: no manifest AND no SSE events yet
  if (!loading && !manifest && events.length === 0) {
    return (
      <div className={`space-y-4 ${className}`} data-state="legacy-run">
        <EmptyState reason="legacy-run" />
      </div>
    )
  }

  const status = manifest?.status ?? (streamStatus === 'live' || streamStatus === 'replaying' ? 'running' : 'queued')
  const objective = manifest?.objective || fallbackObjective || ''

  return (
    <div className={`space-y-4 ${className}`} data-state="loaded">
      <RunHeader
        runId={runId}
        status={status}
        objective={objective}
        createdAt={manifest?.created_at}
        updatedAt={manifest?.updated_at}
        endedAt={status === 'completed' || status === 'failed' ? manifest?.updated_at : undefined}
        streamStatus={streamStatus}
      />

      {streamStatus === 'disconnected' && (
        <EmptyState reason="sse-disconnected" />
      )}

      {events.length > 0 || manifest?.event_count ? (
        <RunTimeline events={events.length > 0 ? events : []} />
      ) : null}

      {/* Blockers panel is foregrounded when the run is paused on operator action. */}
      {(manifest?.blockers?.length ?? 0) > 0 && (
        <BlockersPanel
          blockers={manifest!.blockers}
          runStatus={status}
        />
      )}

      {(manifest?.agents?.length ?? 0) > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Agents</h2>
          <AgentCards
            agents={manifest!.agents}
            activeAgent={manifest!.active_agent}
            blockersByAgent={blockersByAgent}
          />
        </section>
      )}

      {artifacts.length > 0 && (
        <ArtifactsPanel runId={runId} artifacts={artifacts} />
      )}

      {manifest?.validation && (
        <ValidationChecklist snapshot={manifest.validation} />
      )}

      {events.length > 0 && (
        <EventStream events={events} />
      )}

      {finalSummary && <FinalResultPanel summary={finalSummary} />}

      {/* "Queued but no events yet" hint */}
      {manifest && status === 'queued' && events.length === 0 && (
        <EmptyState reason="queued-not-started" />
      )}
    </div>
  )
}
