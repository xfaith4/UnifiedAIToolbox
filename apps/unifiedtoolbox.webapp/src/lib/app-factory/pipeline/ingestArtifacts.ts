import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'

export type AppFactoryArtifact = {
  name: string
  type?: string
  content: string
  sourceTeamId?: string
  sourceTaskId?: string
  sourceTaskName?: string
}

export type PlannedArtifactWrite = {
  index: number
  artifact: AppFactoryArtifact
  originalName: string
  relPath: string
  fullPath: string
  ext: string
  reason?: string
}

export type ArtifactIngestItem = {
  originalName: string
  storedPath?: string
  status: 'written' | 'skipped' | 'error'
  reason?: string
  sourceTeamId?: string
  sourceTaskId?: string
}

export type ArtifactIngestResult = {
  items: ArtifactIngestItem[]
  reportPath: string
}

const INVALID_SEGMENT_RE = /[<>:"|?*\u0000]/g
const CONTROL_RE = /[\r\n\t]/g

function safeRelativePath(input: string): string {
  const raw = (input || '').replace(/\\/g, '/').trim()
  const noDrive = raw.replace(/^[a-zA-Z]:\//, '')
  const stripped = noDrive.replace(/^\/+/, '')
  const parts = stripped
    .split('/')
    .map((p) => p.trim())
    .filter((p) => p && p !== '.' && p !== '..')
  return parts.join('/')
}

function sanitizeSegment(seg: string): string {
  const cleaned = seg.replace(CONTROL_RE, ' ').replace(INVALID_SEGMENT_RE, '_').replace(/\s+/g, ' ').trim()
  // Avoid empty segments and trailing dots/spaces (Windows).
  const trimmed = cleaned.replace(/[. ]+$/g, '')
  return trimmed || '_'
}

function looksLikeMultiTargetOrGlob(name: string): boolean {
  return (
    name.includes(',') ||
    name.includes('*') ||
    name.includes('?') ||
    name.includes('..') ||
    name.includes('\n') ||
    name.includes('\r') ||
    name.includes('\t')
  )
}

function toOrphanedPath(originalName: string, suggestedExt?: string): string {
  const ext = suggestedExt && suggestedExt.startsWith('.') ? suggestedExt : '.md'
  const hash = crypto.createHash('sha256').update(originalName).digest('hex').slice(0, 10)
  const base = sanitizeSegment(originalName).slice(0, 60)
  return `orphaned/${base}-${hash}${ext}`
}

function ensureWithinRepo(repoDir: string, rel: string): string {
  const full = path.resolve(repoDir, rel)
  const root = path.resolve(repoDir)
  if (!full.startsWith(root + path.sep) && full !== root) {
    throw new Error('path escaped repo root')
  }
  return full
}

export function planArtifactWrites(repoDir: string, artifacts: AppFactoryArtifact[]): PlannedArtifactWrite[] {
  const planned: PlannedArtifactWrite[] = []

  let index = 0
  for (const art of artifacts || []) {
    const originalName = String(art?.name || '')
    if (!originalName.trim()) {
      planned.push({
        index: index++,
        artifact: art,
        originalName,
        relPath: '',
        fullPath: repoDir,
        ext: '',
        reason: 'missing name',
      })
      continue
    }

    const relCandidate = safeRelativePath(originalName)
    const ext = path.extname(relCandidate).toLowerCase()

    let rel = relCandidate
    let reason: string | undefined

    if (!rel || looksLikeMultiTargetOrGlob(originalName)) {
      reason = 'unsafe artifact name (multi-target/glob/control chars); stored under orphaned/'
      rel = toOrphanedPath(originalName, ext || '.md')
    } else {
      const segs = rel.split('/').map(sanitizeSegment)
      rel = segs.join('/')
    }

    try {
      planned.push({
        index: index++,
        artifact: art,
        originalName,
        relPath: rel.replace(/\\/g, '/'),
        fullPath: ensureWithinRepo(repoDir, rel),
        ext,
        reason,
      })
    } catch (err) {
      const fallback = toOrphanedPath(originalName, ext || '.md')
      planned.push({
        index: index++,
        artifact: art,
        originalName,
        relPath: fallback,
        fullPath: ensureWithinRepo(repoDir, fallback),
        ext,
        reason: `unsafe artifact path (${err instanceof Error ? err.message : String(err)}); stored under orphaned/`,
      })
    }
  }

  return planned
}

export async function ingestArtifacts(
  repoDir: string,
  artifacts: AppFactoryArtifact[],
  options?: { plannedWrites?: PlannedArtifactWrite[] }
): Promise<ArtifactIngestResult> {
  const items: ArtifactIngestItem[] = []
  const planned = options?.plannedWrites ?? planArtifactWrites(repoDir, artifacts)

  for (const entry of planned) {
    const art = entry.artifact
    const originalName = entry.originalName
    try {
      if (!originalName.trim()) {
        items.push({ originalName, status: 'skipped', reason: entry.reason || 'missing name' })
        continue
      }

      const rel = entry.relPath || safeRelativePath(originalName)
      const full = entry.fullPath || ensureWithinRepo(repoDir, rel)
      await fs.mkdir(path.dirname(full), { recursive: true })

      if ((art.type || '').toUpperCase() === 'IMAGE') {
        const buf = Buffer.from(art.content || '', 'base64')
        await fs.writeFile(full, buf)
      } else {
        const body = (art.content || '').replace(/\r\n/g, '\n')
        await fs.writeFile(full, body, 'utf8')
      }

      items.push({
        originalName,
        storedPath: rel.replace(/\\/g, '/'),
        status: 'written',
        reason: entry.reason,
        sourceTeamId: art.sourceTeamId,
        sourceTaskId: art.sourceTaskId,
      })
    } catch (err) {
      items.push({
        originalName,
        status: 'error',
        reason: err instanceof Error ? err.message : String(err),
        sourceTeamId: art?.sourceTeamId,
        sourceTaskId: art?.sourceTaskId,
      })
      continue
    }
  }

  const reportPath = path.join(repoDir, 'ARTIFACT_INGEST_REPORT.md')
  const lines: string[] = [
    '# Artifact Ingest Report',
    '',
    `- Written: ${items.filter((i) => i.status === 'written').length}`,
    `- Skipped: ${items.filter((i) => i.status === 'skipped').length}`,
    `- Errors: ${items.filter((i) => i.status === 'error').length}`,
    '',
    '## Items',
    '',
    ...items.map((i) => {
      const stored = i.storedPath ? ` → \`${i.storedPath}\`` : ''
      const why = i.reason ? ` (${i.reason})` : ''
      const meta = i.sourceTeamId || i.sourceTaskId ? ` [team:${i.sourceTeamId || '-'} task:${i.sourceTaskId || '-'}]` : ''
      return `- **${i.status}**: \`${i.originalName.replace(/`/g, "'")}\`${stored}${why}${meta}`
    }),
    '',
  ]
  await fs.writeFile(reportPath, lines.join('\n'), 'utf8')

  return { items, reportPath }
}
