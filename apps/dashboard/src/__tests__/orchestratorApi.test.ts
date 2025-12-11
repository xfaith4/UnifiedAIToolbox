import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchRunsApi, createRunApi } from '../services/orchestratorApi'

describe('orchestratorApi', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE', 'http://localhost:8000')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('fetchRunsApi', () => {
    it('should handle network errors gracefully', async () => {
      // Mock fetch to throw a network error
      global.fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch

      try {
        await fetchRunsApi()
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('Backend API is not available')
      }
    })

    it('should handle HTTP errors', async () => {
      // Mock fetch to return a 500 error
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
        })
      ) as typeof fetch

      try {
        await fetchRunsApi()
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('Failed to fetch runs (500)')
      }
    })

    it('should succeed when API responds correctly', async () => {
      const mockRuns = [
        { run_id: 'test-1', prompt_id: 'prompt-1', status: 'completed' },
      ]

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ runs: mockRuns }),
        })
      ) as typeof fetch

      const result = await fetchRunsApi()
      expect(result).toEqual(mockRuns)
    })
  })

  describe('createRunApi', () => {
    it('should handle network errors gracefully', async () => {
      global.fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch

      const testRun = {
        run_id: 'test-1',
        prompt_id: 'test-prompt',
        status: 'queued' as const,
        goal: 'Test goal',
      }

      try {
        await createRunApi(testRun)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('Backend API is not available')
      }
    })
  })
})
