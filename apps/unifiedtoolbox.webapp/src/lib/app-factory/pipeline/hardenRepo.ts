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
import { ingestArtifacts, type AppFactoryArtifact as IngestArtifact } from './ingestArtifacts'
import { writeRunDiagnosticsBundle } from '../diagnostics/writeRunDiagnosticsBundle'
import { featureFlags } from '../flags'
import { planArtifactWrites } from './ingestArtifacts'
import { prepareParallelArtifacts, type ParallelPrepareResult } from '../parallel/prepareParallelArtifacts'
import { runDecisionLock, type DecisionLockResult } from '../parallel/decisionLock'

export type AppFactoryArtifact = IngestArtifact

export type HardeningConfig = {
  maxRepairCycles: number
  gateTimeoutSeconds: number
  bootTimeoutSeconds: number
  healthPollIntervalMs: number
  fixerModel: string
  apiKey?: string
}

export type HardenRepoResult = {
  runId: string
  repoDir: string
  passed: boolean
  normalization: NormalizeRepoResult
  contractEval: RepoContractEvaluation
  gateReport: GateReport
  repair?: { attemptedCycles: number; patchLogPath: string }
  parallel?: {
    enabled: boolean
    prepare?: { passed: boolean; ownershipPassed: boolean; assemblerPassed: boolean; ownershipReportPath: string; assemblerReportPath: string }
    decisionLock?: { contractHash: string; reportPath: string }
  }
  timings?: Partial<Record<'assemble' | 'normalize' | 'contract' | 'gates' | 'repair' | 'decisionLock', { startedAt: string; endedAt: string }>>
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

export async function hardenRepo(options: {
  artifacts: AppFactoryArtifact[]
  contract: RepoContract
  workRootDir: string
  runLabel?: string
  config?: Partial<HardeningConfig>
}): Promise<HardenRepoResult> {
  const cfg = { ...defaultHardeningConfig(), ...(options.config || {}) }
  const parallelEnabled = featureFlags.parallelTeams()
  const runId = `${options.runLabel ? safeRelativePath(options.runLabel).replace(/\//g, '-') + '-' : ''}${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`

  const repoDir = path.join(options.workRootDir, 'runs', runId, 'repo')
  await fs.mkdir(repoDir, { recursive: true })

  let parallelPrepare: ParallelPrepareResult | null = null
  if (parallelEnabled) {
    const planned = planArtifactWrites(repoDir, options.artifacts)
    parallelPrepare = await prepareParallelArtifacts(repoDir, planned)
    await ingestArtifacts(repoDir, parallelPrepare.selectedArtifacts, { plannedWrites: planArtifactWrites(repoDir, parallelPrepare.selectedArtifacts) })
  } else {
    await ingestArtifacts(repoDir, options.artifacts)
  }

  const timings: HardenRepoResult['timings'] = {}
  {
    const startedAt = new Date().toISOString()
    await assembleRepo(repoDir, options.contract)
    const endedAt = new Date().toISOString()
    timings.assemble = { startedAt, endedAt }
  }

  let normalization: NormalizeRepoResult
  {
    const startedAt = new Date().toISOString()
    normalization = await normalizeRepo(repoDir, options.contract)
    const endedAt = new Date().toISOString()
    timings.normalize = { startedAt, endedAt }
  }

  let contractEval: RepoContractEvaluation
  {
    const startedAt = new Date().toISOString()
    contractEval = await evaluateRepoContract(repoDir, options.contract)
    const endedAt = new Date().toISOString()
    timings.contract = { startedAt, endedAt }
  }

  let gateReport: GateReport
  {
    const startedAt = new Date().toISOString()
    gateReport = await runGates(repoDir, options.contract, {
      gateTimeoutSeconds: cfg.gateTimeoutSeconds,
      bootTimeoutSeconds: cfg.bootTimeoutSeconds,
      healthPollIntervalMs: cfg.healthPollIntervalMs,
    })
    const endedAt = new Date().toISOString()
    timings.gates = { startedAt, endedAt }
  }

  let decisionLock: DecisionLockResult | null = null
  if (parallelEnabled) {
    const startedAt = new Date().toISOString()
    decisionLock = await runDecisionLock(repoDir, options.contract)
    const endedAt = new Date().toISOString()
    timings.decisionLock = { startedAt, endedAt }
  }

  const parallelPassed = !parallelEnabled || Boolean(parallelPrepare?.passed)
  if (normalization.violations.length === 0 && contractEval.passed && gateReport.passed && parallelPassed) {
    await removeGitDir(repoDir)
    await writeRunDiagnosticsBundle({
      repoDir,
      runId,
      stackId: options.contract.stackId,
      contract: options.contract,
      config: cfg,
      passed: true,
      normalization,
      contractEval,
      gateReport,
    })
    return {
      runId,
      repoDir,
      passed: true,
      normalization,
      contractEval,
      gateReport,
      parallel: parallelEnabled
        ? {
            enabled: true,
            prepare: parallelPrepare
              ? {
                  passed: parallelPrepare.passed,
                  ownershipPassed: parallelPrepare.ownership.passed,
                  assemblerPassed: parallelPrepare.assembler.passed,
                  ownershipReportPath: parallelPrepare.ownership.reportPath,
                  assemblerReportPath: parallelPrepare.assembler.reportPath,
                }
              : undefined,
            decisionLock: decisionLock ? { contractHash: decisionLock.contractHash, reportPath: decisionLock.reportPath } : undefined,
          }
        : { enabled: false },
      timings,
    }
  }

  if (parallelEnabled && parallelPrepare && !parallelPrepare.passed) {
    await fs.writeFile(
      path.join(repoDir, 'PATCHLOG.md'),
      '# Patch Log\n\nRepair loop skipped: parallel teams ownership/conflict checks failed.\nSee `OWNERSHIP_REPORT.md` and `ASSEMBLER_REPORT.md`.\n',
      'utf8'
    )
  }

  if (!cfg.apiKey) {
    await fs.writeFile(
      path.join(repoDir, 'PATCHLOG.md'),
      '# Patch Log\n\nRepair loop skipped: missing OpenAI API key for fixer.\nSet `OPENAI_API_KEY` (recommended) or `NEXT_PUBLIC_OPENAI_API_KEY`.\n',
      'utf8'
    )
    await removeGitDir(repoDir)
    await writeRunDiagnosticsBundle({
      repoDir,
      runId,
      stackId: options.contract.stackId,
      contract: options.contract,
      config: cfg,
      passed: false,
      normalization,
      contractEval,
      gateReport,
      repair: { attemptedCycles: 0, patchLogPath: path.join(repoDir, 'PATCHLOG.md') },
    })
    return {
      runId,
      repoDir,
      passed: false,
      normalization,
      contractEval,
      gateReport,
      parallel: parallelEnabled
        ? {
            enabled: true,
            prepare: parallelPrepare
              ? {
                  passed: parallelPrepare.passed,
                  ownershipPassed: parallelPrepare.ownership.passed,
                  assemblerPassed: parallelPrepare.assembler.passed,
                  ownershipReportPath: parallelPrepare.ownership.reportPath,
                  assemblerReportPath: parallelPrepare.assembler.reportPath,
                }
              : undefined,
            decisionLock: decisionLock ? { contractHash: decisionLock.contractHash, reportPath: decisionLock.reportPath } : undefined,
          }
        : { enabled: false },
      repair: { attemptedCycles: 0, patchLogPath: path.join(repoDir, 'PATCHLOG.md') },
      timings,
    }
  }

  if (parallelEnabled && parallelPrepare && !parallelPrepare.passed) {
    await removeGitDir(repoDir)
    await writeRunDiagnosticsBundle({
      repoDir,
      runId,
      stackId: options.contract.stackId,
      contract: options.contract,
      config: cfg,
      passed: false,
      normalization,
      contractEval,
      gateReport,
      repair: { attemptedCycles: 0, patchLogPath: path.join(repoDir, 'PATCHLOG.md') },
    })
    return {
      runId,
      repoDir,
      passed: false,
      normalization,
      contractEval,
      gateReport,
      parallel: {
        enabled: true,
        prepare: {
          passed: false,
          ownershipPassed: parallelPrepare.ownership.passed,
          assemblerPassed: parallelPrepare.assembler.passed,
          ownershipReportPath: parallelPrepare.ownership.reportPath,
          assemblerReportPath: parallelPrepare.assembler.reportPath,
        },
        decisionLock: decisionLock ? { contractHash: decisionLock.contractHash, reportPath: decisionLock.reportPath } : undefined,
      },
      repair: { attemptedCycles: 0, patchLogPath: path.join(repoDir, 'PATCHLOG.md') },
      timings,
    }
  }

  const repairStartedAt = new Date().toISOString()
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
  const repairEndedAt = new Date().toISOString()
  timings.repair = { startedAt: repairStartedAt, endedAt: repairEndedAt }

  normalization = await normalizeRepo(repoDir, options.contract)
  contractEval = await evaluateRepoContract(repoDir, options.contract)
  gateReport = await runGates(repoDir, options.contract, {
    gateTimeoutSeconds: cfg.gateTimeoutSeconds,
    bootTimeoutSeconds: cfg.bootTimeoutSeconds,
    healthPollIntervalMs: cfg.healthPollIntervalMs,
  })

  await removeGitDir(repoDir)

  const passed = normalization.violations.length === 0 && contractEval.passed && gateReport.passed
  await writeRunDiagnosticsBundle({
    repoDir,
    runId,
    stackId: options.contract.stackId,
    contract: options.contract,
    config: cfg,
    passed,
    normalization,
    contractEval,
    gateReport,
    repair: { attemptedCycles: repair.attemptedCycles, patchLogPath: repair.patchLogPath },
  })

  return {
    runId,
    repoDir,
    passed,
    normalization,
    contractEval,
    gateReport,
    parallel: parallelEnabled
      ? {
          enabled: true,
          prepare: parallelPrepare
            ? {
                passed: parallelPrepare.passed,
                ownershipPassed: parallelPrepare.ownership.passed,
                assemblerPassed: parallelPrepare.assembler.passed,
                ownershipReportPath: parallelPrepare.ownership.reportPath,
                assemblerReportPath: parallelPrepare.assembler.reportPath,
              }
            : undefined,
          decisionLock: decisionLock ? { contractHash: decisionLock.contractHash, reportPath: decisionLock.reportPath } : undefined,
        }
      : { enabled: false },
    repair: { attemptedCycles: repair.attemptedCycles, patchLogPath: repair.patchLogPath },
    timings,
  }
}
