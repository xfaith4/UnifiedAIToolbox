import { loadAll as loadAllYaml } from 'js-yaml'
import type { PromptItem } from '@/lib/types/prompts'
import { normalizePrompt } from '@/lib/services/promptStore'

export type PromptImportFormat = 'json' | 'yaml' | 'csv' | 'unknown'

export interface PromptImportReport {
  prompts: PromptItem[]
  warnings: string[]
  guidance: string[]
  errors: string[]
  detectedFormat: PromptImportFormat
  sourceName: string
  importedCount: number
  skippedCount: number
}

interface ImportOptions {
  fileName?: string
  contentType?: string
}

interface CoerceResult {
  prompts: Partial<PromptItem>[]
  warnings: string[]
  guidance: string[]
  skippedCount: number
  sourceCount: number
}

const DEFAULT_SOURCE_NAME = 'uploaded prompt file'

export function parsePromptImport(text: string, options: ImportOptions = {}): PromptImportReport {
  const cleaned = text.replace(/^\uFEFF/, '')
  const sourceName = options.fileName || DEFAULT_SOURCE_NAME
  const detectedFormat = detectFormat(sourceName, options.contentType, cleaned)
  const baseReport: PromptImportReport = {
    prompts: [],
    warnings: [],
    guidance: [],
    errors: [],
    detectedFormat,
    sourceName,
    importedCount: 0,
    skippedCount: 0,
  }

  try {
    if (detectedFormat === 'csv') {
      const csvResult = parseCsv(cleaned)
      baseReport.errors.push(...csvResult.errors)
      const coerce = coerceFromArray(csvResult.records, sourceName, 'csv')
      return finalizeReport(baseReport, coerce)
    }

    if (detectedFormat === 'json') {
      const data = JSON.parse(cleaned)
      const coerce = coerceFromUnknown(data, sourceName)
      return finalizeReport(baseReport, coerce)
    }

    if (detectedFormat === 'yaml') {
      const yamlDocs: unknown[] = []
      loadAllYaml(cleaned, (doc) => yamlDocs.push(doc))
      const data = yamlDocs.length === 1 ? yamlDocs[0] : yamlDocs
      const coerce = coerceFromUnknown(data, sourceName)
      return finalizeReport(baseReport, coerce)
    }

    const jsonAttempt = tryParseJson(cleaned)
    if (jsonAttempt.ok) {
      baseReport.detectedFormat = 'json'
      const coerce = coerceFromUnknown(jsonAttempt.value, sourceName)
      return finalizeReport(baseReport, coerce)
    }

    const yamlAttempt = tryParseYaml(cleaned)
    if (yamlAttempt.ok) {
      baseReport.detectedFormat = 'yaml'
      const coerce = coerceFromUnknown(yamlAttempt.value, sourceName)
      return finalizeReport(baseReport, coerce)
    }

    const csvResult = parseCsv(cleaned)
    baseReport.detectedFormat = 'csv'
    baseReport.errors.push(...csvResult.errors)
    const coerce = coerceFromArray(csvResult.records, sourceName, 'csv')
    return finalizeReport(baseReport, coerce)
  } catch (error) {
    baseReport.errors.push(
      `Import failed to parse ${sourceName}: ${(error as Error).message}`
    )
    baseReport.guidance.push(minimumFormatGuidance())
    return baseReport
  }
}

function finalizeReport(
  report: PromptImportReport,
  coerce: CoerceResult
): PromptImportReport {
  const prompts = coerce.prompts.map(normalizePrompt)
  const importedCount = prompts.length
  const skippedCount = Math.max(coerce.sourceCount - importedCount, coerce.skippedCount)

  return {
    ...report,
    prompts,
    warnings: [...report.warnings, ...coerce.warnings],
    guidance: [...report.guidance, ...coerce.guidance],
    importedCount,
    skippedCount,
  }
}

function detectFormat(
  fileName: string,
  contentType: string | undefined,
  text: string
): PromptImportFormat {
  const lowerName = fileName.toLowerCase()
  const lowerType = (contentType || '').toLowerCase()

  if (lowerName.endsWith('.csv') || lowerType.includes('csv')) {
    return 'csv'
  }
  if (lowerName.endsWith('.yaml') || lowerName.endsWith('.yml') || lowerType.includes('yaml')) {
    return 'yaml'
  }
  if (lowerName.endsWith('.json') || lowerType.includes('json')) {
    return 'json'
  }

  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json'
  if (trimmed.startsWith('---') || trimmed.includes(':')) return 'yaml'
  if (trimmed.includes(',') && trimmed.includes('\n')) return 'csv'

  return 'unknown'
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false }
  }
}

function tryParseYaml(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    const docs: unknown[] = []
    loadAllYaml(text, (doc) => docs.push(doc))
    const value = docs.length === 1 ? docs[0] : docs
    return { ok: true, value }
  } catch {
    return { ok: false }
  }
}

function coerceFromUnknown(data: unknown, sourceName: string): CoerceResult {
  if (Array.isArray(data)) {
    return coerceFromArray(data, sourceName, 'array')
  }

  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    const listKeys = ['prompts', 'items', 'data', 'entries', 'records']
    for (const key of listKeys) {
      if (Array.isArray(obj[key])) {
        return coerceFromArray(obj[key] as unknown[], sourceName, key)
      }
    }

    if (Array.isArray(obj.professions)) {
      return coerceFromArray(obj.professions, sourceName, 'professions')
    }

    const single = coercePromptFromObject(obj, 0, sourceName, 'object')
    if (single.prompt) {
      return {
        prompts: [single.prompt],
        warnings: single.warnings,
        guidance: single.guidance,
        skippedCount: 0,
        sourceCount: 1,
      }
    }
  }

  return {
    prompts: [],
    warnings: [],
    guidance: [minimumFormatGuidance()],
    skippedCount: 0,
    sourceCount: 0,
  }
}

function coerceFromArray(
  items: unknown[],
  sourceName: string,
  label: string
): CoerceResult {
  const prompts: Partial<PromptItem>[] = []
  const warnings: string[] = []
  const guidance: string[] = []
  let skippedCount = 0
  let usedDescriptionFallback = 0
  let missingTitles = 0
  let missingTemplates = 0

  items.forEach((item, index) => {
    if (typeof item === 'string') {
      const title = `Imported Prompt ${index + 1}`
      prompts.push({
        title,
        template: item,
      })
      missingTitles += 1
      return
    }

    if (!item || typeof item !== 'object') {
      skippedCount += 1
      return
    }

    const result = coercePromptFromObject(
      item as Record<string, unknown>,
      index,
      sourceName,
      label
    )
    if (result.usedDescriptionFallback) usedDescriptionFallback += 1
    if (result.missingTitle) missingTitles += 1
    if (result.missingTemplate) missingTemplates += 1

    if (result.prompt) {
      prompts.push(result.prompt)
      warnings.push(...result.warnings)
      guidance.push(...result.guidance)
    } else {
      skippedCount += 1
    }
  })

  if (usedDescriptionFallback > 0) {
    warnings.push(
      `Used description text as the template for ${usedDescriptionFallback} entries. Consider adding a template or prompt field.`
    )
  }
  if (missingTitles > 0) {
    warnings.push(
      `Assigned default titles for ${missingTitles} entries. Consider adding a title or name field.`
    )
  }
  if (missingTemplates > 0) {
    guidance.push(
      `Skipped ${missingTemplates} entries missing any prompt text. ${minimumFormatGuidance()}`
    )
  }

  return {
    prompts,
    warnings: dedupe(warnings),
    guidance: dedupe(guidance),
    skippedCount,
    sourceCount: items.length,
  }
}

function coercePromptFromObject(
  obj: Record<string, unknown>,
  index: number,
  _sourceName: string,
  label: string
): {
  prompt: Partial<PromptItem> | null
  warnings: string[]
  guidance: string[]
  usedDescriptionFallback: boolean
  missingTitle: boolean
  missingTemplate: boolean
} {
  const warnings: string[] = []
  const guidance: string[] = []
  const templateResult = extractTemplate(obj)
  const rawTitle =
    extractString(obj, ['title', 'name', 'profession_name', 'prompt_title', 'id']) || ''
  const title = rawTitle || `Imported Prompt ${index + 1}`
  const missingTitle = !rawTitle
  const missingTemplate = !templateResult.template

  if (!templateResult.template) {
    return {
      prompt: null,
      warnings,
      guidance,
      usedDescriptionFallback: templateResult.usedDescriptionFallback,
      missingTitle,
      missingTemplate,
    }
  }

  if (missingTitle && label !== 'object') {
    warnings.push(`Entry ${index + 1} had no title; assigned "${title}".`)
  }

  if (templateResult.usedDescriptionFallback) {
    warnings.push(
      `Entry ${index + 1} used a description field as prompt text. Add template/prompt for clearer intent.`
    )
  }

  const tags = extractTags(obj)
  const category =
    extractString(obj, ['category', 'group', 'collection']) ||
    (extractString(obj, ['profession_name']) ? 'Profession Persona' : '')

  const prompt: Partial<PromptItem> = {
    title,
    template: templateResult.template,
    description: extractString(obj, ['description', 'summary', 'notes']),
    context: extractString(obj, ['context', 'background']),
    category,
    tags,
  }

  return {
    prompt,
    warnings,
    guidance,
    usedDescriptionFallback: templateResult.usedDescriptionFallback,
    missingTitle,
    missingTemplate,
  }
}

function extractTemplate(obj: Record<string, unknown>): {
  template: string
  usedDescriptionFallback: boolean
} {
  const direct = extractString(obj, [
    'template',
    'prompt',
    'prompt_text',
    'persona_prompt',
    'instructions',
    'instruction',
    'user_template',
    'content',
    'text',
  ])
  if (direct) return { template: direct, usedDescriptionFallback: false }

  const blocks = obj.blocks
  if (Array.isArray(blocks)) {
    const chunk = blocks
      .map((block) => {
        if (!block || typeof block !== 'object') return ''
        return (
          extractString(block as Record<string, unknown>, [
            'instructions',
            'instruction',
            'prompt',
            'content',
            'text',
          ]) || ''
        )
      })
      .filter(Boolean)
      .join('\n\n')
    if (chunk) return { template: chunk, usedDescriptionFallback: false }
  }

  const description = extractString(obj, ['description', 'summary'])
  if (description) return { template: description, usedDescriptionFallback: true }

  return { template: '', usedDescriptionFallback: false }
}

function extractTags(obj: Record<string, unknown>): string[] {
  const tagsValue = obj.tags
  if (Array.isArray(tagsValue)) {
    return tagsValue.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag)
  }
  if (typeof tagsValue === 'string') {
    return tagsValue
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
  }
  return []
}

function extractString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  const normalizedEntries = Object.entries(obj).map(([key, value]) => [
    normalizeKey(key),
    value,
  ] as [string, unknown])
  for (const candidate of keys) {
    const normalizedCandidate = normalizeKey(candidate)
    for (const [normalizedKey, value] of normalizedEntries) {
      if (
        normalizedKey === normalizedCandidate ||
        normalizedKey.includes(normalizedCandidate)
      ) {
        if (typeof value === 'string' && value.trim()) return value.trim()
      }
    }
  }
  return ''
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function parseCsv(text: string): { records: Record<string, string>[]; errors: string[] } {
  const errors: string[] = []
  const rows = parseCsvRows(text, errors)
  if (rows.length === 0) {
    return { records: [], errors: errors.length ? errors : ['No CSV rows found.'] }
  }

  const headers = rows.shift() || []
  const normalizedHeaders = headers.map((header, index) => {
    const trimmed = header.trim()
    if (trimmed) return trimmed
    return `column_${index + 1}`
  })

  if (headers.every((header) => !header.trim())) {
    errors.push('CSV header row is empty. Add headers like title, template, or persona_prompt.')
  }

  const records = rows
    .filter((row) => row.some((cell) => cell.trim() !== ''))
    .map((row) => {
      const record: Record<string, string> = {}
      normalizedHeaders.forEach((header, index) => {
        record[header] = row[index] ?? ''
      })
      return record
    })

  return { records, errors }
}

function parseCsvRows(text: string, errors: string[]): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        const next = text[i + 1]
        if (next === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        row.push(field)
        field = ''
      } else if (char === '\n') {
        row.push(field)
        rows.push(row)
        row = []
        field = ''
      } else if (char === '\r') {
        // ignore carriage returns
      } else {
        field += char
      }
    }
    i += 1
  }

  row.push(field)
  rows.push(row)

  if (inQuotes) {
    errors.push('CSV parsing ended inside a quoted field. Check for unmatched quotes.')
  }

  return rows.filter((r) => r.length > 0 && !(r.length === 1 && r[0].trim() === ''))
}

function minimumFormatGuidance(): string {
  return [
    'Minimum format: include a title and prompt text.',
    'JSON example: [{"title":"My Prompt","template":"You are..."}]',
    'YAML example: - title: My Prompt\n  template: |\n    You are...',
    'CSV example headers: title,template or profession_name,persona_prompt',
  ].join(' ')
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items))
}
