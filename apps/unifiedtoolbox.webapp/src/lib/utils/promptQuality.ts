import type { PromptQuality, PromptQualitySubscores } from '@/lib/types/prompts'

const REFINER_VERSION = 'local-heuristic-v1'

const claritySignals = ['role', 'objectiv', 'task', 'goal', 'mission']
const constraintSignals = ['must', 'required', 'do not', 'avoid', 'only', 'limit', 'constraint', 'rule']
const outputFormatSignals = ['json', 'markdown', 'table', 'csv', 'xml', 'yaml', 'format', 'template']
const exampleSignals = ['example', 'sample', 'test case', 'input/output', 'scenario']
const safetySignals = ['safe', 'ethic', 'no harm', 'respectful', 'guardrail', 'avoid', 'prevent']
const reusabilitySignals = ['{{', 'placeholder', 'variable', 'input', 'context', 'data', 'parameter']

const refinementSections = [
  { name: 'Role', placeholder: 'Describe the persona or assistant style to adopt.' },
  { name: 'Objective', placeholder: 'Explain the goal the prompt is trying to achieve.' },
  { name: 'Inputs', placeholder: 'List the expected inputs and their formats.' },
  { name: 'Constraints', placeholder: 'Add rules, limits, or forbidden behaviors.' },
  { name: 'Output Format', placeholder: 'Define the desired structure (JSON, Markdown, etc.).' },
  { name: 'Examples', placeholder: 'Show a sample input/output pair.' },
  { name: 'Success Criteria', placeholder: 'Clarify how to know the task succeeded.' },
] as const

function clampScore(value: number): number {
  return Math.max(0, Math.min(10, Math.round(value * 10) / 10))
}

function scoreFromSignals(text: string, signals: string[]): number {
  if (!signals.length) return 0
  const hits = signals.filter((signal) => text.includes(signal))
  return clampScore((hits.length / signals.length) * 10)
}

export function evaluatePromptQuality(template: string, context?: string): PromptQuality {
  const combined = [context, template].filter(Boolean).join('\n\n').toLowerCase()
  const clarityScore = clampScore(scoreFromSignals(combined, claritySignals))
  const constraintsScore = clampScore(scoreFromSignals(combined, constraintSignals))
  const outputFormatScore = clampScore(scoreFromSignals(combined, outputFormatSignals))
  const rawExampleScore = scoreFromSignals(combined, exampleSignals)
  const examplesScore = rawExampleScore > 0 ? clampScore(rawExampleScore + 1) : 0
  const safetyScore = clampScore(scoreFromSignals(combined, safetySignals))
  const reusabilityScore = clampScore(scoreFromSignals(combined, reusabilitySignals))

  const subscores: PromptQualitySubscores = {
    clarity: clarityScore,
    constraints: constraintsScore,
    outputFormat: outputFormatScore,
    examples: examplesScore,
    safety: safetyScore,
    reusability: reusabilityScore,
  }

  const findings: string[] = []
  const suggestions = new Set<string>()

  if (clarityScore < 5) {
    findings.push('Role or objective lines are not defined clearly.')
    suggestions.add('Add explicit Role/Objective statements (e.g., "Role: ...", "Objective: ...").')
  }

  if (constraintsScore < 4) {
    findings.push('Constraints are thin or missing.')
    suggestions.add('Include constraints with keywords like "must", "do not", or "limit".')
  }

  if (outputFormatScore < 4) {
    findings.push('Output format is not specified.')
    suggestions.add('Define the output structure (JSON, Markdown table, etc.).')
  }

  if (examplesScore < 2) {
    findings.push('No concrete examples or test cases are provided.')
    suggestions.add('Add at least one example input/output scenario.')
  }

  if (safetyScore < 4) {
    findings.push('Safety guardrails are not ground-truthed.')
    suggestions.add('Add safety statements (avoid, respect, do not instruct harmful acts).')
  }

  if (reusabilityScore < 5) {
    findings.push('Reusability cues (placeholders, variables) are weak.')
    suggestions.add('Use placeholders (e.g., {{user_input}}) and describe input fields.')
  }

  if (findings.length === 0) {
    suggestions.add('Score validated. Keep refining goal clarity and constraints if needed.')
  }

  const overallScore =
    Object.values(subscores).reduce((sum, value) => sum + value, 0) /
    Object.values(subscores).length

  return {
    overallScore: clampScore(overallScore),
    subscores,
    findings,
    suggestions: Array.from(suggestions),
    lastRatedAt: new Date().toISOString(),
    raterVersion: REFINER_VERSION,
  }
}

export function generateRefinementDraft(template: string, context?: string): string {
  const base = template.trim() || context?.trim() || ''
  let result = base

  for (const section of refinementSections) {
    const hasSection = new RegExp(`^${section.name}:`, 'im').test(result)
    if (!hasSection) {
      result = `${result}${result ? '\n\n' : ''}${section.name}: ${section.placeholder}`
    }
  }

  return result.trim()
}
