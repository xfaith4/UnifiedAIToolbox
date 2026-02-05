import { promises as fs } from 'fs'
import path from 'path'

export type ReadSessionsResult<T> = {
  sessions: T[]
  recovered: boolean
  error?: string
}

let _writeChain: Promise<void> = Promise.resolve()

function enqueueWrite(fn: () => Promise<void>): Promise<void> {
  const next = _writeChain.then(fn, fn)
  _writeChain = next.then(
    () => undefined,
    () => undefined
  )
  return next
}

function stripNul(text: string): string {
  return text.replace(/\u0000/g, '')
}

function extractJsonArraySlices(text: string): string[] {
  const slices: string[] = []
  const s = text
  let i = 0
  while (i < s.length) {
    const start = s.indexOf('[', i)
    if (start < 0) break

    let depth = 0
    let inString = false
    let escaped = false
    for (let j = start; j < s.length; j++) {
      const ch = s[j]
      if (escaped) {
        escaped = false
        continue
      }
      if (inString) {
        if (ch === '\\\\') escaped = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') {
        inString = true
        continue
      }
      if (ch === '[') depth++
      if (ch === ']') {
        depth--
        if (depth === 0) {
          slices.push(s.slice(start, j + 1))
          i = j + 1
          break
        }
      }
    }

    // Could not find end; stop scanning.
    if (slices.length === 0 || !slices.at(-1)) break
  }
  return slices
}

function looksLikeSessionsArray(value: unknown): boolean {
  if (!Array.isArray(value)) return false
  for (const item of value) {
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>
      if (typeof obj.id === 'string' && ('tasks' in obj || 'goal' in obj)) return true
    }
  }
  return false
}

export async function readSessionsFile<T>(filePath: string): Promise<ReadSessionsResult<T>> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const cleaned = stripNul(raw).trim()
    if (!cleaned) return { sessions: [], recovered: false }

    try {
      const parsed = JSON.parse(cleaned)
      return { sessions: Array.isArray(parsed) ? (parsed as T[]) : [], recovered: false }
    } catch (err) {
      const slices = extractJsonArraySlices(cleaned)
      const parsedArrays: unknown[] = []
      for (const slice of slices) {
        try {
          const parsed = JSON.parse(slice)
          if (Array.isArray(parsed)) parsedArrays.push(parsed)
        } catch {
          // ignore
        }
      }

      const best = [...parsedArrays].reverse().find(looksLikeSessionsArray) ?? parsedArrays.at(-1)
      if (best && Array.isArray(best)) {
        return {
          sessions: best as T[],
          recovered: true,
          error: err instanceof Error ? err.message : String(err),
        }
      }
      return { sessions: [], recovered: true, error: err instanceof Error ? err.message : String(err) }
    }
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e?.code === 'ENOENT') return { sessions: [], recovered: false }
    return { sessions: [], recovered: true, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function writeSessionsFile(filePath: string, sessions: unknown[]): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })

  await enqueueWrite(async () => {
    const tmpPath = `${filePath}.tmp`
    const content = JSON.stringify(sessions, null, 2)
    await fs.writeFile(tmpPath, content, 'utf8')
    try {
      await fs.rename(tmpPath, filePath)
    } catch {
      await fs.rm(filePath, { force: true })
      await fs.rename(tmpPath, filePath)
    }
  })
}
