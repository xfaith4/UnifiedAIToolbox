import { promises as fs } from 'fs'
import path from 'path'
import type { RepoContract } from '../contracts/RepoContract'
import { DEFAULT_CODE_FILE_FORBIDDEN } from '../contracts/defaultForbidden'
import { stripCommonWrappers } from './wrapperStripper'
import { splitBundledBlobIfNeeded } from './blobSplitter'

export type NormalizedFileChange = {
  filePath: string
  edits: { kind: string; detail: string }[]
  beforeBytes: number
  afterBytes: number
}

export type NormalizationViolation = {
  filePath: string
  message: string
  matches?: { line: number; snippet: string }[]
}

export type NormalizeRepoResult = {
  changedFiles: NormalizedFileChange[]
  violations: NormalizationViolation[]
  reportPath: string
}

const TEXT_FILE_MAX_BYTES = 2 * 1024 * 1024

async function listFilesRecursively(baseDir: string): Promise<string[]> {
  const out: string[] = []
  const stack: string[] = [baseDir]
  while (stack.length) {
    const current = stack.pop()
    if (!current) continue
    const entries = await fs.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next' || entry.name === 'dist' || entry.name === 'build') {
          continue
        }
        stack.push(full)
      } else if (entry.isFile()) {
        out.push(full)
      }
    }
  }
  return out
}

function isCodeFile(filePath: string, contract: RepoContract): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return contract.codeFileExtensions.includes(ext)
}

function findForbiddenMatches(text: string, pattern: RegExp, maxMatches = 20): { line: number; snippet: string }[] {
  const matches: { line: number; snippet: string }[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i] ?? '')) {
      matches.push({ line: i + 1, snippet: (lines[i] ?? '').slice(0, 200) })
      if (matches.length >= maxMatches) break
    }
  }
  return matches
}

function mergeForbidden<T extends { id: string }>(defaults: T[], overrides: T[]): T[] {
  const byId = new Map<string, T>()
  for (const r of defaults) byId.set(r.id, r)
  for (const r of overrides) byId.set(r.id, r)
  return Array.from(byId.values())
}

export async function normalizeRepo(repoDir: string, contract: RepoContract): Promise<NormalizeRepoResult> {
  const changedFiles: NormalizedFileChange[] = []
  const violations: NormalizationViolation[] = []

  const queue = await listFilesRecursively(repoDir)
  const seen = new Set(queue.map((p) => path.resolve(p)))

  while (queue.length) {
    const filePath = queue.shift()
    if (!filePath) continue
    if (!isCodeFile(filePath, contract)) continue

    const stat = await fs.stat(filePath)
    if (stat.size > TEXT_FILE_MAX_BYTES) continue

    const raw = await fs.readFile(filePath, 'utf8')
    const beforeBytes = Buffer.byteLength(raw, 'utf8')

    const split = await splitBundledBlobIfNeeded(repoDir, filePath, raw)
    if (split.didSplit) {
      for (const createdRel of split.created) {
        const createdFull = path.join(repoDir, createdRel)
        const resolved = path.resolve(createdFull)
        if (!seen.has(resolved)) {
          queue.push(createdFull)
          seen.add(resolved)
        }
      }
      changedFiles.push({
        filePath: path.relative(repoDir, filePath).replace(/\\/g, '/'),
        edits: [{ kind: 'blob-split', detail: split.message }, { kind: 'blob-split', detail: `Created: ${split.created.join(', ')}` }],
        beforeBytes,
        afterBytes: Buffer.byteLength(split.replacedWith, 'utf8'),
      })
      continue
    }

    const stripped = stripCommonWrappers(raw)

    const normalized = stripped.text.replace(/\r\n/g, '\n')
    const afterBytes = Buffer.byteLength(normalized, 'utf8')

    const wasChanged = normalized !== raw
    if (wasChanged) {
      await fs.writeFile(filePath, normalized, 'utf8')
      changedFiles.push({
        filePath: path.relative(repoDir, filePath).replace(/\\/g, '/'),
        edits: stripped.edits,
        beforeBytes,
        afterBytes,
      })
    }

    if (!normalized.trim()) {
      violations.push({
        filePath: path.relative(repoDir, filePath).replace(/\\/g, '/'),
        message: 'Normalization produced an empty/whitespace-only code file',
      })
      continue
    }

    const ext = path.extname(filePath).toLowerCase()
    const forbidden = mergeForbidden(DEFAULT_CODE_FILE_FORBIDDEN, contract.forbiddenPatternsByExtension[ext] || [])
    for (const rule of forbidden) {
      const re = new RegExp(rule.pattern, rule.flags ?? '')
      if (re.test(normalized)) {
        const fileRel = path.relative(repoDir, filePath).replace(/\\/g, '/')
        violations.push({
          filePath: fileRel,
          message: `Forbidden pattern '${rule.id}': ${rule.description}`,
          matches: findForbiddenMatches(normalized, re),
        })
      }
    }
  }

  const reportPath = path.join(repoDir, 'NORMALIZATION_REPORT.md')
  const report = renderNormalizationReport(changedFiles, violations)
  await fs.writeFile(reportPath, report, 'utf8')

  return { changedFiles, violations, reportPath }
}

function renderNormalizationReport(changedFiles: NormalizedFileChange[], violations: NormalizationViolation[]): string {
  const lines: string[] = []
  lines.push('# Normalization Report')
  lines.push('')
  lines.push(`- Changed files: ${changedFiles.length}`)
  lines.push(`- Violations: ${violations.length}`)
  lines.push('')

  if (changedFiles.length) {
    lines.push('## Changes')
    lines.push('')
    for (const change of changedFiles) {
      lines.push(`- \`${change.filePath}\` (${change.beforeBytes}B → ${change.afterBytes}B)`)
      for (const edit of change.edits) {
        lines.push(`  - ${edit.kind}: ${edit.detail}`)
      }
    }
    lines.push('')
  }

  if (violations.length) {
    lines.push('## Violations')
    lines.push('')
    for (const v of violations) {
      lines.push(`- \`${v.filePath}\`: ${v.message}`)
      if (v.matches?.length) {
        for (const m of v.matches.slice(0, 5)) {
          lines.push(`  - line ${m.line}: \`${m.snippet.replace(/`/g, "'")}\``)
        }
      }
    }
    lines.push('')
    lines.push('Fix: remove markdown wrappers/fences or adjust generation prompts; then re-export.')
    lines.push('')
  }

  return lines.join('\n')
}
