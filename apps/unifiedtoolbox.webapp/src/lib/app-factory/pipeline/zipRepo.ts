import { promises as fs } from 'fs'
import path from 'path'
import JSZip from 'jszip'

const DENY_DIRS = new Set([
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
  'LICENSE',
  'NOTICE',
  'COPYING',
  'README',
  'CODEOWNERS',
  'Dockerfile',
  'Makefile',
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

function firstDeniedDir(relPath: string): string | null {
  const parts = String(relPath || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
  for (const p of parts) {
    if (DENY_DIRS.has(p)) return p
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

async function listFiles(baseDir: string): Promise<string[]> {
  const out: string[] = []
  const stack: string[] = [baseDir]
  while (stack.length) {
    const current = stack.pop()
    if (!current) continue
    const entries = await fs.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (DENY_DIRS.has(entry.name)) continue
        stack.push(full)
      } else if (entry.isFile()) {
        const rel = path.relative(baseDir, full).replace(/\\/g, '/')
        const denied = firstDeniedDir(rel)
        if (denied) continue
        const nameLower = entry.name.toLowerCase()
        if (JUNK_FILENAMES.has(nameLower)) continue
        out.push(full)
      }
    }
  }
  return out
}

export type ZipProgressEvent =
  | {
      type: 'export.enumeration.start'
      data: { baseDir: string }
    }
  | {
      type: 'export.enumeration.progress'
      data: { files_seen: number; excluded_dirs: string[] }
    }
  | {
      type: 'export.zip.progress'
      data: { files_zipped: number; files_total: number; bytes_written: number; bytes_total_estimate: number; percent: number }
    }

export async function zipDirectoryToBuffer(
  baseDir: string,
  options?: { onProgress?: (event: ZipProgressEvent) => Promise<void> | void }
): Promise<Buffer> {
  const zip = new JSZip()
  await options?.onProgress?.({
    type: 'export.enumeration.start',
    data: { baseDir: baseDir.replace(/\\/g, '/') },
  })
  const files = await listFiles(baseDir)
  await options?.onProgress?.({
    type: 'export.enumeration.progress',
    data: { files_seen: files.length, excluded_dirs: Array.from(DENY_DIRS).sort() },
  })
  const fileSizes = await Promise.all(
    files.map(async (file) => {
      try {
        const stat = await fs.stat(file)
        return stat.size
      } catch {
        return 0
      }
    })
  )
  const totalBytesEstimate = fileSizes.reduce((sum, size) => sum + size, 0)
  let zippedCount = 0
  let zippedBytes = 0
  for (const file of files) {
    const rel = path.relative(baseDir, file).replace(/\\/g, '/')
    if (isExtensionlessJunk(rel)) continue
    const buf = await fs.readFile(file)
    zip.file(rel, buf)
    zippedCount += 1
    zippedBytes += buf.byteLength
    await options?.onProgress?.({
      type: 'export.zip.progress',
      data: {
        files_zipped: zippedCount,
        files_total: files.length,
        bytes_written: zippedBytes,
        bytes_total_estimate: totalBytesEstimate,
        percent: files.length > 0 ? Math.round((zippedCount / files.length) * 100) : 100,
      },
    })
  }
  const arrayBuffer = await zip.generateAsync({ type: 'arraybuffer' }, (metadata) => {
    void options?.onProgress?.({
      type: 'export.zip.progress',
      data: {
        files_zipped: zippedCount,
        files_total: files.length,
        bytes_written: zippedBytes,
        bytes_total_estimate: totalBytesEstimate,
        percent: Math.max(0, Math.min(100, Math.round(metadata.percent || 0))),
      },
    })
  })
  return Buffer.from(arrayBuffer)
}
