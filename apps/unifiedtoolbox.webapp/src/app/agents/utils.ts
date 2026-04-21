'use client'

import type { AgentInstruction, AgentStatus } from '@/lib/types/agents'

const VALID_AGENT_STATUSES = new Set<AgentStatus>(['draft', 'ready', 'archived'])

function asTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined
}

function asStringArray(value: unknown): string[] | null {
  if (value == null) return []
  if (!Array.isArray(value)) return null
  const next: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') return null
    const trimmed = entry.trim()
    if (trimmed) next.push(trimmed)
  }
  return next
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function getEffectiveAgentPrompt(agent: Pick<AgentInstruction, 'prompt' | 'promptOverride'>): string {
  return agent.promptOverride?.trim() || agent.prompt?.trim() || ''
}

export function getAgentReadinessIssues(agent: AgentInstruction): string[] {
  const issues: string[] = []
  if (!getEffectiveAgentPrompt(agent)) issues.push('Prompt')
  if (!(agent.purpose?.trim() || agent.mission?.trim())) issues.push('Purpose or mission')
  if (!Array.isArray(agent.outputs) || agent.outputs.length === 0) issues.push('Expected outputs')
  if (!Array.isArray(agent.playbook) || agent.playbook.length === 0) issues.push('Playbook')
  return issues
}

export function validateImportedAgentLibrary(payload: unknown): Partial<AgentInstruction>[] {
  if (!Array.isArray(payload)) {
    throw new Error('Expected a JSON array of agent objects.')
  }

  const errors: string[] = []
  const validated: Partial<AgentInstruction>[] = []

  payload.forEach((entry, index) => {
    if (!isRecord(entry)) {
      errors.push(`Item ${index + 1}: expected an object.`)
      return
    }

    const name = asTrimmedString(entry.name)
    if (!name) {
      errors.push(`Item ${index + 1}: name is required.`)
      return
    }

    const status = asTrimmedString(entry.status)
    if (status && !VALID_AGENT_STATUSES.has(status as AgentStatus)) {
      errors.push(`Item ${index + 1}: status must be one of draft, ready, archived.`)
    }

    const arrayFields = ['tags', 'triggers', 'inputs', 'outputs', 'tools', 'playbook'] as const
    const arrays: Partial<Record<(typeof arrayFields)[number], string[]>> = {}
    for (const field of arrayFields) {
      const normalized = asStringArray(entry[field])
      if (normalized === null) {
        errors.push(`Item ${index + 1}: ${field} must be an array of strings.`)
      } else {
        arrays[field] = normalized
      }
    }

    const prompt = typeof entry.prompt === 'string' ? entry.prompt : undefined
    const promptOverride =
      entry.promptOverride == null
        ? undefined
        : typeof entry.promptOverride === 'string'
          ? entry.promptOverride
          : null

    if (!(prompt?.trim() || promptOverride?.trim() || asTrimmedString(entry.purpose) || asTrimmedString(entry.mission))) {
      errors.push(`Item ${index + 1}: include at least one of prompt, promptOverride, purpose, or mission.`)
    }

    validated.push({
      id: asTrimmedString(entry.id),
      name,
      purpose: asTrimmedString(entry.purpose),
      mission: asTrimmedString(entry.mission),
      role: asTrimmedString(entry.role),
      prompt,
      promptOverride,
      status: (status as AgentStatus | undefined) ?? 'draft',
      tags: arrays.tags ?? [],
      triggers: arrays.triggers ?? [],
      inputs: arrays.inputs ?? [],
      outputs: arrays.outputs ?? [],
      tools: arrays.tools ?? [],
      playbook: arrays.playbook ?? [],
      owner: asTrimmedString(entry.owner),
      handoff: typeof entry.handoff === 'string' ? entry.handoff : undefined,
      notes: typeof entry.notes === 'string' ? entry.notes : undefined,
      createdAt: asTrimmedString(entry.createdAt),
      updatedAt: asTrimmedString(entry.updatedAt),
    })
  })

  if (errors.length > 0) {
    throw new Error(errors.join(' '))
  }

  return validated
}
