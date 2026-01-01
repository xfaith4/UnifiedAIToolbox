'use client'

type SwarmRunnerPayload = {
  goal: string
  agents?: string[]
  model?: string
}

export type SwarmRunnerResult = {
  ok: boolean
  status: string
  runId?: string
  goal?: string
  agents?: string[]
  model?: string
  output?: unknown
  stderr?: string
  error?: string
  startedAt?: string
  completedAt?: string
}

export async function runLocalSwarm(payload: SwarmRunnerPayload): Promise<SwarmRunnerResult> {
  const res = await fetch('/api/swarms/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = (await res.json()) as SwarmRunnerResult
  if (!res.ok || data.ok === false) {
    const message = data.error || `Failed to run swarm (${res.status})`
    throw new Error(message)
  }
  return data
}
