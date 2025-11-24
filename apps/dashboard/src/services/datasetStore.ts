export type DatasetType = 'genesys-conversations' | 'syslog' | 'json' | 'text'

export interface DatasetEntry {
  id: string
  name: string
  type: DatasetType
  sizeBytes: number
  items: number
  importedAt: string
  preview: string
  raw: unknown
}

const STORAGE_KEY = 'dataset.explorer.v1'

export function loadDatasets(): DatasetEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as DatasetEntry[]) : []
  } catch {
    return []
  }
}

export function saveDatasets(entries: DatasetEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

function detectType(obj: unknown, text?: string): DatasetType {
  if (text) {
    const syslogPattern = /^\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/m
    if (syslogPattern.test(text)) return 'syslog'
    return 'text'
  }
  if (obj && typeof obj === 'object') {
    if (Array.isArray(obj)) {
      if (obj.length && typeof obj[0] === 'object' && 'participants' in (obj[0] as Record<string, unknown>)) {
        return 'genesys-conversations'
      }
      return 'json'
    }
    if ('conversations' in (obj as Record<string, unknown>)) return 'genesys-conversations'
    return 'json'
  }
  return 'text'
}

function summarize(obj: unknown, text?: string): { items: number; preview: string; type: DatasetType } {
  if (text) {
    const lines = text.split(/\r?\n/)
    const sample = lines.slice(0, 5).join('\n')
    const type = detectType(undefined, text)
    return { items: lines.filter(Boolean).length, preview: sample, type }
  }
  if (Array.isArray(obj)) {
    const sample = JSON.stringify(obj.slice(0, 2), null, 2)
    return { items: obj.length, preview: sample, type: detectType(obj) }
  }
  if (obj && typeof obj === 'object') {
    const asArray = (obj as Record<string, unknown>).conversations
    if (Array.isArray(asArray)) {
      const sample = JSON.stringify(asArray.slice(0, 2), null, 2)
      return { items: asArray.length, preview: sample, type: 'genesys-conversations' }
    }
    const sample = JSON.stringify(obj, null, 2)
    return { items: 1, preview: sample, type: 'json' }
  }
  return { items: 0, preview: '', type: 'text' }
}

export async function importDataset(file: File): Promise<DatasetEntry> {
  const buffer = await file.arrayBuffer()
  const text = new TextDecoder().decode(buffer)
  let parsed: unknown = undefined
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = undefined
  }

  const summary = summarize(parsed, parsed ? undefined : text)
  const entry: DatasetEntry = {
    id: crypto.randomUUID(),
    name: file.name,
    type: summary.type,
    sizeBytes: file.size,
    items: summary.items,
    importedAt: new Date().toISOString(),
    preview: summary.preview,
    raw: parsed ?? text,
  }

  const current = loadDatasets()
  const updated = [entry, ...current]
  saveDatasets(updated)
  return entry
}

export function deleteDataset(id: string): DatasetEntry[] {
  const updated = loadDatasets().filter((d) => d.id !== id)
  saveDatasets(updated)
  return updated
}

export function getDataset(id: string): DatasetEntry | undefined {
  return loadDatasets().find((d) => d.id === id)
}

export function previewDataset(id: string, lines: number = 8): string {
  const ds = getDataset(id)
  if (!ds) return ''
  if (typeof ds.raw === 'string') {
    return ds.raw.split(/\r?\n/).slice(0, lines).join('\n')
  }
  return JSON.stringify(ds.raw, null, 2)
}

export type TransformKind = 'summarize' | 'syslog-to-json'

export function transformDataset(id: string, kind: TransformKind): DatasetEntry | undefined {
  const datasets = loadDatasets()
  const idx = datasets.findIndex((d) => d.id === id)
  if (idx === -1) return undefined
  const ds = datasets[idx]

  if (kind === 'summarize' && ds.type === 'genesys-conversations' && ds.raw && typeof ds.raw === 'object') {
    const convs = Array.isArray(ds.raw)
      ? ds.raw
      : (ds.raw as Record<string, unknown>).conversations
    const total = Array.isArray(convs) ? convs.length : 0
    const sample = Array.isArray(convs) ? convs.slice(0, 2) : []
    const summary = {
      conversations: total,
      sample: sample,
    }
    ds.preview = JSON.stringify(summary, null, 2)
    ds.raw = convs
  }

  if (kind === 'syslog-to-json' && typeof ds.raw === 'string') {
    const lines = ds.raw.split(/\r?\n/).filter(Boolean)
    const parsed = lines.map((line) => {
      const m = line.match(/^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(.*)$/)
      return m ? { timestamp: m[1], message: m[2] } : { message: line }
    })
    ds.preview = JSON.stringify(parsed.slice(0, 5), null, 2)
    ds.raw = parsed
    ds.items = parsed.length
    ds.type = 'syslog'
  }

  datasets[idx] = ds
  saveDatasets(datasets)
  return ds
}
