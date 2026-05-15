/**
 * A2A (Agent-to-Agent) envelope types and validators.
 *
 * Source of truth (human-readable): docs/contracts/A2A_CONTRACT.md
 * Source of truth (runtime): this file.
 *
 * Pure, no IO, safe to import from server or browser.
 */

import { classifyBlocker, type BlockerSeverity } from './decisionLock'

export const A2A_ENVELOPE_VERSION = '1.0.0'

export type RunStatus =
  | 'queued'
  | 'running'
  | 'waiting_on_input'
  | 'recovering'
  | 'blocked'
  | 'validating'
  | 'completed'
  | 'failed'

export const RUN_STATUSES: readonly RunStatus[] = [
  'queued',
  'running',
  'waiting_on_input',
  'recovering',
  'blocked',
  'validating',
  'completed',
  'failed',
] as const

export type A2AIntent =
  | 'request'
  | 'response'
  | 'progress'
  | 'blocker'
  | 'final'
  | 'handoff'
  | 'recovery'

export const A2A_INTENTS: readonly A2AIntent[] = [
  'request',
  'response',
  'progress',
  'blocker',
  'final',
  'handoff',
  'recovery',
] as const

export type EvidenceKind = 'url' | 'doc' | 'file' | 'tool_output' | 'search_result'

export interface EvidenceRef {
  kind: EvidenceKind
  uri: string
  title?: string
  captured_at?: string
}

export interface ArtifactRef {
  path: string
  kind?: string
  bytes?: number
  sha256?: string
  produced_by?: string
}

export interface Blocker {
  severity: BlockerSeverity
  code: string
  summary: string
  details?: string
  needed_from?: string
  options?: string[]
}

export type RecoveryStrategy =
  | 'retry'
  | 'retry_with_changes'
  | 'skip'
  | 'escalate'
  | 'abort'

export const RECOVERY_STRATEGIES: readonly RecoveryStrategy[] = [
  'retry',
  'retry_with_changes',
  'skip',
  'escalate',
  'abort',
] as const

export interface Recovery {
  strategy: RecoveryStrategy
  rationale?: string
  changes?: string[]
  attempt_budget_remaining?: number
}

export type ValidationStatus = 'passed' | 'failed' | 'partial' | 'deferred' | 'pending'

export const VALIDATION_STATUSES: readonly ValidationStatus[] = [
  'passed',
  'failed',
  'partial',
  'deferred',
  'pending',
] as const

export interface FinalAnswer {
  requested_objective: string
  completed_deliverables: string[]
  incomplete_items: string[]
  assumptions_used: string[]
  blockers_encountered: Blocker[]
  artifacts_created: ArtifactRef[]
  validation_status: ValidationStatus
  recommended_next_step: string
}

export interface A2AEnvelope {
  envelope_version: string
  message_id: string
  correlation_id?: string
  run_id: string
  attempt_id?: string
  from_agent: string
  to_agent: string
  intent: A2AIntent
  status: RunStatus
  ts: string
  evidence_refs?: EvidenceRef[]
  artifact_refs?: ArtifactRef[]
  blocker?: Blocker
  recovery?: Recovery
  final?: FinalAnswer
  payload: Record<string, unknown>
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  envelope?: A2AEnvelope
}

// ---------- helpers ----------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

function isIsoDateString(v: unknown): v is string {
  if (typeof v !== 'string' || v.length === 0) return false
  const ms = Date.parse(v)
  return Number.isFinite(ms)
}

function isSemver(v: unknown): v is string {
  return typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v)
}

function pushIf(errors: string[], cond: boolean, msg: string): void {
  if (cond) errors.push(msg)
}

function validateBlocker(b: unknown, prefix: string, errors: string[]): void {
  if (!isObject(b)) {
    errors.push(`${prefix} must be an object`)
    return
  }
  pushIf(errors, !isNonEmptyString(b.code), `${prefix}.code is required (non-empty string)`)
  pushIf(errors, !isNonEmptyString(b.summary), `${prefix}.summary is required (non-empty string)`)
  if (b.severity !== undefined && !['hard_blocker', 'soft_blocker', 'clarification_needed', 'non_blocking_gap'].includes(String(b.severity))) {
    errors.push(`${prefix}.severity must be one of hard_blocker|soft_blocker|clarification_needed|non_blocking_gap`)
  }
}

function validateRecovery(r: unknown, prefix: string, errors: string[]): void {
  if (!isObject(r)) {
    errors.push(`${prefix} must be an object`)
    return
  }
  if (!RECOVERY_STRATEGIES.includes(r.strategy as RecoveryStrategy)) {
    errors.push(`${prefix}.strategy must be one of ${RECOVERY_STRATEGIES.join('|')}`)
  }
}

function validateFinal(f: unknown, prefix: string, errors: string[]): void {
  if (!isObject(f)) {
    errors.push(`${prefix} must be an object`)
    return
  }
  const required = [
    'requested_objective',
    'completed_deliverables',
    'incomplete_items',
    'assumptions_used',
    'blockers_encountered',
    'artifacts_created',
    'validation_status',
    'recommended_next_step',
  ]
  for (const k of required) {
    if (!(k in f)) errors.push(`${prefix}.${k} is required`)
  }
  if ('validation_status' in f && !VALIDATION_STATUSES.includes(f.validation_status as ValidationStatus)) {
    errors.push(`${prefix}.validation_status must be one of ${VALIDATION_STATUSES.join('|')}`)
  }
  for (const arrKey of ['completed_deliverables', 'incomplete_items', 'assumptions_used', 'blockers_encountered', 'artifacts_created']) {
    if (arrKey in f && !Array.isArray((f as Record<string, unknown>)[arrKey])) {
      errors.push(`${prefix}.${arrKey} must be an array`)
    }
  }
}

// ---------- public API ----------

/**
 * Validate an A2A envelope object. Pure, no IO.
 *
 * Returns { valid, errors, envelope? }. When valid, `envelope` is the input
 * narrowed to A2AEnvelope (no mutation, no defaulting).
 */
export function validateA2AEnvelope(input: unknown): ValidationResult {
  const errors: string[] = []

  if (!isObject(input)) {
    return { valid: false, errors: ['envelope must be an object'] }
  }

  pushIf(errors, !isSemver(input.envelope_version), 'envelope_version must be semver (e.g. "1.0.0")')
  pushIf(errors, !isNonEmptyString(input.message_id), 'message_id is required (non-empty string)')
  pushIf(errors, !isNonEmptyString(input.run_id), 'run_id is required (non-empty string)')
  pushIf(errors, !isNonEmptyString(input.from_agent), 'from_agent is required (non-empty string)')
  pushIf(errors, !isNonEmptyString(input.to_agent), 'to_agent is required (non-empty string)')
  pushIf(errors, !isIsoDateString(input.ts), 'ts is required (ISO-8601 string)')

  if (!A2A_INTENTS.includes(input.intent as A2AIntent)) {
    errors.push(`intent must be one of ${A2A_INTENTS.join('|')}`)
  }
  if (!RUN_STATUSES.includes(input.status as RunStatus)) {
    errors.push(`status must be one of ${RUN_STATUSES.join('|')}`)
  }
  if (!isObject(input.payload)) {
    errors.push('payload must be an object (may be empty)')
  }

  // Intent-specific requirements
  if (input.intent === 'blocker') {
    if (input.blocker === undefined) {
      errors.push('blocker is required when intent="blocker"')
    } else {
      validateBlocker(input.blocker, 'blocker', errors)
    }
  } else if (input.blocker !== undefined) {
    validateBlocker(input.blocker, 'blocker', errors)
  }

  if (input.intent === 'recovery') {
    if (input.recovery === undefined) {
      errors.push('recovery is required when intent="recovery"')
    } else {
      validateRecovery(input.recovery, 'recovery', errors)
    }
  } else if (input.recovery !== undefined) {
    validateRecovery(input.recovery, 'recovery', errors)
  }

  if (input.intent === 'final') {
    if (input.final === undefined) {
      errors.push('final is required when intent="final"')
    } else {
      validateFinal(input.final, 'final', errors)
    }
  } else if (input.final !== undefined) {
    validateFinal(input.final, 'final', errors)
  }

  if (errors.length) return { valid: false, errors }
  return { valid: true, errors: [], envelope: input as unknown as A2AEnvelope }
}

/**
 * Re-export of the decision-lock classifier, so consumers only need to import
 * from one module.
 */
export { classifyBlocker }
export type { BlockerSeverity }

/**
 * Build (and assert) a Run Success Contract.
 *
 * Throws if any required field is missing or shaped wrong. Returns the
 * narrowed FinalAnswer on success.
 */
export function buildRunSuccessContract(input: {
  requested_objective: string
  completed_deliverables: string[]
  incomplete_items: string[]
  assumptions_used: string[]
  blockers_encountered: Blocker[]
  artifacts_created: ArtifactRef[]
  validation_status: ValidationStatus
  recommended_next_step: string
}): FinalAnswer {
  const errors: string[] = []
  pushIf(errors, !isNonEmptyString(input?.requested_objective), 'requested_objective is required')
  pushIf(errors, !Array.isArray(input?.completed_deliverables), 'completed_deliverables must be an array')
  pushIf(errors, !Array.isArray(input?.incomplete_items), 'incomplete_items must be an array')
  pushIf(errors, !Array.isArray(input?.assumptions_used), 'assumptions_used must be an array')
  pushIf(errors, !Array.isArray(input?.blockers_encountered), 'blockers_encountered must be an array')
  pushIf(errors, !Array.isArray(input?.artifacts_created), 'artifacts_created must be an array')
  pushIf(errors, !VALIDATION_STATUSES.includes(input?.validation_status), `validation_status must be one of ${VALIDATION_STATUSES.join('|')}`)
  pushIf(errors, !isNonEmptyString(input?.recommended_next_step), 'recommended_next_step is required')

  if (errors.length) {
    throw new Error(`buildRunSuccessContract: invalid input: ${errors.join('; ')}`)
  }

  return {
    requested_objective: input.requested_objective,
    completed_deliverables: [...input.completed_deliverables],
    incomplete_items: [...input.incomplete_items],
    assumptions_used: [...input.assumptions_used],
    blockers_encountered: [...input.blockers_encountered],
    artifacts_created: [...input.artifacts_created],
    validation_status: input.validation_status,
    recommended_next_step: input.recommended_next_step,
  }
}
