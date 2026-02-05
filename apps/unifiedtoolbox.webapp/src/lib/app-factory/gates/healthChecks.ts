export type HealthCheckResult = {
  name: string
  url: string
  expectedStatus: number
  passed: boolean
  lastStatus?: number
  lastError?: string
  durationMs: number
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function pollHealthChecks(options: {
  checks: { name: string; url: string; expectedStatus: number; timeoutSeconds?: number }[]
  overallTimeoutSeconds: number
  pollIntervalMs: number
}): Promise<HealthCheckResult[]> {
  const startedAt = Date.now()
  const deadline = startedAt + options.overallTimeoutSeconds * 1000
  const results: HealthCheckResult[] = options.checks.map((c) => ({
    name: c.name,
    url: c.url,
    expectedStatus: c.expectedStatus,
    passed: false,
    durationMs: 0,
  }))

  while (Date.now() < deadline) {
    let allPassed = true
    for (let i = 0; i < options.checks.length; i++) {
      const check = options.checks[i]
      const perCheckDeadline = startedAt + (check.timeoutSeconds ?? options.overallTimeoutSeconds) * 1000
      if (Date.now() > perCheckDeadline) {
        results[i] = {
          ...results[i],
          passed: false,
          lastError: results[i]?.lastError || 'timeout',
          durationMs: Date.now() - startedAt,
        }
        allPassed = false
        continue
      }

      try {
        const res = await fetchWithTimeout(check.url, 3000)
        const ok = res.status === check.expectedStatus
        results[i] = {
          ...results[i],
          passed: ok,
          lastStatus: res.status,
          lastError: ok ? undefined : `expected ${check.expectedStatus} got ${res.status}`,
          durationMs: Date.now() - startedAt,
        }
      } catch (err) {
        results[i] = {
          ...results[i],
          passed: false,
          lastError: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - startedAt,
        }
      }

      if (!results[i].passed) allPassed = false
    }

    if (allPassed) return results
    await new Promise((r) => setTimeout(r, options.pollIntervalMs))
  }

  return results.map((r) => ({ ...r, durationMs: Date.now() - startedAt }))
}

