import React, { useState, useMemo } from 'react';
import type { Task, Artifact, RunMode } from '../types';
import { CloseIcon, DownloadIcon, PaperclipIcon, LoadingIcon } from './icons';
import { getBrowserApiKeyFromEnv } from '../utils/apiKey';
import type { EnginePipelinePayload, PipelineStage } from '@/lib/app-factory/pipeline/pipelineStatus'
import type { RunArtifact } from '@/lib/app-factory/runs/types'

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
  const [isZipping, setIsZipping] = useState(false);
  const [lastValidationError, setLastValidationError] = useState<string | null>(null)
  const [exportBlockers, setExportBlockers] = useState<ExportBlocker[]>([])

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
      setLastValidationError('Design Run selected: acceptance checks are skipped. Switch to Build Run to validate a runnable repo.')
      return null
    }
    setLastValidationError(null)
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
    const res = await fetch('/api/app-factory/validate', {
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
    })

    const json = await res.json().catch(() => null)
    if (json?.pipeline) setPipeline(json.pipeline as EnginePipelinePayload)

    if (!res.ok) {
      const blockers = Array.isArray(json?.blockers) ? (json.blockers as ExportBlocker[]) : []
      setExportBlockers(blockers)
      const detail = json ? JSON.stringify(json, null, 2) : `HTTP ${res.status}`
      setLastValidationError(detail)
      return null
    }
    setExportBlockers([])
    return (json?.pipeline as EnginePipelinePayload) || null
  }

  const downloadFromRun = async (runId: string) => {
    const res = await fetch(
      useRunArtifactsExport ? `/api/app-factory/runs/${encodeURIComponent(runId)}/export` : '/api/app-factory/export-run',
      useRunArtifactsExport
        ? { method: 'GET' }
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ runId }),
          }
    )
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`export-run failed: HTTP ${res.status}\n${text}`)
    }
    const blob = await res.blob()
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `run-${runId}-artifacts.zip`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(link.href)
  }

  const downloadLegacy = async () => {
    const apiKey = getBrowserApiKeyFromEnv()
    const res = await fetch('/api/app-factory/export', {
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
          apiKey: apiKey || undefined,
          runMode,
        },
      }),
    })

    if (!res.ok) {
      const contentType = res.headers.get('content-type') || ''
      const payload = contentType.includes('application/json') ? await res.json().catch(() => null) : null
      if (res.status === 422) {
        const blockers = Array.isArray(payload?.blockers) ? (payload.blockers as ExportBlocker[]) : []
        setExportBlockers(blockers)
        setLastValidationError('Export blocked by validation')
      }
      const detail = payload ? JSON.stringify(payload, null, 2) : await res.text()
      throw new Error(`export failed: HTTP ${res.status}\n${detail}`)
    }

    const blob = await res.blob()
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'app-factory-repo.zip'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(link.href)
  }

  const handleValidate = async () => {
    if (isZipping) return;
    setIsZipping(true);
    setExportBlockers([])

    try {
      if (!pipeline.hardeningEnabled) return
      await validateHardening()
    } catch (error) {
      console.error("Validation failed:", error);
      if (!lastValidationError) {
        alert("An error occurred while validating artifacts. Please check the console.")
      }
    } finally {
      setIsZipping(false);
    }
  };

  const handleRepairRun = async () => {
    if (isZipping) return
    setIsZipping(true)
    try {
      if (!pipeline.hardeningEnabled) return
      await validateHardening({ repairMode: true })
    } catch (error) {
      console.error('Repair run failed:', error)
      if (!lastValidationError) {
        alert('An error occurred while running repair. Please check the console.')
      }
    } finally {
      setIsZipping(false)
    }
  }

  const handleDownloadZip = async () => {
    if (isZipping) return
    setIsZipping(true)
    try {
      if (useRunArtifactsExport && runId) {
        await downloadFromRun(runId)
        return
      }
      if (runMode === 'design') {
        await downloadLegacy()
        return
      }
      if (pipeline.hardeningEnabled) {
        // Allow export even if validation failed, but warn the user
        if (!isRunnable(pipeline)) {
          const proceed = confirm(
            'Warning: Validation checks failed. The exported artifacts may not be runnable.\n\n' +
            'Do you want to export the artifacts anyway?'
          )
          if (!proceed) {
            return
          }
        }
        
        // Prefer run export when available; fall back to session artifacts if run export fails.
        if (pipeline.runId) {
          try {
            await downloadFromRun(pipeline.runId)
          } catch (runExportError) {
            console.warn('Run-based export failed; falling back to session artifacts export.', runExportError)
            setLastValidationError(
              `Run export failed for ${pipeline.runId}. Falling back to session artifacts export.\n` +
              `${runExportError instanceof Error ? runExportError.message : String(runExportError)}`
            )
            await downloadLegacy()
          }
        } else {
          await downloadLegacy()
        }
        return
      }

      await downloadLegacy()
    } catch (error) {
      console.error("Failed to generate zip file:", error);
      if (!lastValidationError) {
        alert("An error occurred while creating the zip file. Please check the console.")
      }
    } finally {
      setIsZipping(false);
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
          {lastValidationError && (
            <div className="mb-4 p-3 rounded border border-amber-700 bg-amber-900/20 text-amber-200 text-xs whitespace-pre-wrap">
              <strong>⚠️ Validation Failed</strong>
              {'\n\n'}
              The acceptance checks detected issues with the generated artifacts. You can still export the artifacts, but they may not be runnable without fixing the issues below.
              {'\n\n'}
              <strong>Issues:</strong>
              {'\n'}
              {lastValidationError.length > 1800 ? lastValidationError.slice(0, 1800) + '…' : lastValidationError}
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
                disabled={isZipping || displayArtifacts.length === 0 || useRunArtifactsExport}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg flex items-center transition-colors disabled:opacity-60 disabled:cursor-wait"
              >
                {isZipping ? (
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
                disabled={isZipping || displayArtifacts.length === 0 || useRunArtifactsExport || runMode === 'design'}
                className="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-white font-semibold rounded-lg flex items-center transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                title="Run another validation cycle with extended repair attempts using the same generated artifacts."
              >
                {isZipping ? (
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
                disabled={isZipping || displayArtifacts.length === 0}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg flex items-center transition-colors disabled:bg-indigo-400 disabled:cursor-not-allowed"
                title={!isRunnable(pipeline) ? 'Validation failed - exported artifacts may not be runnable' : 'Download exported artifacts'}
              >
                <DownloadIcon className="w-5 h-5 mr-2" />
                Download .zip {!isRunnable(pipeline) && '⚠️'}
              </button>
            </>
          ) : (
            <button
              onClick={handleDownloadZip}
              disabled={isZipping || displayArtifacts.length === 0}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg flex items-center transition-colors disabled:bg-indigo-400 disabled:cursor-wait"
            >
              {isZipping ? (
                <>
                  <LoadingIcon className="w-5 h-5 mr-2 animate-spin" />
                  Zipping...
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
