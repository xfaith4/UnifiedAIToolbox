import 'server-only'
import path from 'path'
import { promises as fs } from 'fs'
import type { RunArtifact, RunEvent, RunStage, RunStageStatus, RunStatusResponse } from './types'

type RunStatusOptions = {
  rootDir?: string
  eventLimit?: number
}

const DEFAULT_EVENT_LIMIT = 200
const MAX_EVENT_BYTES = 512 * 1024
const MAX_TEXT_SNIPPET = 4000

function ensureWithin(root: string, candidate: string): string {
  const full = path.resolve(root, candidate)
  const r = path.resolve(root)
  if (!full.startsWith(r + path.sep) && full !== r) {
    throw new Error('path escaped root')
  }
  return full
}

export function getAppFactoryRoot(): string {
  return path.resolve(process.cwd(), '..', '..', '.uaitoolbox', 'app-factory')
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath)
    return stat.isFile() || stat.isDirectory()
  } catch {
    return false
  }
}

async function readJsonIfExists(filePath: string): Promise<any | null> {
  if (!(await fileExists(filePath))) return null
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function readTextIfExists(filePath: string, maxChars = MAX_TEXT_SNIPPET): Promise<string | null> {
  if (!(await fileExists(filePath))) return null
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    if (raw.length <= maxChars) return raw
    return raw.slice(0, maxChars) + '…'
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
  if (['running', 'in_progress', 'active'].includes(value)) return 'running'
  if (['succeeded', 'success', 'passed', 'completed', 'done'].includes(value)) return 'succeeded'
  if (['failed', 'error', 'cancelled', 'canceled'].includes(value)) return 'failed'
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
      level: (match.groups.level || 'info').toLowerCase(),
      stage: match.groups.stage,
      message: match.groups.msg || line,
    }
  }
  return {
    ts: new Date().toISOString(),
    level: 'info',
    message: line,
  }
}

async function readEvents(runDir: string, limit: number): Promise<RunEvent[]> {
  const jsonlPath = path.join(runDir, 'events.jsonl')
  if (await fileExists(jsonlPath)) {
    const lines = await readTailLines(jsonlPath, limit)
    const events: RunEvent[] = []
    for (const line of lines) {
      try {
        const rec = JSON.parse(line)
        const ts = rec.ts || rec.timestamp || rec.time || new Date().toISOString()
        const level = rec.level || rec.severity || rec.type || 'info'
        const stage = rec.stage || rec.agent || rec.name
        const message = rec.message || rec.msg || rec.status || line
        const data = rec.data ? rec.data : undefined
        events.push({
          ts: String(ts),
          level: String(level).toLowerCase(),
          stage: stage ? String(stage) : undefined,
          message: String(message),
          data: data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined,
        })
      } catch {
        events.push({ ts: new Date().toISOString(), level: 'info', message: line })
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
          sizeBytes: stat.size,
          updatedAt: stat.mtime.toISOString(),
        })
      }
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

function mapArtifactsIndex(index: any[]): RunArtifact[] {
  const records: RunArtifact[] = []
  for (const entry of index) {
    if (!entry || typeof entry !== 'object') continue
    const rel = String(entry.relativePath || entry.path || entry.fileName || '')
    if (!rel) continue
    records.push({
      path: rel.replace(/\\/g, '/'),
      type: entry.mimeType ? String(entry.mimeType) : undefined,
      sizeBytes: typeof entry.size === 'number' ? entry.size : undefined,
      updatedAt: entry.createdAt ? String(entry.createdAt) : undefined,
    })
  }
  return records
}

export async function loadRunStatus(runId: string, options: RunStatusOptions = {}): Promise<RunStatusResponse | null> {
  const rootDir = options.rootDir ?? getAppFactoryRoot()
  const runDir = ensureWithin(rootDir, path.join('runs', runId))
  try {
    const stat = await fs.stat(runDir)
    if (!stat.isDirectory()) return null
  } catch {
    return null
  }

  const statusPath = path.join(runDir, 'status.json')
  const manifestPath = path.join(runDir, 'run_manifest.json')
  const summaryPath = path.join(runDir, 'orchestration-summary.json')

  const statusJson = await readJsonIfExists(statusPath)
  const manifestJson = await readJsonIfExists(manifestPath)
  const summaryJson = await readJsonIfExists(summaryPath)

  const jobType =
    statusJson?.job_type ||
    manifestJson?.job_type ||
    summaryJson?.JobType ||
    summaryJson?.job_type ||
    undefined

  const stages: RunStage[] = []
  if (Array.isArray(statusJson?.stages)) {
    for (const stage of statusJson.stages) {
      if (!stage) continue
      stages.push({
        id: String(stage.id || stage.name || 'stage'),
        name: stage.name ? String(stage.name) : undefined,
        status: normalizeStageStatus(stage.status),
        startedAt: stage.started_at || stage.startedAt,
        finishedAt: stage.finished_at || stage.finishedAt,
      })
    }
  } else if (Array.isArray(manifestJson?.routing?.stages)) {
    for (const stageId of manifestJson.routing.stages) {
      stages.push({ id: String(stageId), status: 'pending' })
    }
  }

  const state =
    normalizeState(
      statusJson?.state ||
        statusJson?.status ||
        summaryJson?.status ||
        summaryJson?.Status
    ) || 'running'

  let currentStage = statusJson?.current_stage || statusJson?.currentStage || null
  if (!currentStage && stages.length) {
    const runningStage = stages.find((s) => s.status === 'running')
    currentStage = runningStage?.id || stages.find((s) => s.status === 'pending')?.id || null
  }

  const events = await readEvents(runDir, options.eventLimit ?? DEFAULT_EVENT_LIMIT)

  const artifactsDir = path.join(runDir, 'artifacts')
  let artifacts: RunArtifact[] = []
  if (await fileExists(artifactsDir)) {
    artifacts = await listArtifacts(artifactsDir)
  } else {
    const indexJson = await readJsonIfExists(path.join(runDir, 'artifacts_index.json'))
    if (Array.isArray(indexJson)) {
      artifacts = mapArtifactsIndex(indexJson)
    }
  }

  const prJson =
    (await readJsonIfExists(path.join(artifactsDir, 'pr.json'))) ||
    (await readJsonIfExists(path.join(runDir, 'pr.json')))
  const changesetJson =
    (await readJsonIfExists(path.join(artifactsDir, 'changeset.summary.json'))) ||
    (await readJsonIfExists(path.join(runDir, 'changeset.summary.json')))
  const prError =
    (await readTextIfExists(path.join(artifactsDir, 'pr_error.md'))) ||
    (await readTextIfExists(path.join(runDir, 'pr_error.md')))

  const prSummary = prJson
    ? {
        status: prJson.status as string | undefined,
        url: prJson.pr?.url as string | undefined,
        number: prJson.pr?.number as number | undefined,
        draft: prJson.pr?.draft as boolean | undefined,
        base: prJson.pr?.base as string | undefined,
        head: prJson.pr?.head as string | undefined,
        title: prJson.pr?.title as string | undefined,
      }
    : undefined

  const filesChanged = Array.isArray(changesetJson?.files_changed)
    ? changesetJson.files_changed.map((item: unknown) => String(item))
    : undefined

  const changesetSummary = changesetJson
    ? {
        filesChanged: filesChanged?.length,
        locAdded: typeof changesetJson.loc_added === 'number' ? changesetJson.loc_added : undefined,
        locRemoved: typeof changesetJson.loc_removed === 'number' ? changesetJson.loc_removed : undefined,
        files: filesChanged,
      }
    : undefined

  return {
    runId,
    jobType,
    startedAt: statusJson?.started_at || statusJson?.startedAt || summaryJson?.StartTime || summaryJson?.started_at,
    updatedAt: statusJson?.updated_at || statusJson?.updatedAt,
    finishedAt: statusJson?.finished_at || statusJson?.finishedAt || summaryJson?.EndTime || summaryJson?.ended_at,
    state,
    currentStage,
    stages,
    events,
    artifacts,
    error: statusJson?.error
      ? {
          code: statusJson.error.code,
          message: statusJson.error.message || 'Run failed',
          details: statusJson.error.details,
        }
      : undefined,
    pr: prSummary,
    changeset: changesetSummary,
    prError: prError ?? undefined,
  }
}
