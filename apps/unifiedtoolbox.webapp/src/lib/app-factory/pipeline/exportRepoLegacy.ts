import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'
import type { RepoContract } from '../contracts/RepoContract'
import { assembleRepo } from '../assemble/assembleRepo'
import { ingestArtifacts, type AppFactoryArtifact } from './ingestArtifacts'
import { removeGitDir } from '../repair/patchApplier'
import { writeAppFactoryMetadata } from '../provenance/writeRepoProvenance'
import { writeLegacyDiagnosticsBundle } from '../diagnostics/writeLegacyDiagnosticsBundle'

function safeRelativePath(input: string): string {
  const raw = (input || '').replace(/\\/g, '/').trim()
  const noDrive = raw.replace(/^[a-zA-Z]:\//, '')
  const stripped = noDrive.replace(/^\/+/, '')
  const parts = stripped.split('/').filter((p) => p && p !== '.' && p !== '..')
  return parts.join('/')
}

export async function exportRepoLegacy(options: {
  artifacts: AppFactoryArtifact[]
  contract: RepoContract
  workRootDir: string
  runLabel?: string
}): Promise<{ repoDir: string; runId: string }> {
  const runId = `${options.runLabel ? safeRelativePath(options.runLabel).replace(/\//g, '-') + '-' : ''}${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`

  const repoDir = path.join(options.workRootDir, 'runs', runId, 'repo')
  await fs.mkdir(repoDir, { recursive: true })

  await ingestArtifacts(repoDir, options.artifacts)
  await assembleRepo(repoDir, options.contract)
  await writeAppFactoryMetadata({ repoDir, runId, contract: options.contract })
  await removeGitDir(repoDir)
  await writeLegacyDiagnosticsBundle({ repoDir, runId, stackId: options.contract.stackId })

  return { repoDir, runId }
}
