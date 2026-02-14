import { promises as fs } from 'fs'
import path from 'path'
import type { RepoContract } from '../contracts/RepoContract'
import type { RepoContractEvaluation } from '../contracts/evaluateRepoContract'
import type { GateReport } from '../gates/runGates'
import type { NormalizeRepoResult } from '../normalize/normalizeRepo'
import { callOpenAIChat } from '@/lib/services/serverOpenAI'
import { applyPatchFile, ensureGitWorkspace, extractUnifiedDiff } from './patchApplier'

export type RepairLoopConfig = {
  maxRepairCycles: number
  model: string
  apiKey: string
}

export type RepairCycleResult = {
  cycle: number
  status: 'applied' | 'skipped' | 'failed'
  message: string
  patchPath?: string
  patchStat?: string
}

export type RepairLoopResult = {
  attemptedCycles: number
  cycles: RepairCycleResult[]
  patchLogPath: string
}

async function readLogTail(filePath: string, maxChars = 8000): Promise<string> {
  try {
    const text = await fs.readFile(filePath, 'utf8')
    if (text.length <= maxChars) return text
    return '... (tail)\n' + text.slice(-maxChars)
  } catch {
    return '(log missing)'
  }
}

async function renderFixerPrompt(input: {
  contract: RepoContract
  normalization: NormalizeRepoResult
  contractEval: RepoContractEvaluation
  gateReport: GateReport
}): Promise<{ system: string; user: string }> {
  const system = [
    'You are a repo repair bot.',
    'Return a single unified diff ONLY (no markdown, no explanations).',
    'Keep edits minimal and patch-only: do not rewrite whole files unless required.',
    'Do not introduce markdown fences/headings/frontmatter inside code files.',
    'If you need to add missing build plumbing, add the smallest viable configs and scripts.',
  ].join('\n')

  const failures = input.contractEval.failures.slice(0, 25).map((f) => JSON.stringify(f)).join('\n')
  const gateSteps = input.gateReport.steps
    .map((s) => `${s.name}: ${s.status}${s.result ? ` (log ${path.basename(s.result.logPath)})` : ''}${s.message ? ` (${s.message})` : ''}`)
    .join('\n')

  const firstFail = input.gateReport.steps.find((s) => s.status === 'failed' && s.result?.logPath)
  const failingLog = firstFail?.result?.logPath ? await readLogTail(firstFail.result.logPath) : '(no failing step log)'

  const user = [
    `Stack contract: ${input.contract.stackId}`,
    '',
    'Repo contract failures (JSON, truncated):',
    failures || '(none)',
    '',
    'Normalization violations:',
    input.normalization.violations.map((v) => `- ${v.filePath}: ${v.message}`).join('\n') || '(none)',
    '',
    'Gate steps:',
    gateSteps,
    '',
    `Failing step log (${firstFail?.name || 'n/a'}):`,
    failingLog,
    '',
    'Gate report excerpt:',
    `- report: ${path.basename(input.gateReport.reportPath)}`,
    '',
    'Task: Fix the repo so that it passes the repo contract and the gates.',
  ].join('\n')

  return { system, user }
}

export async function repairLoop(options: {
  repoDir: string
  contract: RepoContract
  normalization: NormalizeRepoResult
  contractEval: RepoContractEvaluation
  gateReport: GateReport
  config: RepairLoopConfig
  onCycle: (cycle: number) => Promise<{ normalization: NormalizeRepoResult; contractEval: RepoContractEvaluation; gateReport: GateReport }>
  onEvent?: (event: { phase?: string; agent?: string; status?: string; message: string; details?: Record<string, unknown> }) => Promise<void>
}): Promise<RepairLoopResult> {
  const patchLogPath = path.join(options.repoDir, 'PATCHLOG.md')
  const cycles: RepairCycleResult[] = []

  await ensureGitWorkspace(options.repoDir)

  const patchesDir = path.join(options.repoDir, 'patches')
  await fs.mkdir(patchesDir, { recursive: true })

  for (let cycle = 1; cycle <= options.config.maxRepairCycles; cycle++) {
    const prompt = await renderFixerPrompt({
      contract: options.contract,
      normalization: options.normalization,
      contractEval: options.contractEval,
      gateReport: options.gateReport,
    })

    let content = ''
    try {
      const res = await callOpenAIChat(
        [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        options.config.apiKey,
        options.config.model,
        0.1,
        2200
      )
      content = res.content
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('429')) {
        await options.onEvent?.({ phase: 'repair', agent: 'Synthesizer', status: 'retrying', message: `Rate limited — retrying repair cycle ${cycle}`, details: { retryAttempt: cycle } })
      }
      cycles.push({ cycle, status: 'failed', message: `Fixer API call failed: ${msg}` })
      await options.onEvent?.({ phase: 'repair', agent: 'Synthesizer', status: 'failed', message: `Repair cycle ${cycle} failed`, details: { error: msg } })
      break
    }

    const diff = extractUnifiedDiff(content)
    if (!diff) {
      cycles.push({ cycle, status: 'failed', message: 'Fixer did not return a parseable unified diff' })
      break
    }

    const patchPath = path.join(patchesDir, `cycle-${cycle}.patch`)
    await fs.writeFile(patchPath, diff + '\n', 'utf8')

    const applied = await applyPatchFile(options.repoDir, patchPath)
    if (!applied.ok) {
      cycles.push({ cycle, status: 'failed', message: applied.error || 'Patch apply failed', patchPath })
      break
    }

    cycles.push({ cycle, status: 'applied', message: 'Patch applied', patchPath, patchStat: applied.stat })
    await options.onEvent?.({ phase: 'repair', agent: 'Synthesizer', status: 'running', message: `Repair cycle ${cycle} patch applied` })

    const refreshed = await options.onCycle(cycle)
    options.normalization = refreshed.normalization
    options.contractEval = refreshed.contractEval
    options.gateReport = refreshed.gateReport

    if (options.contractEval.passed && options.gateReport.passed && options.normalization.violations.length === 0) {
      break
    }
  }

  const patchLog = renderPatchLog(cycles)
  await fs.writeFile(patchLogPath, patchLog, 'utf8')

  return { attemptedCycles: cycles.length, cycles, patchLogPath }
}

function renderPatchLog(cycles: RepairCycleResult[]): string {
  const lines: string[] = []
  lines.push('# Patch Log')
  lines.push('')
  for (const c of cycles) {
    lines.push(`## Cycle ${c.cycle}`)
    lines.push('')
    lines.push(`- status: ${c.status}`)
    lines.push(`- message: ${c.message}`)
    if (c.patchPath) lines.push(`- patch: \`patches/${path.basename(c.patchPath)}\``)
    if (c.patchStat) {
      lines.push('')
      lines.push('```')
      lines.push(c.patchStat.trim())
      lines.push('```')
    }
    lines.push('')
  }
  return lines.join('\n')
}
