/* eslint-disable no-console */

const fs = require('node:fs/promises')
const path = require('node:path')

const WEBAPP_ROOT = process.cwd() // eslint-disable-line no-undef
const REPO_ROOT = path.resolve(WEBAPP_ROOT, '..', '..')
const ARTIFACTS_DIR = path.join(REPO_ROOT, 'artifacts', 'ux-simulations')

async function listSummaryFiles() {
  const entries = await fs.readdir(ARTIFACTS_DIR, { withFileTypes: true })
  const summaries = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!entry.name.startsWith('summary-') || !entry.name.endsWith('.json')) continue
    const full = path.join(ARTIFACTS_DIR, entry.name)
    const stat = await fs.stat(full)
    summaries.push({ full, mtimeMs: stat.mtimeMs })
  }
  summaries.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return summaries
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8')
  return JSON.parse(raw)
}

function safeKeyPart(value) {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\s+/g, ' ').trim()
}

async function main() {
  const summaries = await listSummaryFiles()
  if (summaries.length === 0) {
    console.error('[ux-analyze] No summaries found under artifacts/ux-simulations')
    process.exit(1)
  }

  const summaryPath = summaries[0].full
  const summary = await readJson(summaryPath)

  const runFiles = Array.isArray(summary.runFiles) ? summary.runFiles : []
  if (runFiles.length === 0) {
    console.error('[ux-analyze] Summary has no runFiles:', path.relative(REPO_ROOT, summaryPath))
    process.exit(1)
  }

  const breakdown = {
    summary: path.relative(REPO_ROOT, summaryPath),
    runs: runFiles.length,
    byEndpoint: {},
    byRoute: {},
    samples: {},
  }

  for (const runRel of runFiles) {
    const runPath = path.resolve(REPO_ROOT, runRel)
    const run = await readJson(runPath)
    const events = run?.journey?.uxEvents
    if (!Array.isArray(events)) continue

    for (const ev of events) {
      if (ev?.name !== 'api_error') continue
      const route = safeKeyPart(ev.route)
      const url = safeKeyPart(ev?.details?.url)
      const status = safeKeyPart(ev?.details?.status)
      const message = safeKeyPart(ev?.details?.message)

      const endpointKey = `${route} | ${url} | ${status} | ${message}`.trim()
      breakdown.byEndpoint[endpointKey] = (breakdown.byEndpoint[endpointKey] || 0) + 1
      breakdown.byRoute[route || '(unknown)'] = (breakdown.byRoute[route || '(unknown)'] || 0) + 1

      if (!breakdown.samples[endpointKey]) {
        breakdown.samples[endpointKey] = {
          run: path.relative(REPO_ROOT, runPath),
          ts: ev.ts,
        }
      }
    }
  }

  const sortedEndpoints = Object.entries(breakdown.byEndpoint)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)

  const outJson = {
    ...breakdown,
    topEndpoints: sortedEndpoints.map(([key, count]) => ({
      key,
      count,
      sample: breakdown.samples[key],
    })),
  }

  const outName = `api-error-breakdown-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  const outPath = path.join(ARTIFACTS_DIR, outName)
  await fs.writeFile(outPath, JSON.stringify(outJson, null, 2), 'utf-8')

  console.log('[ux-analyze] summary:', path.relative(REPO_ROOT, summaryPath))
  console.log('[ux-analyze] wrote:', path.relative(REPO_ROOT, outPath))
  console.log('[ux-analyze] top api_error endpoints:')
  for (const { key, count } of outJson.topEndpoints) {
    console.log(`  - ${count}x ${key}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
