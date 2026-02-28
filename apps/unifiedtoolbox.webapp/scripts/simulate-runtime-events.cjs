#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs/promises')
const path = require('path')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function defaultRunsRoot() {
  const cwd = process.cwd()
  return path.resolve(cwd, '..', '..', '.uaitoolbox', 'app-factory', 'runs')
}

async function appendEvent(eventsPath, event) {
  await fs.appendFile(eventsPath, `${JSON.stringify(event)}\n`, 'utf8')
  console.log(`[event] ${event.stage} ${event.type} ${event.msg || event.message}`)
}

async function writeState(statePath, patch) {
  let current = {}
  try {
    current = JSON.parse(await fs.readFile(statePath, 'utf8'))
  } catch {
    // ignore
  }
  const next = {
    ...current,
    ...patch,
    updated_at: new Date().toISOString(),
  }
  await fs.writeFile(statePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
}

async function main() {
  const runId = process.argv[2] || `dev-runtime-${new Date().toISOString().replace(/[:.]/g, '-')}`
  const runsRoot = process.env.UAITOOLBOX_RUNS_DIR ? path.resolve(process.env.UAITOOLBOX_RUNS_DIR) : defaultRunsRoot()
  const runDir = path.join(runsRoot, runId)
  const repoDir = path.join(runDir, 'repo')
  const eventsPath = path.join(runDir, 'events.ndjson')
  const statePath = path.join(runDir, 'run_state.json')

  await fs.mkdir(repoDir, { recursive: true })
  await writeState(statePath, {
    run_id: runId,
    job_type: 'maintain_existing_app',
    status: 'running',
    current_stage: 'agents',
    started_at: new Date().toISOString(),
    progress: 0,
  })

  const stages = [
    { stage: 'agents', step: 'Enumerating files', delayMs: 1400 },
    { stage: 'assemble', step: 'Applying exclusions', delayMs: 1400 },
    { stage: 'normalize', step: 'Normalizing generated files', delayMs: 1400 },
    { stage: 'contract', step: 'Evaluating runtime model', delayMs: 1400 },
    { stage: 'gates', step: 'Running lint/typecheck', delayMs: 1400 },
    { stage: 'repair', step: 'Repair pass 1/3', delayMs: 1400 },
    { stage: 'export', step: 'Zipping output', delayMs: 1400 },
  ]

  for (let i = 0; i < stages.length; i += 1) {
    const current = stages[i]
    await writeState(statePath, {
      current_stage: current.stage,
      stage_index: i,
      stage_count: stages.length,
      progress: Math.round(((i + 1) / stages.length) * 100),
    })

    await appendEvent(eventsPath, {
      ts: new Date().toISOString(),
      level: 'info',
      runId,
      run_id: runId,
      stage: current.stage,
      step: current.step,
      type: 'stage.start',
      msg: `${current.stage} started`,
      data: { index: i + 1, total: stages.length },
    })

    for (let tick = 1; tick <= 3; tick += 1) {
      await sleep(current.delayMs)
      const payload = {
        ts: new Date().toISOString(),
        level: 'info',
        runId,
        run_id: runId,
        stage: current.stage,
        step: current.step,
        type: 'step.progress',
        msg: `${current.step} progress`,
        data: {
          files_scanned: i * 200 + tick * 40,
          files_excluded: i * 12 + tick,
          bytes_written: i * 1024 * 1024 + tick * 256 * 1024,
          pass: Math.min(tick, 3),
          total_passes: 3,
        },
      }
      if (current.stage === 'export') {
        payload.msg = 'export.zip.progress'
        payload.data.files_zipped = tick * 3
        payload.data.files_total = 9
      }
      await appendEvent(eventsPath, payload)
    }

    if (current.stage === 'repair') {
      await appendEvent(eventsPath, {
        ts: new Date().toISOString(),
        level: 'warn',
        runId,
        run_id: runId,
        stage: current.stage,
        step: current.step,
        type: 'warn',
        msg: 'Repair pass exceeded threshold; continuing',
      })
    }

    await appendEvent(eventsPath, {
      ts: new Date().toISOString(),
      level: 'info',
      runId,
      run_id: runId,
      stage: current.stage,
      step: current.step,
      type: 'stage.complete',
      msg: `${current.stage} completed`,
    })
  }

  await appendEvent(eventsPath, {
    ts: new Date().toISOString(),
    level: 'error',
    runId,
    run_id: runId,
    stage: 'export',
    type: 'error',
    msg: 'Simulated export warning: checksum mismatch ignored',
  })

  await writeState(statePath, {
    status: 'succeeded',
    ended_at: new Date().toISOString(),
    current_stage: 'export',
    progress: 100,
  })

  console.log(`\nSimulated run written: ${runId}`)
  console.log(`Run directory: ${runDir}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
