import { PROMPT_API_BASE } from './promptStore'
import type { OrchestrationRun } from './orchestratorStore'

// Timeout for fetch requests (in milliseconds)
const FETCH_TIMEOUT = 5000

// Helper function to fetch with timeout
async function fetchWithTimeout(url: string, options: Record<string, unknown> = {}): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout')
    }
    throw error
  }
}

export async function createRunApi(run: OrchestrationRun): Promise<OrchestrationRun> {
  if (!PROMPT_API_BASE) {
    throw new Error('API base not configured')
  }
  
  try {
    const res = await fetchWithTimeout(`${PROMPT_API_BASE}/orchestrate/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(run),
    })
    
    if (!res.ok) {
      throw new Error(`Failed to launch orchestration (${res.status})`)
    }
    
    const payload = await res.json()
    const manifest = payload.manifest as OrchestrationRun
    return {
      ...manifest,
      requested_at: manifest.requested_at,
    }
  } catch (error) {
    // Network error or timeout - provide more context
    if (error instanceof TypeError) {
      throw new Error('Backend API is not available')
    }
    throw error
  }
}

export async function fetchRunsApi(): Promise<OrchestrationRun[]> {
  if (!PROMPT_API_BASE) throw new Error('API base not configured')
  
  try {
    const res = await fetchWithTimeout(`${PROMPT_API_BASE}/orchestrate/runs`)
    
    if (!res.ok) {
      throw new Error(`Failed to fetch runs (${res.status})`)
    }
    
    const payload = await res.json()
    return (payload.runs as OrchestrationRun[]).map((r) => ({
      ...r,
      run_id: r.run_id || r.prompt_id,
    }))
  } catch (error) {
    // Network error or timeout - silently fail for polling
    if (error instanceof TypeError || (error instanceof Error && error.message === 'Request timeout')) {
      throw new Error('Backend API is not available')
    }
    throw error
  }
}

export async function fetchRunApi(run_id: string): Promise<OrchestrationRun> {
  if (!PROMPT_API_BASE) throw new Error('API base not configured')
  
  try {
    const res = await fetchWithTimeout(`${PROMPT_API_BASE}/orchestrate/run/${encodeURIComponent(run_id)}`)
    
    if (!res.ok) {
      throw new Error(`Failed to fetch run (${res.status})`)
    }
    
    const payload = await res.json()
    return payload as OrchestrationRun
  } catch (error) {
    // Network error or timeout
    if (error instanceof TypeError || (error instanceof Error && error.message === 'Request timeout')) {
      throw new Error('Backend API is not available')
    }
    throw error
  }
}

export async function fetchRunLogApi(run_id: string, maxBytes = 8000): Promise<{ log: string; bytes: number }> {
  if (!PROMPT_API_BASE) throw new Error('API base not configured')
  
  try {
    const res = await fetchWithTimeout(`${PROMPT_API_BASE}/orchestrate/run/${encodeURIComponent(run_id)}/log?max_bytes=${maxBytes}`)
    
    if (!res.ok) {
      throw new Error(`Failed to fetch log (${res.status})`)
    }
    
    const payload = await res.json()
    return { log: payload.log as string, bytes: payload.bytes as number }
  } catch (error) {
    // Network error or timeout
    if (error instanceof TypeError || (error instanceof Error && error.message === 'Request timeout')) {
      throw new Error('Backend API is not available')
    }
    throw error
  }
}
