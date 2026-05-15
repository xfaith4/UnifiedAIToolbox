import path from 'path'
import os from 'os'
import { promises as fs } from 'fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appendEvent } from '../canonicalEvents'
import { indexArtifact } from '../artifactIndex'
import { writeFinalSummary } from '../finalSummary'
import { buildRunManifest, deriveManifestFromEvents, isTerminalStatus } from '../manifest'

async function makeTmpRoot(prefix = 'manifest-'): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

describe('manifest', () => {
  let rootDir: string

  beforeEach(async () => {
    rootDir = await makeTmpRoot()
  })
  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true })
  })

  it('returns null when run dir is missing', async () => {
    const m = await buildRunManifest('does-not-exist', { rootDir })
    expect(m).toBeNull()
  })

  it('derives status and active agent from canonical events', async () => {
    const runId = 'run-manifest'
    const runDir = path.join(rootDir, runId)
    await fs.mkdir(runDir, { recursive: true })

    await appendEvent({ run_id: runId, event_type: 'run_created', severity: 'info', message: 'created' }, { rootDir })
    await appendEvent({ run_id: runId, event_type: 'run_started', severity: 'info', message: 'started' }, { rootDir })
    await appendEvent(
      { run_id: runId, event_type: 'agent_started', severity: 'info', message: 'planner up', agent_name: 'planner' },
      { rootDir }
    )
    await appendEvent(
      { run_id: runId, event_type: 'agent_progress', severity: 'info', message: 'doing things', agent_name: 'planner' },
      { rootDir }
    )

    const manifest = await buildRunManifest(runId, { rootDir })
    expect(manifest).not.toBeNull()
    expect(manifest!.status).toBe('running')
    expect(manifest!.active_agent).toBe('planner')
    expect(manifest!.agents.map((a) => a.name)).toContain('planner')
    expect(manifest!.event_count).toBe(4)
    expect(manifest!.paths.events_jsonl).toBe('events.jsonl')
    expect(manifest!.paths.artifacts_index).toBe('artifacts.index.jsonl')
  })

  it('reflects blockers with severity classification', async () => {
    const runId = 'run-blocked'
    const runDir = path.join(rootDir, runId)
    await fs.mkdir(runDir, { recursive: true })

    await appendEvent({ run_id: runId, event_type: 'run_started', severity: 'info', message: 'go' }, { rootDir })
    await appendEvent(
      {
        run_id: runId,
        event_type: 'agent_blocked',
        severity: 'warn',
        message: 'need api key',
        agent_name: 'fetcher',
        data: { severity: 'clarification_needed' },
      },
      { rootDir }
    )

    const manifest = await buildRunManifest(runId, { rootDir })
    expect(manifest!.status).toBe('blocked')
    expect(manifest!.blockers).toHaveLength(1)
    expect(manifest!.blockers[0].severity).toBe('clarification_needed')
  })

  it('terminal final_summary forces terminal status', async () => {
    const runId = 'run-terminal'
    const runDir = path.join(rootDir, runId)
    await fs.mkdir(runDir, { recursive: true })

    await appendEvent({ run_id: runId, event_type: 'run_started', severity: 'info', message: 'go' }, { rootDir })
    // No run_completed event, but a final_summary exists with completed outcome.
    await writeFinalSummary(
      {
        run_id: runId,
        objective: 'do the thing',
        outcome: 'completed',
        completed_work: ['shipped'],
        changed_files: [],
        created_artifacts: [],
        validation_results: [],
        blockers: [],
        warnings: [],
        next_steps: [],
      },
      { rootDir }
    )

    const manifest = await buildRunManifest(runId, { rootDir })
    expect(manifest!.status).toBe('completed')
    expect(isTerminalStatus(manifest!.status)).toBe(true)
    expect(manifest!.active_agent).toBeNull()
    expect(manifest!.final_summary?.outcome).toBe('completed')
  })

  it('counts artifacts from the index', async () => {
    const runId = 'run-art'
    const runDir = path.join(rootDir, runId)
    await fs.mkdir(runDir, { recursive: true })

    await appendEvent({ run_id: runId, event_type: 'run_started', severity: 'info', message: 'go' }, { rootDir })
    await indexArtifact(
      { run_id: runId, type: 'doc', title: 'plan.md', path: 'artifacts/plan.md', producing_agent: 'planner' },
      { rootDir }
    )
    await indexArtifact(
      { run_id: runId, type: 'code', title: 'patch', path: 'artifacts/patch.diff', producing_agent: 'coder' },
      { rootDir }
    )

    const manifest = await buildRunManifest(runId, { rootDir })
    expect(manifest!.artifact_count).toBe(2)
  })

  it('deriveManifestFromEvents is pure and handles empty input', () => {
    const out = deriveManifestFromEvents([], [], null)
    expect(out.status).toBe('queued')
    expect(out.event_count).toBe(0)
    expect(out.active_agent).toBeNull()
  })
})
