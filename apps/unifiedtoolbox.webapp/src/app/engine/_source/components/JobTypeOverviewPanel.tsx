import React from 'react'
import type { JobTypeSummary } from '../hooks/useJobTypes'

type Props = {
  jobType: string
  config: JobTypeSummary | null | undefined
}

// ── Per-mode static identity ──────────────────────────────────────────────────

interface ModeMeta {
  label: string
  description: string
  badges: Array<{ text: string; style: string }>
}

const MODE_META: Record<string, ModeMeta> = {
  build_new_app: {
    label: 'Create New App',
    description: 'Design and build a production-ready application from scratch. Generates code, tests, and documentation.',
    badges: [
      { text: 'New Codebase',     style: 'border-indigo-700/60 bg-indigo-900/30 text-indigo-200' },
      { text: 'Design + Build',   style: 'border-blue-700/60   bg-blue-900/30   text-blue-200'   },
      { text: 'Validated Output', style: 'border-emerald-700/60 bg-emerald-900/30 text-emerald-200' },
    ],
  },
  maintain_existing_app: {
    label: 'Maintain Existing App',
    description: 'Analyze and improve your existing local codebase. Reads files directly from disk — no GitHub token or remote clone required.',
    badges: [
      { text: '📁 Local Files',     style: 'border-amber-600/60  bg-amber-900/30  text-amber-200'  },
      { text: '⚡ Fast Access',     style: 'border-sky-700/60    bg-sky-900/30    text-sky-200'    },
      { text: 'No Clone Required',  style: 'border-emerald-700/60 bg-emerald-900/30 text-emerald-200' },
      { text: 'Can Open PR',        style: 'border-purple-700/60 bg-purple-900/30 text-purple-200' },
    ],
  },
  github_repo: {
    label: 'GitHub Repo',
    description: 'Apply targeted changes to a remote GitHub repository and open a pull request. Clones the repo, runs agents, then ships.',
    badges: [
      { text: 'GitHub API',      style: 'border-slate-500/60  bg-slate-800/60  text-slate-200'  },
      { text: 'Creates PR',      style: 'border-emerald-700/60 bg-emerald-900/30 text-emerald-200' },
      { text: 'Token Required',  style: 'border-amber-600/60  bg-amber-900/30  text-amber-200'  },
      { text: 'Remote Clone',    style: 'border-blue-700/60   bg-blue-900/30   text-blue-200'   },
    ],
  },
}

// Fallback for any server-defined job type without a static entry
function getMeta(jobType: string, config: JobTypeSummary | null | undefined): ModeMeta {
  if (MODE_META[jobType]) return MODE_META[jobType]
  return {
    label: config?.label || jobType,
    description: '',
    badges: [],
  }
}

// ── Static data for GitHub Repo (no server config) ───────────────────────────

const GITHUB_REPO_PIPELINE = ['Setup & Clone', 'Planning', 'Implementation', 'Review', 'Ship (PR)']
const GITHUB_REPO_AGENTS   = ['RepoOrchestrator', 'Planner', 'CodexAgent (×N)', 'PRPublisher']

// ── Helpers ───────────────────────────────────────────────────────────────────

const MAX_LIST = 6

function ListColumn({
  label,
  items,
  accent = 'text-indigo-300',
}: {
  label: string
  items: string[]
  accent?: string
}) {
  const shown = items.slice(0, MAX_LIST)
  const more  = items.length - shown.length
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-2.5">
      <div className={`text-xs font-semibold uppercase tracking-wide ${accent}`}>{label}</div>
      <div className="mt-2 space-y-0.5 text-sm text-gray-300">
        {shown.length
          ? shown.map((item) => (
              <div key={item} className="truncate leading-snug">{item}</div>
            ))
          : <div className="text-gray-500">None</div>}
        {more > 0 && (
          <div className="text-[11px] text-gray-500">+{more} more</div>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const JobTypeOverviewPanel: React.FC<Props> = ({ jobType, config }) => {
  const meta = getMeta(jobType, config)

  // Derive technical details
  let gates:    string[]
  let agents:   string[]
  let pipeline: string[]

  if (jobType === 'github_repo') {
    gates    = []
    agents   = GITHUB_REPO_AGENTS
    pipeline = GITHUB_REPO_PIPELINE
  } else if (config) {
    gates = Array.isArray(config.gate_policy?.gates)
      ? (config.gate_policy!.gates as string[])
      : []
    const rawArtifacts = Array.isArray(config.artifact_policy?.required_artifacts)
      ? config.artifact_policy!.required_artifacts
      : []
    void rawArtifacts // retained for future use; not shown in current layout
    agents = Array.isArray(config.default_agents)
      ? (config.default_agents as string[])
      : []
    pipeline = Array.isArray(config.pipeline?.stages)
      ? (config.pipeline!.stages as Array<{ id: string; name?: string }>).map(
          (s) => s.name || s.id
        )
      : []
  } else {
    // Server config still loading for a known mode — show skeleton intent only
    gates = []; agents = []; pipeline = []
  }

  const showDetails = pipeline.length > 0 || agents.length > 0 || gates.length > 0

  return (
    <section className="px-4 py-3 border-b border-gray-700 bg-gray-900/30">
      <div className="max-w-6xl mx-auto space-y-2.5">

        {/* Mode identity header */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-gray-100">{meta.label}</div>
            {meta.description && (
              <div className="mt-0.5 text-xs text-gray-400 leading-relaxed max-w-2xl">
                {meta.description}
              </div>
            )}
          </div>
        </div>

        {/* Capability badges */}
        {meta.badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {meta.badges.map((b) => (
              <span
                key={b.text}
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${b.style}`}
              >
                {b.text}
              </span>
            ))}
          </div>
        )}

        {/* Technical detail grid */}
        {showDetails && (
          <div className={`grid gap-2 text-sm ${gates.length ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
            <ListColumn label="Pipeline"  items={pipeline} accent="text-sky-300"     />
            <ListColumn label="Agents"    items={agents}   accent="text-violet-300"  />
            {gates.length > 0 && (
              <ListColumn label="Gates"   items={gates}    accent="text-amber-300"   />
            )}
          </div>
        )}

        {/* Loading placeholder (server config not yet arrived) */}
        {!showDetails && jobType !== 'github_repo' && !config && (
          <div className="text-xs text-gray-500">Loading pipeline configuration…</div>
        )}
      </div>
    </section>
  )
}

export default JobTypeOverviewPanel
