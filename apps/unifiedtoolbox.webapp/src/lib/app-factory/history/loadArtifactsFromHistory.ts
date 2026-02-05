import { readSessionsFile } from './sessionsStore'
import type { AppFactoryArtifact } from '../pipeline/hardenRepo'
import { inferTeamId } from '../parallel/teams'

type HistoryTask = {
  id?: string
  name?: string
  agent?: { specialization?: string }
  artifacts?: { name?: string; type?: string; content?: string }[]
}

type HistorySession = {
  id?: string
  tasks?: HistoryTask[]
}

export async function loadArtifactsFromHistoryFile(historyFilePath: string, sessionId: string): Promise<AppFactoryArtifact[] | null> {
  try {
    const parsed = await readSessionsFile<HistorySession>(historyFilePath)
    const sessions = parsed.sessions
    const session = Array.isArray(sessions) ? sessions.find((s) => s && s.id === sessionId) : null
    if (!session) return null

    const tasks = Array.isArray(session.tasks) ? session.tasks : []
    const artifacts: AppFactoryArtifact[] = []
    for (const task of tasks) {
      const list = Array.isArray(task.artifacts) ? task.artifacts : []
      const teamId = inferTeamId({
        explicitTeamId: null,
        specialization: task.agent?.specialization || null,
        taskName: task.name || null,
      })
      for (const a of list) {
        if (!a?.name || typeof a.content !== 'string') continue
        artifacts.push({
          name: String(a.name),
          type: a.type ? String(a.type) : undefined,
          content: a.content,
          sourceTaskId: task.id ? String(task.id) : undefined,
          sourceTaskName: task.name ? String(task.name) : undefined,
          sourceTeamId: teamId === 'unknown' ? undefined : teamId,
        })
      }
    }
    return artifacts
  } catch {
    return null
  }
}

