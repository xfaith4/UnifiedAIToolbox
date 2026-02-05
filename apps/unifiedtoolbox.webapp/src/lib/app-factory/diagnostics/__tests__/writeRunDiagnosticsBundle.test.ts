import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'

import { writeRunDiagnosticsBundle } from '../writeRunDiagnosticsBundle'
import { writeLegacyDiagnosticsBundle } from '../writeLegacyDiagnosticsBundle'

describe('writeRunDiagnosticsBundle', () => {
  it('writes the expected diagnostics files', async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'uaitoolbox-diag-'))
    await fs.mkdir(path.join(repoDir, 'src'), { recursive: true })
    await fs.writeFile(path.join(repoDir, 'src', 'index.ts'), 'export const x = 1\n', 'utf8')

    const res = await writeRunDiagnosticsBundle({
      repoDir,
      runId: 'run_test_1',
      stackId: 'node-next-app-npm',
      contract: {
        stackId: 'node-next-app-npm',
        requiredFilesAll: ['package.json'],
        requiredFilesAny: [],
        codeFileExtensions: ['.ts'],
        forbiddenPatternsByExtension: {},
        installCommand: 'npm install',
        typecheckCommand: 'npm run typecheck',
        lintCommand: 'npm run lint',
        buildCommand: 'npm run build',
        testCommand: undefined,
        bootCommands: [],
        healthChecks: [],
      },
      config: {
        maxRepairCycles: 3,
        gateTimeoutSeconds: 600,
        bootTimeoutSeconds: 120,
        healthPollIntervalMs: 1000,
        fixerModel: 'gpt-4o-mini',
        apiKey: undefined,
      },
      passed: false,
      normalization: { changedFiles: [], violations: [], reportPath: path.join(repoDir, 'NORMALIZATION_REPORT.md') },
      contractEval: {
        stackId: 'node-next-app-npm',
        passed: false,
        requiredFilesAll: [],
        requiredFilesAny: [],
        env: [],
        failures: [{ kind: 'missing_required_file', pattern: 'package.json', message: "Missing required file matching 'package.json'" }],
        reportPath: path.join(repoDir, 'REPO_CONTRACT.json'),
      },
      gateReport: { passed: false, steps: [], healthChecks: [], reportPath: path.join(repoDir, 'GATE_REPORT.md'), logsDir: path.join(repoDir, 'gate-logs') },
      repair: { attemptedCycles: 0, patchLogPath: path.join(repoDir, 'PATCHLOG.md') },
    })

    const state = JSON.parse(await fs.readFile(res.statePath, 'utf8')) as { stackId: string; runId: string }
    expect(state.stackId).toBe('node-next-app-npm')
    expect(state.runId).toBe('run_test_1')

    const cfg = JSON.parse(await fs.readFile(res.configPath, 'utf8')) as { stackId: string; runId: string }
    expect(cfg.stackId).toBe('node-next-app-npm')
    expect(cfg.runId).toBe('run_test_1')

    const tree = await fs.readFile(res.treePath, 'utf8')
    expect(tree).toContain('src/index.ts')

    const md = await fs.readFile(res.reportPath, 'utf8')
    expect(md).toContain('# Run Diagnostics')
  })
})

describe('writeLegacyDiagnosticsBundle', () => {
  it('writes the expected diagnostics files', async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'uaitoolbox-legacy-diag-'))
    await fs.writeFile(path.join(repoDir, 'README.md'), 'hello\n', 'utf8')

    const res = await writeLegacyDiagnosticsBundle({
      repoDir,
      runId: 'run_test_legacy_1',
      stackId: 'node-next-app-npm',
    })

    const state = JSON.parse(await fs.readFile(res.statePath, 'utf8')) as { hardeningEnabled: boolean }
    expect(state.hardeningEnabled).toBe(false)

    const tree = await fs.readFile(res.treePath, 'utf8')
    expect(tree).toContain('README.md')
  })
})
