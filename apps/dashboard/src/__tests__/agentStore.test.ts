import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the JSON imports
vi.mock('../data/agents.json', () => ({
  default: {
    Agents: [
      { name: 'Researcher', role: 'system', description: 'Finds information' },
      { name: 'Engineer', role: 'system', description: 'Writes code' },
    ],
  },
}))

vi.mock('../data/agents2.json', () => ({
  default: {
    Agents: [
      { name: 'Critic', role: 'system', description: 'Reviews output' },
    ],
  },
}))

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

// Need to import after mocks are set up
import { listAgents, upsertAgent, deleteAgent, type AgentDefinition } from '../services/agentStore'

describe('agentStore', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  describe('listAgents', () => {
    it('returns base agents from JSON files', () => {
      const agents = listAgents()
      
      expect(agents.length).toBeGreaterThanOrEqual(3)
      expect(agents.some(a => a.name === 'Researcher')).toBe(true)
      expect(agents.some(a => a.name === 'Engineer')).toBe(true)
      expect(agents.some(a => a.name === 'Critic')).toBe(true)
    })

    it('includes normalized agent properties', () => {
      const agents = listAgents()
      const researcher = agents.find(a => a.name === 'Researcher')
      
      expect(researcher).toBeDefined()
      expect(researcher?.role).toBe('system')
      expect(researcher?.description).toBe('Finds information')
    })
  })

  describe('upsertAgent', () => {
    it('adds a new custom agent', () => {
      const newAgent: AgentDefinition = {
        name: 'CustomAgent',
        role: 'user',
        description: 'A custom agent',
      }

      const result = upsertAgent(newAgent)
      
      expect(result.some(a => a.name === 'CustomAgent')).toBe(true)
      expect(localStorageMock.setItem).toHaveBeenCalled()
    })

    it('updates an existing agent', () => {
      const customAgent: AgentDefinition = {
        name: 'TestAgent',
        role: 'system',
        description: 'Original description',
      }

      upsertAgent(customAgent)

      const updatedAgent: AgentDefinition = {
        name: 'TestAgent',
        role: 'system',
        description: 'Updated description',
      }

      const result = upsertAgent(updatedAgent)
      const found = result.find(a => a.name === 'TestAgent')
      
      expect(found?.description).toBe('Updated description')
    })
  })

  describe('deleteAgent', () => {
    it('removes a custom agent', () => {
      const customAgent: AgentDefinition = {
        name: 'ToDelete',
        role: 'system',
        description: 'Will be deleted',
      }

      upsertAgent(customAgent)
      const afterAdd = listAgents()
      expect(afterAdd.some(a => a.name === 'ToDelete')).toBe(true)

      deleteAgent('ToDelete')
      const afterDelete = listAgents()
      expect(afterDelete.some(a => a.name === 'ToDelete')).toBe(false)
    })

    it('handles case-insensitive deletion', () => {
      const customAgent: AgentDefinition = {
        name: 'CaseSensitive',
        role: 'system',
        description: 'Test case sensitivity',
      }

      upsertAgent(customAgent)
      deleteAgent('casesensitive')  // lowercase
      
      const agents = listAgents()
      expect(agents.some(a => a.name === 'CaseSensitive')).toBe(false)
    })
  })

  describe('agent normalization', () => {
    it('provides default values for missing properties', () => {
      const minimalAgent: AgentDefinition = {
        name: 'Minimal',
      }

      const result = upsertAgent(minimalAgent)
      const found = result.find(a => a.name === 'Minimal')

      expect(found?.role).toBe('system')
      expect(found?.prompt).toBe('')
      expect(found?.description).toBe('')
      expect(found?.meta).toEqual({})
    })
  })
})
