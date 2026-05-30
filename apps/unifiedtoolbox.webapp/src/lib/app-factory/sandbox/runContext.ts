import path from 'path'
import { isValidRunId } from '@/lib/app-factory/runs/runStatus'

export interface SandboxRunContext {
  runId: string
  rootDir: string
}

export function resolveRunContext(
  runDir: string,
): SandboxRunContext | null {
  const runId = path.basename(runDir)
  if (!isValidRunId(runId)) return null
  return {
    runId,
    rootDir: path.dirname(runDir),
  }
}
