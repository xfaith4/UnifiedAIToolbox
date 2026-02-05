'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ORCHESTRATOR_API_BASE } from '@/lib/services/orchestratorApi'
import { nodeMatchesFilter, renderMarkdown, sanitizeHtml } from '@/lib/artifacts/viewerUtils'

type ArtifactItem = {
  artifactId?: string
  fileName?: string
  filePath?: string
  mimeType?: string
  size?: number
  createdAt?: string
}

type TabKey = 'rendered' | 'raw' | 'files'

const toFileUrl = (path: string) => `file:///${path.replace(/\\/g, '/')}`
const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const getExtension = (name: string) => {
  const idx = name.lastIndexOf('.')
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : ''
}

const formatValue = (value: unknown) => {
  if (value === null) return 'null'
  if (typeof value === 'string') return `"${value}"`
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `[${value.length} items]`
  if (typeof value === 'object') return '{...}'
  return String(value)
}

const JsonNode = ({
  label,
  value,
  path,
  filter,
  onCopy,
}: {
  label: string
  value: unknown
  path: string
  filter: string
  onCopy: (path: string) => void
}) => {
  if (!nodeMatchesFilter(value, filter)) return null
  const isObject = typeof value === 'object' && value !== null
  if (!isObject) {
    return (
      <div className="flex items-center gap-3 text-xs text-slate-200">
        <span className="font-mono text-slate-300">{label}</span>
        <span className="text-slate-400">{formatValue(value)}</span>
        <button
          className="text-[11px] text-blue-300 underline"
          onClick={(event) => {
            event.stopPropagation()
            event.preventDefault()
            onCopy(path)
          }}
        >
          Copy path
        </button>
      </div>
    )
  }

  const entries = Array.isArray(value) ? value.map((item, idx) => [String(idx), item]) : Object.entries(value)
  const summaryMeta = Array.isArray(value) ? `Array(${entries.length})` : `Object(${entries.length})`

  return (
    <details open className="rounded border border-slate-800 bg-slate-950/30 px-3 py-2">
      <summary className="flex cursor-pointer items-center gap-3 text-xs text-slate-200">
        <span className="font-mono">{label}</span>
        <span className="text-slate-400">{summaryMeta}</span>
        <button
          className="text-[11px] text-blue-300 underline"
          onClick={(event) => {
            event.stopPropagation()
            event.preventDefault()
            onCopy(path)
          }}
        >
          Copy path
        </button>
      </summary>
      <div className="mt-2 space-y-2 pl-4">
        {entries.length === 0 && <div className="text-xs text-slate-500">No entries</div>}
        {entries.map(([key, val]) => {
          const nextPath = Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`
          return (
            <JsonNode
              key={`${path}-${key}`}
              label={key}
              value={val}
              path={nextPath}
              filter={filter}
              onCopy={onCopy}
            />
          )
        })}
      </div>
    </details>
  )
}

export default function ArtifactViewerPage({
  params,
}: {
  params: { runId: string; artifactId: string }
}) {
  const runId = safeDecode(params.runId)
  const artifactId = safeDecode(params.artifactId)

  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([])
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactItem | null>(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('rendered')
  const [jsonFilter, setJsonFilter] = useState('')
  const [textFilter, setTextFilter] = useState('')

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      setContent('')
      setSelectedArtifact(null)
      setArtifacts([])
      setTextFilter('')
      setJsonFilter('')
      setActiveTab('rendered')

      if (!ORCHESTRATOR_API_BASE) {
        setError('Orchestrator API base is not configured.')
        setLoading(false)
        return
      }

      try {
        const listRes = await fetch(
          `${ORCHESTRATOR_API_BASE}/orchestrate/repo/${encodeURIComponent(runId)}/artifacts`
        )
        if (!listRes.ok) {
          const text = await listRes.text().catch(() => '')
          throw new Error(text || `Failed to load artifacts (${listRes.status})`)
        }
        const listPayload = (await listRes.json()) as { artifacts?: ArtifactItem[] }
        const items = Array.isArray(listPayload.artifacts) ? listPayload.artifacts : []
        if (!cancelled) setArtifacts(items)

        const match = items.find((item) => item.artifactId === artifactId) || null
        if (!match) {
          throw new Error('Artifact not found in run index.')
        }
        if (!cancelled) setSelectedArtifact(match)

        const contentRes = await fetch(
          `${ORCHESTRATOR_API_BASE}/orchestrate/repo/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactId)}`
        )
        if (!contentRes.ok) {
          const text = await contentRes.text().catch(() => '')
          throw new Error(text || `Failed to load artifact (${contentRes.status})`)
        }
        const text = await contentRes.text()
        if (!cancelled) setContent(text)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load artifact.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [runId, artifactId])

  const runDir = useMemo(() => {
    const path = selectedArtifact?.filePath || artifacts[0]?.filePath
    if (!path) return undefined
    const normalized = path.replace(/\\/g, '/')
    return normalized.slice(0, normalized.lastIndexOf('/'))
  }, [selectedArtifact, artifacts])

  const mimeType = selectedArtifact?.mimeType || ''
  const fileName = selectedArtifact?.fileName || ''
  const extension = getExtension(fileName)
  const isMarkdown = mimeType.includes('markdown') || extension === 'md'
  const isJson = mimeType.includes('json') || extension === 'json'
  const isHtml = mimeType.includes('html') || extension === 'html' || extension === 'htm'
  const isText =
    mimeType.startsWith('text/') ||
    ['log', 'txt', 'diff', 'patch'].includes(extension) ||
    (!mimeType && !isMarkdown && !isJson && !isHtml)

  const parsedJson = useMemo(() => {
    if (!isJson) return null
    try {
      return JSON.parse(content)
    } catch {
      return null
    }
  }, [content, isJson])

  const renderedMarkdown = useMemo(() => {
    if (!isMarkdown) return ''
    return renderMarkdown(content)
  }, [content, isMarkdown])

  const renderedHtml = useMemo(() => {
    if (!isHtml) return ''
    return sanitizeHtml(content)
  }, [content, isHtml])

  const filteredLines = useMemo(() => {
    const lines = content.split(/\r?\n/)
    if (!textFilter.trim()) return lines
    const lowered = textFilter.toLowerCase()
    return lines.filter((line) => line.toLowerCase().includes(lowered))
  }, [content, textFilter])

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      return
    }
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'rendered', label: 'Rendered' },
    { key: 'raw', label: 'Raw' },
    { key: 'files', label: 'Files' },
  ]

  return (
    <main className="max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Artifact Viewer</h1>
        <p className="mt-1 text-sm text-slate-400">
          Inspect orchestration artifacts with clean rendering, raw access, and downloadable bundles.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-100">{fileName || 'Artifact'}</div>
            <div className="text-xs text-slate-400">Run: {runId}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800/60" href="/github">
              Back to GitHub
            </Link>
            {runId && ORCHESTRATOR_API_BASE && (
              <a
                className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800/60"
                href={`${ORCHESTRATOR_API_BASE}/orchestrate/repo/${encodeURIComponent(runId)}/artifacts.zip`}
                target="_blank"
                rel="noreferrer"
              >
                Download ZIP
              </a>
            )}
            {runDir && (
              <a
                className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800/60"
                href={toFileUrl(runDir)}
                target="_blank"
                rel="noreferrer"
              >
                Open Run Folder
              </a>
            )}
            {selectedArtifact?.filePath && (
              <a
                className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800/60"
                href={toFileUrl(selectedArtifact.filePath)}
                target="_blank"
                rel="noreferrer"
              >
                Open Externally
              </a>
            )}
          </div>
        </div>
      </div>

      {loading && (
        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="h-4 w-32 rounded bg-slate-800/60" />
          <div className="h-3 w-64 rounded bg-slate-800/40" />
          <div className="h-48 rounded bg-slate-800/30" />
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-rose-800 bg-rose-900/30 p-4 text-sm text-rose-100">
          <div className="font-semibold">Artifact unavailable</div>
          <p className="mt-1">{error}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <Link className="underline text-rose-200" href={`/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactId)}`}>
              Retry
            </Link>
            {runId && ORCHESTRATOR_API_BASE && (
              <a
                className="underline text-rose-200"
                href={`${ORCHESTRATOR_API_BASE}/orchestrate/repo/${encodeURIComponent(runId)}/artifacts`}
                target="_blank"
                rel="noreferrer"
              >
                View files
              </a>
            )}
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3 text-sm">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                className={`rounded-full px-3 py-1 text-xs ${
                  activeTab === tab.key ? 'bg-blue-500/20 text-blue-100' : 'text-slate-300 hover:bg-slate-800/60'
                }`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab !== 'files' && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              {selectedArtifact?.mimeType && <span>Mime: {selectedArtifact.mimeType}</span>}
              {selectedArtifact?.size !== undefined && <span>Size: {selectedArtifact.size} bytes</span>}
              {selectedArtifact?.createdAt && <span>Created: {selectedArtifact.createdAt}</span>}
            </div>
          )}

          {activeTab === 'rendered' && (
            <div className="mt-4 space-y-3">
              {isMarkdown && (
                <div
                  className="prose prose-invert max-w-none rounded-xl border border-slate-800 bg-slate-950/40 p-4"
                  dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
                />
              )}
              {isHtml && (
                <div
                  className="prose prose-invert max-w-none rounded-xl border border-slate-800 bg-slate-950/40 p-4"
                  dangerouslySetInnerHTML={{ __html: renderedHtml }}
                />
              )}
              {isJson && (
                <div className="space-y-3">
                  <input
                    className="w-full rounded border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-100"
                    placeholder="Search JSON…"
                    value={jsonFilter}
                    onChange={(event) => setJsonFilter(event.target.value)}
                  />
                  {parsedJson ? (
                    <JsonNode label="$" value={parsedJson} path="$" filter={jsonFilter} onCopy={handleCopy} />
                  ) : (
                    <div className="text-sm text-slate-400">Unable to parse JSON. Switch to Raw view.</div>
                  )}
                </div>
              )}
              {isText && !isMarkdown && !isHtml && !isJson && (
                <div className="space-y-2">
                  <input
                    className="w-full rounded border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-100"
                    placeholder="Search text…"
                    value={textFilter}
                    onChange={(event) => setTextFilter(event.target.value)}
                  />
                  <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-100">
                    {filteredLines.length > 0 ? filteredLines.join('\n') : 'No matching lines.'}
                  </pre>
                </div>
              )}
            </div>
          )}

          {activeTab === 'raw' && (
            <div className="mt-4 space-y-2">
              <input
                className="w-full rounded border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-100"
                placeholder="Search raw content…"
                value={textFilter}
                onChange={(event) => setTextFilter(event.target.value)}
              />
              <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-100">
                {filteredLines.length > 0 ? filteredLines.join('\n') : 'No matching lines.'}
              </pre>
            </div>
          )}

          {activeTab === 'files' && (
            <div className="mt-4 space-y-2">
              {artifacts.length === 0 && <div className="text-sm text-slate-400">No artifacts found.</div>}
              <div className="grid gap-2 sm:grid-cols-2">
                {artifacts.map((artifact) => (
                  <div key={artifact.artifactId} className="rounded border border-slate-800 bg-slate-950/40 px-3 py-2">
                    <div className="text-sm font-semibold text-slate-100">{artifact.fileName}</div>
                    <div className="text-[11px] text-slate-400">{artifact.mimeType}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-200">
                      {artifact.artifactId && (
                        <Link
                          className="underline"
                          href={`/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifact.artifactId)}`}
                        >
                          View in app
                        </Link>
                      )}
                      {artifact.filePath && (
                        <a className="underline" href={toFileUrl(artifact.filePath)} target="_blank" rel="noreferrer">
                          Open file
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
