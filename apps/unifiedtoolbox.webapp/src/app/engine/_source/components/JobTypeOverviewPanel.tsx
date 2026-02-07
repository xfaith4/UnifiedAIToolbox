import React from 'react'
import type { JobTypeSummary } from '../hooks/useJobTypes'

type Props = {
  jobType: string
  config: JobTypeSummary | null | undefined
}

const JobTypeOverviewPanel: React.FC<Props> = ({ jobType, config }) => {
  if (!config) {
    return (
      <section className="p-4 border-b border-gray-700 bg-gray-900/40">
        <div className="max-w-6xl mx-auto text-sm text-gray-400">Loading job type configuration...</div>
      </section>
    )
  }

  const gates = Array.isArray(config.gate_policy?.gates) ? config.gate_policy?.gates : []
  const requiredArtifactsRaw = Array.isArray(config.artifact_policy?.required_artifacts) ? config.artifact_policy?.required_artifacts : []
  const requiredArtifacts = requiredArtifactsRaw.map((entry: any) => (typeof entry === 'string' ? entry : entry?.name)).filter(Boolean)
  const agents = Array.isArray(config.default_agents) ? config.default_agents : []
  const stages = Array.isArray(config.pipeline?.stages) ? config.pipeline.stages : []

  return (
    <section className="p-4 border-b border-gray-700 bg-gray-900/30">
      <div className="max-w-6xl mx-auto space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-gray-200">Job Type Overview</div>
          <div className="text-xs text-gray-400">Selected: {config.label || jobType}</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-3">
            <div className="text-xs font-semibold text-indigo-300 uppercase tracking-wide">Gates</div>
            <div className="mt-2 space-y-1 text-gray-300">
              {gates.length ? gates.map((gate: string) => <div key={gate}>{gate}</div>) : <div className="text-gray-500">None</div>}
            </div>
          </div>

          <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-3">
            <div className="text-xs font-semibold text-indigo-300 uppercase tracking-wide">Artifacts</div>
            <div className="mt-2 space-y-1 text-gray-300">
              {requiredArtifacts.length ? requiredArtifacts.map((name: string) => <div key={name}>{name}</div>) : <div className="text-gray-500">None</div>}
            </div>
          </div>

          <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-3">
            <div className="text-xs font-semibold text-indigo-300 uppercase tracking-wide">Agents</div>
            <div className="mt-2 space-y-1 text-gray-300">
              {agents.length ? agents.map((agent: string) => <div key={agent}>{agent}</div>) : <div className="text-gray-500">None</div>}
            </div>
          </div>

          <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-3">
            <div className="text-xs font-semibold text-indigo-300 uppercase tracking-wide">Pipeline</div>
            <div className="mt-2 space-y-1 text-gray-300">
              {stages.length
                ? stages.map((stage: any) => <div key={stage.id}>{stage.name || stage.id}</div>)
                : <div className="text-gray-500">None</div>}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default JobTypeOverviewPanel
