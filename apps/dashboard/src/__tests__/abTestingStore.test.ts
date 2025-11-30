import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createABTest,
  getABTests,
  getABTest,
  updateABTestStatus,
  deleteABTest,
  getVariantAssignment,
  recordVariantMetric,
  getABTestResults,
  clearABTests,
} from '../services/abTestingStore'

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

describe('abTestingStore', () => {
  beforeEach(() => {
    localStorageMock.clear()
    clearABTests()
  })

  describe('createABTest', () => {
    it('should create a new A/B test', () => {
      const test = createABTest({
        name: 'Test Experiment',
        description: 'Testing prompt variations',
        controlPromptId: 'prompt-1',
        treatmentPromptIds: ['prompt-2'],
        trafficSplit: [50, 50],
      })

      expect(test.id).toBeDefined()
      expect(test.name).toBe('Test Experiment')
      expect(test.status).toBe('draft')
      expect(test.controlVariant.promptId).toBe('prompt-1')
      expect(test.treatmentVariants).toHaveLength(1)
      expect(test.treatmentVariants[0].promptId).toBe('prompt-2')
    })

    it('should set default traffic weights', () => {
      const test = createABTest({
        name: 'Test',
        description: 'Test',
        controlPromptId: 'prompt-1',
        treatmentPromptIds: ['prompt-2'],
        trafficSplit: [],
      })

      expect(test.controlVariant.trafficWeight).toBe(50)
      expect(test.treatmentVariants[0].trafficWeight).toBe(50)
    })
  })

  describe('getABTests', () => {
    it('should return all tests', () => {
      createABTest({
        name: 'Test 1',
        description: 'Test 1',
        controlPromptId: 'prompt-1',
        treatmentPromptIds: ['prompt-2'],
        trafficSplit: [50, 50],
      })
      createABTest({
        name: 'Test 2',
        description: 'Test 2',
        controlPromptId: 'prompt-3',
        treatmentPromptIds: ['prompt-4'],
        trafficSplit: [50, 50],
      })

      const tests = getABTests()

      expect(tests).toHaveLength(2)
    })

    it('should filter by status', () => {
      const test = createABTest({
        name: 'Test',
        description: 'Test',
        controlPromptId: 'prompt-1',
        treatmentPromptIds: ['prompt-2'],
        trafficSplit: [50, 50],
      })
      updateABTestStatus(test.id, 'running')

      const runningTests = getABTests('running')
      const draftTests = getABTests('draft')

      expect(runningTests).toHaveLength(1)
      expect(draftTests).toHaveLength(0)
    })
  })

  describe('updateABTestStatus', () => {
    it('should update test status', () => {
      const test = createABTest({
        name: 'Test',
        description: 'Test',
        controlPromptId: 'prompt-1',
        treatmentPromptIds: ['prompt-2'],
        trafficSplit: [50, 50],
      })

      const updated = updateABTestStatus(test.id, 'running')

      expect(updated?.status).toBe('running')
      expect(updated?.startDate).toBeDefined()
    })

    it('should set end date when completed', () => {
      const test = createABTest({
        name: 'Test',
        description: 'Test',
        controlPromptId: 'prompt-1',
        treatmentPromptIds: ['prompt-2'],
        trafficSplit: [50, 50],
      })
      updateABTestStatus(test.id, 'running')

      const completed = updateABTestStatus(test.id, 'completed')

      expect(completed?.endDate).toBeDefined()
    })
  })

  describe('deleteABTest', () => {
    it('should delete a test', () => {
      const test = createABTest({
        name: 'Test',
        description: 'Test',
        controlPromptId: 'prompt-1',
        treatmentPromptIds: ['prompt-2'],
        trafficSplit: [50, 50],
      })

      const result = deleteABTest(test.id)

      expect(result).toBe(true)
      expect(getABTest(test.id)).toBeUndefined()
    })

    it('should return false for non-existent test', () => {
      const result = deleteABTest('non-existent-id')

      expect(result).toBe(false)
    })
  })

  describe('getVariantAssignment', () => {
    it('should return null for non-running tests', () => {
      const test = createABTest({
        name: 'Test',
        description: 'Test',
        controlPromptId: 'prompt-1',
        treatmentPromptIds: ['prompt-2'],
        trafficSplit: [50, 50],
      })

      const assignment = getVariantAssignment(test.id)

      expect(assignment).toBeNull()
    })

    it('should return assignment for running tests', () => {
      const test = createABTest({
        name: 'Test',
        description: 'Test',
        controlPromptId: 'prompt-1',
        treatmentPromptIds: ['prompt-2'],
        trafficSplit: [50, 50],
      })
      updateABTestStatus(test.id, 'running')

      const assignment = getVariantAssignment(test.id)

      expect(assignment).not.toBeNull()
      expect(assignment?.testId).toBe(test.id)
      expect(assignment?.promptId).toBeDefined()
    })

    it('should return same assignment for same session', () => {
      const test = createABTest({
        name: 'Test',
        description: 'Test',
        controlPromptId: 'prompt-1',
        treatmentPromptIds: ['prompt-2'],
        trafficSplit: [50, 50],
      })
      updateABTestStatus(test.id, 'running')

      const sessionId = 'session-123'
      const assignment1 = getVariantAssignment(test.id, sessionId)
      const assignment2 = getVariantAssignment(test.id, sessionId)

      expect(assignment1?.variantId).toBe(assignment2?.variantId)
    })
  })

  describe('recordVariantMetric', () => {
    it('should record metrics for a variant', () => {
      const test = createABTest({
        name: 'Test',
        description: 'Test',
        controlPromptId: 'prompt-1',
        treatmentPromptIds: ['prompt-2'],
        trafficSplit: [50, 50],
      })
      updateABTestStatus(test.id, 'running')
      const assignment = getVariantAssignment(test.id)

      const result = recordVariantMetric(test.id, assignment!.variantId, {
        responseTime: 1500,
        tokensUsed: 100,
        cost: 0.002,
        isConversion: true,
      })

      expect(result).toBe(true)

      const updatedTest = getABTest(test.id)
      const allVariants = [updatedTest!.controlVariant, ...updatedTest!.treatmentVariants]
      const variant = allVariants.find((v) => v.id === assignment!.variantId)

      expect(variant?.metrics.impressions).toBe(1)
      expect(variant?.metrics.conversions).toBe(1)
    })
  })

  describe('getABTestResults', () => {
    it('should return null for non-existent test', () => {
      const result = getABTestResults('non-existent-id')

      expect(result).toBeNull()
    })

    it('should return results for existing test', () => {
      const test = createABTest({
        name: 'Test',
        description: 'Test',
        controlPromptId: 'prompt-1',
        treatmentPromptIds: ['prompt-2'],
        trafficSplit: [50, 50],
      })

      const result = getABTestResults(test.id)

      expect(result).not.toBeNull()
      expect(result?.testId).toBe(test.id)
      expect(result?.variants).toHaveLength(2)
      expect(result?.recommendation).toBeDefined()
    })
  })
})
