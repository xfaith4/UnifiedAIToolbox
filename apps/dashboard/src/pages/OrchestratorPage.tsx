import React, { useEffect, useState } from 'react'
import { addRun, listRuns, type OrchestrationRun } from '../services/orchestratorStore'
import { fetchPromptLibrary, PROMPT_API_BASE, type PromptItem } from '../services/promptStore'
import { loadDatasets, type DatasetEntry } from '../services/datasetStore'
import { createRunApi } from '../services/orchestratorApi'

export default function OrchestratorPage() {
  const [runs, setRuns] = useState<OrchestrationRun[]>([])
  const [prompts, setPrompts] = useState<PromptItem[]>([])
  const [datasets, setDatasets] = useState<DatasetEntry[]>([])
  const [form, setForm] = useState<OrchestrationRun>({
    prompt_id: '',
    version: '',
    review_policy: 'standard',
    status: 'queued',
    dataset_id: '',
    dataset_name: '',
  })

  useEffect(() => {
    setRuns(listRuns())
    fetchPromptLibrary().then(setPrompts).catch(() => setPrompts([]))
    setDatasets(loadDatasets())
  }, [])

  const handlePromptSelect = (promptId: string) => {
    const selected = prompts.find((p) => p.id === promptId)
    setForm((f) => ({
      ...f,
      prompt_id: promptId,
      version: selected?.version || f.version,
    }))
  }

  const handleDatasetSelect = (datasetId: string) => {
    const ds = datasets.find((d) => d.id === datasetId)
    setForm((f) => ({
      ...f,
      dataset_id: datasetId || undefined,
      dataset_name: ds?.name || '',
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.prompt_id.trim()) return
    const entry: OrchestrationRun = {
      ...form,
      requested_at: new Date().toISOString(),
    }

    const launch = async () => {
      if (PROMPT_API_BASE) {
        try {
          const apiRun = await createRunApi(entry)
          setRuns((prev) => [apiRun, ...prev])
        } catch (err) {
          console.warn('API launch failed, falling back to local', err)
          const merged = addRun(entry)
          setRuns(merged)
        }
      } else {
        const merged = addRun(entry)
        setRuns(merged)
      }
      setForm({
        prompt_id: '',
        version: '',
        review_policy: 'standard',
        status: 'queued',
        dataset_id: '',
        dataset_name: '',
      })
    }
    void launch()
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Orchestrator</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Select a prompt from the library and launch a new orchestration. Runs are merged from
          bundled manifests and your local launches.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow md:grid-cols-2 lg:grid-cols-3"
      >
        <div className="space-y-1">
          <label className="text-sm text-slate-300">Prompt</label>
          <select
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
            value={form.prompt_id}
            onChange={(e) => handlePromptSelect(e.target.value)}
          >
            <option value="">Select a prompt…</option>
            {prompts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title || p.id} {p.category ? `(${p.category})` : ''}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500">
            Populated from the prompt library (API + bundled prompts).
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-slate-300">Version</label>
          <input
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
            placeholder="e.g., 2.1.0"
            value={form.version}
            onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-slate-300">Review Policy</label>
          <select
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
            value={form.review_policy}
            onChange={(e) => setForm((f) => ({ ...f, review_policy: e.target.value }))}
          >
            <option value="standard">standard</option>
            <option value="critical">critical</option>
            <option value="none">none</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-slate-300">Status</label>
          <select
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="queued">queued</option>
            <option value="running">running</option>
            <option value="completed">completed</option>
            <option value="failed">failed</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-slate-300">Dataset (optional)</label>
          <select
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
            value={form.dataset_id || ''}
            onChange={(e) => handleDatasetSelect(e.target.value)}
          >
            <option value="">No dataset</option>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.type})
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2 lg:col-span-3">
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            Launch orchestration
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 shadow">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-800/70 text-slate-200">
            <tr>
              <th className="px-4 py-3 text-left">Prompt ID</th>
              <th className="px-4 py-3 text-left">Version</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Review Policy</th>
              <th className="px-4 py-3 text-left">Dataset</th>
              <th className="px-4 py-3 text-left">Requested</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={`${run.prompt_id}-${run.version}`} className="border-t border-slate-800">
                <td className="px-4 py-3 text-slate-100">{run.prompt_id}</td>
                <td className="px-4 py-3 text-slate-300">{run.version || '—'}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-200">
                    {run.status || 'unknown'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-300">{run.review_policy || '—'}</td>
                <td className="px-4 py-3 text-slate-300">
                  {run.dataset_name || run.dataset_id || '—'}
                </td>
                <td className="px-4 py-3 text-slate-300">{run.requested_at || '—'}</td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  No runs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
