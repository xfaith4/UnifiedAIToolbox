import type { Task } from '../types'
import type { TaskStatus } from '../types'

export type GraphTask = {
  id: string
  name: string
  status: TaskStatus
  dependencies: string[]
  agentRole: string
  cost?: number
  artifactCount: number
}

export const GRAPH_LIMITS = {
  MAX_GRAPH_NODES: 80,
  MAX_GRAPH_EDGES: 400,
  GRAPH_PADDING: 80,
} as const

export function buildGraphTasks(tasks: Task[]): GraphTask[] {
  return tasks
    .map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      dependencies: Array.isArray(t.dependencies) ? [...t.dependencies] : [],
      agentRole: t.agent?.role || 'Unknown Agent',
      cost: t.cost,
      artifactCount: Array.isArray(t.artifacts) ? t.artifacts.length : 0,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function graphSignature(tasks: GraphTask[]): string {
  // Purposefully exclude high-churn fields like agent logs to prevent constant re-renders.
  return tasks
    .map((t) => `${t.id}|${t.status}|${t.dependencies.slice().sort().join(',')}|${t.agentRole}|${t.artifactCount}|${t.cost ?? ''}|${t.name}`)
    .join('||')
}

export function findCycle(nodes: string[], edges: Array<[string, string]>): string[] | null {
  const adj = new Map<string, string[]>()
  for (const n of nodes) adj.set(n, [])
  for (const [from, to] of edges) {
    if (!adj.has(from) || !adj.has(to)) continue
    adj.get(from)!.push(to)
  }

  const state = new Map<string, 0 | 1 | 2>() // 0 unvisited, 1 visiting, 2 done
  const parent = new Map<string, string | null>()
  for (const n of nodes) state.set(n, 0)

  let cycle: string[] | null = null

  const dfs = (v: string): boolean => {
    state.set(v, 1)
    for (const next of adj.get(v) ?? []) {
      const nextState = state.get(next) ?? 0
      if (nextState === 0) {
        parent.set(next, v)
        if (dfs(next)) return true
      } else if (nextState === 1) {
        // Found a back edge v -> next
        const path: string[] = [next]
        let cur: string | null = v
        while (cur && cur !== next) {
          path.push(cur)
          cur = parent.get(cur) ?? null
        }
        path.push(next)
        path.reverse()
        cycle = path
        return true
      }
    }
    state.set(v, 2)
    return false
  }

  for (const n of nodes) {
    if ((state.get(n) ?? 0) === 0) {
      parent.set(n, null)
      if (dfs(n)) break
    }
  }

  return cycle
}

