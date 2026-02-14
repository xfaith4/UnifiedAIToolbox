import { NextResponse } from 'next/server'
import path from 'path'
import { promises as fs } from 'fs'
import crypto from 'crypto'
import { loadRepoContract } from '@/lib/app-factory/contracts/loadContract'
import { hardenRepo } from '@/lib/app-factory/pipeline/hardenRepo'
import { zipDirectoryToBuffer } from '@/lib/app-factory/pipeline/zipRepo'
import { featureFlags } from '@/lib/app-factory/flags'
import { exportRepoLegacy } from '@/lib/app-factory/pipeline/exportRepoLegacy'
import { loadArtifactsFromHistoryFile } from '@/lib/app-factory/history/loadArtifactsFromHistory'
import { ingestArtifacts } from '@/lib/app-factory/pipeline/ingestArtifacts'
import { buildExportBlockers } from '@/lib/app-factory/pipeline/exportBlockers'
import { emitRunEvent } from '@/lib/app-factory/runs/runEvents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ExportRequest = {
  stackId: string
  runLabel?: string
  sessionId?: string
  artifacts: { name: string; type?: string; content: string }[]
  config?: {
    maxRepairCycles?: number
    gateTimeoutSeconds?: number
    bootTimeoutSeconds?: number
    healthPollIntervalMs?: number
    fixerModel?: string
    apiKey?: string
    runMode?: 'design' | 'build'
  }
}

const HISTORY_DIR = path.resolve(process.cwd(), '..', '..', 'data', 'orchestrator-history')
const HISTORY_FILE = path.join(HISTORY_DIR, 'sessions.json')

async function readTextIfExists(filePath: string, maxChars = 12000): Promise<string | null> {
  try {
    const text = await fs.readFile(filePath, 'utf8')
    if (text.length <= maxChars) return text
    return text.slice(0, maxChars) + '\n... (truncated)\n'
  } catch {
    return null
  }
}

function safeRelativeLabel(input: string): string {
  const raw = (input || '').replace(/\\/g, '/').trim()
  const noDrive = raw.replace(/^[a-zA-Z]:\//, '')
  const stripped = noDrive.replace(/^\/+/, '')
  const parts = stripped.split('/').filter((p) => p && p !== '.' && p !== '..')
  return parts.join('/')
}

export async function POST(req: Request) {
  try {
    let payload: ExportRequest
    try {
      payload = (await req.json()) as ExportRequest
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload (possibly too large)' }, { status: 400 })
    }

    if (!payload?.stackId) {
      return NextResponse.json({ error: 'Missing stackId' }, { status: 400 })
    }

    const contract = loadRepoContract(payload.stackId)
    const workRootDir = path.resolve(process.cwd(), '..', '..', '.uaitoolbox', 'app-factory')

    let artifacts = Array.isArray(payload.artifacts) ? payload.artifacts : []
    if (payload.sessionId) {
      const fromHistory = await loadArtifactsFromHistoryFile(HISTORY_FILE, payload.sessionId)
      if (fromHistory) artifacts = fromHistory
      else if (!artifacts.length) {
        return NextResponse.json({ error: `Session not found in history: ${payload.sessionId}`, hint: 'Wait a moment and retry export.' }, { status: 404 })
      }
    }

    if (!Array.isArray(artifacts) || artifacts.length === 0) {
      return NextResponse.json({ error: 'No artifacts available to export (missing sessionId history and artifacts[])' }, { status: 400 })
    }

    const runMode = payload.config?.runMode ?? 'build'
    if (runMode === 'design') {
      const runId = `${payload.runLabel ? safeRelativeLabel(payload.runLabel).replace(/\//g, '-') + '-' : ''}${new Date()
        .toISOString()
        .replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`
      const artifactsDir = path.join(workRootDir, 'design-runs', runId, 'artifacts')
      await fs.mkdir(artifactsDir, { recursive: true })
      await ingestArtifacts(artifactsDir, artifacts as { name: string; type?: string; content: string }[])
      await fs.writeFile(
        path.join(artifactsDir, 'DESIGN_RUN.md'),
        `# Design Run Export\n\nThis zip contains docs/specs artifacts only (no runnable repo scaffolding).\n\nGenerated: ${new Date().toISOString()}\nSession: ${payload.sessionId || '(inline artifacts)'}\n`,
        'utf8'
      )
      const zip = await zipDirectoryToBuffer(artifactsDir)
      return new NextResponse(new Uint8Array(zip), {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': 'attachment; filename=\"app-factory-design.zip\"',
        },
      })
    }

    const hardeningEnabled = featureFlags.hardeningPipeline()
    if (!hardeningEnabled) {
      const legacy = await exportRepoLegacy({
        artifacts,
        contract,
        workRootDir,
        runLabel: payload.runLabel,
      })
      const zip = await zipDirectoryToBuffer(legacy.repoDir)
      return new NextResponse(new Uint8Array(zip), {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': 'attachment; filename="app-factory-repo.zip"',
        },
      })
    }

    const result = await hardenRepo({
      onEvent: emitRunEvent,
      artifacts,
      contract,
      workRootDir,
      runLabel: payload.runLabel,
      config: payload.config,
    })

    if (!result.passed) {
      const normalizationReport = await readTextIfExists(path.join(result.repoDir, 'NORMALIZATION_REPORT.md'))
      const gateReport = await readTextIfExists(path.join(result.repoDir, 'GATE_REPORT.md'))
      const patchLog = await readTextIfExists(path.join(result.repoDir, 'PATCHLOG.md'))
      const assemblyReport = await readTextIfExists(path.join(result.repoDir, 'ASSEMBLY_REPORT.md'))
      const ownershipReport = await readTextIfExists(path.join(result.repoDir, 'OWNERSHIP_REPORT.md'))
      const assemblerReport = await readTextIfExists(path.join(result.repoDir, 'ASSEMBLER_REPORT.md'))
      const decisionLockReport = await readTextIfExists(path.join(result.repoDir, 'DECISION_LOCK_REPORT.md'))
      const contractJson = await readTextIfExists(path.join(result.repoDir, 'REPO_CONTRACT.json'))

      const blockers = buildExportBlockers({ normalization: result.normalization, contractEval: result.contractEval, gateReport: result.gateReport, repair: result.repair })
      return NextResponse.json(
        {
          passed: false,
          runId: result.runId,
          repoDir: result.repoDir,
          blockers,
          reports: {
            assembly: assemblyReport,
            decisionLock: decisionLockReport,
            ownership: ownershipReport,
            assembler: assemblerReport,
            normalization: normalizationReport,
            repoContract: contractJson,
            gate: gateReport,
            patchlog: patchLog,
          },
          hint:
            'Export blocked: repo did not pass normalization/contract/gates. Fix generation outputs or ensure build tooling (node/pnpm) is installed, then retry.',
        },
        { status: 422 }
      )
    }

    const zip = await zipDirectoryToBuffer(result.repoDir)
    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="app-factory-repo.zip"',
      },
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Unhandled export error',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}
