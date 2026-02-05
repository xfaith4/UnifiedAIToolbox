import { promises as fs } from 'fs'
import path from 'path'
import { stripCommonWrappers } from './wrapperStripper'

export type BlobSplitResult =
  | { didSplit: false }
  | { didSplit: true; created: string[]; replacedWith: string; message: string }

// Supports markers like:
// - "## File: path/to/file.ts"
// - "//// FILE: path/to/file.ts"
// - "// FILE: path/to/file.ts"
// - "FILE: path/to/file.ts"
const FILE_MARKER_RE = /^\s*(?:(?:\/{2,}|#{1,6})\s*)?file\s*:\s*(.+?)\s*$/i

function safeRelativePath(input: string): string {
  const raw = (input || '').replace(/\\/g, '/').trim()
  const noDrive = raw.replace(/^[a-zA-Z]:\//, '')
  const stripped = noDrive.replace(/^\/+/, '')
  const parts = stripped.split('/').filter((p) => p && p !== '.' && p !== '..')
  return parts.join('/')
}

function commentPrefix(ext: string): string {
  if (ext === '.py' || ext === '.ps1' || ext === '.sh' || ext === '.rb') return '#'
  return '//'
}

export async function splitBundledBlobIfNeeded(repoDir: string, filePath: string, text: string): Promise<BlobSplitResult> {
  const lines = (text || '').replace(/\r\n/g, '\n').split('\n')

  const markers: { idx: number; target: string }[] = []
  for (let i = 0; i < lines.length; i++) {
    const match = FILE_MARKER_RE.exec(lines[i] ?? '')
    if (match?.[1]) {
      const target = safeRelativePath(match[1])
      if (target) markers.push({ idx: i, target })
    }
  }

  if (markers.length < 2) return { didSplit: false }

  const created: string[] = []
  for (let mi = 0; mi < markers.length; mi++) {
    const start = markers[mi]!.idx + 1
    const end = mi + 1 < markers.length ? markers[mi + 1]!.idx : lines.length
    const targetRel = markers[mi]!.target

    const segmentRaw = lines.slice(start, end).join('\n').trimEnd() + '\n'
    const normalized = stripCommonWrappers(segmentRaw).text
    if (!normalized.trim()) continue

    const outFull = path.join(repoDir, targetRel)
    await fs.mkdir(path.dirname(outFull), { recursive: true })

    try {
      await fs.stat(outFull)
      // skip overwrite
      continue
    } catch {
      // create
    }

    await fs.writeFile(outFull, normalized.replace(/\r\n/g, '\n'), 'utf8')
    created.push(targetRel)
  }

  if (!created.length) return { didSplit: false }

  const ext = path.extname(filePath).toLowerCase()
  const prefix = commentPrefix(ext)
  const rel = path.relative(repoDir, filePath).replace(/\\/g, '/')
  const stubLines = [
    `${prefix} NOTE: This file contained bundled multi-file output and was split by the normalizer.`,
    `${prefix} Original: ${rel}`,
    `${prefix} Created:`,
    ...created.map((c) => `${prefix} - ${c}`),
    '',
  ]

  const replacedWith = stubLines.join('\n')
  await fs.writeFile(filePath, replacedWith, 'utf8')

  return {
    didSplit: true,
    created,
    replacedWith: replacedWith,
    message: `Split bundled blob into ${created.length} file(s)`,
  }
}
