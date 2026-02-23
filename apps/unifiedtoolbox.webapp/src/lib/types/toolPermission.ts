/**
 * toolPermission.ts
 * Types for the Phase 4 tool enablement + least-privilege + audit system.
 *
 * Each tool recommended by a Proposal must be explicitly enabled by the user
 * with a scope (read | write) and optional path allowlist before a run starts.
 * The resulting ToolPermission[] is frozen as a ToolAuditEntry at run start.
 */

export type ToolAccess = 'read' | 'write'

export interface ToolPermission {
  name: string
  /** Whether the user has explicitly enabled this tool. Default: false (least privilege). */
  enabled: boolean
  /** Access level. Default: 'read' (least privilege). */
  access: ToolAccess
  /** Path prefix/glob patterns restricting tool scope. Empty = unrestricted. */
  pathAllowlist: string[]
  /** ISO timestamp set when the run starts (frozen). Undefined until run starts. */
  enabledAt?: string
}

export interface ToolAuditEntry {
  /** Primary key — equals proposalId. */
  id: string
  proposalId: string
  /** Set once the run is launched. */
  runId?: string
  startedAt: string
  tools: ToolPermission[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const WRITE_PREFIXES = [
  'write_',
  'create_',
  'delete_',
  'update_',
  'modify_',
  'execute_',
  'run_',
  'push_',
  'patch_',
  'rm_',
  'move_',
]

/**
 * Infer likely access level from tool name (used for UI warning only;
 * user can override before the run starts).
 */
export function inferToolAccess(name: string): ToolAccess {
  const lower = name.toLowerCase()
  return WRITE_PREFIXES.some((p) => lower.startsWith(p)) ? 'write' : 'read'
}

/**
 * Build a least-privilege default permission for a tool:
 * disabled, read-only, no path restrictions.
 */
export function defaultToolPermission(name: string): ToolPermission {
  return { name, enabled: false, access: 'read', pathAllowlist: [] }
}
