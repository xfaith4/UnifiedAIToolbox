'use client'

import type { ToolAuditEntry } from '@/lib/types/toolPermission'

const TOOL_AUDIT_KEY = 'concierge.tool-audits.v1'

// ── Helpers ───────────────────────────────────────────────────────────────────

function load(): ToolAuditEntry[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(TOOL_AUDIT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ToolAuditEntry[]) : []
  } catch {
    return []
  }
}

function save(entries: ToolAuditEntry[]): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(TOOL_AUDIT_KEY, JSON.stringify(entries))
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export function listToolAudits(): ToolAuditEntry[] {
  return load()
}

export function getToolAudit(id: string): ToolAuditEntry | undefined {
  return load().find((e) => e.id === id)
}

/**
 * Upsert a ToolAuditEntry by id.
 * If an entry with the same id already exists it is replaced.
 */
export function saveToolAudit(entry: ToolAuditEntry): ToolAuditEntry {
  const existing = load()
  const idx = existing.findIndex((e) => e.id === entry.id)
  const updated =
    idx >= 0
      ? existing.map((e) => (e.id === entry.id ? entry : e))
      : [entry, ...existing]
  save(updated)
  return entry
}
