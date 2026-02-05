import { promises as fs } from 'fs'
import path from 'path'

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

export async function writeLegacyDiagnosticsBundle(options: {
  repoDir: string
  runId: string
  stackId: string
}): Promise<{
  statePath: string
  configPath: string
  treePath: string
  reportPath: string
}> {
  const now = new Date().toISOString()

  const statePath = path.join(options.repoDir, 'run_state_snapshot.json')
  const configPath = path.join(options.repoDir, 'run_config_snapshot.json')
  const treePath = path.join(options.repoDir, 'artifact_tree.txt')
  const reportPath = path.join(options.repoDir, 'RUN_DIAGNOSTICS.md')

  const state = {
    schemaVersion: 1,
    generatedAt: now,
    runId: options.runId,
    stackId: options.stackId,
    hardeningEnabled: false,
    note: 'HARDENING_PIPELINE=false (legacy export path; normalization/contract/gates/repair are skipped).',
  }

  const cfg = {
    schemaVersion: 1,
    generatedAt: now,
    runId: options.runId,
    stackId: options.stackId,
    featureFlags: {
      HARDENING_PIPELINE: process.env.HARDENING_PIPELINE ?? '',
      PARALLEL_TEAMS: process.env.PARALLEL_TEAMS ?? '',
      REQUIREMENT_WIZARD: process.env.REQUIREMENT_WIZARD ?? '',
    },
  }

  await fs.writeFile(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8')
  await fs.writeFile(configPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8')
  await fs.writeFile(treePath, (await listRepoFiles(options.repoDir)).join('\n') + '\n', 'utf8')

  const reportLines: string[] = []
  reportLines.push('# Run Diagnostics')
  reportLines.push('')
  reportLines.push(`- Generated: ${now}`)
  reportLines.push(`- Run: \`${options.runId}\``)
  reportLines.push(`- Stack: \`${options.stackId}\``)
  reportLines.push(`- Hardening: disabled (\`HARDENING_PIPELINE=false\`)`)
  reportLines.push('')
  reportLines.push('## Bundle')
  reportLines.push('')
  reportLines.push('- `run_state_snapshot.json`')
  reportLines.push('- `run_config_snapshot.json`')
  reportLines.push('- `artifact_tree.txt`')
  reportLines.push('')
  reportLines.push('## Notes')
  reportLines.push('')
  reportLines.push('- Normalization / repo contract / acceptance gates / repair loop are skipped in legacy mode.')
  reportLines.push('- See `ARTIFACT_INGEST_REPORT.md` and `ASSEMBLY_REPORT.md` for what was written/scaffolded.')
  reportLines.push('')

  await fs.writeFile(reportPath, reportLines.join('\n'), 'utf8')

  return { statePath, configPath, treePath, reportPath }
}

