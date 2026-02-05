import { promises as fs } from 'fs'
import path from 'path'
import type { RepoContract } from '../contracts/RepoContract'
import type { GateReport } from '../gates/runGates'
import type { NormalizeRepoResult } from '../normalize/normalizeRepo'
import type { RepoContractEvaluation } from '../contracts/evaluateRepoContract'

export type HardeningConfigSnapshot = {
  maxRepairCycles: number
  gateTimeoutSeconds: number
  bootTimeoutSeconds: number
  healthPollIntervalMs: number
  fixerModel: string
  apiKey?: string
}

export type RunStateSnapshot = {
  schemaVersion: 1
  generatedAt: string
  passed: boolean
  stackId: string
  runId: string
  normalization: Pick<NormalizeRepoResult, 'changedFiles' | 'violations'>
  repoContract: Pick<RepoContractEvaluation, 'passed' | 'failures'>
  gates: {
    passed: boolean
    steps: { name: string; status: string; exitCode?: number; timedOut?: boolean; durationMs?: number; logPath?: string }[]
    healthChecks: { name: string; passed: boolean; url: string; lastStatus?: number | null; lastError?: string | null }[]
  }
  repair?: { attemptedCycles: number; patchLogPath: string }
}

export type RunConfigSnapshot = {
  schemaVersion: 1
  generatedAt: string
  stackId: string
  runId: string
  hardening: Omit<HardeningConfigSnapshot, 'apiKey'> & { apiKeyConfigured: boolean }
  contract: Pick<
    RepoContract,
    | 'stackId'
    | 'requiredFilesAll'
    | 'requiredFilesAny'
    | 'installCommand'
    | 'typecheckCommand'
    | 'lintCommand'
    | 'buildCommand'
    | 'testCommand'
    | 'bootCommands'
    | 'healthChecks'
  >
}

type DiagnosticsOptions = {
  repoDir: string
  runId: string
  stackId: string
  contract: RepoContract
  config: HardeningConfigSnapshot
  passed: boolean
  normalization: NormalizeRepoResult
  contractEval: RepoContractEvaluation
  gateReport: GateReport
  repair?: { attemptedCycles: number; patchLogPath: string }
}

const DEFAULT_IGNORE_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'out', 'coverage'])

async function listRepoFiles(repoDir: string): Promise<string[]> {
  const results: string[] = []
  const root = path.resolve(repoDir)

  const walk = async (dir: string) => {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      const rel = path.relative(root, full).replace(/\\/g, '/')
      if (!rel) continue

      if (ent.isDirectory()) {
        if (DEFAULT_IGNORE_DIRS.has(ent.name)) continue
        await walk(full)
      } else if (ent.isFile()) {
        results.push(rel)
      }
    }
  }

  await walk(root)
  results.sort((a, b) => a.localeCompare(b, 'en'))
  return results
}

export async function writeRunDiagnosticsBundle(options: DiagnosticsOptions): Promise<{
  statePath: string
  configPath: string
  treePath: string
  reportPath: string
}> {
  const now = new Date().toISOString()

  const state: RunStateSnapshot = {
    schemaVersion: 1,
    generatedAt: now,
    passed: options.passed,
    stackId: options.stackId,
    runId: options.runId,
    normalization: {
      changedFiles: options.normalization.changedFiles,
      violations: options.normalization.violations,
    },
    repoContract: {
      passed: options.contractEval.passed,
      failures: options.contractEval.failures,
    },
    gates: {
      passed: options.gateReport.passed,
      steps: options.gateReport.steps.map((s) => ({
        name: s.name,
        status: s.status,
        exitCode: typeof s.result?.exitCode === 'number' ? s.result.exitCode : undefined,
        timedOut: s.result?.timedOut,
        durationMs: s.result?.durationMs,
        logPath: s.result?.logPath ? path.relative(options.repoDir, s.result.logPath).replace(/\\/g, '/') : undefined,
      })),
      healthChecks: options.gateReport.healthChecks.map((h) => ({
        name: h.name,
        passed: h.passed,
        url: h.url,
        lastStatus: h.lastStatus ?? null,
        lastError: h.lastError ?? null,
      })),
    },
    repair: options.repair,
  }

  const cfg: RunConfigSnapshot = {
    schemaVersion: 1,
    generatedAt: now,
    stackId: options.stackId,
    runId: options.runId,
    hardening: {
      maxRepairCycles: options.config.maxRepairCycles,
      gateTimeoutSeconds: options.config.gateTimeoutSeconds,
      bootTimeoutSeconds: options.config.bootTimeoutSeconds,
      healthPollIntervalMs: options.config.healthPollIntervalMs,
      fixerModel: options.config.fixerModel,
      apiKeyConfigured: Boolean(options.config.apiKey),
    },
    contract: {
      stackId: options.contract.stackId,
      requiredFilesAll: options.contract.requiredFilesAll,
      requiredFilesAny: options.contract.requiredFilesAny,
      installCommand: options.contract.installCommand,
      typecheckCommand: options.contract.typecheckCommand,
      lintCommand: options.contract.lintCommand,
      buildCommand: options.contract.buildCommand,
      testCommand: options.contract.testCommand,
      bootCommands: options.contract.bootCommands,
      healthChecks: options.contract.healthChecks,
    },
  }

  const statePath = path.join(options.repoDir, 'run_state_snapshot.json')
  const configPath = path.join(options.repoDir, 'run_config_snapshot.json')
  const treePath = path.join(options.repoDir, 'artifact_tree.txt')
  const reportPath = path.join(options.repoDir, 'RUN_DIAGNOSTICS.md')

  await fs.writeFile(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8')
  await fs.writeFile(configPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8')
  await fs.writeFile(treePath, (await listRepoFiles(options.repoDir)).join('\n') + '\n', 'utf8')

  const reportLines: string[] = []
  reportLines.push('# Run Diagnostics')
  reportLines.push('')
  reportLines.push(`- Generated: ${now}`)
  reportLines.push(`- Run: \`${options.runId}\``)
  reportLines.push(`- Stack: \`${options.stackId}\``)
  reportLines.push(`- Passed: ${options.passed}`)
  reportLines.push('')
  reportLines.push('## Bundle')
  reportLines.push('')
  reportLines.push('- `run_state_snapshot.json` (normalized run status payload)')
  reportLines.push('- `run_config_snapshot.json` (stack + runtime settings)')
  reportLines.push('- `artifact_tree.txt` (deterministic path listing; excludes `node_modules/`, `.git/`, `.next/`)')
  reportLines.push('')
  reportLines.push('## Related Reports')
  reportLines.push('')
  reportLines.push('- `ARTIFACT_INGEST_REPORT.md`')
  reportLines.push('- `DECISION_LOCK_REPORT.md` + `STACK_LOCK.json` + `CONTRACT_HASH.txt` (when parallel teams enabled)')
  reportLines.push('- `OWNERSHIP_REPORT.md` + `ASSEMBLER_REPORT.md` (when parallel teams enabled)')
  reportLines.push('- `ASSEMBLY_REPORT.md`')
  reportLines.push('- `NORMALIZATION_REPORT.md`')
  reportLines.push('- `REPO_CONTRACT.json`')
  reportLines.push('- `GATE_REPORT.md` + `gate-logs/`')
  reportLines.push('- `PATCHLOG.md` + `patches/`')
  reportLines.push('')

  await fs.writeFile(reportPath, reportLines.join('\n'), 'utf8')

  return { statePath, configPath, treePath, reportPath }
}
