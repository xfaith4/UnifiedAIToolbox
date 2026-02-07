import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setRepositoryTopics, getGitHubConfigFromEnv } from '../githubTopicService'

describe('githubTopicService', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.resetAllMocks()
    // Clear environment variables
    delete process.env.GITHUB_TOKEN
    delete process.env.GITHUB_PAT
    delete process.env.GITHUB_REPO_OWNER
    delete process.env.APP_FACTORY_REPO_OWNER
    delete process.env.GITHUB_REPO_NAME
    delete process.env.APP_FACTORY_REPO_NAME
  })

  describe('setRepositoryTopics', () => {
    it('returns skipped when config is null', async () => {
      const result = await setRepositoryTopics(null, ['topic1'])
      
      expect(result.success).toBe(false)
      expect(result.skipped).toBe(true)
      expect(result.error).toContain('not provided')
    })

    it('returns skipped when config is missing required fields', async () => {
      const result = await setRepositoryTopics(
        { token: '', owner: 'test', repo: 'test' },
        ['topic1']
      )
      
      expect(result.success).toBe(false)
      expect(result.skipped).toBe(true)
    })

    it('normalizes topics correctly', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ names: ['topic-1', 'topic-2'] }),
      })

      const result = await setRepositoryTopics(
        { token: 'ghp_test', owner: 'testowner', repo: 'testrepo' },
        ['Topic 1', 'TOPIC-2', 'invalid@@topic']
      )

      expect(result.success).toBe(true)
      expect(result.topics).toEqual(['topic-1', 'topic-2'])
      
      // Verify fetch was called with normalized topics
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/testowner/testrepo/topics',
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('topic-1'),
        })
      )
    })

    it('successfully sets topics with valid config', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ names: ['appfactory', 'nodejs', 'nextjs'] }),
      })

      const result = await setRepositoryTopics(
        { token: 'ghp_test123', owner: 'myorg', repo: 'myrepo' },
        ['appfactory', 'nodejs', 'nextjs']
      )

      expect(result.success).toBe(true)
      expect(result.topics).toEqual(['appfactory', 'nodejs', 'nextjs'])
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/myorg/myrepo/topics',
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            Authorization: 'Bearer ghp_test123',
            Accept: 'application/vnd.github.mercy-preview+json',
          }),
        })
      )
    })

    it('handles GitHub API errors gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ message: 'Repository not found' }),
      })

      const result = await setRepositoryTopics(
        { token: 'ghp_test', owner: 'test', repo: 'nonexistent' },
        ['topic1']
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('404')
      expect(result.error).toContain('not found')
    })

    it('handles network errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const result = await setRepositoryTopics(
        { token: 'ghp_test', owner: 'test', repo: 'test' },
        ['topic1']
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Network error')
    })

    it('limits topics to 50 items', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ names: [] }),
      })

      const manyTopics = Array.from({ length: 100 }, (_, i) => `topic-${i}`)
      const result = await setRepositoryTopics(
        { token: 'ghp_test', owner: 'test', repo: 'test' },
        manyTopics
      )

      // Check that only 50 topics were sent
      const callArgs = (global.fetch as any).mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.names.length).toBeLessThanOrEqual(50)
    })

    it('truncates long topic names to 50 characters', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ names: [] }),
      })

      const longTopic = 'a'.repeat(100)
      await setRepositoryTopics(
        { token: 'ghp_test', owner: 'test', repo: 'test' },
        [longTopic]
      )

      const callArgs = (global.fetch as any).mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.names[0].length).toBeLessThanOrEqual(50)
    })

    it('removes invalid characters from topics', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ names: ['test-topic'] }),
      })

      await setRepositoryTopics(
        { token: 'ghp_test', owner: 'test', repo: 'test' },
        ['Test@Topic#123!']
      )

      const callArgs = (global.fetch as any).mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      // Should be normalized to only contain alphanumeric and hyphens
      expect(body.names[0]).toMatch(/^[a-z0-9-]+$/)
    })

    it('filters out empty topics after normalization', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ names: [] }),
      })

      const result = await setRepositoryTopics(
        { token: 'ghp_test', owner: 'test', repo: 'test' },
        ['', '   ', '@@@', '---']
      )

      // Should fail because all topics are invalid
      expect(result.success).toBe(false)
      expect(result.error).toContain('No valid topics')
    })
  })

  describe('getGitHubConfigFromEnv', () => {
    it('returns null when no environment variables are set', () => {
      const config = getGitHubConfigFromEnv()
      expect(config).toBeNull()
    })

    it('extracts config from GITHUB_* variables', () => {
      process.env.GITHUB_TOKEN = 'ghp_test123'
      process.env.GITHUB_REPO_OWNER = 'myowner'
      process.env.GITHUB_REPO_NAME = 'myrepo'

      const config = getGitHubConfigFromEnv()
      
      expect(config).toEqual({
        token: 'ghp_test123',
        owner: 'myowner',
        repo: 'myrepo',
      })
    })

    it('falls back to APP_FACTORY_* variables', () => {
      process.env.GITHUB_PAT = 'ghp_alt'
      process.env.APP_FACTORY_REPO_OWNER = 'altowner'
      process.env.APP_FACTORY_REPO_NAME = 'altrepo'

      const config = getGitHubConfigFromEnv()
      
      expect(config).toEqual({
        token: 'ghp_alt',
        owner: 'altowner',
        repo: 'altrepo',
      })
    })

    it('prefers GITHUB_* over APP_FACTORY_* variables', () => {
      process.env.GITHUB_TOKEN = 'primary'
      process.env.GITHUB_PAT = 'secondary'
      process.env.GITHUB_REPO_OWNER = 'primary-owner'
      process.env.APP_FACTORY_REPO_OWNER = 'secondary-owner'
      process.env.GITHUB_REPO_NAME = 'primary-repo'
      process.env.APP_FACTORY_REPO_NAME = 'secondary-repo'

      const config = getGitHubConfigFromEnv()
      
      expect(config?.token).toBe('primary')
      expect(config?.owner).toBe('primary-owner')
      expect(config?.repo).toBe('primary-repo')
    })

    it('returns null if any required variable is missing', () => {
      process.env.GITHUB_TOKEN = 'ghp_test'
      process.env.GITHUB_REPO_OWNER = 'owner'
      // Missing GITHUB_REPO_NAME

      const config = getGitHubConfigFromEnv()
      expect(config).toBeNull()
    })
  })
})
