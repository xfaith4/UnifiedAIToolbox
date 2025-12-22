'use server'

import { evaluatePromptQuality, getPromptQualityCriteria } from '@/lib/utils/promptQuality'
import { extractSummaryFromChange } from '@/lib/utils/promptRefiner'
import { PromptQualitySubscores } from '@/lib/types/prompts'
import { callOpenAIChat, type ChatUsage, type ChatMessage } from '@/lib/services/serverOpenAI'

const MODEL = process.env.OPENAI_PROMPT_REFINER_MODEL || 'gpt-4o-mini'
const COST_PER_THOUSAND = parseFloat(process.env.OPENAI_REFINE_COST_PER_THOUSAND || '0')

type PromptRefinerPayload = {
  title?: string
  category?: string
  context?: string
  template: string
  goals?: string
  constraints?: string
  outputFormat?: string
  apiKey?: string
}

type CriticResponse = {
  critiqueBullets?: string[]
}

type EngineerResponse = {
  refinedTemplate?: string
  changeSummary?: string[]
}

function formatCriteriaForPrompt(): string {
  const criteria = getPromptQualityCriteria()
  const sections = criteria.sections
    .map((section) => `- ${section.name}: ${section.placeholder}`)
    .join('\n')
  const signals = Object.entries(criteria.signals)
    .map(([key, items]) => `- ${key}: ${items.join(', ')}`)
    .join('\n')
  const thresholds = Object.entries(criteria.thresholds)
    .map(([key, value]) => `- ${key}: >= ${value}`)
    .join('\n')

  return [
    'Evaluation sections:',
    sections,
    '',
    'Keyword signals (used in local scoring):',
    signals,
    '',
    'Thresholds (min score targets):',
    thresholds,
  ].join('\n')
}

function buildMetadata(payload: PromptRefinerPayload): string {
  const lines: string[] = []
  for (const [label, value] of [
    ['Title', payload.title],
    ['Category', payload.category],
    ['Context', payload.context],
    ['Goals', payload.goals],
    ['Constraints', payload.constraints],
    ['Output Format', payload.outputFormat],
  ]) {
    if (value) {
      lines.push(`${label}: ${value}`)
    }
  }
  return lines.join('\n')
}

function safeParseJson<T>(text?: string): T | null {
  if (!text) return null
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(text.substring(start, end + 1)) as T
  } catch {
    return null
  }
}

function parseEngineerFallback(text: string): EngineerResponse {
  const lines = text.split('\n')
  const refinedIndex = lines.findIndex((line) =>
    /(refined template|refined prompt|refined result)/i.test(line)
  )
  const summaryIndex = lines.findIndex((line) =>
    /(change summary|summary of changes|changes)/i.test(line)
  )

  let refinedLines: string[] = []
  if (refinedIndex !== -1) {
    const start = refinedIndex + 1
    const end = summaryIndex > start ? summaryIndex : lines.length
    refinedLines = lines.slice(start, end)
  }

  let summaryLines: string[] = []
  if (summaryIndex !== -1) {
    summaryLines = lines.slice(summaryIndex + 1)
  }

  const refinedTemplate = refinedLines.length ? refinedLines.join('\n').trim() : text.trim()
  const changeSummary = summaryLines
    .map((line) => line.replace(/^[-*•\s]+/, '').trim())
    .filter(Boolean)

  return {
    refinedTemplate: refinedTemplate || undefined,
    changeSummary: changeSummary.length ? changeSummary : undefined,
  }
}

function accumulateUsage(target: ChatUsage, usage?: ChatUsage) {
  if (!usage) return
  target.prompt_tokens = (target.prompt_tokens ?? 0) + (usage.prompt_tokens ?? 0)
  target.completion_tokens = (target.completion_tokens ?? 0) + (usage.completion_tokens ?? 0)
  target.total_tokens = (target.total_tokens ?? 0) + (usage.total_tokens ?? 0)
}

async function runCritic(payload: PromptRefinerPayload, apiKey: string): Promise<{ bullets: string[]; usage: ChatUsage }> {
  const metadata = buildMetadata(payload)
  const criteriaText = formatCriteriaForPrompt()
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are a Prompt Critic. Identify ambiguities, missing constraints, missing output formats, and placeholder issues using the local evaluation criteria.',
    },
    {
      role: 'user',
      content: `Prompt metadata:\n${metadata}\n\nLocal evaluation criteria:\n${criteriaText}\n\nTemplate:\n${payload.template}\n\nReturn JSON: { "critiqueBullets": ["..."] }`,
    },
  ]

  const response = await callOpenAIChat(messages, apiKey, MODEL)
  const parsed = safeParseJson<CriticResponse>(response.content)
  const bullets = parsed?.critiqueBullets ?? response.content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  return { bullets, usage: response.usage ?? {} }
}

async function runEngineer(payload: PromptRefinerPayload, apiKey: string): Promise<{ result: EngineerResponse; usage: ChatUsage }> {
  const metadata = buildMetadata(payload)
  const criteriaText = formatCriteriaForPrompt()
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are a Prompt Engineer. Improve the prompt by clarifying intent, constraints, and output format without inventing new requirements. Align the output with the local evaluation criteria.',
    },
    {
      role: 'user',
      content: `Prompt metadata:\n${metadata}\n\nLocal evaluation criteria:\n${criteriaText}\n\nTemplate:\n${payload.template}\n\nReturn JSON with keys: refinedTemplate (the improved prompt text) and changeSummary (array of bullet points summarizing changes).`,
    },
  ]

  const response = await callOpenAIChat(messages, apiKey, MODEL)
  const parsed = safeParseJson<EngineerResponse>(response.content)
  if (parsed?.refinedTemplate || parsed?.changeSummary?.length) {
    return { result: parsed, usage: response.usage ?? {} }
  }
  const fallback = parseEngineerFallback(response.content)
  return { result: fallback, usage: response.usage ?? {} }
}

export async function POST(request: Request) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const payload = (await request.json()) as PromptRefinerPayload
    if (!payload.template) {
      return new Response(JSON.stringify({ error: 'Template is required' }), { status: 400 })
    }

    const apiKey =
      payload.apiKey ||
      process.env.OPENAI_API_KEY ||
      process.env.NEXT_PUBLIC_OPENAI_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing OpenAI API key' }), { status: 400 })
    }

    const originalQuality = evaluatePromptQuality(payload.template, payload.context)

    const critic = await runCritic(payload, apiKey)
    const engineer = await runEngineer(payload, apiKey)

    const refinedTemplate = (engineer.result.refinedTemplate ?? payload.template).trim()
    const refinedQuality = evaluatePromptQuality(refinedTemplate, payload.context)
    const qualityScoreDelta = Number((refinedQuality.overallScore - originalQuality.overallScore).toFixed(1))

    const tokens: ChatUsage = {}
    accumulateUsage(tokens, critic.usage)
    accumulateUsage(tokens, engineer.usage)
    const cost =
      COST_PER_THOUSAND > 0 && tokens.total_tokens
        ? Number(((tokens.total_tokens / 1000) * COST_PER_THOUSAND).toFixed(5))
        : undefined

    const rubricBreakdown: PromptQualitySubscores = refinedQuality.subscores

    const critiqueBullets = critic.bullets
    let changeSummary =
      engineer.result.changeSummary?.map((entry) => entry.toString()) ??
      extractSummaryFromChange(engineer.result.refinedTemplate ?? '')
    if (changeSummary.length === 0 && refinedTemplate === payload.template) {
      changeSummary = ['AI returned critique only; no draft changes were produced.']
    }

    return new Response(
      JSON.stringify({
        refinedTemplate,
        critiqueBullets,
        changeSummary,
        qualityScoreDelta,
        rubricBreakdown,
        tokens,
        cost,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
    })
  }
}
