import { describe, it, expect } from 'vitest'
import { pollHealthChecks } from '../healthChecks'

describe('healthChecks', () => {
  it('passes when all checks return expected status', async () => {
    // Mock fetch to return 200
    global.fetch = async () => ({ status: 200 } as Response)

    const results = await pollHealthChecks({
      checks: [
        { name: 'api', url: 'http://localhost:3000/health', expectedStatus: 200 },
      ],
      overallTimeoutSeconds: 2,
      pollIntervalMs: 100,
    })

    expect(results).toHaveLength(1)
    expect(results[0].passed).toBe(true)
    expect(results[0].lastStatus).toBe(200)
  })

  it('fails when check returns unexpected status', async () => {
    // Mock fetch to return 500
    global.fetch = async () => ({ status: 500 } as Response)

    const results = await pollHealthChecks({
      checks: [
        { name: 'api', url: 'http://localhost:3000/health', expectedStatus: 200 },
      ],
      overallTimeoutSeconds: 1,
      pollIntervalMs: 100,
    })

    expect(results).toHaveLength(1)
    expect(results[0].passed).toBe(false)
    expect(results[0].lastStatus).toBe(500)
    expect(results[0].lastError).toContain('expected 200 got 500')
  })

  it('handles fetch errors gracefully', async () => {
    // Mock fetch to throw error
    global.fetch = async () => {
      throw new Error('Connection refused')
    }

    const results = await pollHealthChecks({
      checks: [
        { name: 'api', url: 'http://localhost:3000/health', expectedStatus: 200 },
      ],
      overallTimeoutSeconds: 1,
      pollIntervalMs: 100,
    })

    expect(results).toHaveLength(1)
    expect(results[0].passed).toBe(false)
    expect(results[0].lastError).toContain('Connection refused')
  })

  it('retries until success', async () => {
    let callCount = 0
    // Mock fetch to fail first 2 times then succeed
    global.fetch = async () => {
      callCount++
      if (callCount < 3) {
        return { status: 500 } as Response
      }
      return { status: 200 } as Response
    }

    const results = await pollHealthChecks({
      checks: [
        { name: 'api', url: 'http://localhost:3000/health', expectedStatus: 200 },
      ],
      overallTimeoutSeconds: 2,
      pollIntervalMs: 100,
    })

    expect(results).toHaveLength(1)
    expect(results[0].passed).toBe(true)
    expect(callCount).toBeGreaterThanOrEqual(3)
  })

  it('handles multiple checks', async () => {
    // Mock fetch with different status for different URLs
    global.fetch = (async (url: string | URL) => {
      const urlStr = url.toString()
      if (urlStr.includes('api')) return { status: 200 } as Response
      if (urlStr.includes('web')) return { status: 200 } as Response
      return { status: 500 } as Response
    }) as unknown as typeof fetch

    const results = await pollHealthChecks({
      checks: [
        { name: 'api', url: 'http://localhost:3000/api/health', expectedStatus: 200 },
        { name: 'web', url: 'http://localhost:3001/web/health', expectedStatus: 200 },
      ],
      overallTimeoutSeconds: 2,
      pollIntervalMs: 100,
    })

    expect(results).toHaveLength(2)
    expect(results[0].passed).toBe(true)
    expect(results[1].passed).toBe(true)
  })
})
