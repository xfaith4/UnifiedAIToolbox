import React, { useEffect, useState } from 'react'
import { addRun, listRuns, type OrchestrationRun } from '../services/orchestratorStore'
import { fetchPromptLibrary, PROMPT_API_BASE, type PromptItem } from '../services/promptStore'
import { loadDatasets, type DatasetEntry } from '../services/datasetStore'
import { createRunApi, fetchRunApi, fetchRunsApi, fetchRunLogApi } from '../services/orchestratorApi'

export default function OrchestratorPage() {
  const [runs, setRuns] = useState<OrchestrationRun[]>([])
  const [prompts, setPrompts] = useState<PromptItem[]>([])
  const [datasets, setDatasets] = useState<DatasetEntry[]>([])
  const [logRun, setLogRun] = useState<OrchestrationRun | null>(null)
  const [logText, setLogText] = useState<string>('')
  const [logError, setLogError] = useState<string>('')
  const [logLoading, setLogLoading] = useState(false)
  const [logEvents, setLogEvents] = useState<OrchestrationRun['events']>([])
  const [logPollId, setLogPollId] = useState<number | null>(null)
  const [form, setForm] = useState<OrchestrationRun>({
    prompt_id: '',
    version: '',
    review_policy: 'standard',
    status: 'queued',
    dataset_id: '',
    dataset_name: '',
    goal: '',
    run_mode: 'default',
  })

  useEffect(() => {
    const loadAll = async () => {
      if (PROMPT_API_BASE) {
        try {
          const apiRuns = await fetchRunsApi()
          setRuns(apiRuns)
        } catch {
          setRuns(listRuns())
        }
      } else {
        setRuns(listRuns())
      }
      fetchPromptLibrary().then(setPrompts).catch(() => setPrompts([]))
      setDatasets(loadDatasets())
    }
    void loadAll()

    const id = window.setInterval(() => {
      if (PROMPT_API_BASE) {
        fetchRunsApi()
          .then(setRuns)
          .catch(() => setRuns(listRuns()))
      } else {
        setRuns(listRuns())
      }
    }, 4000)
    return () => window.clearInterval(id)
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
      run_id: form.run_mode === 'codex-swarm' ? `codex-${Date.now()}` : `local-${Date.now()}`,
      ...form,
      status: 'queued', // always system-managed
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
          // simulate completion in local mode
          window.setTimeout(() => {
            setRuns((prev) =>
              prev.map((r) =>
                r.run_id === entry.run_id ? { ...r, status: 'completed', mode: 'simulated' } : r
              )
            )
          }, 2500)
        }
      } else {
        const merged = addRun(entry)
        setRuns(merged)
        // simulate completion in local mode
        window.setTimeout(() => {
          setRuns((prev) =>
            prev.map((r) =>
              r.run_id === entry.run_id ? { ...r, status: 'completed', mode: 'simulated' } : r
            )
          )
        }, 2500)
      }
      setForm({
        prompt_id: '',
        version: '',
        review_policy: 'standard',
        status: 'queued',
        dataset_id: '',
        dataset_name: '',
        goal: '',
      })
    }
    void launch()
  }

  const fetchLogBundle = async (run: OrchestrationRun, silent = false) => {
    if (!run) return
    if (!silent) setLogLoading(true)
    setLogError('')
    try {
      if (run.run_id && PROMPT_API_BASE) {
        const latest = await fetchRunApi(run.run_id)
        setLogRun(latest)
        setLogEvents(latest.events ?? [])

        let manifestText = JSON.stringify(latest, null, 2)
        try {
          const logResp = await fetchRunLogApi(run.run_id)
          if (logResp?.log) {
            manifestText = `${manifestText}\n\n--- LOG ---\n${logResp.log}`
          }
        } catch {
          // log fetch can fail independently; keep manifest text
        }
        setLogText(manifestText)
      } else {
        setLogText(JSON.stringify(run, null, 2))
        setLogEvents(run.events ?? [])
      }
    } catch (err) {
      setLogError(err instanceof Error ? err.message : 'Failed to fetch run')
      setLogText(JSON.stringify(run, null, 2))
      setLogEvents(run.events ?? [])
    } finally {
      if (!silent) setLogLoading(false)
    }
  }

  const handleLogs = async (run: OrchestrationRun) => {
    setLogRun(run)
    setLogText('')
    setLogEvents([])
    await fetchLogBundle(run)
  }

  useEffect(() => {
    if (!logRun || !PROMPT_API_BASE) return
    const id = window.setInterval(() => {
      void fetchLogBundle(logRun, true)
    }, 4000)
    setLogPollId(id)
    return () => {
      window.clearInterval(id)
      setLogPollId(null)
    }
  }, [logRun?.run_id, PROMPT_API_BASE])

  return (
    <>
      <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Orchestrator</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Select a prompt from the library and launch a new orchestration. Runs are merged from
          bundled manifests and your local launches.
        </p>
        {!PROMPT_API_BASE && (
          <p className="text-xs text-amber-400">
            No API configured; runs are stored locally. Set VITE_API_URL to trigger backend execution.
          </p>
        )}
        {runs.some((r) => r.mode === 'simulated' || (r.status || '').startsWith('error')) && (
          <p className="text-xs text-amber-400">
            Some runs are simulated or failed to execute the external orchestrator. Ensure ORCHESTRATOR_PS1 and PowerShell are configured on the server.
          </p>
        )}
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
          <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
            <span className="rounded-full bg-slate-900 px-2 py-1 text-xs text-slate-200">
              {form.status || 'queued'}
            </span>
            <span className="text-[11px] text-slate-400">System managed</span>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-slate-300">Engine</label>
          <select
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
            value={form.run_mode || 'default'}
            onChange={(e) => setForm((f) => ({ ...f, run_mode: e.target.value }))}
          >
            <option value="default">Default Orchestrator</option>
            <option value="codex-swarm">Codex Swarm Review</option>
          </select>
          <p className="text-xs text-slate-500">
            Default uses MilestoneController; Codex Swarm runs Orchestrate-Codex.ps1 over the repo.
          </p>
        </div>
        <div className="space-y-1 md:col-span-2 lg:col-span-3">
          <label className="text-sm text-slate-300">Goal / Task (optional)</label>
          <textarea
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
            rows={3}
            placeholder="Describe the goal for this orchestration run"
            value={form.goal || ''}
            onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))}
          />
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
              <th className="px-4 py-3 text-left">Engine</th>
              <th className="px-4 py-3 text-left">Requested</th>
              <th className="px-4 py-3 text-left">Logs</th>
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
                <td className="px-4 py-3 text-slate-300">
                  {run.run_mode || 'default'} {run.mode === 'simulated' ? '(simulated)' : ''}
                </td>
                <td className="px-4 py-3 text-slate-300">{run.requested_at || '—'}</td>
                <td className="px-4 py-3">
                  <button
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
                    onClick={() => handleLogs(run)}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  No runs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </div>

      {logRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
        <div className="w-full max-w-6xl rounded-xl border border-slate-800 bg-slate-900 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <div className="text-sm font-semibold text-slate-100 flex flex-col gap-1">
              <span>
                Run logs: {logRun.prompt_id} ({logRun.run_mode || 'default'})
              </span>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-100">
                  {logRun.status || 'unknown'}
                </span>
                {logRun.model && (
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-100">
                    Model: {logRun.model}
                  </span>
                )}
                {logRun.goal && (
                  <span className="line-clamp-1 text-slate-400">Goal: {logRun.goal}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {logRun.mode === 'simulated' && (
                <span className="text-[11px] text-amber-400">Simulated (orchestrator missing)</span>
              )}
              {logRun.run_id && PROMPT_API_BASE && (
                <button
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
                  onClick={() => fetchLogBundle(logRun)}
                  disabled={logLoading}
                >
                  {logLoading ? 'Refreshing…' : 'Refresh log'}
                </button>
              )}
              <button
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
                onClick={() => setLogRun(null)}
              >
                Close
              </button>
            </div>
          </div>
          <div className="px-4 py-3 text-xs text-slate-300 flex flex-col md:flex-row gap-4">
            <div className="w-full md:w-1/3">
              <div className="font-semibold text-slate-100 mb-2">Events</div>
              <div className="max-h-[60vh] overflow-auto space-y-2">
                {logEvents && logEvents.length > 0 ? (
                  logEvents.map((ev, idx) => (
                    <div key={idx} className="rounded border border-slate-800 bg-slate-950 p-2">
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>{ev.type}</span>
                        <span>{ev.ts}</span>
                      </div>
                      <div className="text-slate-100 text-xs whitespace-pre-wrap">{ev.message}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-500">No events.</div>
                )}
              </div>
            </div>
            <div className="w-full md:w-2/3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-100 mb-2">Manifest / Logs</div>
                <div className="text-xs text-slate-400">
                  {logLoading ? 'Loading…' : logError ? logError : ''}
                </div>
              </div>
              <pre className="max-h-[60vh] overflow-auto bg-slate-950 px-4 py-3 text-xs text-slate-200 whitespace-pre-wrap">
                {logText}
              </pre>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
