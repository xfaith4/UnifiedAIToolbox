import { NextResponse } from 'next/server'
import path from 'path'
import { loadRepoContract } from '@/lib/app-factory/contracts/loadContract'
import { hardenRepo } from '@/lib/app-factory/pipeline/hardenRepo'
import { featureFlags } from '@/lib/app-factory/flags'
import { exportRepoLegacy } from '@/lib/app-factory/pipeline/exportRepoLegacy'
import { buildEnginePipelinePayload } from '@/lib/app-factory/pipeline/pipelineStatus'
import { loadArtifactsFromHistoryFile } from '@/lib/app-factory/history/loadArtifactsFromHistory'

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
  }
}

const HISTORY_DIR = path.resolve(process.cwd(), '..', '..', 'data', 'orchestrator-history')
const HISTORY_FILE = path.join(HISTORY_DIR, 'sessions.json')

export async function POST(req: Request) {
  try {
    let payload: ExportRequest
    try {
      payload = (await req.json()) as ExportRequest
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    if (!payload?.stackId) return NextResponse.json({ error: 'Missing stackId' }, { status: 400 })
    const contract = loadRepoContract(payload.stackId)
    const workRootDir = path.resolve(process.cwd(), '..', '..', '.uaitoolbox', 'app-factory')

    let artifacts = Array.isArray(payload.artifacts) ? payload.artifacts : []
    if (payload.sessionId) {
      const fromHistory = await loadArtifactsFromHistoryFile(HISTORY_FILE, payload.sessionId)
      if (fromHistory) artifacts = fromHistory
      else if (!artifacts.length) return NextResponse.json({ error: `Session not found in history: ${payload.sessionId}` }, { status: 404 })
    }

    if (!artifacts.length) return NextResponse.json({ error: 'No artifacts to validate' }, { status: 400 })

    const hardeningEnabled = featureFlags.hardeningPipeline()
    if (!hardeningEnabled) {
      const legacy = await exportRepoLegacy({ artifacts, contract, workRootDir, runLabel: payload.runLabel })
      return NextResponse.json({
        passed: true,
        hardeningEnabled: false,
        runId: legacy.runId,
        repoDir: legacy.repoDir,
        pipeline: buildEnginePipelinePayload({
          hardeningEnabled: false,
          repoDir: legacy.repoDir,
          runId: legacy.runId,
          maxRepairCycles: payload.config?.maxRepairCycles ?? 3,
          agentsStatus: 'passed',
        }),
      })
    }

    const result = await hardenRepo({
      artifacts,
      contract,
      workRootDir,
      runLabel: payload.runLabel,
      config: payload.config,
    })

    const pipeline = buildEnginePipelinePayload({
      hardeningEnabled: true,
      parallel: result.parallel,
      maxParallelTeams: featureFlags.maxParallelTeams(),
      repoDir: result.repoDir,
      runId: result.runId ?? null,
      maxRepairCycles: payload.config?.maxRepairCycles ?? 3,
      agentsStatus: 'passed',
      timings: result.timings,
      normalization: result.normalization,
      contractEval: result.contractEval,
      gateReport: result.gateReport,
      repair: result.repair ?? null,
    })

    return NextResponse.json({ passed: result.passed, hardeningEnabled: true, runId: pipeline.runId, repoDir: result.repoDir, pipeline }, { status: result.passed ? 200 : 422 })
  } catch (err) {
    return NextResponse.json({ error: 'Unhandled validate error', detail: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
