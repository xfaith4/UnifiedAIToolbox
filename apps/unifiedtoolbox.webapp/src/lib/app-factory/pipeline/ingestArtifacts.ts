import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'
import { cleanupArtifactContent } from './cleanupArtifactContent'

export type AppFactoryArtifact = {
  name: string
  type?: string
  content: string
  sourceTeamId?: string
  sourceTaskId?: string
  sourceTaskName?: string
}

const DENY_SEGMENTS = new Set([
  '.git',
  'node_modules',
  '.next',
  '.turbo',
  'dist',
  'build',
  'out',
  'coverage',
  '.vercel',
  '.output',
  '.cache',
  '.pnpm-store',
  '.uaitoolbox',
])

const ALLOW_EXTENSIONLESS_NAMES = new Set([
  // common repo root files
  'LICENSE',
  'NOTICE',
  'COPYING',
  'README',
  'CODEOWNERS',
  'Dockerfile',
  'Makefile',
  // common dotfiles (path.extname returns '' for these)
  '.gitignore',
  '.gitattributes',
  '.editorconfig',
  '.npmrc',
  '.nvmrc',
  '.node-version',
  '.prettierrc',
  '.prettierignore',
  '.eslintignore',
  '.eslintrc',
  '.env',
  '.env.example',
  '.env.local',
  '.env.production',
  '.env.development',
  '.env.test',
])

const JUNK_FILENAMES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini'])

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

export type ArtifactIngestProgress = {
  processed: number
  total: number
  written: number
  skipped: number
  errors: number
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

function firstDeniedSegment(relPath: string): string | null {
  const parts = String(relPath || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
  for (const p of parts) {
    if (DENY_SEGMENTS.has(p)) return p
  }
  return null
}

function isExtensionlessJunk(relPath: string): boolean {
  const base = path.posix.basename(String(relPath || '').replace(/\\/g, '/'))
  const ext = path.posix.extname(base)
  if (ext) return false
  if (ALLOW_EXTENSIONLESS_NAMES.has(base)) return false
  return true
}

function looksLikePromptFragmentOnly(content: string): boolean {
  const text = String(content || '').trim()
  if (!text) return false
  // avoid penalizing long docs; this filter targets small junk fragments
  if (text.length > 12000) return false

  const lower = text.toLowerCase()
  const signals = [
    'you are an ai',
    'you are a supervisor',
    'mission',
    'non-negotiable',
    'definition of done',
    'agents & responsibilities',
    'execution rules',
    'begin by',
    'return raw json',
    'do not skip',
  ]
  const signalCount = signals.reduce((sum, s) => sum + (lower.includes(s) ? 1 : 0), 0)

  const codeLike =
    /(^|\n)\s*(import|export|function|class|const|let|var|type|interface|enum|def|package)\b/m.test(text) ||
    /[{};]\s*$/m.test(text)

  return signalCount >= 2 && !codeLike
}


function hasInvalidCodeBoundary(content: string, relPath: string): { ok: boolean; reason?: string } {
  const ext = path.extname(relPath).toLowerCase()
  if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) return { ok: true }
  const text = String(content || '')
  if (/```/.test(text)) return { ok: false, reason: 'code file contains markdown fence markers' }
  if (/^#\s+.+/m.test(text)) return { ok: false, reason: 'code file appears to contain markdown heading content' }
  return { ok: true }
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
  options?: {
    plannedWrites?: PlannedArtifactWrite[]
    onProgress?: (progress: ArtifactIngestProgress) => Promise<void> | void
  }
): Promise<ArtifactIngestResult> {
  const items: ArtifactIngestItem[] = []
  const planned = options?.plannedWrites ?? planArtifactWrites(repoDir, artifacts)
  const progress = { processed: 0, total: planned.length, written: 0, skipped: 0, errors: 0 }

  const emitProgress = async () => {
    await options?.onProgress?.({ ...progress })
  }

  for (const entry of planned) {
    const art = entry.artifact
    const originalName = entry.originalName
    try {
      if (!originalName.trim()) {
        items.push({ originalName, status: 'skipped', reason: entry.reason || 'missing name' })
        progress.processed += 1
        progress.skipped += 1
        await emitProgress()
        continue
      }

      const rel = entry.relPath || safeRelativePath(originalName)
      const denied = firstDeniedSegment(rel)
      if (denied) {
        items.push({ originalName, status: 'skipped', reason: `blocked path segment '${denied}'`, sourceTeamId: art.sourceTeamId, sourceTaskId: art.sourceTaskId })
        progress.processed += 1
        progress.skipped += 1
        await emitProgress()
        continue
      }

      const baseLower = path.posix.basename(rel.replace(/\\/g, '/')).toLowerCase()
      if (JUNK_FILENAMES.has(baseLower)) {
        items.push({ originalName, status: 'skipped', reason: `junk file '${baseLower}'`, sourceTeamId: art.sourceTeamId, sourceTaskId: art.sourceTaskId })
        progress.processed += 1
        progress.skipped += 1
        await emitProgress()
        continue
      }

      if (isExtensionlessJunk(rel)) {
        items.push({ originalName, status: 'skipped', reason: 'blocked extensionless junk file', sourceTeamId: art.sourceTeamId, sourceTaskId: art.sourceTaskId })
        progress.processed += 1
        progress.skipped += 1
        await emitProgress()
        continue
      }

      // Block tiny prompt-only fragments in unexpected locations (keeps docs/ and prompts/ intact).
      if (!rel.startsWith('docs/') && !rel.startsWith('prompts/') && looksLikePromptFragmentOnly(art.content || '')) {
        items.push({ originalName, status: 'skipped', reason: 'blocked prompt-fragment-only file', sourceTeamId: art.sourceTeamId, sourceTaskId: art.sourceTaskId })
        progress.processed += 1
        progress.skipped += 1
        await emitProgress()
        continue
      }

      const full = entry.fullPath || ensureWithinRepo(repoDir, rel)
      await fs.mkdir(path.dirname(full), { recursive: true })

      const boundaryCheck = hasInvalidCodeBoundary(art.content || '', rel)
      if (!boundaryCheck.ok) {
        items.push({ originalName, status: 'skipped', reason: boundaryCheck.reason, sourceTeamId: art.sourceTeamId, sourceTaskId: art.sourceTaskId })
        progress.processed += 1
        progress.skipped += 1
        await emitProgress()
        continue
      }

      if ((art.type || '').toUpperCase() === 'IMAGE') {
        const buf = Buffer.from(art.content || '', 'base64')
        await fs.writeFile(full, buf)
      } else {
        // Apply cleanup to remove markdown code fencing and normalize line endings
        const cleaned = cleanupArtifactContent(art.content || '', originalName)
        const body = cleaned.replace(/\r\n/g, '\n')
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
      progress.processed += 1
      progress.written += 1
      await emitProgress()
    } catch (err) {
      items.push({
        originalName,
        status: 'error',
        reason: err instanceof Error ? err.message : String(err),
        sourceTeamId: art?.sourceTeamId,
        sourceTaskId: art?.sourceTaskId,
      })
      progress.processed += 1
      progress.errors += 1
      await emitProgress()
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
