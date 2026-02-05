import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'
import type { RepoContract } from '../contracts/RepoContract'
import { assembleRepo } from '../assemble/assembleRepo'
import { normalizeRepo, type NormalizeRepoResult } from '../normalize/normalizeRepo'
import { evaluateRepoContract, type RepoContractEvaluation } from '../contracts/evaluateRepoContract'
import { runGates, type GateReport } from '../gates/runGates'
import { repairLoop } from '../repair/repairLoop'
import { removeGitDir } from '../repair/patchApplier'

export type AppFactoryArtifact = {
  name: string
  type?: string
  content: string
}

export type HardeningConfig = {
  maxRepairCycles: number
  gateTimeoutSeconds: number
  bootTimeoutSeconds: number
  healthPollIntervalMs: number
  fixerModel: string
  apiKey?: string
}

export type HardenRepoResult = {
  repoDir: string
  passed: boolean
  normalization: NormalizeRepoResult
  contractEval: RepoContractEvaluation
  gateReport: GateReport
  repair?: { attemptedCycles: number; patchLogPath: string }
}

export function defaultHardeningConfig(): HardeningConfig {
  const num = (name: string, def: number) => {
    const raw = process.env[name]
    const parsed = raw ? Number.parseInt(raw, 10) : NaN
    return Number.isFinite(parsed) && parsed > 0 ? parsed : def
  }

  return {
    maxRepairCycles: num('MAX_REPAIR_CYCLES', 3),
    gateTimeoutSeconds: num('GATE_TIMEOUT_SECONDS', 600),
    bootTimeoutSeconds: num('BOOT_TIMEOUT_SECONDS', 120),
    healthPollIntervalMs: num('HEALTH_POLL_INTERVAL_MS', 1000),
    fixerModel: process.env.APP_FACTORY_FIXER_MODEL || 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY || process.env.NEXT_PUBLIC_API_KEY,
  }
}

function safeRelativePath(input: string): string {
  const raw = (input || '').replace(/\\/g, '/').trim()
  const noDrive = raw.replace(/^[a-zA-Z]:\//, '')
  const stripped = noDrive.replace(/^\/+/, '')
  const parts = stripped.split('/').filter((p) => p && p !== '.' && p !== '..')
  return parts.join('/')
}

async function writeArtifacts(repoDir: string, artifacts: AppFactoryArtifact[]): Promise<void> {
  for (const art of artifacts) {
    if (!art?.name) continue
    const rel = safeRelativePath(art.name)
    if (!rel) continue
    const full = path.join(repoDir, rel)
    await fs.mkdir(path.dirname(full), { recursive: true })

    if (art.type === 'IMAGE') {
      const buf = Buffer.from(art.content, 'base64')
      await fs.writeFile(full, buf)
      continue
    }

    await fs.writeFile(full, (art.content || '').replace(/\r\n/g, '\n'), 'utf8')
  }
}

export async function hardenRepo(options: {
  artifacts: AppFactoryArtifact[]
  contract: RepoContract
  workRootDir: string
  runLabel?: string
  config?: Partial<HardeningConfig>
}): Promise<HardenRepoResult> {
  const cfg = { ...defaultHardeningConfig(), ...(options.config || {}) }
  const runId = `${options.runLabel ? safeRelativePath(options.runLabel).replace(/\//g, '-') + '-' : ''}${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`

  const repoDir = path.join(options.workRootDir, 'runs', runId, 'repo')
  await fs.mkdir(repoDir, { recursive: true })

  await writeArtifacts(repoDir, options.artifacts)

  await assembleRepo(repoDir, options.contract)

  let normalization = await normalizeRepo(repoDir, options.contract)
  let contractEval = await evaluateRepoContract(repoDir, options.contract)
  let gateReport = await runGates(repoDir, options.contract, {
    gateTimeoutSeconds: cfg.gateTimeoutSeconds,
    bootTimeoutSeconds: cfg.bootTimeoutSeconds,
    healthPollIntervalMs: cfg.healthPollIntervalMs,
  })

  if (normalization.violations.length === 0 && contractEval.passed && gateReport.passed) {
    await removeGitDir(repoDir)
    return { repoDir, passed: true, normalization, contractEval, gateReport }
  }

  if (!cfg.apiKey) {
    await fs.writeFile(
      path.join(repoDir, 'PATCHLOG.md'),
      '# Patch Log\n\nRepair loop skipped: missing OpenAI API key for fixer.\nSet `OPENAI_API_KEY` (recommended) or `NEXT_PUBLIC_OPENAI_API_KEY`.\n',
      'utf8'
    )
    await removeGitDir(repoDir)
    return { repoDir, passed: false, normalization, contractEval, gateReport, repair: { attemptedCycles: 0, patchLogPath: path.join(repoDir, 'PATCHLOG.md') } }
  }

  const repair = await repairLoop({
    repoDir,
    contract: options.contract,
    normalization,
    contractEval,
    gateReport,
    config: { maxRepairCycles: cfg.maxRepairCycles, model: cfg.fixerModel, apiKey: cfg.apiKey },
    onCycle: async () => {
      const newNormalization = await normalizeRepo(repoDir, options.contract)
      const newContractEval = await evaluateRepoContract(repoDir, options.contract)
      const newGateReport = await runGates(repoDir, options.contract, {
        gateTimeoutSeconds: cfg.gateTimeoutSeconds,
        bootTimeoutSeconds: cfg.bootTimeoutSeconds,
        healthPollIntervalMs: cfg.healthPollIntervalMs,
      })
      return { normalization: newNormalization, contractEval: newContractEval, gateReport: newGateReport }
    },
  })

  normalization = await normalizeRepo(repoDir, options.contract)
  contractEval = await evaluateRepoContract(repoDir, options.contract)
  gateReport = await runGates(repoDir, options.contract, {
    gateTimeoutSeconds: cfg.gateTimeoutSeconds,
    bootTimeoutSeconds: cfg.bootTimeoutSeconds,
    healthPollIntervalMs: cfg.healthPollIntervalMs,
  })

  await removeGitDir(repoDir)

  return {
    repoDir,
    passed: normalization.violations.length === 0 && contractEval.passed && gateReport.passed,
    normalization,
    contractEval,
    gateReport,
    repair: { attemptedCycles: repair.attemptedCycles, patchLogPath: repair.patchLogPath },
  }
}

