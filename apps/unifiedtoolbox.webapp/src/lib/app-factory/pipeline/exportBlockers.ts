import type { RepoContractEvaluation } from '../contracts/evaluateRepoContract'
import type { GateReport } from '../gates/runGates'
import type { NormalizeRepoResult } from '../normalize/normalizeRepo'

export type ExportBlocker = {
  kind: string
  filePath?: string
  ruleId: string
  message: string
  lines?: number[]
  snippet?: string
  phase?: 'normalize' | 'contract' | 'gates' | 'repair'
}

export function buildExportBlockers(input: {
  normalization: NormalizeRepoResult
  contractEval: RepoContractEvaluation
  gateReport: GateReport
  repair?: { attemptedCycles: number }
}): ExportBlocker[] {
  const blockers: ExportBlocker[] = []

  for (const violation of input.normalization.violations) {
    blockers.push({
      kind: 'normalization_violation',
      filePath: violation.filePath,
      ruleId: 'normalization',
      message: violation.message,
      lines: violation.matches?.map((m) => m.line),
      snippet: violation.matches?.[0]?.snippet,
      phase: 'normalize',
    })
  }

  for (const failure of input.contractEval.failures) {
    if (failure.kind === 'forbidden_pattern') {
      blockers.push({
        kind: failure.kind,
        filePath: failure.filePath,
        ruleId: failure.ruleId,
        message: failure.description,
        lines: failure.matches?.map((m) => m.line),
        snippet: failure.matches?.[0]?.snippet,
        phase: 'contract',
      })
      continue
    }

    blockers.push({
      kind: failure.kind,
      ruleId: failure.kind,
      message: failure.message,
      phase: 'contract',
    })
  }

  for (const step of input.gateReport.steps) {
    if (step.status === 'failed' || step.status === 'skipped') {
      blockers.push({
        kind: step.status === 'failed' ? 'gate_failure' : 'gate_skipped',
        ruleId: `gate:${step.name}`,
        message: step.message || `${step.name} ${step.status}`,
        phase: 'gates',
      })
    }
  }

  if (input.repair && input.repair.attemptedCycles === 0 && blockers.length > 0) {
    blockers.push({
      kind: 'repair_not_attempted',
      ruleId: 'repair',
      message: 'Repair was not attempted for this run.',
      phase: 'repair',
    })
  }

  return blockers
}
