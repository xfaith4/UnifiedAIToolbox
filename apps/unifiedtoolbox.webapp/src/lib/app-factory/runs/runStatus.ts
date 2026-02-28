import 'server-only'
import path from 'path'
import { promises as fs } from 'fs'
import { existsSync, readFileSync } from 'fs'
import type { RunArtifact, RunEvent, RunStage, RunStageStatus, RunStatusResponse } from './types'

type RunStatusOptions = {
  rootDir?: string
  eventLimit?: number
}

const DEFAULT_EVENT_LIMIT = 200
const MAX_EVENT_BYTES = 512 * 1024
const RUN_ID_PATTERN = /^[a-zA-Z0-9._-]+$/

function ensureWithin(root: string, candidate: string): string {
  const full = path.resolve(root, candidate)
  const r = path.resolve(root)
  if (!full.startsWith(r + path.sep) && full !== r) {
    throw new Error('path escaped root')
  }
  return full
}

export function isValidRunId(runId: string): boolean {
  const trimmed = runId.trim()
  if (!RUN_ID_PATTERN.test(trimmed)) return false
  if (trimmed.includes('..')) return false
  return true
}

export function getRunsRoot(): string {
  const override = process.env.UAITOOLBOX_RUNS_DIR
  if (override && override.trim()) {
    return path.resolve(override)
  }
  const configPath = path.resolve(process.cwd(), '..', '..', 'config', 'run-observatory.json')
  if (existsSync(configPath)) {
    try {
      const raw = JSON.parse(readFileSync(configPath, 'utf8')) as { runsRoot?: string }
      if (raw?.runsRoot && raw.runsRoot.trim()) {
        return path.resolve(raw.runsRoot)
      }
    } catch {
      // fall back to default root
    }
  }
  return path.resolve(process.cwd(), '..', '..', '.uaitoolbox', 'app-factory', 'runs')
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath)
    return stat.isFile() || stat.isDirectory()
  } catch {
    return false
  }
}

async function readJsonIfExists(filePath: string): Promise<unknown | null> {
  if (!(await fileExists(filePath))) return null
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function readTailLines(filePath: string, maxLines: number): Promise<string[]> {
  const stat = await fs.stat(filePath)
  const size = stat.size
  const readSize = Math.min(size, MAX_EVENT_BYTES)
  const fd = await fs.open(filePath, 'r')
  const buffer = Buffer.alloc(readSize)
  try {
    await fd.read(buffer, 0, readSize, size - readSize)
  } finally {
    await fd.close()
  }
  const text = buffer.toString('utf8')
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length <= maxLines) return lines
  return lines.slice(-maxLines)
}

function normalizeState(raw?: string): 'queued' | 'running' | 'succeeded' | 'failed' {
  const value = String(raw || '').toLowerCase()
  if (['queued', 'pending'].includes(value)) return 'queued'
  // dispatching = worker assigned but not yet processing → treat as running
  if (['running', 'in_progress', 'active', 'dispatching', 'gating', 'awaiting_gate', 'awaiting_input', 'starting'].includes(value)) return 'running'
  if (['succeeded', 'success', 'passed', 'completed', 'done'].includes(value)) return 'succeeded'
  // stuck + cancelled are terminal failures
  if (['failed', 'error', 'cancelled', 'canceled', 'stuck'].includes(value)) return 'failed'
  return 'running'
}

function normalizeStageStatus(raw?: string): RunStageStatus {
  const value = String(raw || '').toLowerCase()
  if (['pending', 'queued'].includes(value)) return 'pending'
  if (['running', 'in_progress'].includes(value)) return 'running'
  if (['succeeded', 'success', 'completed', 'passed', 'done'].includes(value)) return 'succeeded'
  if (['failed', 'error'].includes(value)) return 'failed'
  if (['skipped'].includes(value)) return 'skipped'
  return raw || 'pending'
}

function parseLogLine(line: string): RunEvent {
  const match = line.match(/^\[(?<ts>[^\]]+)\]\s+\[(?<level>[^\]]+)\]\s+\[(?<stage>[^\]]+)\]\s+(?<msg>.*)$/)
  if (match?.groups) {
    return {
      ts: match.groups.ts || new Date().toISOString(),
      type: String(match.groups.level || 'info'),
      stage: match.groups.stage,
      message: match.groups.msg || line,
    }
  }
  return {
    ts: new Date().toISOString(),
    type: 'info',
    message: line,
  }
}

async function readEvents(runDir: string, limit: number): Promise<RunEvent[]> {
  const ndjsonPath = path.join(runDir, 'events.ndjson')
  if (await fileExists(ndjsonPath)) {
    const lines = await readTailLines(ndjsonPath, limit)
    const events: RunEvent[] = []
    for (const line of lines) {
      try {
        const rec = JSON.parse(line)
        const ts = rec.ts || rec.timestamp || rec.time || new Date().toISOString()
        const type = rec.type || rec.level || rec.severity || 'info'
        const stage = rec.stage || rec.agent || rec.name
        const message = rec.message || rec.msg || rec.status || line
        const data = rec.data ? rec.data : undefined
        events.push({
          ts: String(ts),
          type: String(type),
          stage: stage ? String(stage) : undefined,
          message: String(message),
          data: data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined,
        })
      } catch {
        events.push({ ts: new Date().toISOString(), type: 'info', message: line })
      }
    }
    return events
  }

  const jsonlPath = path.join(runDir, 'events.jsonl')
  if (await fileExists(jsonlPath)) {
    const lines = await readTailLines(jsonlPath, limit)
    const events: RunEvent[] = []
    for (const line of lines) {
      try {
        const rec = JSON.parse(line)
        const ts = rec.ts || rec.timestamp || rec.time || new Date().toISOString()
        const type = rec.type || rec.level || rec.severity || 'info'
        const stage = rec.stage || rec.agent || rec.name
        const message = rec.message || rec.msg || rec.status || line
        const data = rec.data ? rec.data : undefined
        events.push({
          ts: String(ts),
          type: String(type),
          stage: stage ? String(stage) : undefined,
          message: String(message),
          data: data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined,
        })
      } catch {
        events.push({ ts: new Date().toISOString(), type: 'info', message: line })
      }
    }
    return events
  }

  const logPath = path.join(runDir, 'events.log')
  if (await fileExists(logPath)) {
    const lines = await readTailLines(logPath, limit)
    return lines.map(parseLogLine)
  }

  return []
}

function guessMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.json':
      return 'application/json'
    case '.md':
      return 'text/markdown'
    case '.txt':
    case '.log':
      return 'text/plain'
    case '.diff':
    case '.patch':
      return 'text/x-diff'
    case '.html':
    case '.htm':
      return 'text/html'
    case '.yaml':
    case '.yml':
      return 'text/yaml'
    case '.csv':
      return 'text/csv'
    default:
      return 'application/octet-stream'
  }
}

async function listArtifacts(artifactDir: string): Promise<RunArtifact[]> {
  const out: RunArtifact[] = []
  const stack: string[] = [artifactDir]
  while (stack.length) {
    const current = stack.pop()
    if (!current) continue
    const entries = await fs.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else if (entry.isFile()) {
        const rel = path.relative(artifactDir, full).replace(/\\/g, '/')
        const stat = await fs.stat(full)
        out.push({
          path: rel,
          type: guessMimeType(full),
          bytes: stat.size,
          mtime: stat.mtime.toISOString(),
          exists: true,
        })
      }
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

function mapArtifactsIndex(index: unknown[]): RunArtifact[] {
  const records: RunArtifact[] = []
  for (const entry of index) {
    if (!entry || typeof entry !== 'object') continue
    const entryObj = entry as Record<string, unknown>
    const rel = String(entryObj.relativePath || entryObj.path || entryObj.fileName || '')
    if (!rel) continue
    records.push({
      path: rel.replace(/\\/g, '/'),
      type: entryObj.mimeType ? String(entryObj.mimeType) : undefined,
      bytes: typeof entryObj.size === 'number' ? entryObj.size : undefined,
      mtime: entryObj.createdAt ? String(entryObj.createdAt) : undefined,
      exists: true,
    })
  }
  return records
}

/**
 * Helper to extract first valid string value from multiple JSON sources
 */
function getFirstString(...values: unknown[]): string | undefined {
  for (const val of values) {
    if (val != null && val !== '') {
      return String(val)
    }
  }
  return undefined
}

export async function loadRunStatus(runId: string, options: RunStatusOptions = {}): Promise<RunStatusResponse | null> {
  const normalizedRunId = runId.trim()
  if (!isValidRunId(normalizedRunId)) return null
  const rootDir = options.rootDir ?? getRunsRoot()
  const runDir = ensureWithin(rootDir, normalizedRunId)
  try {
    const stat = await fs.stat(runDir)
    if (!stat.isDirectory()) return null
  } catch {
    return null
  }

  const statePath = path.join(runDir, 'run_state.json')
  const statusPath = path.join(runDir, 'status.json')
  const manifestPath = path.join(runDir, 'run_manifest.json')
  const summaryPath = path.join(runDir, 'orchestration-summary.json')

  const runStateJson = await readJsonIfExists(statePath) as Record<string, unknown> | null
  const statusJson = await readJsonIfExists(statusPath) as Record<string, unknown> | null
  const manifestJson = await readJsonIfExists(manifestPath) as Record<string, unknown> | null
  const summaryJson = await readJsonIfExists(summaryPath) as Record<string, unknown> | null

  const jobType =
    runStateJson?.job_type ||
    statusJson?.job_type ||
    manifestJson?.job_type ||
    summaryJson?.JobType ||
    summaryJson?.job_type ||
    undefined

  const stages: RunStage[] = []
  const stageSource = Array.isArray(runStateJson?.stages)
    ? runStateJson?.stages
    : Array.isArray(statusJson?.stages)
      ? statusJson.stages
      : null

  if (stageSource) {
    for (const stage of stageSource) {
      if (!stage) continue
      stages.push({
        id: String(stage.id || stage.name || 'stage'),
        name: stage.name ? String(stage.name) : undefined,
        status: normalizeStageStatus(stage.status),
        startedAt: stage.started_at || stage.startedAt,
        finishedAt: stage.finished_at || stage.finishedAt,
      })
    }
  } else if (manifestJson && typeof manifestJson === 'object') {
    const routing = (manifestJson as Record<string, unknown>).routing as Record<string, unknown> | undefined
    if (routing && Array.isArray(routing.stages)) {
      for (const stageId of routing.stages) {
        stages.push({ id: String(stageId), status: 'pending' })
      }
    }
  }

  const status =
    normalizeState(
      String(runStateJson?.status ||
        statusJson?.state ||
        statusJson?.status ||
        summaryJson?.status ||
        summaryJson?.Status || '')
    ) || 'running'

  let currentStage = runStateJson?.current_stage || statusJson?.current_stage || statusJson?.currentStage || null
  if (!currentStage && stages.length) {
    const runningStage = stages.find((s) => s.status === 'running')
    currentStage = runningStage?.id || stages.find((s) => s.status === 'pending')?.id || null
  }

  const events = await readEvents(runDir, options.eventLimit ?? DEFAULT_EVENT_LIMIT)

  const artifactsDir = path.join(runDir, 'artifacts')
  let artifacts: RunArtifact[] = []
  if (Array.isArray(runStateJson?.artifacts)) {
    artifacts = (runStateJson.artifacts as unknown[]).map((entry) => {
      const entryObj = entry as Record<string, unknown>
      return {
        path: String(entryObj.path || ''),
        exists: entryObj.exists !== false,
        bytes: typeof entryObj.bytes === 'number' ? entryObj.bytes : undefined,
        mtime: entryObj.mtime ? String(entryObj.mtime) : undefined,
        type: entryObj.type ? String(entryObj.type) : undefined,
      }
    })
  } else if (await fileExists(artifactsDir)) {
    artifacts = await listArtifacts(artifactsDir)
  } else {
    const indexJson = await readJsonIfExists(path.join(runDir, 'artifacts_index.json'))
    if (Array.isArray(indexJson)) {
      artifacts = mapArtifactsIndex(indexJson)
    }
  }

  const prJson = (await readJsonIfExists(path.join(artifactsDir, 'pr.json'))) ||
    (await readJsonIfExists(path.join(runDir, 'pr.json'))) as Record<string, unknown> | null

  const prData = prJson && typeof prJson === 'object' ? prJson as Record<string, unknown> : null
  const prNested = prData?.pr as Record<string, unknown> | undefined
  const prUrlFromJson = prNested?.url || prData?.pr_url
  
  const runStateLinks = runStateJson?.links as Record<string, unknown> | undefined
  const links = {
    pr_url: getFirstString(runStateLinks?.pr_url, prUrlFromJson),
    repo_url: getFirstString(runStateLinks?.repo_url, runStateLinks?.repo),
  }

  // Use the normalized run id for the response payload.
  runId = normalizedRunId

  const stageCount =
    typeof runStateJson?.stage_count === 'number'
      ? runStateJson.stage_count
      : stages.length
        ? stages.length
        : undefined

  const stageIndex =
    typeof runStateJson?.stage_index === 'number'
      ? runStateJson.stage_index
      : stages.length && currentStage
        ? Math.max(0, stages.findIndex((s) => s.id === currentStage))
        : undefined

  let progress = typeof runStateJson?.progress === 'number' ? runStateJson.progress : undefined
  if (progress == null && typeof stageIndex === 'number' && typeof stageCount === 'number' && stageCount > 0) {
    progress = Math.round(((stageIndex + 1) / stageCount) * 100)
  }

  // Phase 1 — read sandbox_report.json if present
  const sandboxReportJson = await readJsonIfExists(path.join(runDir, 'sandbox_report.json')) as Record<string, unknown> | null

  // Read acceptance_checks from request.json for display
  let acceptanceChecks: string[] | undefined
  const requestJson = await readJsonIfExists(path.join(runDir, 'request.json')) as Record<string, unknown> | null
  if (Array.isArray(requestJson?.acceptance_checks)) {
    acceptanceChecks = (requestJson.acceptance_checks as unknown[]).map(String)
  }

  return {
    runId,
    jobType: jobType ? String(jobType) : undefined,
    status,
    currentStage: currentStage ? String(currentStage) : null,
    stageIndex: typeof stageIndex === 'number' ? stageIndex : undefined,
    stageCount,
    progress,
    startedAt: getFirstString(runStateJson?.started_at, statusJson?.started_at, statusJson?.startedAt, summaryJson?.StartTime, summaryJson?.started_at),
    updatedAt: getFirstString(runStateJson?.updated_at, statusJson?.updated_at, statusJson?.updatedAt),
    endedAt: getFirstString(runStateJson?.ended_at, statusJson?.finished_at, statusJson?.finishedAt, summaryJson?.EndTime, summaryJson?.ended_at),
    stages,
    events,
    artifacts,
    risk: runStateJson?.risk as { level?: 'low' | 'medium' | 'high'; reasons?: string[] } | undefined,
    links,
    errors: Array.isArray(runStateJson?.errors) ? runStateJson.errors : undefined,
    warnings: Array.isArray(runStateJson?.warnings) ? runStateJson.warnings : undefined,
    acceptanceChecks,
    verificationStatus: sandboxReportJson?.verificationStatus as RunStatusResponse['verificationStatus'] | undefined,
    loopIteration: typeof sandboxReportJson?.loopIteration === 'number' ? sandboxReportJson.loopIteration : undefined,
    sandboxReport: sandboxReportJson ? sandboxReportJson as RunStatusResponse['sandboxReport'] : undefined,
  }
}
