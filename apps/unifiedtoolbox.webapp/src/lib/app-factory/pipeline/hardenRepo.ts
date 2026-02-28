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

  type EmitInput = Omit<Parameters<typeof emitRunEvent>[0], 'runId'>
  const emit = async (event: EmitInput) => {
    const sender = options.onEvent || emitRunEvent
    await sender({ ...event, runId })
  }

  const emitStage = async (stage: string, type: string, msg: string, data?: Record<string, unknown>, level?: 'debug' | 'info' | 'warn' | 'error') => {
    await emit({
      phase: stage,
      stage,
      type,
      level: level || (type === 'error' ? 'error' : type === 'warn' ? 'warn' : 'info'),
      message: msg,
      msg,
      data,
    })
  }

  const withProgressPulse = async <T>(
    stage: string,
    step: string,
    task: () => Promise<T>,
    pulseMs = 5000
  ): Promise<T> => {
    const startedAt = Date.now()
    let timer: NodeJS.Timeout | null = null
    try {
      timer = setInterval(() => {
        void emitStage(stage, 'step.progress', `${step} in progress`, { elapsed_ms: Date.now() - startedAt, step })
      }, pulseMs)
      return await task()
    } finally {
      if (timer) clearInterval(timer)
    }
  }

  await emitStage('agents', 'stage.start', 'Hardening run started')

  let parallelPrepare: ParallelPrepareResult | null = null
  if (parallelEnabled) {
    const planned = planArtifactWrites(repoDir, options.artifacts)
    parallelPrepare = await prepareParallelArtifacts(repoDir, planned)
    await emitStage('agents', 'step.start', 'Ingesting selected artifacts', {
      selected_artifacts: parallelPrepare.selectedArtifacts.length,
      total_artifacts: options.artifacts.length,
    })
    await ingestArtifacts(repoDir, parallelPrepare.selectedArtifacts, {
      plannedWrites: planArtifactWrites(repoDir, parallelPrepare.selectedArtifacts),
      onProgress: async (progress) => {
        await emitStage('agents', 'step.progress', 'Applying exclusions and writing artifacts', {
          files_scanned: progress.processed,
          files_total: progress.total,
          files_excluded: progress.skipped,
          files_written: progress.written,
          files_errors: progress.errors,
        })
      },
    })
  } else {
    await emitStage('agents', 'step.start', 'Ingesting artifacts', { total_artifacts: options.artifacts.length })
    await ingestArtifacts(repoDir, options.artifacts, {
      onProgress: async (progress) => {
        await emitStage('agents', 'step.progress', 'Applying exclusions and writing artifacts', {
          files_scanned: progress.processed,
          files_total: progress.total,
          files_excluded: progress.skipped,
          files_written: progress.written,
          files_errors: progress.errors,
        })
      },
    })
  }
  await emitStage('agents', 'step.complete', 'Artifacts ingested', { artifact_count: options.artifacts.length })

  const timings: HardenRepoResult['timings'] = {}
  {
    const startedAt = new Date().toISOString()
    await emitStage('assemble', 'stage.start', 'Assemble started', { agent: 'Engineer' })
    await withProgressPulse('assemble', 'Scaffolding repository', async () => {
      await assembleRepo(repoDir, options.contract)
      await writeAppFactoryMetadata({ repoDir, runId, contract: options.contract })
    })
    const endedAt = new Date().toISOString()
    timings.assemble = { startedAt, endedAt }
    await emitStage('assemble', 'stage.complete', 'Assemble completed', { agent: 'Engineer' })
    await emitStage('assemble', 'artifact.created', 'Artifact created', { path: 'ASSEMBLY_REPORT.md' })
  }

  let normalization: NormalizeRepoResult
  {
    const startedAt = new Date().toISOString()
    await emitStage('normalize', 'stage.start', 'Normalization started', { agent: 'Critic' })
    normalization = await withProgressPulse('normalize', 'Normalizing generated files', async () =>
      normalizeRepo(repoDir, options.contract)
    )
    const endedAt = new Date().toISOString()
    timings.normalize = { startedAt, endedAt }
    await emitStage(
      'normalize',
      normalization.violations.length === 0 ? 'stage.complete' : 'error',
      normalization.violations.length === 0 ? 'Normalization passed' : 'Normalization reported violations',
      { violations: normalization.violations.length, agent: 'Critic' },
      normalization.violations.length === 0 ? 'info' : 'error'
    )
    await emitStage('normalize', 'artifact.created', 'Artifact created', { path: 'NORMALIZATION_REPORT.md' })
  }

  let contractEval: RepoContractEvaluation
  {
    const startedAt = new Date().toISOString()
    await emitStage('contract', 'stage.start', 'Contract evaluation started', { agent: 'Supervisor' })
    contractEval = await withProgressPulse('contract', 'Evaluating repo contract', async () =>
      evaluateRepoContract(repoDir, options.contract)
    )
    const endedAt = new Date().toISOString()
    timings.contract = { startedAt, endedAt }
    await emitStage(
      'contract',
      contractEval.passed ? 'stage.complete' : 'error',
      contractEval.passed ? 'Contract checks passed' : 'Contract checks failed',
      { failures: contractEval.failures.length, agent: 'Supervisor' },
      contractEval.passed ? 'info' : 'error'
    )
    await emitStage('contract', 'artifact.created', 'Artifact created', { path: 'REPO_CONTRACT.json' })
  }

  let gateReport: GateReport
  {
    const startedAt = new Date().toISOString()
    await emitStage('gates', 'stage.start', 'Gate checks started', { agent: 'Commissioner' })
    const canRunGatesNow = normalization.violations.length === 0 && contractEval.passed
    gateReport = canRunGatesNow
      ? await withProgressPulse('gates', 'Running gate commands', async () =>
          runGates(repoDir, options.contract, {
            gateTimeoutSeconds: cfg.gateTimeoutSeconds,
            bootTimeoutSeconds: cfg.bootTimeoutSeconds,
            healthPollIntervalMs: cfg.healthPollIntervalMs,
          })
        )
      : await writeSkippedGateReport(
          repoDir,
          normalization.violations.length > 0 ? 'Skipped: normalization violations present' : 'Skipped: contract failed'
        )
    const endedAt = new Date().toISOString()
    timings.gates = { startedAt, endedAt }
    await emitStage(
      'gates',
      gateReport.passed ? 'stage.complete' : gateReport.steps.every((step) => step.status === 'skipped') ? 'warn' : 'error',
      gateReport.passed ? 'Gate checks passed' : 'Gate checks failed or skipped',
      {
        skipped_reason: gateReport.steps.find((step) => step.status === 'skipped')?.message,
        agent: 'Commissioner',
      },
      gateReport.passed ? 'info' : gateReport.steps.every((step) => step.status === 'skipped') ? 'warn' : 'error'
    )
    await emitStage('gates', 'artifact.created', 'Artifact created', { path: 'GATE_REPORT.md' })
  }

  let decisionLock: DecisionLockResult | null = null
  if (parallelEnabled) {
    const startedAt = new Date().toISOString()
    await emitStage('contract', 'step.start', 'Decision lock started', { agent: 'Supervisor' })
    decisionLock = await runDecisionLock(repoDir, options.contract)
    const endedAt = new Date().toISOString()
    timings.decisionLock = { startedAt, endedAt }
    await emitStage('contract', 'step.complete', 'Decision lock completed', { agent: 'Supervisor' })
  }

  // Deterministic repair: attempt to fix common contract failures without an API key.
  // Runs before the API-key gate so basic issues (e.g. malformed package.json) are
  // resolved even when no OpenAI key is configured.
  if (!contractEval.passed || normalization.violations.length > 0) {
    const detRepairStart = new Date().toISOString()
    const detResult = await runDeterministicRepair(repoDir, options.contract, contractEval)
    if (detResult.fixed) {
      await emitStage('repair', 'step.start', `Deterministic repair: ${detResult.notes.join('; ')}`, { agent: 'Synthesizer' })
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
      await emitStage(
        'repair',
        detAllPassed ? 'step.complete' : 'step.progress',
        detAllPassed ? 'Deterministic repair resolved all issues' : 'Deterministic repair applied; remaining issues may need LLM repair',
        { agent: 'Synthesizer' }
      )
    }
  }

  const parallelPassed = !parallelEnabled || Boolean(parallelPrepare?.passed)
  if (normalization.violations.length === 0 && contractEval.passed && gateReport.passed && parallelPassed) {
    await removeGitDir(repoDir)
    await emitStage('agents', 'stage.complete', 'Hardening run completed successfully')
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
    await emitStage('agents', 'error', 'Parallel ownership/conflict checks failed', { agent: 'Supervisor' }, 'error')
    await fs.writeFile(
      path.join(repoDir, 'PATCHLOG.md'),
      '# Patch Log\n\nRepair loop skipped: parallel teams ownership/conflict checks failed.\nSee `OWNERSHIP_REPORT.md` and `ASSEMBLER_REPORT.md`.\n',
      'utf8'
    )
  }

  if (!cfg.apiKey) {
    await emitStage('repair', 'error', 'Repair loop skipped: missing API key', { agent: 'Synthesizer' }, 'error')
    await fs.writeFile(
      path.join(repoDir, 'PATCHLOG.md'),
      '# Patch Log\n\nRepair loop skipped: missing OpenAI API key for fixer.\nSet `OPENAI_API_KEY` (recommended) or `NEXT_PUBLIC_OPENAI_API_KEY`.\n',
      'utf8'
    )
    await removeGitDir(repoDir)
    await emitStage('agents', 'error', 'Hardening run failed before repair', undefined, 'error')
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
    await emitStage('agents', 'error', 'Hardening run failed due to parallel ownership/conflict checks', undefined, 'error')
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
  await emitStage('repair', 'stage.start', 'Repair loop started', { agent: 'Synthesizer' })
  const repair = await withProgressPulse('repair', 'Repair loop active', async () =>
    repairLoop({
      repoDir,
      contract: options.contract,
      normalization,
      contractEval,
      gateReport,
      config: { maxRepairCycles: cfg.maxRepairCycles, model: cfg.fixerModel, apiKey: cfg.apiKey! },
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
  )
  const repairEndedAt = new Date().toISOString()
  timings.repair = { startedAt: repairStartedAt, endedAt: repairEndedAt }
  await emitStage(
    'repair',
    repair.attemptedCycles > 0 ? 'stage.complete' : 'warn',
    `Repair loop finished after ${repair.attemptedCycles} cycle(s)`,
    { agent: 'Synthesizer', pass: repair.attemptedCycles, total_passes: cfg.maxRepairCycles },
    repair.attemptedCycles > 0 ? 'info' : 'warn'
  )
  await emitStage('repair', 'artifact.created', 'Artifact created', { path: 'PATCHLOG.md' })

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
  await emitStage(
    'agents',
    passed ? 'stage.complete' : 'error',
    passed ? 'Hardening run completed successfully' : 'Hardening run finished with blockers',
    undefined,
    passed ? 'info' : 'error'
  )
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
