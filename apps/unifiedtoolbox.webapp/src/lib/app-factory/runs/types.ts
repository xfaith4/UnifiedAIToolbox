export type RunStageStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | string

export type RunStage = {
  id: string
  name?: string
  status: RunStageStatus
  startedAt?: string
  finishedAt?: string
}

export type RunEvent = {
  ts: string
  level?: string
  stage?: string
  message: string
  data?: Record<string, unknown>
}

export type RunArtifact = {
  path: string
  type?: string
  sizeBytes?: number
  updatedAt?: string
}

export type RunStatusResponse = {
  runId: string
  jobType?: string
  startedAt?: string
  updatedAt?: string
  finishedAt?: string
  state: 'queued' | 'running' | 'succeeded' | 'failed'
  currentStage?: string | null
  stages: RunStage[]
  events: RunEvent[]
  artifacts: RunArtifact[]
  error?: { code?: string; message: string; details?: unknown }
  pr?: {
    status?: string
    url?: string
    number?: number
    draft?: boolean
    base?: string
    head?: string
    title?: string
  }
  changeset?: {
    filesChanged?: number
    locAdded?: number
    locRemoved?: number
    files?: string[]
  }
  prError?: string
}
