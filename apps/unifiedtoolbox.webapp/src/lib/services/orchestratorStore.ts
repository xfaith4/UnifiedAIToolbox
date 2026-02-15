'use client'

import type { OrchestrationRun } from '@/lib/types/orchestrator'

const STORAGE_KEY = 'orchestrator.runs.v1'

/**
 * Load orchestration runs from local storage
 */
function loadSavedRuns(): OrchestrationRun[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as OrchestrationRun[]) : []
  } catch {
    return []
  }
}

/**
 * Save orchestration runs to local storage
 */
function saveRuns(runs: OrchestrationRun[]): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(runs))
}

/**
 * List all locally stored orchestration runs
 */
export function listLocalRuns(): OrchestrationRun[] {
  return loadSavedRuns()
}

/**
 * Add a new orchestration run to local storage
 */
export function addLocalRun(run: OrchestrationRun): OrchestrationRun[] {
  const existing = loadSavedRuns()
  const updated = [run, ...existing]
  saveRuns(updated)
  return updated
}

/**
 * Update an existing orchestration run in local storage
 */
export function updateLocalRun(runId: string, updates: Partial<OrchestrationRun>): OrchestrationRun[] {
  const runs = loadSavedRuns()
  const updated = runs.map((run) =>
    run.id === runId ? { ...run, ...updates } : run
  )
  saveRuns(updated)
  return updated
}

/**
 * Generate a unique run ID
 */
export function generateRunId(prefix = 'run'): string {
  return `${prefix}_${Date.now()}`
}

/**
 * Create a new orchestration run with defaults
 */
export function createNewRun(
  goal: string,
  options: Partial<OrchestrationRun> = {}
): OrchestrationRun {
  const now = new Date().toISOString()
  return {
    id: generateRunId('multi-agent'),
    promptId: options.promptId || '',
    goal,
    agents: options.agents || [],
    status: 'queued',
    runMode: options.runMode || 'multi-agent',
    requestedAt: now,
    events: [
      {
        timestamp: now,
        type: 'status',
        message: 'queued',
      },
    ],
    ...options,
  }
}
