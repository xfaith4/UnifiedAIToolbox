import starterPrompts from '../../prompt-library.starter.json'
import type {
  PromptBlocks,
  PromptExampleBlock,
  PromptItem,
  PromptVariable,
  PromptVarType,
} from '../types/prompts'

const DB_KEY = 'promptlib.v1'
const API_BASE_RAW = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'
const API_BASE = API_BASE_RAW ? API_BASE_RAW.replace(/\/$/, '') : ''
export const PROMPT_API_BASE = API_BASE

const STARTER_PROMPTS: PromptItem[] = Array.isArray(starterPrompts)
  ? (starterPrompts as PromptItem[]).map((item) => normalizePrompt(item))
  : []

interface PromptVariableDefinition {
  label?: string
  type?: string
  default?: unknown
  required?: boolean
  description?: string
}

interface PromptSource extends Record<string, unknown> {
  id?: string
  title?: string
  category?: string
  context?: string
  description?: string
  tags?: string[]
  role?: 'system' | 'user' | 'assistant'
  style?: string
  template?: string
  fewShot?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  outputFormat?: string
  stop?: string[]
  temperature?: number
  top_p?: number
  updatedAt?: string
  createdAt?: string
  version?: string
  source?: string
  integrations?: { ui?: { category?: string; context?: string } }
  telemetry?: { tags?: string[] }
  prompt?: {
    system?: string
    instructions?: string
    constraints?: string
    style?: string
    examples?: PromptExampleBlock[]
  }
  outputs?: { schema?: string; format?: string }
  provenance?: { source?: string }
  variables?: PromptVariable[]
  models?: Record<string, unknown>
  blocks?: PromptBlocks
}

export function nowIso() {
  return new Date().toISOString()
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function coerceString(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function readBlocks(raw: Record<string, unknown>): PromptBlocks | undefined {
  const blocks = raw?.prompt
  if (!blocks || typeof blocks !== 'object') return undefined
  const toText = (val: unknown) =>
    typeof val === 'string'
      ? val
      : Array.isArray(val)
        ? val.join('\n').trim()
        : val
          ? coerceString(val)
          : undefined

  const mapped: PromptBlocks = {
    system: toText((blocks as Record<string, unknown>).system),
    instructions: toText((blocks as Record<string, unknown>).instructions),
    constraints: toText((blocks as Record<string, unknown>).constraints),
    style: toText((blocks as Record<string, unknown>).style),
  }

  const examples = (blocks as Record<string, unknown>).examples
  if (Array.isArray(examples)) {
    const normalized = examples
      .map((example) => {
        if (!example || typeof example !== 'object') return null
        const block = example as PromptExampleBlock
        if (!block.output) return null
        return {
          input: block.input,
          output: coerceString(block.output),
        } as PromptExampleBlock
      })
      .filter((ex): ex is PromptExampleBlock => ex !== null)
    if (normalized.length > 0) {
      mapped.examples = normalized
    }
  }

  return mapped
}

function normalizeVariables(rawVars: unknown): PromptVariable[] {
  const coerceVarType = (type: unknown): PromptVarType | undefined => {
    if (!type) return undefined
    const typeStr = String(type).toLowerCase()
    if (['string', 'number', 'boolean', 'multiline', 'json'].includes(typeStr)) {
      return typeStr as PromptVarType
    }
    return undefined
  }

  if (Array.isArray(rawVars)) {
    return rawVars.map((variable, index) => ({
      name: variable?.name || `var${index + 1}`,
      label: variable?.label ?? '',
      type: coerceVarType(variable?.type) ?? 'string',
      default: coerceString(variable?.default ?? ''),
      required: variable?.required ?? false,
      description: variable?.description,
    }))
  }

  if (rawVars && typeof rawVars === 'object') {
    return Object.entries(rawVars as Record<string, PromptVariableDefinition | undefined>).map(
      ([name, definition]) => ({
        name,
        label: definition?.label ?? name,
        type: coerceVarType(definition?.type) ?? 'string',
        default: coerceString(definition?.default ?? ''),
        required: Boolean(definition?.required),
        description: definition?.description,
      })
    )
  }

  return []
}

function deriveFewShot(
  raw: Partial<PromptItem> & Record<string, unknown>,
  blocks?: PromptBlocks
) {
  const directFewShot = Array.isArray(raw.fewShot) ? raw.fewShot : []
  const fromBlocks =
    blocks?.examples?.flatMap((example) => {
      const result: { role: 'user' | 'assistant'; content: string }[] = []
      if (example.input) {
        result.push({
          role: 'user',
          content: coerceString(example.input),
        })
      }
      if (example.output) {
        result.push({
          role: 'assistant',
          content: example.output,
        })
      }
      return result
    }) ?? []

  return [...directFewShot, ...fromBlocks]
}

export function normalizePrompt(raw: PromptSource): PromptItem {
  const createdAt = raw.createdAt || nowIso()
  const updatedAt = raw.updatedAt || createdAt
  const blocks = readBlocks(raw)

  const rawCategory =
    raw.category || raw?.integrations?.ui?.category || raw?.tags?.[0] || ''
  const category = rawCategory?.trim?.() ?? ''

  const description =
    raw.description ??
    raw.context ??
    raw?.integrations?.ui?.context ??
    raw?.prompt?.instructions ??
    ''
  const context = raw.context ?? raw?.integrations?.ui?.context ?? description

  const telemetryTags = Array.isArray(raw.tags)
    ? raw.tags
    : Array.isArray(raw?.telemetry?.tags)
      ? raw.telemetry.tags
      : []
  const tags = [
    ...new Set(
      telemetryTags
        .filter((t: unknown): t is string => typeof t === 'string')
        .map((t: string) => t.trim())
        .filter(Boolean)
    ),
  ]
  if (category && !tags.includes(category)) {
    tags.unshift(category)
  }

  const instructionsBlock = blocks?.instructions?.trim() ?? ''
  const fallbackTemplate =
    (typeof raw.template === 'string' ? raw.template.trim() : '') ||
    instructionsBlock ||
    blocks?.system ||
    blocks?.constraints ||
    blocks?.style ||
    ''

  const template = fallbackTemplate

  const fewShot = deriveFewShot(raw, blocks)

  return {
    id: raw.id || uid(),
    title: raw.title || 'Untitled Prompt',
    category,
    context,
    description,
    tags,
    role: raw.role ?? 'system',
    style: raw.style ?? blocks?.style ?? '',
    template,
    variables: normalizeVariables(raw.variables),
    fewShot,
    outputFormat:
      raw.outputFormat ??
      raw?.outputs?.schema ??
      (typeof raw?.outputs?.format === 'string' ? raw.outputs.format : undefined) ??
      '',
    stop: raw.stop ?? [],
    temperature: raw.temperature ?? 0.2,
    top_p: raw.top_p ?? 1,
    updatedAt,
    createdAt,
    version: raw.version,
    source: raw?.provenance?.source,
    blocks,
    outputs: raw.outputs,
    models: raw.models,
  }
}

function loadLocal(): PromptItem[] {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as PromptItem[]
    return Array.isArray(arr) ? arr.map((item) => normalizePrompt(item)) : []
  } catch {
    return []
  }
}

function saveLocal(items: PromptItem[]) {
  localStorage.setItem(DB_KEY, JSON.stringify(items))
}

function ensureSeededLocal(): PromptItem[] {
  const existing = loadLocal()
  if (existing.length === 0 && STARTER_PROMPTS.length > 0) {
    saveLocal(STARTER_PROMPTS)
    return STARTER_PROMPTS
  }
  return existing
}

export async function fetchPromptLibrary(): Promise<PromptItem[]> {
  if (!API_BASE) {
    return ensureSeededLocal()
  }

  try {
    const response = await fetch(`${API_BASE}/prompts`, {
      headers: { 'Content-Type': 'application/json' },
    })
    if (!response.ok) {
      throw new Error(`API responded with ${response.status}`)
    }
    const payload = await response.json()
    if (Array.isArray(payload)) {
      return payload.map((item) => normalizePrompt(item))
    }
    return ensureSeededLocal()
  } catch (error) {
    console.warn('Falling back to local prompt store:', error)
    return ensureSeededLocal()
  }
}

export async function persistPromptLibrary(items: PromptItem[]): Promise<void> {
  if (!API_BASE) {
    saveLocal(items)
    return
  }

  try {
    const response = await fetch(`${API_BASE}/prompts:sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompts: items }),
    })
    if (!response.ok) {
      throw new Error(`Failed to sync prompts (${response.status})`)
    }
  } catch (error) {
    console.warn('Prompt sync failed; writing to local cache instead.', error)
    saveLocal(items)
  }
}

export function parseImportedPrompt(
  raw: unknown
): PromptItem | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  const looksLikeFullPrompt =
    typeof obj.template === 'string' ||
    typeof obj.description === 'string' ||
    typeof obj.context === 'string' ||
    typeof obj.style === 'string' ||
    Array.isArray(obj.variables) ||
    Array.isArray(obj.fewShot) ||
    typeof obj.role === 'string'

  if (looksLikeFullPrompt) {
    return normalizePrompt(obj as Partial<PromptItem>)
  }

  const prompt = typeof obj.prompt === 'string' ? obj.prompt : null
  if (!prompt) return null

  const context =
    typeof obj.context === 'string'
      ? obj.context
      : typeof obj.description === 'string'
        ? obj.description
        : ''
  const category = typeof obj.category === 'string' ? obj.category : ''
  const tags = Array.isArray(obj.tags)
    ? obj.tags.filter((tag): tag is string => typeof tag === 'string')
    : undefined
  const roleCandidate = obj.role
  const role =
    roleCandidate === 'system' ||
    roleCandidate === 'user' ||
    roleCandidate === 'assistant'
      ? roleCandidate
      : undefined

  return normalizePrompt({
    id: typeof obj.id === 'string' ? obj.id : undefined,
    title:
      typeof obj.title === 'string' && obj.title.trim()
        ? obj.title
        : 'Imported prompt',
    category,
    context,
    description: context,
    template: prompt,
    tags,
    style: typeof obj.style === 'string' ? obj.style : undefined,
    role,
    variables: Array.isArray(obj.variables)
      ? (obj.variables as PromptVariable[])
      : undefined,
    outputFormat:
      typeof obj.outputFormat === 'string' ? obj.outputFormat : undefined,
    stop: Array.isArray(obj.stop)
      ? obj.stop.filter((s): s is string => typeof s === 'string')
      : undefined,
    temperature:
      typeof obj.temperature === 'number' ? obj.temperature : undefined,
    top_p: typeof obj.top_p === 'number' ? obj.top_p : undefined,
  })
}

export async function renderPromptViaApi(
  promptId: string,
  variables: Record<string, unknown>
): Promise<{ prompt: unknown; rendered_blocks: Record<string, unknown>; output?: unknown }> {
  if (!API_BASE) {
    throw new Error('Prompt API base URL is not configured.')
  }

  const response = await fetch(`${API_BASE}/prompts/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt_id: promptId, variables }),
  })

  if (!response.ok) {
    throw new Error(`Render failed with status ${response.status}`)
  }

  return response.json()
}
