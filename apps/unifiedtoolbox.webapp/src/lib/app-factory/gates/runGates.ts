import { promises as fs } from 'fs'
import path from 'path'
import type { RepoContract } from '../contracts/RepoContract'
import { pollHealthChecks, type HealthCheckResult } from './healthChecks'
import { killProcessTree, rewriteCommandForTooling, runCommandToLog, type CommandResult } from './processUtils'
import { spawn } from 'child_process'

export type GateRunConfig = {
  gateTimeoutSeconds: number
  bootTimeoutSeconds: number
  healthPollIntervalMs: number
}

export type GateReport = {
  passed: boolean
  steps: { name: string; status: 'passed' | 'failed' | 'skipped'; result?: CommandResult; message?: string }[]
  healthChecks: HealthCheckResult[]
  reportPath: string
  logsDir: string
}

function truthyCommand(cmd?: string): string | null {
  const trimmed = (cmd || '').trim()
  return trimmed ? trimmed : null
}

async function lintConfigured(repoDir: string): Promise<boolean> {
  const candidates = [
    'eslint.config.js',
    'eslint.config.mjs',
    '.eslintrc',
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.eslintrc.json',
    '.eslintrc.yml',
    '.eslintrc.yaml',
  ].map((p) => path.join(repoDir, p))

  for (const c of candidates) {
    try {
      const stat = await fs.stat(c)
      if (stat.isFile()) return true
    } catch {
      // ignore
    }
  }

  // package.json eslintConfig
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(repoDir, 'package.json'), 'utf8')) as { eslintConfig?: unknown }
    if (pkg.eslintConfig) return true
  } catch {
    // ignore
  }

  return false
}

export async function runGates(repoDir: string, contract: RepoContract, config: GateRunConfig): Promise<GateReport> {
  const logsDir = path.join(repoDir, 'gate-logs')
  await fs.mkdir(logsDir, { recursive: true })

  const steps: GateReport['steps'] = []
  const healthChecks: HealthCheckResult[] = []

  const installCmd = truthyCommand(contract.installCommand)
  const buildCmd = truthyCommand(contract.buildCommand)
  const typecheckCmd = truthyCommand(contract.typecheckCommand)
  const lintCmd = truthyCommand(contract.lintCommand)
  const testCmd = truthyCommand(contract.testCommand)

  if (!installCmd || !buildCmd) {
    throw new Error('Contract must specify installCommand and buildCommand')
  }

  const installRes = await runCommandToLog({
    name: '01-install',
    command: installCmd,
    cwd: repoDir,
    timeoutSeconds: config.gateTimeoutSeconds,
    logDir: logsDir,
  })
  steps.push({ name: 'install', status: installRes.exitCode === 0 && !installRes.timedOut ? 'passed' : 'failed', result: installRes })
  if (steps.at(-1)?.status === 'failed') return await writeGateReport(repoDir, steps, healthChecks, logsDir)

  if (typecheckCmd) {
    const typecheckRes = await runCommandToLog({
      name: '02-typecheck',
      command: typecheckCmd,
      cwd: repoDir,
      timeoutSeconds: config.gateTimeoutSeconds,
      logDir: logsDir,
    })
    steps.push({
      name: 'typecheck',
      status: typecheckRes.exitCode === 0 && !typecheckRes.timedOut ? 'passed' : 'failed',
      result: typecheckRes,
    })
    if (steps.at(-1)?.status === 'failed') return await writeGateReport(repoDir, steps, healthChecks, logsDir)
  } else {
    steps.push({ name: 'typecheck', status: 'skipped', message: 'No typecheckCommand configured' })
  }

  if (lintCmd) {
    const isConfigured = await lintConfigured(repoDir)
    if (isConfigured) {
      const lintRes = await runCommandToLog({
        name: '03-lint',
        command: lintCmd,
        cwd: repoDir,
        timeoutSeconds: config.gateTimeoutSeconds,
        logDir: logsDir,
      })
      steps.push({ name: 'lint', status: lintRes.exitCode === 0 && !lintRes.timedOut ? 'passed' : 'failed', result: lintRes })
      if (steps.at(-1)?.status === 'failed') return await writeGateReport(repoDir, steps, healthChecks, logsDir)
    } else {
      steps.push({ name: 'lint', status: 'skipped', message: 'No ESLint config detected' })
    }
  } else {
    steps.push({ name: 'lint', status: 'skipped', message: 'No lintCommand configured' })
  }

  const buildRes = await runCommandToLog({
    name: '04-build',
    command: buildCmd,
    cwd: repoDir,
    timeoutSeconds: config.gateTimeoutSeconds,
    logDir: logsDir,
  })
  steps.push({ name: 'build', status: buildRes.exitCode === 0 && !buildRes.timedOut ? 'passed' : 'failed', result: buildRes })
  if (steps.at(-1)?.status === 'failed') return await writeGateReport(repoDir, steps, healthChecks, logsDir)

  if (testCmd) {
    const testRes = await runCommandToLog({
      name: '05-test',
      command: testCmd,
      cwd: repoDir,
      timeoutSeconds: config.gateTimeoutSeconds,
      logDir: logsDir,
    })
    steps.push({ name: 'test', status: testRes.exitCode === 0 && !testRes.timedOut ? 'passed' : 'failed', result: testRes })
    if (steps.at(-1)?.status === 'failed') return await writeGateReport(repoDir, steps, healthChecks, logsDir)
  } else {
    steps.push({ name: 'test', status: 'skipped', message: 'No testCommand configured' })
  }

  const bootCommands = contract.bootCommands || []
  const checks = contract.healthChecks || []
  if (bootCommands.length && checks.length) {
    const procs = []
    for (const cmd of bootCommands) {
      const cwd = cmd.cwd ? path.join(repoDir, cmd.cwd) : repoDir
      const rewritten = await rewriteCommandForTooling(cmd.command)
      const child = spawn(rewritten, {
        cwd,
        env: { ...process.env, ...(cmd.env || {}) },
        shell: true,
        windowsHide: true,
        stdio: 'pipe',
      })

      const logPath = path.join(logsDir, `boot-${cmd.name}.log`)
      void fs.writeFile(logPath, `# boot ${cmd.name}\n# cwd: ${cwd}\n# cmd: ${cmd.command}\n\n`, 'utf8')
      child.stdout?.on('data', (buf) => void fs.appendFile(logPath, buf.toString('utf8'), 'utf8'))
      child.stderr?.on('data', (buf) => void fs.appendFile(logPath, buf.toString('utf8'), 'utf8'))

      procs.push({ name: cmd.name, child, logPath })
    }

    try {
      const results = await pollHealthChecks({
        checks,
        overallTimeoutSeconds: config.bootTimeoutSeconds,
        pollIntervalMs: config.healthPollIntervalMs,
      })
      healthChecks.push(...results)
      const passed = results.every((r) => r.passed)
      steps.push({ name: 'boot', status: passed ? 'passed' : 'failed', message: passed ? 'health checks passed' : 'health checks failed' })
    } finally {
      for (const p of procs) {
        killProcessTree(p.child.pid)
      }
    }
  } else {
    steps.push({ name: 'boot', status: 'skipped', message: 'No bootCommands/healthChecks configured' })
  }

  return await writeGateReport(repoDir, steps, healthChecks, logsDir)
}

async function readLogExcerpt(logPath: string, maxChars = 4000): Promise<string> {
  try {
    const text = await fs.readFile(logPath, 'utf8')
    if (text.length <= maxChars) return text
    return text.slice(0, maxChars) + '\n... (truncated)\n'
  } catch {
    return '(log missing)'
  }
}

async function writeGateReport(repoDir: string, steps: GateReport['steps'], healthChecks: HealthCheckResult[], logsDir: string): Promise<GateReport> {
  const reportPath = path.join(repoDir, 'GATE_REPORT.md')
  const passed = steps.every((s) => s.status === 'passed' || s.status === 'skipped') && healthChecks.every((h) => h.passed)

  const lines: string[] = []
  lines.push('# Gate Report')
  lines.push('')
  lines.push(`- Passed: ${passed}`)
  lines.push(`- Generated: ${new Date().toISOString()}`)
  lines.push('')
  lines.push('## Steps')
  lines.push('')
  for (const step of steps) {
    lines.push(`- **${step.name}**: ${step.status}`)
    if (step.result) {
      lines.push(`  - cmd: \`${step.result.command}\``)
      lines.push(`  - cwd: \`${step.result.cwd}\``)
      lines.push(`  - exitCode: ${step.result.exitCode} timedOut: ${step.result.timedOut} durationMs: ${step.result.durationMs}`)
      lines.push(`  - log: \`${path.relative(repoDir, step.result.logPath).replace(/\\/g, '/')}\``)
    }
    if (step.message) lines.push(`  - note: ${step.message}`)
  }
  lines.push('')

  if (healthChecks.length) {
    lines.push('## Health Checks')
    lines.push('')
    for (const hc of healthChecks) {
      lines.push(`- **${hc.name}**: ${hc.passed ? 'passed' : 'failed'} (\`${hc.url}\`)`)
      if (!hc.passed) lines.push(`  - last: ${hc.lastStatus ?? 'n/a'} error: ${hc.lastError ?? 'n/a'}`)
    }
    lines.push('')
  }

  lines.push('## Log Excerpts')
  lines.push('')
  for (const step of steps) {
    if (!step.result) continue
    lines.push(`### ${step.name}`)
    lines.push('')
    lines.push('```')
    lines.push(await readLogExcerpt(step.result.logPath))
    lines.push('```')
    lines.push('')
  }

  await fs.writeFile(reportPath, lines.join('\n'), 'utf8')
  return { passed, steps, healthChecks, reportPath, logsDir }
}
