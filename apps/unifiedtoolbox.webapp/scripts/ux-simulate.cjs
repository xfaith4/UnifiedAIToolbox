/* eslint-disable no-console */

const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright')

const WEBAPP_ROOT = process.cwd()
const REPO_ROOT = path.resolve(WEBAPP_ROOT, '..', '..')
const ARTIFACTS_DIR = path.join(REPO_ROOT, 'artifacts', 'ux-simulations')

const RUNS_DIR = path.join(ARTIFACTS_DIR, 'runs')
const TRACES_DIR = path.join(ARTIFACTS_DIR, 'traces')
const SCREENSHOTS_DIR = path.join(ARTIFACTS_DIR, 'screenshots')

const DEFAULT_RUNS = 120

const VIEWPORTS = [
  { name: 'mobile', viewport: { width: 390, height: 844 } },
  { name: 'tablet', viewport: { width: 820, height: 1180 } },
  { name: 'desktop', viewport: { width: 1280, height: 800 } },
]

const PROFILES = [
  { name: 'novice', baseWaitMs: 250, extraClicks: 0 },
  { name: 'power', baseWaitMs: 50, extraClicks: 0 },
  { name: 'impatient', baseWaitMs: 25, extraClicks: 2 },
]

async function waitForHttpOk(url, { timeoutMs = 30_000, intervalMs = 750 } = {}) {
  const startedAt = Date.now()
  let lastError = null

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), Math.min(2_500, intervalMs))
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timeout)

      if (res.ok) return { ok: true, status: res.status, ms: Date.now() - startedAt }
      lastError = new Error(`HTTP ${res.status}`)
    } catch (error) {
      lastError = error
    }

    await new Promise((r) => setTimeout(r, intervalMs))
  }

  return { ok: false, ms: Date.now() - startedAt, error: String(lastError || 'timeout') }
}

function classifyFailure(errorString) {
  const s = String(errorString || '')
  if (
    s.includes('ERR_CONNECTION_REFUSED') ||
    s.includes('ERR_CONNECTION_RESET') ||
    s.includes('ERR_NAME_NOT_RESOLVED') ||
    s.includes('net::')
  ) {
    return 'infra'
  }
  return 'journey'
}

function isoSafe(ts = new Date()) {
  return ts.toISOString().replace(/[:.]/g, '-')
}

function pick(array) {
  return array[Math.floor(Math.random() * array.length)]
}

async function ensureDirs() {
  await fs.mkdir(RUNS_DIR, { recursive: true })
  await fs.mkdir(TRACES_DIR, { recursive: true })
  await fs.mkdir(SCREENSHOTS_DIR, { recursive: true })
}

async function writeJson(filePath, payload) {
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8')
}

async function runJourney(page, { baseWaitMs, extraClicks }) {
  const results = {
    steps: [],
    uxEvents: [],
    consoleErrors: [],
  }

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      results.consoleErrors.push(msg.text())
      return
    }

    const text = msg.text()
    if (!text.startsWith('UX_EVENT ')) return

    try {
      const json = text.slice('UX_EVENT '.length)
      results.uxEvents.push(JSON.parse(json))
    } catch {
      // ignore
    }
  })

  const step = async (name, fn) => {
    const startedAt = Date.now()
    try {
      await fn()
      results.steps.push({ name, ok: true, ms: Date.now() - startedAt })
    } catch (error) {
      results.steps.push({ name, ok: false, ms: Date.now() - startedAt, error: String(error) })
      throw error
    }
  }

  const maybeExtraClicks = async () => {
    for (let i = 0; i < extraClicks; i++) {
      await page.mouse.click(10 + i * 5, 10 + i * 3)
      await page.waitForTimeout(baseWaitMs)
    }
  }

  await step('home', async () => {
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(baseWaitMs)
    await maybeExtraClicks()
  })

  await step('dashboard', async () => {
    await page.goto('http://localhost:3000/dashboard', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(baseWaitMs)
  })

  await step('prompts-search', async () => {
    await page.goto('http://localhost:3000/prompts', { waitUntil: 'domcontentloaded' })
    const search = page.getByPlaceholder('Search prompts')
    if (await search.count()) {
      await search.fill('agent')
    }
    await page.waitForTimeout(baseWaitMs)
  })

  await step('agents-search', async () => {
    await page.goto('http://localhost:3000/agents', { waitUntil: 'domcontentloaded' })
    const search = page.getByPlaceholder('Search name, tags, mission')
    if (await search.count()) {
      await search.fill('engine')
    }
    await page.waitForTimeout(baseWaitMs)
  })

  await step('orchestrator-load', async () => {
    await page.goto('http://localhost:3000/orchestrator', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(baseWaitMs)
  })

  return results
}

async function main() {
  await ensureDirs()

  const runs = Number(process.env.UX_RUNS || DEFAULT_RUNS)
  const startedAt = Date.now()

  const portalUrl = process.env.UX_PORTAL_URL || 'http://localhost:3000/'
  const promptApiHealthUrl = process.env.UX_PROMPT_API_HEALTH_URL || 'http://localhost:8000/health'

  const summary = {
    startedAt: new Date(startedAt).toISOString(),
    runsRequested: runs,
    runsExecuted: 0,
    passed: 0,
    failed: 0,
    infraFailed: 0,
    skipped: 0,
    totalMs: 0,
    topEvents: {},
    topConsoleErrors: {},
    preflight: {
      portalUrl,
      promptApiHealthUrl,
      portal: null,
      promptApi: null,
    },
    notes: [
      'This is a synthetic UX run. It focuses on navigation + basic interactions and records UX_EVENT telemetry emitted by the portal.',
    ],
    runFiles: [],
  }

  summary.preflight.portal = await waitForHttpOk(portalUrl)
  summary.preflight.promptApi = await waitForHttpOk(promptApiHealthUrl)

  if (!summary.preflight.portal.ok) {
    summary.notes.push(
      'Preflight failed: portal not reachable. Start the Next.js portal first (npm run dev) then rerun ux:simulate.'
    )

    const finishedAt = Date.now()
    summary.finishedAt = new Date(finishedAt).toISOString()
    summary.wallMs = finishedAt - startedAt
    summary.avgRunMs = 0

    const summaryPath = path.join(ARTIFACTS_DIR, `summary-${isoSafe()}.json`)
    await writeJson(summaryPath, summary)
    console.error(`[ux-sim] preflight failed (portal). summary: ${path.relative(REPO_ROOT, summaryPath)}`)
    process.exit(2)
  }

  if (!summary.preflight.promptApi.ok) {
    summary.notes.push('Preflight warning: prompt API health check failed. Orchestrator-related steps may degrade.')
  }

  const browser = await chromium.launch({ headless: true })

  for (let i = 0; i < runs; i++) {
    const runId = `${isoSafe()}_${String(i).padStart(3, '0')}`
    const viewportChoice = pick(VIEWPORTS)
    const profileChoice = pick(PROFILES)

    const context = await browser.newContext({
      viewport: viewportChoice.viewport,
      colorScheme: 'dark',
      reducedMotion: profileChoice.name === 'novice' ? 'reduce' : 'no-preference',
    })

    await context.tracing.start({ screenshots: true, snapshots: true })

    const page = await context.newPage()

    const runRecord = {
      id: runId,
      viewport: viewportChoice.name,
      profile: profileChoice.name,
      ok: true,
      failureType: null,
      startedAt: new Date().toISOString(),
      totalMs: 0,
      journey: null,
      error: null,
    }

    const runStart = Date.now()

    try {
      const journey = await runJourney(page, profileChoice)
      runRecord.journey = journey
      summary.passed += 1
      summary.runsExecuted += 1

      for (const ev of journey.uxEvents) {
        summary.topEvents[ev.name] = (summary.topEvents[ev.name] || 0) + 1
      }

      for (const err of journey.consoleErrors) {
        const key = err.slice(0, 160)
        summary.topConsoleErrors[key] = (summary.topConsoleErrors[key] || 0) + 1
      }

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `run-${runId}.png`),
        fullPage: true,
      })
    } catch (error) {
      runRecord.ok = false
      runRecord.error = String(error)
      runRecord.failureType = classifyFailure(runRecord.error)
      summary.failed += 1
      summary.runsExecuted += 1

      if (runRecord.failureType === 'infra') {
        summary.infraFailed += 1
      }

      try {
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `run-${runId}-FAILED.png`),
          fullPage: true,
        })
      } catch {
        // ignore
      }
    } finally {
      runRecord.totalMs = Date.now() - runStart
      summary.totalMs += runRecord.totalMs

      const tracePath = path.join(TRACES_DIR, `run-${runId}.zip`)
      try {
        await context.tracing.stop({ path: tracePath })
      } catch {
        // ignore
      }

      const outPath = path.join(RUNS_DIR, `run-${runId}.json`)
      await writeJson(outPath, runRecord)
      summary.runFiles.push(path.relative(REPO_ROOT, outPath))

      await context.close()

      if ((i + 1) % 10 === 0) {
        console.log(`[ux-sim] ${i + 1}/${runs} complete`)
      }
    }
  }

  await browser.close()

  const finishedAt = Date.now()
  summary.finishedAt = new Date(finishedAt).toISOString()
  summary.wallMs = finishedAt - startedAt
  summary.avgRunMs = Math.round(summary.totalMs / Math.max(1, summary.runsExecuted))

  const summaryPath = path.join(ARTIFACTS_DIR, `summary-${isoSafe()}.json`)
  await writeJson(summaryPath, summary)

  console.log(`[ux-sim] done. summary: ${path.relative(REPO_ROOT, summaryPath)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
