import React, { useState, useMemo, useEffect } from 'react';
import type { Task, Artifact, RunMode } from '../types';
import { CloseIcon, DownloadIcon, PaperclipIcon, LoadingIcon } from './icons';
import { getBrowserApiKeyFromEnv } from '../utils/apiKey';
import type { EnginePipelinePayload, PipelineStage } from '@/lib/app-factory/pipeline/pipelineStatus'
import type { RunArtifact } from '@/lib/app-factory/runs/types'

// ── Timeout constants ─────────────────────────────────────────────────────────
// VALIDATE_TIMEOUT: matches the server-side default gate timeout (600 s) + buffer
const VALIDATE_TIMEOUT_MS = 10 * 60 * 1000   // 10 min
// DOWNLOAD_TIMEOUT: zipping an existing run dir is fast; 3 min is generous
const DOWNLOAD_TIMEOUT_MS = 3 * 60 * 1000    // 3 min
// LEGACY_EXPORT_TIMEOUT: legacy path re-runs hardenRepo which can be very slow
const LEGACY_EXPORT_TIMEOUT_MS = 12 * 60 * 1000  // 12 min

/**
 * Wraps fetch() with an AbortController timeout.
 * Throws a user-readable Error when the timeout fires, naming the operation.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  operationLabel: string,
): Promise<Response> {
  const controller = new AbortController()
  const timerId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      const mins = Math.round(timeoutMs / 60000)
      throw new Error(
        `Timed out after ${mins} min: "${operationLabel}".\n` +
        `The server may still be processing. Check the run status page and try again.`,
      )
    }
    throw err
  } finally {
    clearTimeout(timerId)
  }
}

/** Triggers a browser file-save dialog for a Blob. */
function triggerBlobDownload(blob: Blob, filename: string): void {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}

type ExportBlocker = {
  kind: string
  filePath?: string
  ruleId: string
  message: string
  lines?: number[]
  snippet?: string
  phase?: string
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  sessionId?: string | null;
  runMode?: RunMode;
  pipeline: EnginePipelinePayload
  setPipeline: (pipeline: EnginePipelinePayload) => void
  runId?: string | null
  runArtifacts?: RunArtifact[]
  useRunArtifactsExport?: boolean
}

function stageStatus(pipeline: EnginePipelinePayload, id: PipelineStage['id']) {
  return pipeline.stages.find((s) => s.id === id)?.status ?? 'pending'
}

function isRunnable(pipeline: EnginePipelinePayload): boolean {
  if (!pipeline.hardeningEnabled) return true
  return stageStatus(pipeline, 'normalize') === 'passed' && stageStatus(pipeline, 'contract') === 'passed' && stageStatus(pipeline, 'gates') === 'passed'
}

const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  tasks,
  sessionId = null,
  runMode = 'build',
  pipeline,
  setPipeline,
  runId,
  runArtifacts,
  useRunArtifactsExport = false,
}) => {
  // isValidating tracks validate/repair operations; isDownloading tracks download.
  // These are intentionally separate so a long-running repair never blocks the download button.
  const [isValidating, setIsValidating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  // lastError covers validation errors, download errors, and timeouts.
  const [lastError, setLastError] = useState<string | null>(null)
  const [exportBlockers, setExportBlockers] = useState<ExportBlocker[]>([])
  const [buildInfo, setBuildInfo] = useState<{
    runDir: string
    artifactsDir: string
    artifactsDirExists: boolean
    readme: string | null
    fileCount: number
    files: string[]
  } | null>(null)

  useEffect(() => {
    if (!isOpen || !useRunArtifactsExport || !runId) return
    void fetch(`/api/app-factory/runs/${encodeURIComponent(runId)}/info`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data && data.runDir) setBuildInfo(data) })
      .catch(() => null)
  }, [isOpen, useRunArtifactsExport, runId])

  const uniqueArtifacts = useMemo(() => {
    // Defensively handle potentially malformed task data from sources like localStorage.
    if (!Array.isArray(tasks)) {
      return [];
    }
    const allArtifacts = tasks.flatMap(task =>
      (task && Array.isArray(task.artifacts)) ? task.artifacts : []
    );

    const artifactMap = new Map<string, Artifact>();
    for (const artifact of allArtifacts) {
      // Ensure artifact is a valid object with a name before adding it.
      if (artifact && artifact.name) {
        artifactMap.set(artifact.name, artifact);
      }
    }
    return Array.from(artifactMap.values());
  }, [tasks]);

  const runArtifactItems = useMemo(() => {
    if (!Array.isArray(runArtifacts) || runArtifacts.length === 0) return []
    return runArtifacts.map((artifact) => ({
      name: artifact.path,
      type: artifact.type || 'file',
    }))
  }, [runArtifacts])

  const displayArtifacts = runArtifactItems.length > 0 ? runArtifactItems : uniqueArtifacts

  if (!isOpen) return null;

  const validateHardening = async (options?: { repairMode?: boolean }): Promise<EnginePipelinePayload | null> => {
    const repairMode = Boolean(options?.repairMode)
    if (runMode === 'design') {
      setLastError('Design Run selected: acceptance checks are skipped. Switch to Build Run to validate a runnable repo.')
      return null
    }
    setLastError(null)
    setExportBlockers([])
    const startedAt = new Date().toISOString()
    setPipeline({
      ...pipeline,
      stages: pipeline.stages.map((s) =>
        ['decision-lock', 'teams', 'assemble', 'normalize', 'contract', 'gates', 'repair', 'export'].includes(s.id)
          ? { ...s, status: s.id === 'repair' ? 'pending' : 'running', startedAt, endedAt: undefined }
          : s
      ),
    })

    const apiKey = getBrowserApiKeyFromEnv()
    const res = await fetchWithTimeout(
      '/api/app-factory/validate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stackId: 'node-next-app-npm',
          runLabel: repairMode ? 'ui-repair' : 'ui-validate',
          sessionId,
          artifacts: sessionId
            ? []
            : uniqueArtifacts.map((a) => ({
                name: a.name,
                type: a.type,
                content: a.content,
              })),
          config: {
            apiKey: apiKey || undefined,
            runMode,
            maxRepairCycles: repairMode ? 6 : undefined,
          },
        }),
      },
      VALIDATE_TIMEOUT_MS,
      repairMode ? 'Running repair pass' : 'Running acceptance checks',
    )

    const json = await res.json().catch(() => null)
    if (json?.pipeline) setPipeline(json.pipeline as EnginePipelinePayload)

    if (!res.ok) {
      const blockers = Array.isArray(json?.blockers) ? (json.blockers as ExportBlocker[]) : []
      setExportBlockers(blockers)
      const detail = json ? JSON.stringify(json, null, 2) : `HTTP ${res.status}`
      setLastError(detail)
      return null
    }
    setExportBlockers([])
    return (json?.pipeline as EnginePipelinePayload) || null
  }

  const downloadFromRun = async (targetRunId: string) => {
    const res = await fetchWithTimeout(
      useRunArtifactsExport
        ? `/api/app-factory/runs/${encodeURIComponent(targetRunId)}/export`
        : '/api/app-factory/export-run',
      useRunArtifactsExport
        ? { method: 'GET' }
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ runId: targetRunId }),
          },
      DOWNLOAD_TIMEOUT_MS,
      `Downloading artifacts from run ${targetRunId}`,
    )
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`export-run failed: HTTP ${res.status}\n${text}`)
    }
    const blob = await res.blob()
    triggerBlobDownload(blob, `run-${targetRunId}-artifacts.zip`)
  }

  const downloadLegacy = async () => {
    const res = await fetchWithTimeout(
      '/api/app-factory/export',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stackId: 'node-next-app-npm',
          runLabel: 'ui-export',
          sessionId,
          artifacts: sessionId
            ? []
            : uniqueArtifacts.map((a) => ({
                name: a.name,
                type: a.type,
                content: a.content,
              })),
          config: {
            runMode,
          },
        }),
      },
      LEGACY_EXPORT_TIMEOUT_MS,
      'Building and packaging artifacts (this may take several minutes)',
    )

    if (!res.ok) {
      const contentType = res.headers.get('content-type') || ''
      const payload = contentType.includes('application/json') ? await res.json().catch(() => null) : null
      if (res.status === 422) {
        const blockers = Array.isArray(payload?.blockers) ? (payload.blockers as ExportBlocker[]) : []
        setExportBlockers(blockers)
        setLastError('Export blocked by validation — the generated artifacts did not pass acceptance checks.')
      }
      const detail = payload ? JSON.stringify(payload, null, 2) : await res.text()
      throw new Error(`export failed: HTTP ${res.status}\n${detail}`)
    }

    const blob = await res.blob()
    triggerBlobDownload(blob, 'app-factory-repo.zip')
  }

  const handleValidate = async () => {
    if (isValidating) return;
    setIsValidating(true);
    setExportBlockers([])

    try {
      if (!pipeline.hardeningEnabled) return
      await validateHardening()
    } catch (error) {
      console.error("Validation failed:", error);
      setLastError(error instanceof Error ? error.message : 'Validation failed. Check the console for details.')
    } finally {
      setIsValidating(false);
    }
  };

  const handleRepairRun = async () => {
    if (isValidating) return
    setIsValidating(true)
    try {
      if (!pipeline.hardeningEnabled) return
      await validateHardening({ repairMode: true })
    } catch (error) {
      console.error('Repair run failed:', error)
      setLastError(error instanceof Error ? error.message : 'Repair run failed. Check the console for details.')
    } finally {
      setIsValidating(false)
    }
  }

  const handleDownloadZip = async () => {
    if (isDownloading) return
    setIsDownloading(true)
    setLastError(null)
    try {
      // Path 1: direct run artifact export (e.g. maintenance mode)
      if (useRunArtifactsExport && runId) {
        await downloadFromRun(runId)
        return
      }

      // Path 2: design mode — no hardening, just zip the artifacts as-is
      if (runMode === 'design') {
        await downloadLegacy()
        return
      }

      // Path 3: hardening-enabled build run
      if (pipeline.hardeningEnabled) {
        // Warn when validation failed but still allow the download
        if (!isRunnable(pipeline)) {
          const proceed = confirm(
            'Warning: Validation checks failed. The exported artifacts may not be runnable.\n\n' +
            'Do you want to export the artifacts anyway?'
          )
          if (!proceed) {
            return
          }
        }

        if (pipeline.runId) {
          // First attempt: POST export-run (expects runs/{runId}/repo/ subdirectory)
          try {
            await downloadFromRun(pipeline.runId)
            return
          } catch (postErr) {
            console.warn('[ExportModal] POST export-run failed; trying direct GET export.', postErr)
          }

          // Second attempt: GET export (zips the entire run directory as-is, no hardenRepo re-run).
          // This succeeds even when validation failed, because it just reads what's on disk.
          try {
            const res = await fetchWithTimeout(
              `/api/app-factory/runs/${encodeURIComponent(pipeline.runId)}/export`,
              { method: 'GET' },
              DOWNLOAD_TIMEOUT_MS,
              `Downloading all artifacts from run ${pipeline.runId}`,
            )
            if (!res.ok) {
              const errText = await res.text().catch(() => `HTTP ${res.status}`)
              throw new Error(`Run export failed: HTTP ${res.status}\n${errText}`)
            }
            const blob = await res.blob()
            triggerBlobDownload(blob, `run-${pipeline.runId}-artifacts.zip`)
            return
          } catch (getErr) {
            // Both direct-download paths failed. Surface the error without re-running hardenRepo,
            // which would be slow and would block again if validation still fails.
            const msg = getErr instanceof Error ? getErr.message : String(getErr)
            setLastError(
              `Could not download artifacts from run "${pipeline.runId}".\n${msg}\n\n` +
              `Try re-running acceptance checks or starting a new build.`,
            )
            return
          }
        }

        // No pipeline.runId: no prior run to pull from, so run the full legacy export.
        // Note: this re-runs hardenRepo and will block (422) if the generated code fails validation.
        await downloadLegacy()
        return
      }

      // Path 4: hardening disabled — simple zip of whatever was generated
      await downloadLegacy()
    } catch (error) {
      console.error("Failed to generate zip file:", error);
      const msg = error instanceof Error ? error.message : String(error)
      if (!lastError) {
        setLastError(`Download failed: ${msg}`)
      }
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl border border-gray-700 transform transition-all animate-fade-in-up">
        <style>{`
          @keyframes fade-in-up {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in-up { animation: fade-in-up 0.3s ease-out forwards; }
        `}</style>
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold">Export App Factory Results</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-700 transition-colors">
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {lastError && (
            <div className="mb-4 p-3 rounded border border-amber-700 bg-amber-900/20 text-amber-200 text-xs whitespace-pre-wrap">
              <strong>⚠️ Notice</strong>
              {'\n\n'}
              {lastError.length > 1800 ? lastError.slice(0, 1800) + '…' : lastError}
            </div>
          )}
          {exportBlockers.length > 0 && (
            <div className="mb-4 p-3 rounded border border-rose-700 bg-rose-950/30 text-rose-100">
              <div className="font-semibold mb-2">Export Blockers</div>
              <ul className="space-y-2 text-xs">
                {exportBlockers.map((blocker, index) => (
                  <li key={`${blocker.ruleId}-${index}`} className="rounded border border-rose-800/70 p-2">
                    <div className="font-mono">{blocker.filePath || '(pipeline)'}</div>
                    <div>{blocker.ruleId}: {blocker.message}</div>
                    {Array.isArray(blocker.lines) && blocker.lines.length > 0 && <div>Lines: {blocker.lines.join(', ')}</div>}
                    {blocker.snippet && <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[11px] text-rose-200">{blocker.snippet}</pre>}
                    {blocker.filePath && (
                      <button
                        type="button"
                        className="mt-1 rounded bg-rose-900/40 px-2 py-1 text-[11px] hover:bg-rose-900/70"
                        onClick={() => navigator.clipboard?.writeText(blocker.filePath || '')}
                      >
                        Copy path
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {buildInfo && (
            <div className="mb-4 rounded-lg border border-emerald-700/60 bg-emerald-950/20 p-4">
              <h3 className="text-sm font-semibold text-emerald-200 mb-2">Build Output Location</h3>
              <div className="flex items-center gap-2 mb-2">
                <code className="flex-1 truncate rounded bg-gray-900/60 px-2 py-1 text-xs font-mono text-emerald-100">
                  {buildInfo.artifactsDirExists ? buildInfo.artifactsDir : buildInfo.runDir}
                </code>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(buildInfo.artifactsDirExists ? buildInfo.artifactsDir : buildInfo.runDir)}
                  className="shrink-0 rounded bg-emerald-900/40 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-900/70"
                >
                  Copy
                </button>
              </div>
              <p className="text-[11px] text-emerald-300/70">
                {buildInfo.fileCount} file{buildInfo.fileCount !== 1 ? 's' : ''} generated — files are ready locally, no download needed.
              </p>
              {buildInfo.readme && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-[11px] font-semibold text-emerald-200 hover:text-emerald-100">
                    README.md
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-gray-900/60 p-2 text-[11px] text-gray-300">
                    {buildInfo.readme}
                  </pre>
                </details>
              )}
            </div>
          )}

          <div className="bg-gray-700/50 p-4 rounded-lg">
            <h3 className="flex items-center text-lg font-semibold mb-3">
              <PaperclipIcon className="w-5 h-5 mr-2 text-indigo-400" /> Generated Artifacts
            </h3>
            {displayArtifacts.length > 0 ? (
              <ul className="space-y-2">
                {displayArtifacts.map((artifact, index) => (
                  <li key={`${artifact.name}-${index}`} className="flex items-center justify-between bg-gray-900/50 p-2 rounded">
                    <span className="font-mono text-sm">{artifact.name}</span>
                    <span className="text-xs px-2 py-1 bg-indigo-500/20 text-indigo-300 rounded-full">{artifact.type}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-400">No artifacts were generated.</p>
            )}
          </div>
        </div>

        <div className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors">
            Close
          </button>
          {pipeline.hardeningEnabled && runMode !== 'design' ? (
            <>
              <button
                onClick={handleValidate}
                disabled={isValidating || displayArtifacts.length === 0 || useRunArtifactsExport}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg flex items-center transition-colors disabled:opacity-60 disabled:cursor-wait"
              >
                {isValidating ? (
                  <>
                    <LoadingIcon className="w-5 h-5 mr-2 animate-spin" />
                    Validating…
                  </>
                ) : (
                  'Run acceptance checks'
                )}
              </button>
              <button
                onClick={handleRepairRun}
                disabled={isValidating || displayArtifacts.length === 0 || useRunArtifactsExport}
                className="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-white font-semibold rounded-lg flex items-center transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                title="Run another validation cycle with extended repair attempts using the same generated artifacts."
              >
                {isValidating ? (
                  <>
                    <LoadingIcon className="w-5 h-5 mr-2 animate-spin" />
                    Repairing…
                  </>
                ) : (
                  'Run repair pass'
                )}
              </button>
              <button
                onClick={handleDownloadZip}
                disabled={isDownloading || displayArtifacts.length === 0}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg flex items-center transition-colors disabled:bg-indigo-400 disabled:cursor-not-allowed"
                title={!isRunnable(pipeline) ? 'Validation failed - exported artifacts may not be runnable' : 'Download exported artifacts'}
              >
                {isDownloading ? (
                  <>
                    <LoadingIcon className="w-5 h-5 mr-2 animate-spin" />
                    Downloading…
                  </>
                ) : (
                  <>
                    <DownloadIcon className="w-5 h-5 mr-2" />
                    Download .zip {!isRunnable(pipeline) && '⚠️'}
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              onClick={handleDownloadZip}
              disabled={isDownloading || displayArtifacts.length === 0}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg flex items-center transition-colors disabled:bg-indigo-400 disabled:cursor-wait"
            >
              {isDownloading ? (
                <>
                  <LoadingIcon className="w-5 h-5 mr-2 animate-spin" />
                  Downloading...
                </>
              ) : (
                <>
                  <DownloadIcon className="w-5 h-5 mr-2" />
                  {runMode === 'design' ? 'Download docs as .zip' : 'Download Project as .zip'}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
