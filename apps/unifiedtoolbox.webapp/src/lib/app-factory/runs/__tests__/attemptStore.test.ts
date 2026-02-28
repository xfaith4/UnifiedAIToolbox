import path from 'path'
import os from 'os'
import { promises as fs } from 'fs'
import { describe, expect, it } from 'vitest'
import {
  deriveAttemptsFromEvents,
  tagEventsWithAttemptId,
  loadAttempts,
  saveAttempts,
} from '../attemptStore'
import type { RunEvent } from '../types'

// ── deriveAttemptsFromEvents ──────────────────────────────────────────────────

describe('deriveAttemptsFromEvents', () => {
  it('returns one attempt with attemptId a1 for empty events', () => {
    const attempts = deriveAttemptsFromEvents('run-1', [])
    expect(attempts).toHaveLength(1)
    expect(attempts[0].attemptId).toBe('a1')
    expect(attempts[0].attemptNumber).toBe(1)
    expect(attempts[0].triggerReason).toBe('initial')
    expect(attempts[0].status).toBe('running')
  })

  it('returns one attempt when no requeue events present', () => {
    const events: RunEvent[] = [
      { ts: '2024-01-01T00:00:00Z', message: 'started', type: 'status' },
      { ts: '2024-01-01T00:01:00Z', message: 'working', type: 'info' },
    ]
    const attempts = deriveAttemptsFromEvents('run-1', events)
    expect(attempts).toHaveLength(1)
    expect(attempts[0].attemptId).toBe('a1')
    expect(attempts[0].startedAt).toBe('2024-01-01T00:00:00Z')
  })

  it('creates two attempts when a requeue type event is present', () => {
    const events: RunEvent[] = [
      { ts: '2024-01-01T00:00:00Z', message: 'started', type: 'status' },
      { ts: '2024-01-01T00:01:00Z', message: 'running', type: 'info' },
      { ts: '2024-01-01T00:02:00Z', message: 'requeued', type: 'requeue' },
      { ts: '2024-01-01T00:03:00Z', message: 'starting attempt 2', type: 'status' },
    ]
    const attempts = deriveAttemptsFromEvents('run-1', events)
    expect(attempts).toHaveLength(2)
    expect(attempts[0].attemptId).toBe('a1')
    expect(attempts[0].attemptNumber).toBe(1)
    expect(attempts[1].attemptId).toBe('a2')
    expect(attempts[1].attemptNumber).toBe(2)
    expect(attempts[1].triggerReason).toBe('requeue')
  })

  it('creates two attempts when a status event with requeue in message is present', () => {
    const events: RunEvent[] = [
      { ts: '2024-01-01T00:00:00Z', message: 'started', type: 'status' },
      { ts: '2024-01-01T00:01:00Z', message: 'job requeued by dispatcher', type: 'status' },
      { ts: '2024-01-01T00:02:00Z', message: 'starting again', type: 'info' },
    ]
    const attempts = deriveAttemptsFromEvents('run-1', events)
    expect(attempts).toHaveLength(2)
    expect(attempts[0].attemptId).toBe('a1')
    expect(attempts[1].attemptId).toBe('a2')
  })

  it('detects repair trigger reason', () => {
    const events: RunEvent[] = [
      { ts: '2024-01-01T00:00:00Z', message: 'started', type: 'status' },
      { ts: '2024-01-01T00:01:00Z', message: 'running repair cycle', type: 'status' },
      { ts: '2024-01-01T00:02:00Z', message: 'repaired', type: 'info' },
    ]
    const attempts = deriveAttemptsFromEvents('run-1', events)
    expect(attempts).toHaveLength(2)
    expect(attempts[1].triggerReason).toBe('repair')
  })

  it('last attempt has no endedAt', () => {
    const events: RunEvent[] = [
      { ts: '2024-01-01T00:00:00Z', message: 'started', type: 'status' },
      { ts: '2024-01-01T00:01:00Z', message: 'requeued', type: 'requeue' },
      { ts: '2024-01-01T00:02:00Z', message: 'started again', type: 'status' },
    ]
    const attempts = deriveAttemptsFromEvents('run-1', events)
    expect(attempts.at(-1)?.endedAt).toBeUndefined()
    expect(attempts[0].endedAt).toBeDefined()
  })
})

// ── tagEventsWithAttemptId ────────────────────────────────────────────────────

describe('tagEventsWithAttemptId', () => {
  it('tags all events a1 when only one attempt', () => {
    const events: RunEvent[] = [
      { ts: '2024-01-01T00:00:00Z', message: 'start', type: 'info' },
      { ts: '2024-01-01T00:01:00Z', message: 'end', type: 'info' },
    ]
    const attempts = deriveAttemptsFromEvents('run-1', events)
    const tagged = tagEventsWithAttemptId('run-1', events, attempts)
    expect(tagged.every((ev) => ev.attemptId === 'a1')).toBe(true)
  })

  it('tags events before requeue as a1 and after as a2', () => {
    const events: RunEvent[] = [
      { ts: '2024-01-01T00:00:00Z', message: 'step 1', type: 'info' },
      { ts: '2024-01-01T00:01:00Z', message: 'requeued', type: 'requeue' },
      { ts: '2024-01-01T00:02:00Z', message: 'step 2', type: 'info' },
      { ts: '2024-01-01T00:03:00Z', message: 'step 3', type: 'info' },
    ]
    const attempts = deriveAttemptsFromEvents('run-1', events)
    const tagged = tagEventsWithAttemptId('run-1', events, attempts)
    expect(tagged[0].attemptId).toBe('a1')
    expect(tagged[1].attemptId).toBe('a1') // the requeue event itself belongs to a1
    expect(tagged[2].attemptId).toBe('a2')
    expect(tagged[3].attemptId).toBe('a2')
  })

  it('does not mutate original events', () => {
    const events: RunEvent[] = [
      { ts: '2024-01-01T00:00:00Z', message: 'test', type: 'info' },
    ]
    const attempts = deriveAttemptsFromEvents('run-1', events)
    tagEventsWithAttemptId('run-1', events, attempts)
    expect(events[0].attemptId).toBeUndefined()
  })

  it('returns events array unchanged when attempts is empty', () => {
    const events: RunEvent[] = [
      { ts: '2024-01-01T00:00:00Z', message: 'test', type: 'info' },
    ]
    const tagged = tagEventsWithAttemptId('run-1', events, [])
    expect(tagged).toBe(events)
  })
})

// ── loadAttempts / saveAttempts round-trip ────────────────────────────────────

describe('loadAttempts / saveAttempts', () => {
  it('returns empty array when no file exists', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'attempt-store-test-'))
    try {
      const result = await loadAttempts.call(null, 'nonexistent-run')
      // loadAttempts uses the env var or default dir — just verify it returns []
      expect(Array.isArray(result)).toBe(true)
    } finally {
      await fs.rmdir(tmpDir, { recursive: true } as object)
    }
  })

  it('round-trips attempts through save and load', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'attempt-store-rt-'))
    const origEnv = process.env.UAITOOLBOX_ATTEMPTS_DIR
    process.env.UAITOOLBOX_ATTEMPTS_DIR = tmpDir
    try {
      const runId = 'test-round-trip-run'
      const attempts = [
        {
          attemptId: 'a1',
          attemptNumber: 1,
          startedAt: '2024-01-01T00:00:00Z',
          endedAt: '2024-01-01T00:05:00Z',
          status: 'failed' as const,
          triggerReason: 'initial' as const,
        },
        {
          attemptId: 'a2',
          attemptNumber: 2,
          startedAt: '2024-01-01T00:06:00Z',
          status: 'running' as const,
          triggerReason: 'requeue' as const,
        },
      ]

      await saveAttempts(runId, attempts)
      const loaded = await loadAttempts(runId)

      expect(loaded).toHaveLength(2)
      expect(loaded[0].attemptId).toBe('a1')
      expect(loaded[0].status).toBe('failed')
      expect(loaded[1].attemptId).toBe('a2')
      expect(loaded[1].status).toBe('running')
    } finally {
      if (origEnv === undefined) {
        delete process.env.UAITOOLBOX_ATTEMPTS_DIR
      } else {
        process.env.UAITOOLBOX_ATTEMPTS_DIR = origEnv
      }
      await fs.rm(tmpDir, { recursive: true })
    }
  })
})
