import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  analyzePrompt,
  getImprovementStats,
  clearSuggestionHistory,
} from '../services/suggestionStore'

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

describe('suggestionStore', () => {
  beforeEach(() => {
    localStorageMock.clear()
    clearSuggestionHistory()
  })

  describe('analyzePrompt', () => {
    it('should analyze a basic prompt', () => {
      const analysis = analyzePrompt({
        promptId: 'test-prompt',
        promptContent: 'Help me write an email',
      })

      expect(analysis.promptId).toBe('test-prompt')
      expect(analysis.overallScore).toBeGreaterThanOrEqual(0)
      expect(analysis.overallScore).toBeLessThanOrEqual(100)
      expect(analysis.categories).toBeDefined()
      expect(analysis.suggestions).toBeDefined()
    })

    it('should identify role definition in prompt', () => {
      const promptWithRole = analyzePrompt({
        promptId: 'test-1',
        promptContent: 'You are a helpful assistant. Help me with my task.',
      })

      const promptWithoutRole = analyzePrompt({
        promptId: 'test-2',
        promptContent: 'Help me with my task.',
      })

      expect(promptWithRole.overallScore).toBeGreaterThan(promptWithoutRole.overallScore)
      expect(promptWithRole.strengths).toContain('Clear role definition')
    })

    it('should identify constraints in prompt', () => {
      const analysis = analyzePrompt({
        promptId: 'test-prompt',
        promptContent: 'Keep your response under 100 words. Avoid using technical jargon.',
      })

      expect(analysis.strengths).toContain('Specific constraints included')
    })

    it('should identify output format specification', () => {
      const analysis = analyzePrompt({
        promptId: 'test-prompt',
        promptContent: 'Output format: JSON with keys "name" and "description"',
      })

      expect(analysis.strengths).toContain('Output format specified')
    })

    it('should generate suggestions for missing elements', () => {
      const analysis = analyzePrompt({
        promptId: 'test-prompt',
        promptContent: 'Do something for me.',
      })

      expect(analysis.suggestions.length).toBeGreaterThan(0)
      expect(analysis.weaknesses).toContain('Missing role definition')
    })

    it('should return category scores', () => {
      const analysis = analyzePrompt({
        promptId: 'test-prompt',
        promptContent: 'You are an expert writer. Write a blog post about AI.',
      })

      expect(analysis.categories.length).toBe(5)
      
      const clarity = analysis.categories.find((c) => c.name === 'Clarity')
      expect(clarity).toBeDefined()
      expect(clarity?.score).toBeGreaterThan(0)
    })

    it('should score well-structured prompts higher', () => {
      const wellStructured = analyzePrompt({
        promptId: 'test-1',
        promptContent: `You are an expert technical writer.

Task: Write documentation for a REST API endpoint.

Constraints:
- Keep explanations concise
- Include example requests and responses
- Use markdown formatting

Output Format: Markdown with code blocks`,
      })

      const poorlyStructured = analyzePrompt({
        promptId: 'test-2',
        promptContent: 'write docs',
      })

      expect(wellStructured.overallScore).toBeGreaterThan(poorlyStructured.overallScore)
    })
  })

  describe('suggestion types', () => {
    it('should suggest adding role definition', () => {
      const analysis = analyzePrompt({
        promptId: 'test-prompt',
        promptContent: 'Help me write an email to a customer.',
      })

      const roleSuggestion = analysis.suggestions.find((s) => s.type === 'clarity' && s.title.includes('role'))
      expect(roleSuggestion).toBeDefined()
    })

    it('should suggest adding constraints', () => {
      const analysis = analyzePrompt({
        promptId: 'test-prompt',
        promptContent: 'You are a helpful assistant. Write me a story.',
      })

      const constraintSuggestion = analysis.suggestions.find((s) => s.type === 'constraints')
      expect(constraintSuggestion).toBeDefined()
    })

    it('should suggest output format', () => {
      const analysis = analyzePrompt({
        promptId: 'test-prompt',
        promptContent: 'You are a data analyst. Analyze this data.',
      })

      const formatSuggestion = analysis.suggestions.find((s) => s.type === 'output_format')
      expect(formatSuggestion).toBeDefined()
    })
  })

  describe('getImprovementStats', () => {
    it('should return improvement statistics', () => {
      analyzePrompt({
        promptId: 'test-1',
        promptContent: 'Help me',
      })
      analyzePrompt({
        promptId: 'test-2',
        promptContent: 'You are an expert. Help me with this task.',
      })

      const stats = getImprovementStats()

      expect(stats.totalSuggestions).toBeGreaterThanOrEqual(0)
      expect(stats.commonIssues).toBeDefined()
    })
  })

  describe('strengths and weaknesses', () => {
    it('should identify strengths correctly', () => {
      const analysis = analyzePrompt({
        promptId: 'test-prompt',
        promptContent: `You are an expert programmer.

Task: Review this code for bugs.

Constraints:
- Focus on security issues
- Keep feedback actionable

For example:
- If you find a SQL injection, explain how to fix it.

Output Format: Markdown list`,
      })

      expect(analysis.strengths).toContain('Clear role definition')
      expect(analysis.strengths).toContain('Specific constraints included')
      expect(analysis.strengths).toContain('Output format specified')
      expect(analysis.strengths).toContain('Examples provided')
    })

    it('should identify weaknesses correctly', () => {
      const analysis = analyzePrompt({
        promptId: 'test-prompt',
        promptContent: 'Do it.',
      })

      expect(analysis.weaknesses).toContain('Missing role definition')
      expect(analysis.weaknesses).toContain('Task not clearly defined')
      expect(analysis.weaknesses).toContain('Prompt may be too brief')
    })
  })
})
