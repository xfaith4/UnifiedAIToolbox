import path from 'path'
import { promises as fs } from 'fs'
import crypto from 'crypto'
import type { RepoContract } from '../contracts/RepoContract'

export type DecisionLockResult = {
  contractHash: string
  reportPath: string
  lockedPaths: string[]
}

async function ensureFile(repoDir: string, relPath: string, content: string): Promise<'created' | 'exists'> {
  const full = path.join(repoDir, relPath)
  try {
    const stat = await fs.stat(full)
    if (stat.isFile()) return 'exists'
  } catch {
    // ignore
  }
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, content.replace(/\r\n/g, '\n'), 'utf8')
  return 'created'
}

async function listFilesUnder(repoDir: string, relDir: string): Promise<string[]> {
  const root = path.join(repoDir, relDir)
  const out: string[] = []
  const walk = async (dir: string) => {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) await walk(full)
      else if (e.isFile()) out.push(path.relative(repoDir, full).replace(/\\/g, '/'))
    }
  }
  try {
    await walk(root)
  } catch {
    return []
  }
  return out
}

async function hashFiles(repoDir: string, relPaths: string[]): Promise<string> {
  const h = crypto.createHash('sha256')
  for (const rel of [...relPaths].sort()) {
    const full = path.join(repoDir, rel)
    h.update(rel)
    h.update('\n')
    const buf = await fs.readFile(full)
    h.update(buf)
    h.update('\n')
  }
  return h.digest('hex')
}

export async function runDecisionLock(repoDir: string, contract: RepoContract): Promise<DecisionLockResult> {
  const lockedPaths: string[] = [
    'STACK_LOCK.json',
    'API_CONTRACT.json',
    'DB_SCHEMA.sql',
    'REPO_CONTRACT_SPEC.json',
    'types/shared/index.ts',
  ]

  const changes: { relPath: string; action: 'created' | 'exists' }[] = []

  const stackLock = JSON.stringify(
    {
      stackId: contract.stackId,
      packageManager: contract.installCommand.includes('pnpm') ? 'pnpm' : contract.installCommand.includes('npm') ? 'npm' : 'unknown',
      workspace: contract.installCommand.includes('pnpm') ? 'pnpm-workspace.yaml' : null,
      layout: {
        api: 'apps/api',
        web: 'apps/web',
        sharedTypes: 'types/shared',
      },
      createdAt: new Date().toISOString(),
    },
    null,
    2
  )
  changes.push({ relPath: 'STACK_LOCK.json', action: await ensureFile(repoDir, 'STACK_LOCK.json', `${stackLock}\n`) })

  const apiContract = JSON.stringify(
    {
      version: 1,
      endpoints: [
        { method: 'GET', path: '/health', response: { ok: true } },
        { method: 'GET', path: '/', response: { name: 'api', ok: true } },
      ],
      notes: 'Canonical API contract for parallel teams. Update via Shared Contracts team only.',
    },
    null,
    2
  )
  changes.push({ relPath: 'API_CONTRACT.json', action: await ensureFile(repoDir, 'API_CONTRACT.json', `${apiContract}\n`) })

  const dbSchema = `-- DB_SCHEMA.sql (canonical)\n-- Update via Shared Contracts team only.\n\nCREATE TABLE IF NOT EXISTS _meta (\n  key TEXT PRIMARY KEY,\n  value TEXT NOT NULL\n);\n`
  changes.push({ relPath: 'DB_SCHEMA.sql', action: await ensureFile(repoDir, 'DB_SCHEMA.sql', dbSchema) })

  changes.push({ relPath: 'REPO_CONTRACT_SPEC.json', action: await ensureFile(repoDir, 'REPO_CONTRACT_SPEC.json', `${JSON.stringify(contract, null, 2)}\n`) })

  const sharedTypes = `export type ApiHealthResponse = { ok: boolean }\n`
  changes.push({ relPath: 'types/shared/index.ts', action: await ensureFile(repoDir, 'types/shared/index.ts', sharedTypes) })

  const sharedFiles = await listFilesUnder(repoDir, 'types/shared')
  const hashInputs = Array.from(new Set(['STACK_LOCK.json', 'API_CONTRACT.json', 'DB_SCHEMA.sql', 'REPO_CONTRACT_SPEC.json', ...sharedFiles]))
  const contractHash = await hashFiles(repoDir, hashInputs)

  await ensureFile(repoDir, 'CONTRACT_HASH.txt', `${contractHash}\n`)
  lockedPaths.push('CONTRACT_HASH.txt')

  const reportPath = path.join(repoDir, 'DECISION_LOCK_REPORT.md')
  const lines: string[] = [
    '# Decision Lock',
    '',
    `- stackId: \`${contract.stackId}\``,
    `- contractHash: \`${contractHash}\``,
    '',
    '## Files',
    '',
    ...changes.map((c) => `- **${c.action}** \`${c.relPath}\``),
    '',
    '## Locked Paths',
    '',
    ...lockedPaths.map((p) => `- \`${p}\``),
    '',
  ]
  await fs.writeFile(reportPath, lines.join('\n'), 'utf8')

  return { contractHash, reportPath, lockedPaths }
}
