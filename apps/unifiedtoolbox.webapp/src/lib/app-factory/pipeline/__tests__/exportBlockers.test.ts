import { describe, expect, it } from 'vitest'
import { buildExportBlockers } from '../exportBlockers'

describe('buildExportBlockers', () => {
  it('maps normalization, contract, and gate failures into blockers', () => {
    const blockers = buildExportBlockers({
      normalization: {
        changedFiles: [],
        reportPath: 'NORMALIZATION_REPORT.md',
        violations: [{ filePath: 'src/a.ts', message: 'bad', matches: [{ line: 3, snippet: '```ts' }] }],
      },
      contractEval: {
        stackId: 'x',
        passed: false,
        reportPath: 'REPO_CONTRACT.json',
        requiredFilesAll: [],
        requiredFilesAny: [],
        env: [],
        failures: [
          {
            kind: 'forbidden_pattern',
            filePath: 'src/a.ts',
            ext: '.ts',
            ruleId: 'frontmatter-marker',
            description: 'frontmatter',
            matches: [{ line: 1, snippet: '---' }],
            message: 'bad pattern',
          },
        ],
      },
      gateReport: {
        passed: false,
        reportPath: 'GATE_REPORT.md',
        logsDir: 'gate-logs',
        healthChecks: [],
        steps: [{ name: 'build', status: 'failed', message: 'build failed' }],
      },
      repair: { attemptedCycles: 0 },
    })

    expect(blockers.length).toBeGreaterThanOrEqual(3)
    expect(blockers.some((b) => b.ruleId === 'frontmatter-marker')).toBe(true)
    expect(blockers.some((b) => b.ruleId === 'gate:build')).toBe(true)
  })
})
