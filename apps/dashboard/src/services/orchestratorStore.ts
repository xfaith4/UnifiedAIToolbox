export interface OrchestrationRun {
  prompt_id: string
  version?: string
  source_path?: string
  requested_at?: string
  status?: string
  review_policy?: string
  dataset_id?: string
  dataset_name?: string
}

/**
 * Load orchestration run manifests bundled in /src/data/runs.
 * Uses Vite's glob import to include all json files.
 */
const STORAGE_KEY = 'orchestrator.runs.v1'

function loadSavedRuns(): OrchestrationRun[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as OrchestrationRun[]) : []
  } catch {
    return []
  }
}

function saveRuns(runs: OrchestrationRun[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(runs))
}

export function listRuns(): OrchestrationRun[] {
  const modules = import.meta.glob('../data/runs/*.json', { eager: true })
  const runs: OrchestrationRun[] = []
  Object.values(modules).forEach((mod) => {
    const payload = (mod as { default?: unknown } | unknown).default ?? mod
    if (payload && typeof payload === 'object') {
      runs.push(payload as OrchestrationRun)
    }
  })
  const saved = loadSavedRuns()
  return [...runs, ...saved]
}

export function addRun(run: OrchestrationRun): OrchestrationRun[] {
  const merged = [...listRuns(), run]
  // Persist only the user-added runs (skip bundled)
  const bundledCount = Object.keys(import.meta.glob('../data/runs/*.json')).length
  const userRuns = merged.slice(bundledCount)
  saveRuns(userRuns)
  return merged
}
