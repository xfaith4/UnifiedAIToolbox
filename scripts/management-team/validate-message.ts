#!/usr/bin/env node
/**
 * Management Team Message Validator
 * ----------------------------------
 * Zero-dependency structural validator for the Management Team inter-agent protocol.
 * Validates an envelope + payload and returns either { valid: true } or a NACK message.
 *
 * Usage (CLI):
 *   npx ts-node scripts/management-team/validate-message.ts <message.json>
 *   echo '{"schema_version":"1.0",...}' | npx ts-node scripts/management-team/validate-message.ts
 *
 * Usage (module):
 *   import { validateMessage, buildNack } from './validate-message'
 *   const result = validateMessage(msg)
 *   if (!result.valid) console.error(result.nack)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = 'Concierge' | 'Commissioner' | 'Overseer' | 'Knowledge'

type MessageType =
  | 'GoalSpec'
  | 'NeedsRequirements'
  | 'Approval'
  | 'StageReport'
  | 'VerificationReport'
  | 'KnowledgeRecord'
  | 'NACK'
  | 'ACK'

type NackReason =
  | 'missing_required_fields'
  | 'invalid_enum'
  | 'no_evidence'
  | 'contradiction'
  | 'insufficient_items'
  | 'schema_version_mismatch'
  | 'unknown_message_type'
  | 'vague_acceptance_test'

export interface ManagementTeamEnvelope {
  schema_version: string
  message_id: string
  run_id: string
  from_role: Role
  to_role: Role
  message_type: MessageType
  timestamp_utc: string
  correlation_id: string
  payload: Record<string, unknown>
}

export interface NackPayload {
  reason: NackReason
  missing_fields: string[]
  expected_schema: string
  retry_instructions: string
  rejected_message_id?: string
  rejected_message_type?: string
}

export interface NackMessage {
  schema_version: '1.0'
  message_id: string
  run_id: string
  from_role: Role
  to_role: Role
  message_type: 'NACK'
  timestamp_utc: string
  correlation_id: string
  payload: NackPayload
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; nack: NackMessage; errors: string[] }

// ─── Utility helpers ──────────────────────────────────────────────────────────

let _counter = 0
function pseudoUuid(): string {
  return `00000000-0000-4000-8000-${String(Date.now()).padStart(12, '0')}${String(++_counter).padStart(4, '0')}`.slice(0, 36)
}

function isString(v: unknown, minLen = 0): v is string {
  return typeof v === 'string' && v.length >= minLen
}

function isArray(v: unknown, minItems = 0): v is unknown[] {
  return Array.isArray(v) && v.length >= minItems
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

// ─── NACK builder ─────────────────────────────────────────────────────────────

export function buildNack(
  respondingAs: Role,
  toRole: Role,
  runId: string,
  correlationId: string,
  reason: NackReason,
  missingFields: string[],
  expectedSchema: string,
  retryInstructions: string,
  rejectedMessageId?: string,
  rejectedMessageType?: string,
): NackMessage {
  return {
    schema_version: '1.0',
    message_id: pseudoUuid(),
    run_id: runId,
    from_role: respondingAs,
    to_role: toRole,
    message_type: 'NACK',
    timestamp_utc: new Date().toISOString(),
    correlation_id: correlationId,
    payload: {
      reason,
      missing_fields: missingFields,
      expected_schema: expectedSchema,
      retry_instructions: retryInstructions,
      ...(rejectedMessageId ? { rejected_message_id: rejectedMessageId } : {}),
      ...(rejectedMessageType ? { rejected_message_type: rejectedMessageType } : {}),
    },
  }
}

// ─── Envelope validator ───────────────────────────────────────────────────────

const VALID_ROLES: Role[] = ['Concierge', 'Commissioner', 'Overseer', 'Knowledge']
const VALID_MESSAGE_TYPES: MessageType[] = [
  'GoalSpec', 'NeedsRequirements', 'Approval', 'StageReport',
  'VerificationReport', 'KnowledgeRecord', 'NACK', 'ACK',
]

function validateEnvelope(msg: unknown): { errors: string[]; envelope: ManagementTeamEnvelope | null } {
  const errors: string[] = []

  if (!isObject(msg)) {
    return { errors: ['Message must be a JSON object'], envelope: null }
  }

  if (msg.schema_version !== '1.0') {
    errors.push(`schema_version must be "1.0", got: ${String(msg.schema_version ?? 'missing')}`)
  }
  if (!isString(msg.message_id, 1)) errors.push('message_id is required (non-empty string)')
  if (!isString(msg.run_id, 1)) errors.push('run_id is required (non-empty string)')
  if (!VALID_ROLES.includes(msg.from_role as Role)) {
    errors.push(`from_role must be one of [${VALID_ROLES.join(', ')}], got: ${String(msg.from_role ?? 'missing')}`)
  }
  if (!VALID_ROLES.includes(msg.to_role as Role)) {
    errors.push(`to_role must be one of [${VALID_ROLES.join(', ')}], got: ${String(msg.to_role ?? 'missing')}`)
  }
  if (!VALID_MESSAGE_TYPES.includes(msg.message_type as MessageType)) {
    errors.push(`message_type must be one of [${VALID_MESSAGE_TYPES.join(', ')}], got: ${String(msg.message_type ?? 'missing')}`)
  }
  if (!isString(msg.timestamp_utc, 1)) errors.push('timestamp_utc is required (ISO-8601 string)')
  if (!isString(msg.correlation_id, 1)) errors.push('correlation_id is required (non-empty string)')
  if (!isObject(msg.payload)) errors.push('payload is required (object)')

  if (errors.length > 0) return { errors, envelope: null }

  return { errors: [], envelope: msg as unknown as ManagementTeamEnvelope }
}

// ─── Payload validators ───────────────────────────────────────────────────────

const VAGUE_PATTERN = /\b(works well|looks nice|looks good|feel(s)? right|nice|pretty|intuitive|smooth)\b/i

function validateGoalSpec(p: Record<string, unknown>): string[] {
  const errors: string[] = []

  if (!isString(p.goal_summary, 20))
    errors.push('payload.goal_summary must be a string of at least 20 characters')

  if (!isObject(p.stack))
    errors.push('payload.stack is required (object)')
  else if (!isString((p.stack as Record<string, unknown>).runtime, 1))
    errors.push('payload.stack.runtime is required')

  if (!isObject(p.constraints))
    errors.push('payload.constraints is required (object)')
  else {
    const c = p.constraints as Record<string, unknown>
    if (typeof c.offline_after_install !== 'boolean')
      errors.push('payload.constraints.offline_after_install must be boolean')
    if (typeof c.no_external_apis !== 'boolean')
      errors.push('payload.constraints.no_external_apis must be boolean')
    if (!isArray(c.target_devices, 1))
      errors.push('payload.constraints.target_devices must be array with at least 1 item')
  }

  if (!isArray(p.interactions)) {
    errors.push('payload.interactions must be an array')
  } else {
    if ((p.interactions as unknown[]).length < 4)
      errors.push(`payload.interactions must have at least 4 items (got ${(p.interactions as unknown[]).length}) — Commissioner speak-up rule`)

    ;(p.interactions as unknown[]).forEach((item, idx) => {
      if (!isObject(item)) { errors.push(`payload.interactions[${idx}] must be an object`); return }
      const req = ['id', 'user_action', 'visible_change', 'state_change', 'numeric_readout']
      req.forEach((field) => {
        if (!isString((item as Record<string, unknown>)[field], 1))
          errors.push(`payload.interactions[${idx}].${field} is required`)
      })
    })
  }

  if (!isArray(p.acceptance_tests, 1)) {
    errors.push('payload.acceptance_tests must be a non-empty array')
  } else {
    ;(p.acceptance_tests as unknown[]).forEach((test, idx) => {
      if (!isString(test, 20))
        errors.push(`payload.acceptance_tests[${idx}] must be at least 20 chars`)
      if (isString(test) && VAGUE_PATTERN.test(test))
        errors.push(`payload.acceptance_tests[${idx}] is vague (contains: "${test.match(VAGUE_PATTERN)?.[0]}")`)
    })
  }

  const validScope = ['demo', 'maintainable']
  if (!validScope.includes(p.maintenance_scope as string))
    errors.push(`payload.maintenance_scope must be one of [${validScope.join(', ')}]`)

  if (!Array.isArray(p.defaults_applied))
    errors.push('payload.defaults_applied must be an array (may be empty)')

  if (!Array.isArray(p.open_questions))
    errors.push('payload.open_questions must be an array')
  else if ((p.open_questions as unknown[]).length > 0)
    errors.push('payload.open_questions must be empty ([]) before GoalSpec is sent — resolve all questions first')

  return errors
}

function validateNeedsRequirements(p: Record<string, unknown>): string[] {
  const errors: string[] = []
  const validBlockReasons = ['requirements_incomplete', 'contradiction', 'risk_unbounded']

  if (!validBlockReasons.includes(p.block_reason as string))
    errors.push(`payload.block_reason must be one of [${validBlockReasons.join(', ')}]`)

  if (!isArray(p.missing, 1)) {
    errors.push('payload.missing must be a non-empty array')
  } else {
    ;(p.missing as unknown[]).forEach((item, idx) => {
      if (!isObject(item)) { errors.push(`payload.missing[${idx}] must be an object`); return }
      const m = item as Record<string, unknown>
      if (!isString(m.field, 1)) errors.push(`payload.missing[${idx}].field is required`)
      if (!isString(m.question, 10)) errors.push(`payload.missing[${idx}].question must be at least 10 chars`)
      if (!isString(m.why, 10)) errors.push(`payload.missing[${idx}].why must be at least 10 chars`)
      if (!Array.isArray(m.defaults)) errors.push(`payload.missing[${idx}].defaults must be an array`)
    })
  }

  if (!Array.isArray(p.proposed_acceptance_tests))
    errors.push('payload.proposed_acceptance_tests must be an array')

  if (!Array.isArray(p.risk_notes))
    errors.push('payload.risk_notes must be an array')

  if (typeof p.commissioner_score !== 'number' || p.commissioner_score < 0 || p.commissioner_score > 100)
    errors.push('payload.commissioner_score must be a number 0–100')

  if (p.decision !== 'blocked_requirements')
    errors.push('payload.decision must be "blocked_requirements"')

  return errors
}

function validateApproval(p: Record<string, unknown>): string[] {
  const errors: string[] = []

  if (!['approved', 'hard_fail'].includes(p.decision as string))
    errors.push('payload.decision must be "approved" or "hard_fail"')

  if (typeof p.commissioner_score !== 'number' || p.commissioner_score < 0 || p.commissioner_score > 100)
    errors.push('payload.commissioner_score must be a number 0–100')

  if (!isString(p.rationale, 20))
    errors.push('payload.rationale must be at least 20 characters')

  if (p.constraints_confirmed !== true)
    errors.push('payload.constraints_confirmed must be exactly true — Overseer speak-up rule')

  if (p.acceptance_tests_confirmed !== true)
    errors.push('payload.acceptance_tests_confirmed must be exactly true — Overseer speak-up rule')

  if (p.decision === 'hard_fail' && !isString(p.hard_fail_reason, 10))
    errors.push('payload.hard_fail_reason is required when decision="hard_fail"')

  return errors
}

function validateStageReport(p: Record<string, unknown>): string[] {
  const errors: string[] = []
  const validStages = ['requirements', 'feasibility', 'execution', 'verification', 'knowledge']
  const validStatuses = ['started', 'working', 'completed', 'blocked']

  if (!validStages.includes(p.stage as string))
    errors.push(`payload.stage must be one of [${validStages.join(', ')}]`)

  if (!validStatuses.includes(p.status as string))
    errors.push(`payload.status must be one of [${validStatuses.join(', ')}]`)

  if (!Array.isArray(p.artifacts_expected))
    errors.push('payload.artifacts_expected must be an array')

  if (!Array.isArray(p.artifacts_present))
    errors.push('payload.artifacts_present must be an array')

  // Enforce: if completed, artifacts_expected must be satisfied
  if (p.status === 'completed' && Array.isArray(p.artifacts_expected) && Array.isArray(p.artifacts_present)) {
    const present = new Set(p.artifacts_present as string[])
    const missing = (p.artifacts_expected as string[]).filter((a) => !present.has(a))
    if (missing.length > 0) {
      errors.push(
        `Stage is 'completed' but artifacts_expected not satisfied. Missing: [${missing.join(', ')}] — Overseer must self-NACK and block progression`
      )
    }
  }

  if (!Array.isArray(p.errors))
    errors.push('payload.errors must be an array (may be empty)')

  if (!isString(p.next_expected_message_type, 1))
    errors.push('payload.next_expected_message_type is required')

  return errors
}

function validateVerificationReport(p: Record<string, unknown>): string[] {
  const errors: string[] = []
  const validStatuses = ['pass', 'fail', 'blocked_requirements', 'deferred']

  if (!validStatuses.includes(p.verification_status as string))
    errors.push(`payload.verification_status must be one of [${validStatuses.join(', ')}]`)

  if (!isArray(p.checks, 1)) {
    errors.push('payload.checks must be a non-empty array')
  } else {
    ;(p.checks as unknown[]).forEach((item, idx) => {
      if (!isObject(item)) { errors.push(`payload.checks[${idx}] must be an object`); return }
      const c = item as Record<string, unknown>
      if (!isString(c.id, 1)) errors.push(`payload.checks[${idx}].id is required`)
      if (!['pass', 'fail', 'defer'].includes(c.result as string))
        errors.push(`payload.checks[${idx}].result must be "pass", "fail", or "defer"`)
      if (!Array.isArray(c.evidence))
        errors.push(`payload.checks[${idx}].evidence must be an array`)
      else if (c.result === 'fail' && (c.evidence as unknown[]).length === 0)
        errors.push(`payload.checks[${idx}].evidence must not be empty when result="fail" — no_evidence rule prevents hallucinated failures`)
    })
  }

  if (!isString(p.summary, 10))
    errors.push('payload.summary must be at least 10 characters')

  if (p.verification_status === 'blocked_requirements') {
    if (!isArray(p.requirements_gaps, 1))
      errors.push('payload.requirements_gaps must be a non-empty array when verification_status="blocked_requirements"')
  }

  return errors
}

function validateKnowledgeRecord(p: Record<string, unknown>): string[] {
  const errors: string[] = []
  const validKnowledgeStatuses = ['pass', 'needs_info', 'fail']
  const validClassifications = [
    'requirements_incomplete', 'dependency', 'build', 'test', 'perf', 'infra', 'flaky', 'policy',
  ]

  if (!validKnowledgeStatuses.includes(p.knowledge_status as string))
    errors.push(`payload.knowledge_status must be one of [${validKnowledgeStatuses.join(', ')}]`)

  if (!validClassifications.includes(p.classification as string))
    errors.push(`payload.classification must be one of [${validClassifications.join(', ')}]`)

  if (!isString(p.what_broke, 10))
    errors.push('payload.what_broke must be at least 10 characters')

  if (!isString(p.root_cause, 10))
    errors.push('payload.root_cause must be at least 10 characters')

  if (!isArray(p.evidence, 1))
    errors.push('payload.evidence must be a non-empty array')

  if (!isArray(p.prevention_patches, 1)) {
    errors.push('payload.prevention_patches must have at least 1 item — Overseer NACK rule: "heal the failure point"')
  } else {
    ;(p.prevention_patches as unknown[]).forEach((item, idx) => {
      if (!isObject(item)) { errors.push(`payload.prevention_patches[${idx}] must be an object`); return }
      const patch = item as Record<string, unknown>
      if (!isString(patch.target, 1)) errors.push(`payload.prevention_patches[${idx}].target is required`)
      if (!isString(patch.change, 10)) errors.push(`payload.prevention_patches[${idx}].change must be at least 10 chars`)
    })
  }

  if (!isArray(p.regression_checks, 1))
    errors.push('payload.regression_checks must have at least 1 item — Overseer NACK rule')

  return errors
}

function validateNack(p: Record<string, unknown>): string[] {
  const errors: string[] = []
  const validReasons: NackReason[] = [
    'missing_required_fields', 'invalid_enum', 'no_evidence', 'contradiction',
    'insufficient_items', 'schema_version_mismatch', 'unknown_message_type', 'vague_acceptance_test',
  ]
  if (!validReasons.includes(p.reason as NackReason))
    errors.push(`payload.reason must be one of [${validReasons.join(', ')}]`)
  if (!Array.isArray(p.missing_fields))
    errors.push('payload.missing_fields must be an array')
  if (!isString(p.expected_schema, 1))
    errors.push('payload.expected_schema is required')
  if (!isString(p.retry_instructions, 10))
    errors.push('payload.retry_instructions must be at least 10 characters')
  return errors
}

function validateAck(p: Record<string, unknown>): string[] {
  const errors: string[] = []
  if (!isString(p.acknowledged_message_id, 1))
    errors.push('payload.acknowledged_message_id is required')
  if (!isString(p.acknowledged_message_type, 1))
    errors.push('payload.acknowledged_message_type is required')
  return errors
}

// ─── Dispatch table ───────────────────────────────────────────────────────────

const PAYLOAD_VALIDATORS: Record<MessageType, (p: Record<string, unknown>) => string[]> = {
  GoalSpec: validateGoalSpec,
  NeedsRequirements: validateNeedsRequirements,
  Approval: validateApproval,
  StageReport: validateStageReport,
  VerificationReport: validateVerificationReport,
  KnowledgeRecord: validateKnowledgeRecord,
  NACK: validateNack,
  ACK: validateAck,
}

const SCHEMA_NAMES: Record<MessageType, string> = {
  GoalSpec: 'management-team/goal-spec v1.0',
  NeedsRequirements: 'management-team/needs-requirements v1.0',
  Approval: 'management-team/approval v1.0',
  StageReport: 'management-team/stage-report v1.0',
  VerificationReport: 'management-team/verification-report v1.0',
  KnowledgeRecord: 'management-team/knowledge-record v1.0',
  NACK: 'management-team/nack v1.0',
  ACK: 'management-team/ack v1.0',
}

// ─── Main exported validator ──────────────────────────────────────────────────

/**
 * Validate a management team message.
 * Returns { valid: true } or { valid: false, nack: NackMessage, errors: string[] }.
 *
 * The nack is addressed from 'Overseer' (the enforcing role) back to from_role.
 * If the envelope itself is invalid, the nack is addressed to 'Concierge' as a safe default.
 */
export function validateMessage(raw: unknown): ValidationResult {
  const { errors: envelopeErrors, envelope } = validateEnvelope(raw)

  if (envelopeErrors.length > 0 || !envelope) {
    const missingFields = envelopeErrors
      .map((e) => e.match(/^(\S+)\s/)?.[1] ?? '')
      .filter(Boolean)
    const nack = buildNack(
      'Overseer',
      'Concierge',
      isObject(raw) && isString((raw as Record<string, unknown>).run_id, 1)
        ? String((raw as Record<string, unknown>).run_id)
        : 'unknown',
      pseudoUuid(),
      envelopeErrors.some((e) => e.includes('schema_version'))
        ? 'schema_version_mismatch'
        : 'missing_required_fields',
      missingFields,
      'management-team/envelope v1.0',
      `Fix the following envelope errors and re-send: ${envelopeErrors.join('; ')}`,
      isObject(raw) && isString((raw as Record<string, unknown>).message_id, 1)
        ? String((raw as Record<string, unknown>).message_id)
        : undefined,
    )
    return { valid: false, nack, errors: envelopeErrors }
  }

  const payloadValidator = PAYLOAD_VALIDATORS[envelope.message_type]
  const payloadErrors = payloadValidator(envelope.payload)

  if (payloadErrors.length > 0) {
    const reason: NackReason = payloadErrors.some((e) => e.includes('no_evidence') || e.includes('evidence'))
      ? 'no_evidence'
      : payloadErrors.some((e) => e.includes('vague'))
        ? 'vague_acceptance_test'
        : payloadErrors.some((e) => e.includes('at least') || e.includes('minItems') || e.includes('fewer'))
          ? 'insufficient_items'
          : 'missing_required_fields'

    const nack = buildNack(
      'Overseer',
      envelope.from_role,
      envelope.run_id,
      envelope.correlation_id,
      reason,
      payloadErrors.map((e) => e.split(' ')[0]),
      SCHEMA_NAMES[envelope.message_type],
      `Fix the following payload errors and re-send. Do not proceed: ${payloadErrors.join('; ')}`,
      envelope.message_id,
      envelope.message_type,
    )
    return { valid: false, nack, errors: payloadErrors }
  }

  return { valid: true }
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

async function runCli(): Promise<void> {
  let input = ''

  const filePath = process.argv[2]
  if (filePath) {
    const { readFileSync } = await import('fs')
    input = readFileSync(filePath, 'utf8')
  } else {
    // Read from stdin
    process.stdin.setEncoding('utf8')
    for await (const chunk of process.stdin) {
      input += chunk
    }
  }

  if (!input.trim()) {
    console.error('No input. Provide a JSON file path or pipe JSON to stdin.')
    process.exit(1)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(input)
  } catch (err) {
    console.error('Invalid JSON:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  const result = validateMessage(parsed)

  if (result.valid) {
    console.log(JSON.stringify({ valid: true }, null, 2))
    process.exit(0)
  } else {
    console.error(JSON.stringify({ valid: false, errors: result.errors, nack: result.nack }, null, 2))
    process.exit(1)
  }
}

// Run CLI only when executed directly (not imported)
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('validate-message.ts') || process.argv[1].endsWith('validate-message.js'))

if (isMain) {
  runCli().catch((err) => {
    console.error('Fatal:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
}
