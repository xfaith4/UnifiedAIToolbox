import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  trackPromptExecution,
  getAnalyticsSummary,
  getAnalyticsTimeSeries,
  getAnalyticsByProvider,
  getAnalyticsByModel,
  clearAnalytics,
} from '../services/analyticsStore'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(global, 'localStorage', { value: localStorageMock })

describe('analyticsStore', () => {
  beforeEach(() => {
    localStorageMock.clear()
    clearAnalytics()
  })

  describe('trackPromptExecution', () => {
    it('should track a prompt execution event', () => {
      const event = {
        promptId: 'test-prompt',
        promptTitle: 'Test Prompt',
        provider: 'openai',
        model: 'gpt-4',
        timestamp: new Date().toISOString(),
        responseTimeMs: 1500,
        promptTokens: 100,
        completionTokens: 50,
        cost: 0.002,
        success: true,
      }

      trackPromptExecution(event)
      const summary = getAnalyticsSummary(30)

      expect(summary.totalExecutions).toBe(1)
      expect(summary.successRate).toBe(1)
    })

    it('should calculate success rate correctly', () => {
      const baseEvent = {
        promptId: 'test-prompt',
        promptTitle: 'Test Prompt',
        provider: 'openai',
        model: 'gpt-4',
        timestamp: new Date().toISOString(),
        responseTimeMs: 1500,
        promptTokens: 100,
        completionTokens: 50,
        cost: 0.002,
      }

      trackPromptExecution({ ...baseEvent, success: true })
      trackPromptExecution({ ...baseEvent, success: true })
      trackPromptExecution({ ...baseEvent, success: false })
      trackPromptExecution({ ...baseEvent, success: true })

      const summary = getAnalyticsSummary(30)

      expect(summary.totalExecutions).toBe(4)
      expect(summary.successRate).toBe(0.75)
    })
  })

  describe('getAnalyticsSummary', () => {
    it('should return empty summary when no events', () => {
      const summary = getAnalyticsSummary(30)

      expect(summary.totalExecutions).toBe(0)
      expect(summary.successRate).toBe(0)
      expect(summary.avgResponseTime).toBe(0)
      expect(summary.totalCost).toBe(0)
      expect(summary.uniquePromptsUsed).toBe(0)
    })

    it('should calculate average response time', () => {
      const baseEvent = {
        promptId: 'test-prompt',
        promptTitle: 'Test Prompt',
        provider: 'openai',
        model: 'gpt-4',
        timestamp: new Date().toISOString(),
        promptTokens: 100,
        completionTokens: 50,
        cost: 0.002,
        success: true,
      }

      trackPromptExecution({ ...baseEvent, responseTimeMs: 1000 })
      trackPromptExecution({ ...baseEvent, responseTimeMs: 2000 })

      const summary = getAnalyticsSummary(30)

      expect(summary.avgResponseTime).toBe(1500)
    })

    it('should calculate total cost', () => {
      const baseEvent = {
        promptId: 'test-prompt',
        promptTitle: 'Test Prompt',
        provider: 'openai',
        model: 'gpt-4',
        timestamp: new Date().toISOString(),
        responseTimeMs: 1500,
        promptTokens: 100,
        completionTokens: 50,
        success: true,
      }

      trackPromptExecution({ ...baseEvent, cost: 0.001 })
      trackPromptExecution({ ...baseEvent, cost: 0.002 })
      trackPromptExecution({ ...baseEvent, cost: 0.003 })

      const summary = getAnalyticsSummary(30)

      expect(summary.totalCost).toBe(0.006)
    })
  })

  describe('getAnalyticsTimeSeries', () => {
    it('should return empty array when no events', () => {
      const timeSeries = getAnalyticsTimeSeries(30)
      expect(timeSeries).toEqual([])
    })

    it('should group events by time period', () => {
      const today = new Date()
      const event = {
        promptId: 'test-prompt',
        promptTitle: 'Test Prompt',
        provider: 'openai',
        model: 'gpt-4',
        timestamp: today.toISOString(),
        responseTimeMs: 1500,
        promptTokens: 100,
        completionTokens: 50,
        cost: 0.002,
        success: true,
      }

      trackPromptExecution(event)
      trackPromptExecution(event)

      const timeSeries = getAnalyticsTimeSeries(30, 'day')

      expect(timeSeries.length).toBeGreaterThan(0)
      expect(timeSeries[0].executionCount).toBe(2)
    })
  })

  describe('getAnalyticsByProvider', () => {
    it('should group by provider', () => {
      const baseEvent = {
        promptId: 'test-prompt',
        promptTitle: 'Test Prompt',
        model: 'gpt-4',
        timestamp: new Date().toISOString(),
        responseTimeMs: 1500,
        promptTokens: 100,
        completionTokens: 50,
        cost: 0.002,
        success: true,
      }

      trackPromptExecution({ ...baseEvent, provider: 'openai' })
      trackPromptExecution({ ...baseEvent, provider: 'openai' })
      trackPromptExecution({ ...baseEvent, provider: 'anthropic' })

      const byProvider = getAnalyticsByProvider(30)

      expect(byProvider.length).toBe(2)
      const openai = byProvider.find((p) => p.provider === 'openai')
      const anthropic = byProvider.find((p) => p.provider === 'anthropic')

      expect(openai?.executionCount).toBe(2)
      expect(anthropic?.executionCount).toBe(1)
    })
  })

  describe('getAnalyticsByModel', () => {
    it('should group by model', () => {
      const baseEvent = {
        promptId: 'test-prompt',
        promptTitle: 'Test Prompt',
        provider: 'openai',
        timestamp: new Date().toISOString(),
        responseTimeMs: 1500,
        promptTokens: 100,
        completionTokens: 50,
        cost: 0.002,
        success: true,
      }

      trackPromptExecution({ ...baseEvent, model: 'gpt-4' })
      trackPromptExecution({ ...baseEvent, model: 'gpt-4' })
      trackPromptExecution({ ...baseEvent, model: 'gpt-3.5-turbo' })

      const byModel = getAnalyticsByModel(30)

      expect(byModel.length).toBe(2)
      const gpt4 = byModel.find((m) => m.model === 'gpt-4')
      const gpt35 = byModel.find((m) => m.model === 'gpt-3.5-turbo')

      expect(gpt4?.executionCount).toBe(2)
      expect(gpt35?.executionCount).toBe(1)
    })
  })
})
