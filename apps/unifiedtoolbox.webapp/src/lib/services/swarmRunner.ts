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

  const data = (await res.json()) as unknown
  if (typeof data !== 'object' || data === null || !('status' in data)) {
    throw new Error(`Unexpected response from swarm runner (${res.status})`)
  }
  const result = data as SwarmRunnerResult
  if (!res.ok || result.ok === false) {
    const message = result.error || `Failed to run swarm (${res.status})`
    throw new Error(message)
  }
  return result
}
