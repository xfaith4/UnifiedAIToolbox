import { NextResponse } from 'next/server'
import path from 'path'
import { promises as fs } from 'fs'
import { loadRepoContract } from '@/lib/app-factory/contracts/loadContract'
import { hardenRepo } from '@/lib/app-factory/pipeline/hardenRepo'
import { zipDirectoryToBuffer } from '@/lib/app-factory/pipeline/zipRepo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ExportRequest = {
  stackId: string
  runLabel?: string
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

async function readTextIfExists(filePath: string, maxChars = 12000): Promise<string | null> {
  try {
    const text = await fs.readFile(filePath, 'utf8')
    if (text.length <= maxChars) return text
    return text.slice(0, maxChars) + '\n... (truncated)\n'
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  let payload: ExportRequest
  try {
    payload = (await req.json()) as ExportRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  if (!payload?.stackId || !Array.isArray(payload.artifacts)) {
    return NextResponse.json({ error: 'Missing stackId or artifacts[]' }, { status: 400 })
  }

  const contract = loadRepoContract(payload.stackId)
  const workRootDir = path.resolve(process.cwd(), '..', '..', '.uaitoolbox', 'app-factory')

  const result = await hardenRepo({
    artifacts: payload.artifacts,
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
    const contractJson = await readTextIfExists(path.join(result.repoDir, 'REPO_CONTRACT.json'))

    return NextResponse.json(
      {
        passed: false,
        repoDir: result.repoDir,
        reports: {
          assembly: assemblyReport,
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
}
