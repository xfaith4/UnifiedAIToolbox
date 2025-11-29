import { describe, it, expect, beforeEach, vi } from 'vitest'
import { normalizePrompt, nowIso, parseImportedPrompt } from '../services/promptStore'

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

describe('promptStore', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  describe('nowIso', () => {
    it('returns a valid ISO date string', () => {
      const result = nowIso()
      expect(typeof result).toBe('string')
      expect(new Date(result).toISOString()).toBe(result)
    })
  })

  describe('normalizePrompt', () => {
    it('normalizes a minimal prompt input', () => {
      const input = {
        id: 'test-prompt',
        title: 'Test Title',
        template: 'Hello {{name}}',
      }

      const result = normalizePrompt(input)

      expect(result.id).toBe('test-prompt')
      expect(result.title).toBe('Test Title')
      expect(result.template).toBe('Hello {{name}}')
      expect(result.role).toBe('system')
      expect(result.temperature).toBe(0.2)
      expect(result.top_p).toBe(1)
    })

    it('uses default title when missing', () => {
      const input = {
        template: 'Some template',
      }

      const result = normalizePrompt(input)

      expect(result.title).toBe('Untitled Prompt')
    })

    it('normalizes tags from multiple sources', () => {
      const input = {
        title: 'Tagged Prompt',
        template: 'Template',
        tags: ['tag1', 'tag2'],
        category: 'test-category',
      }

      const result = normalizePrompt(input)

      expect(result.tags).toContain('tag1')
      expect(result.tags).toContain('tag2')
      expect(result.tags).toContain('test-category')
    })

    it('normalizes variables from array format', () => {
      const input = {
        title: 'Variable Prompt',
        template: 'Hello {{name}}',
        variables: [
          { name: 'name', type: 'string', required: true },
          { name: 'count', type: 'number', default: '5' },
        ],
      }

      const result = normalizePrompt(input)

      expect(result.variables).toHaveLength(2)
      expect(result.variables?.[0]).toMatchObject({
        name: 'name',
        type: 'string',
        required: true,
      })
    })

    it('handles blocks property', () => {
      const input = {
        title: 'Block Prompt',
        prompt: {
          system: 'You are an assistant',
          instructions: 'Follow these steps',
          constraints: 'Keep it brief',
        },
      }

      const result = normalizePrompt(input)

      expect(result.blocks).toBeDefined()
      expect(result.blocks?.system).toBe('You are an assistant')
      expect(result.blocks?.instructions).toBe('Follow these steps')
      expect(result.blocks?.constraints).toBe('Keep it brief')
    })
  })

  describe('parseImportedPrompt', () => {
    it('returns null for non-object input', () => {
      expect(parseImportedPrompt(null)).toBeNull()
      expect(parseImportedPrompt(undefined)).toBeNull()
      expect(parseImportedPrompt('string')).toBeNull()
      expect(parseImportedPrompt(123)).toBeNull()
    })

    it('parses a full prompt object', () => {
      const input = {
        title: 'Imported Prompt',
        template: 'Some template',
        description: 'A description',
        category: 'general',
      }

      const result = parseImportedPrompt(input)

      expect(result).not.toBeNull()
      expect(result?.title).toBe('Imported Prompt')
      expect(result?.template).toBe('Some template')
    })

    it('parses minimal prompt with just prompt field', () => {
      const input = {
        prompt: 'This is the prompt text',
        title: 'Simple Prompt',
      }

      const result = parseImportedPrompt(input)

      expect(result).not.toBeNull()
      expect(result?.template).toBe('This is the prompt text')
      expect(result?.title).toBe('Simple Prompt')
    })

    it('returns null for empty object without recognized fields', () => {
      const input = {
        someRandomField: 'value',
      }

      const result = parseImportedPrompt(input)

      expect(result).toBeNull()
    })
  })
})
