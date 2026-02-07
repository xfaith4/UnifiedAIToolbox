import { NextResponse } from 'next/server'
import path from 'path'
import { promises as fs } from 'fs'
import JSZip from 'jszip'
import { zipDirectoryToBuffer } from '@/lib/app-factory/pipeline/zipRepo'
import { getRunsRoot, isValidRunId } from '@/lib/app-factory/runs/runStatus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const resolveRunId = (paramRunId: unknown, req: Request): string => {
  const direct = safeDecode(String(paramRunId || '')).trim()
  if (direct) return direct
  try {
    const parts = new URL(req.url).pathname.split('/').filter(Boolean)
    const runsIndex = parts.indexOf('runs')
    if (runsIndex >= 0 && parts.length > runsIndex + 1) {
      return safeDecode(parts[runsIndex + 1] || '').trim()
    }
  } catch {
    // ignore
  }
  return ''
}

function ensureWithin(root: string, candidate: string): string {
  const full = path.resolve(root, candidate)
  const r = path.resolve(root)
  if (!full.startsWith(r + path.sep) && full !== r) {
    throw new Error('path escaped root')
  }
  return full
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath)
    return stat.isDirectory()
  } catch {
    return false
  }
}

async function dirHasFiles(dirPath: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    if (entries.length === 0) return false
    for (const entry of entries) {
      if (entry.isFile()) return true
      if (entry.isDirectory()) {
        if (await dirHasFiles(path.join(dirPath, entry.name))) return true
      }
    }
    return false
  } catch {
    return false
  }
}

export async function GET(req: Request, { params }: { params: { runId: string } }) {
  const runId = resolveRunId(params?.runId, req)
  if (!runId) {
    return NextResponse.json({ error: { code: 'MISSING_RUN_ID', message: 'Missing runId' } }, { status: 400 })
  }
  if (!isValidRunId(runId)) {
    return NextResponse.json({ error: { code: 'INVALID_RUN_ID', message: 'Invalid runId' } }, { status: 400 })
  }

  const runsRoot = getRunsRoot()
  const runDir = ensureWithin(runsRoot, runId)

  if (!(await dirExists(runDir))) {
    return NextResponse.json({ error: { code: 'RUN_NOT_FOUND', message: `Run not found: ${runId}` } }, { status: 404 })
  }

  const hasFiles = await dirHasFiles(runDir)
  if (!hasFiles) {
    return NextResponse.json(
      {
        error: {
          code: 'RUN_EMPTY',
          message: 'Run folder exists but contains no files.',
          details: { path: runDir, hint: 'Ensure the orchestrator wrote run_state.json or artifacts before exporting.' },
        },
      },
      { status: 409 }
    )
  }

  // Parse scope parameter: 'artifacts' or 'full' (default: artifacts)
  const url = new URL(req.url)
  const scopeParam = url.searchParams.get('scope') || 'artifacts'
  
  // Validate scope parameter
  if (scopeParam !== 'artifacts' && scopeParam !== 'full') {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_SCOPE',
          message: 'Invalid scope parameter. Valid values are "artifacts" or "full".',
        },
      },
      { status: 400 }
    )
  }
  
  const scope = scopeParam

  try {
    let zip: Buffer
    let filename: string

    if (scope === 'artifacts') {
      // Export only artifacts/ + status.json + run_manifest.json
      filename = `${runId}-artifacts.zip`
      const artifactsDir = path.join(runDir, 'artifacts')
      const statusFile = path.join(runDir, 'status.json')
      const runStateFile = path.join(runDir, 'run_state.json')
      const manifestFile = path.join(runDir, 'run_manifest.json')
      
      const zipObj = new JSZip()
      
      // Add artifacts directory if it exists
      if (await dirExists(artifactsDir)) {
        const artifactFiles = await listFilesRecursive(artifactsDir)
        for (const file of artifactFiles) {
          const rel = path.relative(runDir, file).replace(/\\/g, '/')
          const buf = await fs.readFile(file)
          zipObj.file(rel, buf)
        }
      }
      
      // Add status.json if exists
      if (await fileExists(statusFile)) {
        const buf = await fs.readFile(statusFile)
        zipObj.file('status.json', buf)
      } else if (await fileExists(runStateFile)) {
        // Fallback to run_state.json
        const buf = await fs.readFile(runStateFile)
        zipObj.file('run_state.json', buf)
      }
      
      // Add run_manifest.json if exists
      if (await fileExists(manifestFile)) {
        const buf = await fs.readFile(manifestFile)
        zipObj.file('run_manifest.json', buf)
      }
      
      const arrayBuffer = await zipObj.generateAsync({ type: 'arraybuffer' })
      zip = Buffer.from(arrayBuffer)
    } else {
      // Export full run directory
      filename = `${runId}-full.zip`
      zip = await zipDirectoryToBuffer(runDir)
    }

    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'EXPORT_FAILED', message: 'Failed to export run artifacts', details: err instanceof Error ? err.message : String(err) } },
      { status: 500 }
    )
  }
}

/**
 * Check if a file exists at the given path
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath)
    return stat.isFile()
  } catch (err) {
    // ENOENT is expected for missing files
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      return false
    }
    // Log other filesystem errors (permissions, etc.)
    console.error(`[export] Error checking file existence ${filePath}:`, err instanceof Error ? err.message : String(err))
    return false
  }
}

/**
 * Recursively list all files in a directory tree
 * 
 * Security: Validates all paths to prevent traversal outside baseDir.
 * - Resolves full paths to handle symlinks correctly
 * - Ensures resolved paths are within baseDir boundary
 * - Logs and skips any paths that escape the base directory
 * - Continues processing even if individual directories fail to read
 */
async function listFilesRecursive(baseDir: string): Promise<string[]> {
  const out: string[] = []
  const stack: string[] = [baseDir]
  const resolvedBase = path.resolve(baseDir)
  
  while (stack.length) {
    const current = stack.pop()!
    try {
      const entries = await fs.readdir(current, { withFileTypes: true })
      for (const entry of entries) {
        const full = path.join(current, entry.name)
        const resolved = path.resolve(full)
        
        // Security: prevent path traversal via symlinks
        // Allow the base directory itself and any path that starts with base + separator
        if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + path.sep)) {
          console.warn(`[export] Skipping path outside base directory: ${full}`)
          continue
        }
        
        if (entry.isDirectory()) {
          stack.push(full)
        } else if (entry.isFile()) {
          out.push(full)
        }
      }
    } catch (err) {
      // Log permission/IO errors but continue processing other directories
      console.error(`[export] Failed to read directory ${current}:`, err instanceof Error ? err.message : String(err))
      continue
    }
  }
  return out
}
