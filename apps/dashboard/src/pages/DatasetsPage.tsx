import React, { useEffect, useState } from 'react'
import {
  deleteDataset,
  importDataset,
  loadDatasets,
  previewDataset,
  transformDataset,
  type DatasetEntry,
} from '../services/datasetStore'

export default function DatasetsPage() {
  const [datasets, setDatasets] = useState<DatasetEntry[]>([])
  const [status, setStatus] = useState<string>('')
  const [previewText, setPreviewText] = useState<string>('')
  const [previewTitle, setPreviewTitle] = useState<string>('')
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    setDatasets(loadDatasets())
  }, [])

  const handleImport = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setStatus('Importing...')
    for (const file of Array.from(files)) {
      await importDataset(file)
    }
    setDatasets(loadDatasets())
    setStatus('Imported')
    setTimeout(() => setStatus(''), 1500)
  }

  const handleDelete = (id: string) => {
    const updated = deleteDataset(id)
    setDatasets(updated)
  }

  const handlePreview = (ds: DatasetEntry) => {
    setPreviewText(previewDataset(ds.id, 40))
    setPreviewTitle(ds.name)
    setShowPreview(true)
  }

  const handleTransform = (ds: DatasetEntry) => {
    if (ds.type === 'syslog' || ds.type === 'text') {
      const updated = transformDataset(ds.id, 'syslog-to-json')
      if (updated) setDatasets(loadDatasets())
    } else if (ds.type === 'genesys-conversations') {
      const updated = transformDataset(ds.id, 'summarize')
      if (updated) setDatasets(loadDatasets())
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Datasets</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Import local datasets (Genesys conversations JSON, router/syslog text, or generic JSON) for
          evaluations and prompt tuning.
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-slate-200 font-semibold">Import dataset</p>
            <p className="text-xs text-slate-500">
              JSON (Genesys conversations or generic) or text/syslog files. Stored locally in this browser.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-100 hover:bg-slate-800">
            <input type="file" className="hidden" onChange={(e) => handleImport(e.target.files)} />
            Choose file
          </label>
        </div>
        {status && <div className="text-xs text-slate-400">{status}</div>}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 shadow">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-800/70 text-slate-200">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Items</th>
              <th className="px-4 py-3 text-left">Size</th>
              <th className="px-4 py-3 text-left">Imported</th>
              <th className="px-4 py-3 text-left">Preview</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {datasets.map((ds) => (
              <tr key={ds.id} className="border-t border-slate-800 align-top">
                <td className="px-4 py-3 text-slate-100">{ds.name}</td>
                <td className="px-4 py-3 text-slate-300">{ds.type}</td>
                <td className="px-4 py-3 text-slate-300">{ds.items}</td>
                <td className="px-4 py-3 text-slate-300">
                  {(ds.sizeBytes / 1024).toFixed(1)} KB
                </td>
                <td className="px-4 py-3 text-slate-300">{ds.importedAt}</td>
                <td className="px-4 py-3 text-slate-200 whitespace-pre-line text-xs max-w-lg">
                  {ds.preview}
                </td>
                <td className="px-4 py-3 space-y-2">
                  <button
                    className="rounded-lg border border-red-600 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-600/20"
                    onClick={() => handleDelete(ds.id)}
                  >
                    Delete
                  </button>
                  <div className="flex flex-col gap-2">
                    <button
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
                      onClick={() => handlePreview(ds)}
                    >
                      Preview / Copy
                    </button>
                    {(ds.type === 'syslog' || ds.type === 'text' || ds.type === 'genesys-conversations') && (
                      <button
                        className="rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-600/20"
                        onClick={() => handleTransform(ds)}
                      >
                        {ds.type === 'genesys-conversations' ? 'Summarize' : 'Parse to JSON'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {datasets.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  No datasets yet. Import a JSON or text/syslog file to begin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-4xl rounded-xl border border-slate-800 bg-slate-900 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div className="text-sm font-semibold text-slate-100">{previewTitle}</div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
                  onClick={() => {
                    navigator.clipboard.writeText(previewText || '').catch(() => {
                      window.alert('Copy failed; please copy manually.')
                    })
                  }}
                >
                  Copy
                </button>
                <button
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
                  onClick={() => setShowPreview(false)}
                >
                  Close
                </button>
              </div>
            </div>
            <pre className="max-h-[70vh] overflow-auto bg-slate-950 px-4 py-3 text-xs text-slate-200 whitespace-pre-wrap">
              {previewText}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
