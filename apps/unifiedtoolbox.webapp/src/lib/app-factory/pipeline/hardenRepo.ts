import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'
import type { RepoContract } from '../contracts/RepoContract'
import { assembleRepo } from '../assemble/assembleRepo'
import { normalizeRepo, type NormalizeRepoResult } from '../normalize/normalizeRepo'
import { evaluateRepoContract, type RepoContractEvaluation } from '../contracts/evaluateRepoContract'
import { runGates, writeSkippedGateReport, type GateReport } from '../gates/runGates'
import { repairLoop } from '../repair/repairLoop'
import { removeGitDir } from '../repair/patchApplier'
import { runDeterministicRepair } from '../repair/deterministicRepair'
import { writeAppFactoryMetadata } from '../provenance/writeRepoProvenance'
import { ingestArtifacts, type AppFactoryArtifact as IngestArtifact } from './ingestArtifacts'
import { writeRunDiagnosticsBundle } from '../diagnostics/writeRunDiagnosticsBundle'
import { featureFlags } from '../flags'
import { planArtifactWrites } from './ingestArtifacts'
import { prepareParallelArtifacts, type ParallelPrepareResult } from '../parallel/prepareParallelArtifacts'
import { runDecisionLock, type DecisionLockResult } from '../parallel/decisionLock'
import { emitRunEvent } from '../runs/runEvents'

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
  onEvent?: typeof emitRunEvent
}): Promise<HardenRepoResult> {
  const cfg = { ...defaultHardeningConfig(), ...(options.config || {}) }
  const parallelEnabled = featureFlags.parallelTeams()
  const runId = `${options.runLabel ? safeRelativePath(options.runLabel).replace(/\//g, '-') + '-' : ''}${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`

  const repoDir = path.join(options.workRootDir, 'runs', runId, 'repo')
  await fs.mkdir(repoDir, { recursive: true })

  const emit = async (event: Parameters<typeof emitRunEvent>[0]) => {
    const sender = options.onEvent || emitRunEvent
    await sender({ ...event, runId })
  }

  await emit({ phase: 'run', status: 'running', message: 'Hardening run started' })

  let parallelPrepare: ParallelPrepareResult | null = null
  if (parallelEnabled) {
    const planned = planArtifactWrites(repoDir, options.artifacts)
    parallelPrepare = await prepareParallelArtifacts(repoDir, planned)
    await ingestArtifacts(repoDir, parallelPrepare.selectedArtifacts, { plannedWrites: planArtifactWrites(repoDir, parallelPrepare.selectedArtifacts) })
  } else {
    await ingestArtifacts(repoDir, options.artifacts)
  }
  await emit({ phase: 'artifacts', status: 'success', message: 'Artifacts ingested', details: { artifactCount: options.artifacts.length } })

  const timings: HardenRepoResult['timings'] = {}
  {
    const startedAt = new Date().toISOString()
    await emit({ phase: 'assemble', status: 'running', agent: 'Engineer', message: 'Assemble started' })
    await assembleRepo(repoDir, options.contract)
    await writeAppFactoryMetadata({ repoDir, runId, contract: options.contract })
    const endedAt = new Date().toISOString()
    timings.assemble = { startedAt, endedAt }
    await emit({ phase: 'assemble', status: 'success', agent: 'Engineer', message: 'Assemble completed' })
    await emit({ phase: 'artifacts', status: 'success', message: 'Artifact created', details: { file: 'ASSEMBLY_REPORT.md' } })
  }

  let normalization: NormalizeRepoResult
  {
    const startedAt = new Date().toISOString()
    await emit({ phase: 'normalize', status: 'running', agent: 'Critic', message: 'Normalization started' })
    normalization = await normalizeRepo(repoDir, options.contract)
    const endedAt = new Date().toISOString()
    timings.normalize = { startedAt, endedAt }
    await emit({ phase: 'normalize', status: normalization.violations.length === 0 ? 'success' : 'failed', agent: 'Critic', message: normalization.violations.length === 0 ? 'Normalization passed' : 'Normalization reported violations', details: { violations: normalization.violations.length } })
    await emit({ phase: 'artifacts', status: 'success', message: 'Artifact created', details: { file: 'NORMALIZATION_REPORT.md' } })
  }

  let contractEval: RepoContractEvaluation
  {
    const startedAt = new Date().toISOString()
    await emit({ phase: 'contract', status: 'running', agent: 'Supervisor', message: 'Contract evaluation started' })
    contractEval = await evaluateRepoContract(repoDir, options.contract)
    const endedAt = new Date().toISOString()
    timings.contract = { startedAt, endedAt }
    await emit({ phase: 'contract', status: contractEval.passed ? 'success' : 'failed', agent: 'Supervisor', message: contractEval.passed ? 'Contract checks passed' : 'Contract checks failed', details: { failures: contractEval.failures.length } })
    await emit({ phase: 'artifacts', status: 'success', message: 'Artifact created', details: { file: 'REPO_CONTRACT.json' } })
  }

  let gateReport: GateReport
  {
    const startedAt = new Date().toISOString()
    await emit({ phase: 'gates', status: 'running', agent: 'Commissioner', message: 'Gate checks started' })
    const canRunGatesNow = normalization.violations.length === 0 && contractEval.passed
    gateReport = canRunGatesNow
      ? await runGates(repoDir, options.contract, {
          gateTimeoutSeconds: cfg.gateTimeoutSeconds,
          bootTimeoutSeconds: cfg.bootTimeoutSeconds,
          healthPollIntervalMs: cfg.healthPollIntervalMs,
        })
      : await writeSkippedGateReport(
          repoDir,
          normalization.violations.length > 0 ? 'Skipped: normalization violations present' : 'Skipped: contract failed'
        )
    const endedAt = new Date().toISOString()
    timings.gates = { startedAt, endedAt }
    await emit({ phase: 'gates', status: gateReport.passed ? 'success' : gateReport.steps.every((step) => step.status === 'skipped') ? 'skipped' : 'failed', agent: 'Commissioner', message: gateReport.passed ? 'Gate checks passed' : 'Gate checks failed or skipped', details: { skippedReason: gateReport.steps.find((step) => step.status === 'skipped')?.message } })
    await emit({ phase: 'artifacts', status: 'success', message: 'Artifact created', details: { file: 'GATE_REPORT.md' } })
  }

  let decisionLock: DecisionLockResult | null = null
  if (parallelEnabled) {
    const startedAt = new Date().toISOString()
    await emit({ phase: 'decision-lock', status: 'running', agent: 'Supervisor', message: 'Decision lock started' })
    decisionLock = await runDecisionLock(repoDir, options.contract)
    const endedAt = new Date().toISOString()
    timings.decisionLock = { startedAt, endedAt }
    await emit({ phase: 'decision-lock', status: 'success', agent: 'Supervisor', message: 'Decision lock completed' })
  }

  // Deterministic repair: attempt to fix common contract failures without an API key.
  // Runs before the API-key gate so basic issues (e.g. malformed package.json) are
  // resolved even when no OpenAI key is configured.
  if (!contractEval.passed || normalization.violations.length > 0) {
    const detRepairStart = new Date().toISOString()
    const detResult = await runDeterministicRepair(repoDir, options.contract, contractEval)
    if (detResult.fixed) {
      await emit({ phase: 'repair', status: 'running', agent: 'Synthesizer', message: `Deterministic repair: ${detResult.notes.join('; ')}` })
      normalization = await normalizeRepo(repoDir, options.contract)
      contractEval = await evaluateRepoContract(repoDir, options.contract)
      const canRunGatesNowDet = normalization.violations.length === 0 && contractEval.passed
      gateReport = canRunGatesNowDet
        ? await runGates(repoDir, options.contract, {
            gateTimeoutSeconds: cfg.gateTimeoutSeconds,
            bootTimeoutSeconds: cfg.bootTimeoutSeconds,
            healthPollIntervalMs: cfg.healthPollIntervalMs,
          })
        : await writeSkippedGateReport(
            repoDir,
            normalization.violations.length > 0 ? 'Skipped: normalization violations present' : 'Skipped: contract failed'
          )
      timings.repair = { startedAt: detRepairStart, endedAt: new Date().toISOString() }
      const detAllPassed = normalization.violations.length === 0 && contractEval.passed && gateReport.passed
      await emit({ phase: 'repair', status: detAllPassed ? 'success' : 'running', agent: 'Synthesizer', message: detAllPassed ? 'Deterministic repair resolved all issues' : 'Deterministic repair applied; remaining issues may need LLM repair' })
    }
  }

  const parallelPassed = !parallelEnabled || Boolean(parallelPrepare?.passed)
  if (normalization.violations.length === 0 && contractEval.passed && gateReport.passed && parallelPassed) {
    await removeGitDir(repoDir)
    await emit({ phase: 'run', status: 'success', message: 'Hardening run completed successfully' })
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
    await emit({ phase: 'teams', status: 'failed', agent: 'Supervisor', message: 'Parallel ownership/conflict checks failed' })
    await fs.writeFile(
      path.join(repoDir, 'PATCHLOG.md'),
      '# Patch Log\n\nRepair loop skipped: parallel teams ownership/conflict checks failed.\nSee `OWNERSHIP_REPORT.md` and `ASSEMBLER_REPORT.md`.\n',
      'utf8'
    )
  }

  if (!cfg.apiKey) {
    await emit({ phase: 'repair', status: 'failed', agent: 'Synthesizer', message: 'Repair loop skipped: missing API key' })
    await fs.writeFile(
      path.join(repoDir, 'PATCHLOG.md'),
      '# Patch Log\n\nRepair loop skipped: missing OpenAI API key for fixer.\nSet `OPENAI_API_KEY` (recommended) or `NEXT_PUBLIC_OPENAI_API_KEY`.\n',
      'utf8'
    )
    await removeGitDir(repoDir)
    await emit({ phase: 'run', status: 'failed', message: 'Hardening run failed before repair' })
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
    await emit({ phase: 'run', status: 'success', message: 'Hardening run completed successfully' })
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
  await emit({ phase: 'repair', status: 'running', agent: 'Synthesizer', message: 'Repair loop started' })
  const repair = await repairLoop({
    repoDir,
    contract: options.contract,
    normalization,
    contractEval,
    gateReport,
    config: { maxRepairCycles: cfg.maxRepairCycles, model: cfg.fixerModel, apiKey: cfg.apiKey },
    onEvent: async (event) => {
      await emit({ ...event })
    },
    onCycle: async (cycle) => {
      await emit({ phase: 'repair', status: 'running', agent: 'Synthesizer', message: `Repair cycle ${cycle} running` })
      const newNormalization = await normalizeRepo(repoDir, options.contract)
      const newContractEval = await evaluateRepoContract(repoDir, options.contract)
      const canRunGates = newNormalization.violations.length === 0 && newContractEval.passed
      const newGateReport = canRunGates
        ? await runGates(repoDir, options.contract, {
            gateTimeoutSeconds: cfg.gateTimeoutSeconds,
            bootTimeoutSeconds: cfg.bootTimeoutSeconds,
            healthPollIntervalMs: cfg.healthPollIntervalMs,
          })
        : await writeSkippedGateReport(
            repoDir,
            newNormalization.violations.length > 0 ? 'Skipped: normalization violations present' : 'Skipped: contract failed'
          )
      return { normalization: newNormalization, contractEval: newContractEval, gateReport: newGateReport }
    },
  })
  const repairEndedAt = new Date().toISOString()
  timings.repair = { startedAt: repairStartedAt, endedAt: repairEndedAt }
  await emit({ phase: 'repair', status: repair.attemptedCycles > 0 ? 'success' : 'skipped', agent: 'Synthesizer', message: `Repair loop finished after ${repair.attemptedCycles} cycle(s)` })
  await emit({ phase: 'artifacts', status: 'success', message: 'Artifact created', details: { file: 'PATCHLOG.md' } })

  normalization = await normalizeRepo(repoDir, options.contract)
  contractEval = await evaluateRepoContract(repoDir, options.contract)
  {
    const canRunGates = normalization.violations.length === 0 && contractEval.passed
    gateReport = canRunGates
      ? await runGates(repoDir, options.contract, {
          gateTimeoutSeconds: cfg.gateTimeoutSeconds,
          bootTimeoutSeconds: cfg.bootTimeoutSeconds,
          healthPollIntervalMs: cfg.healthPollIntervalMs,
        })
      : await writeSkippedGateReport(
          repoDir,
          normalization.violations.length > 0 ? 'Skipped: normalization violations present' : 'Skipped: contract failed'
        )
  }

  await removeGitDir(repoDir)

  const passed = normalization.violations.length === 0 && contractEval.passed && gateReport.passed
  await emit({ phase: 'run', status: passed ? 'success' : 'failed', message: passed ? 'Hardening run completed successfully' : 'Hardening run finished with blockers' })
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
