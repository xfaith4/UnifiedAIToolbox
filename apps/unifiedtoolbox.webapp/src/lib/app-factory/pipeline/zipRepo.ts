import { promises as fs } from 'fs'
import path from 'path'
import JSZip from 'jszip'

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
        if (
          entry.name === 'node_modules' ||
          entry.name === '.next' ||
          entry.name === '.turbo' ||
          entry.name === 'dist' ||
          entry.name === 'build' ||
          entry.name === '.git'
        ) {
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

export async function zipDirectoryToBuffer(baseDir: string): Promise<Buffer> {
  const zip = new JSZip()
  const files = await listFiles(baseDir)
  for (const file of files) {
    const rel = path.relative(baseDir, file).replace(/\\/g, '/')
    const buf = await fs.readFile(file)
    zip.file(rel, buf)
  }
  const arrayBuffer = await zip.generateAsync({ type: 'arraybuffer' })
  return Buffer.from(arrayBuffer)
}

