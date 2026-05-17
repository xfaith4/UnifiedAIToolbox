import 'server-only'
import path from 'path'
import { promises as fs } from 'fs'
import { randomUUID } from 'crypto'
import { getRunsRoot, isValidRunId } from './runStatus'
import { runLogger } from './runLogger'

/**
 * Per-run artifact index. Each artifact produced by an agent gets a row in
 * `artifacts.index.jsonl`. The index is append-only JSON Lines so multiple
 * agents can write to it concurrently and readers see a stable snapshot.
 */
export interface ArtifactIndexEntry {
  artifact_id: string
  run_id: string
  /** Free-form type token (e.g. "doc", "code-patch", "test-report", "pr"). */
  type: string
  title: string
  /** Path relative to the run directory (forward-slash separated). */
  path: string
  created_at: string
  producing_agent?: string
  summary?: string
}

export type ArtifactIndexInput = Omit<ArtifactIndexEntry, 'artifact_id' | 'created_at'> & {
  artifact_id?: string
  created_at?: string
}

export const ARTIFACTS_INDEX_FILENAME = 'artifacts.index.jsonl'

function ensureWithin(root: string, candidate: string): string {
  const full = path.resolve(root, candidate)
  const r = path.resolve(root)
  if (!full.startsWith(r + path.sep) && full !== r) {
    throw new Error('path escaped root')
  }
  return full
}

function normalizeRelPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '')
}

/** Per-run mutex for safe append. Single-process; cross-process safety relies
 * on POSIX append-mode atomicity for small writes. */
const runMutex = new Map<string, Promise<void>>()
async function withRunLock<T>(runId: string, fn: () => Promise<T>): Promise<T> {
  const previous = runMutex.get(runId) ?? Promise.resolve()
  let release: () => void = () => undefined
  const next = new Promise<void>((resolve) => {
    release = resolve
  })
  runMutex.set(runId, previous.then(() => next))
  try {
    await previous
    return await fn()
  } finally {
    release()
  }
}

export interface IndexArtifactOptions {
  rootDir?: string
}

/**
 * Append a new artifact entry to `artifacts.index.jsonl`. Returns the fully
 * populated entry (with assigned id + timestamp).
 */
export async function indexArtifact(
  input: ArtifactIndexInput,
  options: IndexArtifactOptions = {}
): Promise<ArtifactIndexEntry> {
  if (!isValidRunId(input.run_id)) {
    throw new Error(`Invalid run_id for artifact index: ${input.run_id}`)
  }
  if (!input.path || !input.path.trim()) {
    throw new Error('Artifact path is required')
  }

  const entry: ArtifactIndexEntry = {
    artifact_id: input.artifact_id ?? randomUUID(),
    run_id: input.run_id,
    type: String(input.type ?? 'file'),
    title: String(input.title ?? path.basename(input.path)),
    path: normalizeRelPath(input.path),
    created_at: input.created_at ?? new Date().toISOString(),
    producing_agent: input.producing_agent,
    summary: input.summary,
  }

  const rootDir = options.rootDir ?? getRunsRoot()
  const runDir = ensureWithin(rootDir, input.run_id)
  const filePath = path.join(runDir, ARTIFACTS_INDEX_FILENAME)

  await withRunLock(input.run_id, async () => {
    try {
      await fs.mkdir(runDir, { recursive: true })
      const fh = await fs.open(filePath, 'a')
      try {
        await fh.appendFile(JSON.stringify(entry) + '\n', 'utf8')
        try {
          await fh.sync()
        } catch {
          // ignore
        }
      } finally {
        await fh.close()
      }
    } catch (error) {
      runLogger.error('artifactIndex.appendFailed', {
        run_id: input.run_id,
        path: entry.path,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })

  return entry
}

export interface ListArtifactsOptions {
  rootDir?: string
}

/** Read all artifact index entries for a run. */
export async function listArtifactIndex(
  runId: string,
  options: ListArtifactsOptions = {}
): Promise<ArtifactIndexEntry[]> {
  if (!isValidRunId(runId)) return []
  const rootDir = options.rootDir ?? getRunsRoot()
  const runDir = ensureWithin(rootDir, runId)
  const filePath = path.join(runDir, ARTIFACTS_INDEX_FILENAME)

  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }

  const entries: ArtifactIndexEntry[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line) as ArtifactIndexEntry
      if (!parsed?.artifact_id || !parsed?.path) continue
      entries.push(parsed)
    } catch {
      // skip malformed
    }
  }
  return entries
}

/** Look up a single artifact entry by id. */
export async function findArtifact(
  runId: string,
  artifactId: string,
  options: ListArtifactsOptions = {}
): Promise<ArtifactIndexEntry | null> {
  const all = await listArtifactIndex(runId, options)
  return all.find((entry) => entry.artifact_id === artifactId) ?? null
}
