import type { ContractFailure, RepoContractEvaluation } from '../contracts/evaluateRepoContract'
import type { GateReport } from '../gates/runGates'
import type { NormalizeRepoResult } from '../normalize/normalizeRepo'

export type PipelineStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped'

export type PipelineStage = {
  id: 'agents' | 'decision-lock' | 'teams' | 'assemble' | 'normalize' | 'contract' | 'gates' | 'repair' | 'export'
  label: string
  status: PipelineStatus
  startedAt?: string
  endedAt?: string
  reportPath?: string
}

export type PipelineGateCheck = {
  id: 'install' | 'typecheck' | 'lint' | 'build' | 'test' | 'boot' | 'env-docs' | 'ownership' | 'assembler'
  label: string
  status: PipelineStatus
  logPath?: string
  reportPath?: string
}

export type PipelineRepair = {
  status: PipelineStatus
  cycle: number
  maxCycles: number
}

export type EnginePipelinePayload = {
  hardeningEnabled: boolean
  parallelTeamsEnabled?: boolean
  maxParallelTeams?: number
  contractHash?: string | null
  runId: string | null
  repoDir: string | null
  stages: PipelineStage[]
  gates: { checks: PipelineGateCheck[] }
  repair: PipelineRepair
}

function relPosix(baseDir: string, fullPath: string): string {
  const base = String(baseDir || '')
    .replace(/\\/g, '/')
    .replace(/\/+$/g, '')
  const full = String(fullPath || '').replace(/\\/g, '/')
  if (!base) return full
  if (full === base) return ''
  if (full.startsWith(base + '/')) return full.slice(base.length + 1)
  return full
}

function stage(
  id: PipelineStage['id'],
  label: string,
  status: PipelineStatus,
  startedAt?: string,
  endedAt?: string,
  reportPath?: string
): PipelineStage {
  const obj: PipelineStage = { id, label, status }
  if (startedAt) obj.startedAt = startedAt
  if (endedAt) obj.endedAt = endedAt
  if (reportPath) obj.reportPath = reportPath
  return obj
}

function mapGateStepStatus(stepStatus: GateReport['steps'][number]['status']): PipelineStatus {
  if (stepStatus === 'passed') return 'passed'
  if (stepStatus === 'failed') return 'failed'
  return 'skipped'
}

function gateStageStatus(gateReport?: GateReport | null): PipelineStatus {
  if (!gateReport) return 'pending'
  const steps = gateReport.steps || []
  const allSkipped = steps.length > 0 && steps.every((s) => s.status === 'skipped')
  if (allSkipped) return 'skipped'
  return gateReport.passed ? 'passed' : 'failed'
}

function envDocsStatus(failures: ContractFailure[], hasEnvVarsRequired: boolean): PipelineStatus {
  if (!hasEnvVarsRequired) return 'skipped'
  return failures.some((f) => f.kind === 'env_undocumented') ? 'failed' : 'passed'
}

export function buildEnginePipelinePayload(options: {
  hardeningEnabled: boolean
  parallel?: {
    enabled: boolean
    prepare?: { passed: boolean; ownershipPassed: boolean; assemblerPassed: boolean; ownershipReportPath: string; assemblerReportPath: string }
    decisionLock?: { contractHash: string; reportPath: string }
  }
  maxParallelTeams?: number
  repoDir: string | null
  runId: string | null
  maxRepairCycles: number
  agentsStatus?: PipelineStatus
  timings?: Partial<Record<'assemble' | 'normalize' | 'contract' | 'gates' | 'repair' | 'decisionLock', { startedAt: string; endedAt: string }>>
  normalization?: NormalizeRepoResult
  contractEval?: RepoContractEvaluation
  gateReport?: GateReport
  repair?: { attemptedCycles: number; patchLogPath: string } | null
}): EnginePipelinePayload {
  const repoDir = options.repoDir
  const normalization = options.normalization
  const contractEval = options.contractEval
  const gateReport = options.gateReport
  const parallelEnabled = Boolean(options.parallel?.enabled)
  const contractHash = options.parallel?.decisionLock?.contractHash ?? null

  const stages: PipelineStage[] = [
    stage('agents', 'Agents', options.agentsStatus ?? 'passed'),
    stage(
      'decision-lock',
      'Decision Lock',
      options.hardeningEnabled ? (parallelEnabled ? (options.parallel?.decisionLock ? 'passed' : 'failed') : 'skipped') : 'skipped',
      options.timings?.decisionLock?.startedAt,
      options.timings?.decisionLock?.endedAt,
      options.parallel?.decisionLock?.reportPath && repoDir ? relPosix(repoDir, options.parallel.decisionLock.reportPath) : 'DECISION_LOCK_REPORT.md'
    ),
    stage(
      'teams',
      'Teams',
      options.hardeningEnabled
        ? parallelEnabled
          ? options.parallel?.prepare
            ? options.parallel.prepare.passed
              ? 'passed'
              : 'failed'
            : 'failed'
          : 'skipped'
        : 'skipped',
      undefined,
      undefined,
      parallelEnabled ? 'OWNERSHIP_REPORT.md' : undefined
    ),
    stage(
      'assemble',
      'Assemble',
      options.hardeningEnabled ? 'passed' : 'passed',
      options.timings?.assemble?.startedAt,
      options.timings?.assemble?.endedAt,
      'ASSEMBLY_REPORT.md'
    ),
    stage(
      'normalize',
      'Normalize',
      options.hardeningEnabled ? (normalization && normalization.violations.length === 0 ? 'passed' : 'failed') : 'skipped',
      options.timings?.normalize?.startedAt,
      options.timings?.normalize?.endedAt,
      'NORMALIZATION_REPORT.md'
    ),
    stage(
      'contract',
      'Contract',
      options.hardeningEnabled ? (contractEval && contractEval.passed ? 'passed' : 'failed') : 'skipped',
      options.timings?.contract?.startedAt,
      options.timings?.contract?.endedAt,
      'REPO_CONTRACT.json'
    ),
    stage(
      'gates',
      'Gates',
      options.hardeningEnabled ? gateStageStatus(gateReport) : 'skipped',
      options.timings?.gates?.startedAt,
      options.timings?.gates?.endedAt,
      'GATE_REPORT.md'
    ),
    stage(
      'repair',
      'Repair',
      options.hardeningEnabled
        ? options.repair && options.repair.attemptedCycles > 0
          ? gateReport && gateReport.passed
            ? 'passed'
            : 'failed'
          : 'skipped'
        : 'skipped',
      options.timings?.repair?.startedAt,
      options.timings?.repair?.endedAt,
      options.repair?.patchLogPath && repoDir ? relPosix(repoDir, options.repair.patchLogPath) : 'PATCHLOG.md'
    ),
    stage('export', 'Export', options.hardeningEnabled ? 'pending' : 'pending'),
  ]

  const checks: PipelineGateCheck[] = []
  if (options.hardeningEnabled && gateReport && repoDir) {
    for (const step of gateReport.steps) {
      const id = step.name as PipelineGateCheck['id']
      if (!['install', 'typecheck', 'lint', 'build', 'test', 'boot'].includes(id)) continue
      checks.push({
        id,
        label: step.name,
        status: mapGateStepStatus(step.status),
        logPath: step.result?.logPath ? relPosix(repoDir, step.result.logPath) : undefined,
        reportPath: gateReport.reportPath ? relPosix(repoDir, gateReport.reportPath) : undefined,
      })
    }
  }

  if (options.hardeningEnabled && parallelEnabled) {
    const ownershipPassed = options.parallel?.prepare?.ownershipPassed
    const assemblerPassed = options.parallel?.prepare?.assemblerPassed
    checks.push({
      id: 'ownership',
      label: 'ownership',
      status: ownershipPassed === true ? 'passed' : ownershipPassed === false ? 'failed' : 'pending',
      reportPath: 'OWNERSHIP_REPORT.md',
    })
    checks.push({
      id: 'assembler',
      label: 'assembler',
      status: assemblerPassed === true ? 'passed' : assemblerPassed === false ? 'failed' : 'pending',
      reportPath: 'ASSEMBLER_REPORT.md',
    })
  }

  const envCheckStatus =
    options.hardeningEnabled && contractEval
      ? envDocsStatus(contractEval.failures, Boolean((contractEval.env || []).length))
      : options.hardeningEnabled
        ? 'pending'
        : 'skipped'

  checks.push({
    id: 'env-docs',
    label: 'env-docs',
    status: envCheckStatus,
    reportPath: options.hardeningEnabled ? 'REPO_CONTRACT.json' : undefined,
  })

  const repair: PipelineRepair = {
    status: options.hardeningEnabled
      ? options.repair && options.repair.attemptedCycles > 0
        ? gateReport && gateReport.passed
          ? 'passed'
          : 'failed'
        : 'skipped'
      : 'skipped',
    cycle: options.repair?.attemptedCycles ?? 0,
    maxCycles: options.maxRepairCycles,
  }

  return {
    hardeningEnabled: options.hardeningEnabled,
    parallelTeamsEnabled: parallelEnabled,
    maxParallelTeams: options.maxParallelTeams,
    contractHash,
    runId: options.runId,
    repoDir: options.repoDir,
    stages,
    gates: { checks },
    repair,
  }
}
