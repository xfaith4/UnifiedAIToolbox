import React, { useEffect, useState } from 'react'
import { CloseIcon, LoadingIcon } from './icons'

type Props = {
  isOpen: boolean
  onClose: () => void
  runId: string
  relPath: string
  title?: string
}

const RunFileModal: React.FC<Props> = ({ isOpen, onClose, runId, relPath, title }) => {
  const [isLoading, setIsLoading] = useState(false)
  const [content, setContent] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      setError(null)
      setContent('')
      try {
        const res = await fetch('/api/app-factory/file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId, relPath }),
        })
        if (!res.ok) {
          const text = await res.text()
          throw new Error(`HTTP ${res.status}: ${text}`)
        }
        const json = (await res.json()) as { content?: string }
        if (!cancelled) setContent(json.content || '')
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [isOpen, runId, relPath])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-3xl border border-gray-700 transform transition-all animate-fade-in-up">
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <div className="min-w-0">
            <h2 className="text-lg font-bold truncate">{title || relPath}</h2>
            <div className="text-[11px] text-gray-500 font-mono truncate">
              run: {runId} • file: {relPath}
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-700 transition-colors">
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 max-h-[70vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center gap-2 text-gray-300">
              <LoadingIcon className="w-5 h-5 animate-spin" /> Loading…
            </div>
          ) : error ? (
            <div className="text-red-300 whitespace-pre-wrap">{error}</div>
          ) : (
            <pre className="text-xs whitespace-pre-wrap bg-gray-900/40 border border-gray-700 rounded p-3">{content}</pre>
          )}
        </div>
      </div>
    </div>
  )
}

export default RunFileModal

