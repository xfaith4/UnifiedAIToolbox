import { describe, it, expect, beforeEach } from 'vitest'

// ── localStorage stub ──────────────────────────────────────────────────────────
const storage: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => { storage[key] = value },
  removeItem: (key: string) => { delete storage[key] },
  clear: () => { for (const k in storage) delete storage[k] },
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })

// Import helpers and store AFTER stub is in place
import { inferToolAccess, defaultToolPermission } from '@/lib/types/toolPermission'
import type { ToolAuditEntry } from '@/lib/types/toolPermission'
import { listToolAudits, getToolAudit, saveToolAudit } from '@/lib/services/toolPermissionStore'

beforeEach(() => localStorageMock.clear())

// ── Helper ────────────────────────────────────────────────────────────────────
function makeEntry(id = 'proposal_test'): ToolAuditEntry {
  return {
    id,
    proposalId: id,
    runId: `run_${id}`,
    startedAt: new Date().toISOString(),
    tools: [
      { name: 'read_file', enabled: true, access: 'read', pathAllowlist: ['src/**'] },
      { name: 'write_file', enabled: false, access: 'read', pathAllowlist: [] },
    ],
  }
}

// ── saveToolAudit ─────────────────────────────────────────────────────────────
describe('saveToolAudit', () => {
  it('returns the saved entry', () => {
    const entry = makeEntry()
    const result = saveToolAudit(entry)
    expect(result.id).toBe(entry.id)
    expect(result.tools).toHaveLength(2)
  })

  it('upserts: second save with same id replaces the first', () => {
    const entry = makeEntry('p1')
    saveToolAudit(entry)
    const updated: ToolAuditEntry = { ...entry, runId: 'run_updated' }
    saveToolAudit(updated)
    const audits = listToolAudits()
    expect(audits).toHaveLength(1)
    expect(audits[0].runId).toBe('run_updated')
  })
})

// ── getToolAudit ──────────────────────────────────────────────────────────────
describe('getToolAudit', () => {
  it('retrieves a saved entry by id', () => {
    const entry = makeEntry('p2')
    saveToolAudit(entry)
    const found = getToolAudit('p2')
    expect(found).toBeDefined()
    expect(found?.proposalId).toBe('p2')
  })

  it('returns undefined for an unknown id', () => {
    expect(getToolAudit('nonexistent')).toBeUndefined()
  })
})

// ── listToolAudits ────────────────────────────────────────────────────────────
describe('listToolAudits', () => {
  it('returns all saved entries', () => {
    saveToolAudit(makeEntry('p3'))
    saveToolAudit(makeEntry('p4'))
    expect(listToolAudits()).toHaveLength(2)
  })

  it('returns an empty array when nothing has been saved', () => {
    expect(listToolAudits()).toEqual([])
  })
})

// ── defaultToolPermission ─────────────────────────────────────────────────────
describe('defaultToolPermission', () => {
  it('returns enabled:false, access:read, empty pathAllowlist', () => {
    const p = defaultToolPermission('write_file')
    expect(p.enabled).toBe(false)
    expect(p.access).toBe('read')
    expect(p.pathAllowlist).toEqual([])
    expect(p.name).toBe('write_file')
  })
})

// ── inferToolAccess ───────────────────────────────────────────────────────────
describe('inferToolAccess', () => {
  it('returns "write" for write_file', () => {
    expect(inferToolAccess('write_file')).toBe('write')
  })

  it('returns "read" for read_file', () => {
    expect(inferToolAccess('read_file')).toBe('read')
  })
})
