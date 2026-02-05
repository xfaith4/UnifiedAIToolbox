import React from 'react'
import type { EnginePipelinePayload, PipelineStage, PipelineStatus } from '@/lib/app-factory/pipeline/pipelineStatus'

const statusClass = (status: PipelineStatus) => {
  switch (status) {
    case 'passed':
      return 'bg-green-500'
    case 'failed':
      return 'bg-red-500'
    case 'running':
      return 'bg-yellow-400 animate-pulse'
    case 'skipped':
      return 'bg-gray-600'
    default:
      return 'bg-gray-500'
  }
}

const textClass = (status: PipelineStatus) => {
  switch (status) {
    case 'passed':
      return 'text-green-300'
    case 'failed':
      return 'text-red-300'
    case 'running':
      return 'text-yellow-300'
    case 'skipped':
      return 'text-gray-400'
    default:
      return 'text-gray-300'
  }
}

function formatTime(value?: string) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleTimeString()
}

const StageItem: React.FC<{ stage: PipelineStage }> = ({ stage }) => {
  const time = stage.endedAt ? formatTime(stage.endedAt) : stage.startedAt ? formatTime(stage.startedAt) : null
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className={`h-2.5 w-2.5 rounded-full ${statusClass(stage.status)}`} aria-hidden="true" />
      <div className="min-w-0">
        <div className={`text-xs font-semibold truncate ${textClass(stage.status)}`}>{stage.label}</div>
        {time && <div className="text-[10px] text-gray-500">{time}</div>}
      </div>
    </div>
  )
}

const PipelineStepper: React.FC<{ pipeline: EnginePipelinePayload }> = ({ pipeline }) => {
  const stages = pipeline?.stages || []
  return (
    <section aria-label="Pipeline" className="p-3 border-b border-gray-700 bg-gray-900/40">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-sm font-semibold text-gray-200">Pipeline</div>
          <div className="text-xs text-gray-400 truncate">
            {pipeline.hardeningEnabled ? 'Hardening enabled' : 'Hardening not enabled'}
            {pipeline.parallelTeamsEnabled ? ' · Parallel teams enabled' : ''}
          </div>
        </div>
        <div className="flex items-center gap-3 min-w-0">
          {pipeline.contractHash && <div className="text-[11px] text-gray-500 font-mono truncate">contract: {pipeline.contractHash.slice(0, 10)}</div>}
          {pipeline.runId && <div className="text-[11px] text-gray-500 font-mono truncate">run: {pipeline.runId}</div>}
        </div>
      </div>

      <div className="max-w-6xl mx-auto mt-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-3">
        {stages.map((s) => (
          <StageItem key={s.id} stage={s} />
        ))}
      </div>
    </section>
  )
}

export default PipelineStepper
