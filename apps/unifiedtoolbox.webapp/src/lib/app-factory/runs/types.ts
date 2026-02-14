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
  runId?: string
  type?: string
  stage?: string
  phase?: string
  agent?: string
  status?: 'running' | 'success' | 'failed' | 'skipped' | 'retrying' | 'pending' | string
  message: string
  details?: Record<string, unknown>
  data?: Record<string, unknown>
}

export type RunArtifact = {
  path: string
  type?: string
  exists?: boolean
  bytes?: number
  mtime?: string
}

export type RunStatusResponse = {
  runId: string
  jobType?: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  currentStage?: string | null
  stageIndex?: number
  stageCount?: number
  progress?: number
  startedAt?: string
  updatedAt?: string
  endedAt?: string
  stages: RunStage[]
  events: RunEvent[]
  artifacts: RunArtifact[]
  risk?: { level?: 'low' | 'medium' | 'high'; reasons?: string[] }
  links?: { pr_url?: string; repo_url?: string }
  errors?: string[]
  warnings?: string[]
}
