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

function firstDeniedDir(fullPath: string): string | null {
  const parts = String(fullPath || '')
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
        const denied = firstDeniedDir(full)
        if (denied) continue
        const nameLower = entry.name.toLowerCase()
        if (JUNK_FILENAMES.has(nameLower)) continue
        out.push(full)
      }
    }
  }
  return out
}

export async function zipDirectoryToBuffer(baseDir: string): Promise<Buffer> {
  const zip = new JSZip()
  const files = await listFiles(baseDir)
  for (const file of files) {
    const rel = path.relative(baseDir, file).replace(/\\/g, '/')
    if (isExtensionlessJunk(rel)) continue
    const buf = await fs.readFile(file)
    zip.file(rel, buf)
  }
  const arrayBuffer = await zip.generateAsync({ type: 'arraybuffer' })
  return Buffer.from(arrayBuffer)
}
