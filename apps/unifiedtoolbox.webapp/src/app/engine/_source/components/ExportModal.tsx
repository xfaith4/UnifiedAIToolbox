import React, { useState, useMemo } from 'react';
import type { Task, Artifact } from '../types';
import { CloseIcon, DownloadIcon, PaperclipIcon, LoadingIcon } from './icons';
import type { EnginePipelinePayload, PipelineStage } from '@/lib/app-factory/pipeline/pipelineStatus'

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  sessionId?: string | null;
  pipeline: EnginePipelinePayload
  setPipeline: (pipeline: EnginePipelinePayload) => void
}

function stageStatus(pipeline: EnginePipelinePayload, id: PipelineStage['id']) {
  return pipeline.stages.find((s) => s.id === id)?.status ?? 'pending'
}

function isRunnable(pipeline: EnginePipelinePayload): boolean {
  if (!pipeline.hardeningEnabled) return true
  return stageStatus(pipeline, 'normalize') === 'passed' && stageStatus(pipeline, 'contract') === 'passed' && stageStatus(pipeline, 'gates') === 'passed'
}

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, tasks, sessionId = null, pipeline, setPipeline }) => {
  const [isZipping, setIsZipping] = useState(false);
  const [lastValidationError, setLastValidationError] = useState<string | null>(null)

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

  if (!isOpen) return null;

  const validateHardening = async (): Promise<EnginePipelinePayload | null> => {
    setLastValidationError(null)
    const startedAt = new Date().toISOString()
    setPipeline({
      ...pipeline,
      stages: pipeline.stages.map((s) =>
        ['decision-lock', 'teams', 'assemble', 'normalize', 'contract', 'gates', 'repair', 'export'].includes(s.id)
          ? { ...s, status: s.id === 'repair' ? 'pending' : 'running', startedAt, endedAt: undefined }
          : s
      ),
    })

    const apiKey = process.env.NEXT_PUBLIC_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY || ''
    const res = await fetch('/api/app-factory/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stackId: 'node-next-app-npm',
        runLabel: 'ui-validate',
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
        },
      }),
    })

    const json = await res.json().catch(() => null)
    if (json?.pipeline) setPipeline(json.pipeline as EnginePipelinePayload)

    if (!res.ok) {
      const detail = json ? JSON.stringify(json, null, 2) : `HTTP ${res.status}`
      setLastValidationError(detail)
      return null
    }
    return (json?.pipeline as EnginePipelinePayload) || null
  }

  const downloadFromRun = async (runId: string) => {
    const res = await fetch('/api/app-factory/export-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`export-run failed: HTTP ${res.status}\n${text}`)
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

  const downloadLegacy = async () => {
    const apiKey = process.env.NEXT_PUBLIC_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY || ''
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
        },
      }),
    })

    if (!res.ok) {
      const contentType = res.headers.get('content-type') || ''
      const detail = contentType.includes('application/json') ? JSON.stringify(await res.json(), null, 2) : await res.text()
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

    try {
      if (!pipeline.hardeningEnabled) return
      await validateHardening()
    } catch (error) {
      console.error("Failed to generate zip file:", error);
      alert("An error occurred while creating the zip file. Please check the console.");
    } finally {
      setIsZipping(false);
    }
  };

  const handleDownloadZip = async () => {
    if (isZipping) return
    setIsZipping(true)
    try {
      if (pipeline.hardeningEnabled) {
        if (!isRunnable(pipeline) || !pipeline.runId) {
          alert('Export blocked: repo failed normalization/contract/gates. Run acceptance checks and fix failures first.')
          return
        }
        await downloadFromRun(pipeline.runId)
        return
      }

      await downloadLegacy()
    } catch (error) {
      console.error("Failed to generate zip file:", error);
      alert("An error occurred while creating the zip file. Please check the console.");
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
            <div className="mb-4 p-3 rounded border border-red-700 bg-red-900/20 text-red-200 text-xs whitespace-pre-wrap">
              Validation failed (hardening enabled). Fix the repo outputs and retry.
              {'\n\n'}
              {lastValidationError.length > 1800 ? lastValidationError.slice(0, 1800) + '…' : lastValidationError}
            </div>
          )}
          <div className="bg-gray-700/50 p-4 rounded-lg">
            <h3 className="flex items-center text-lg font-semibold mb-3">
              <PaperclipIcon className="w-5 h-5 mr-2 text-indigo-400" /> Generated Artifacts
            </h3>
            {uniqueArtifacts.length > 0 ? (
              <ul className="space-y-2">
                {uniqueArtifacts.map(artifact => (
                  <li key={artifact.id} className="flex items-center justify-between bg-gray-900/50 p-2 rounded">
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
          {pipeline.hardeningEnabled ? (
            <>
              <button
                onClick={handleValidate}
                disabled={isZipping || uniqueArtifacts.length === 0}
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
                onClick={handleDownloadZip}
                disabled={isZipping || uniqueArtifacts.length === 0 || !isRunnable(pipeline) || !pipeline.runId}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg flex items-center transition-colors disabled:bg-indigo-400 disabled:cursor-not-allowed"
              >
                <DownloadIcon className="w-5 h-5 mr-2" />
                Download .zip
              </button>
            </>
          ) : (
            <button
              onClick={handleDownloadZip}
              disabled={isZipping || uniqueArtifacts.length === 0}
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
                  Download Project as .zip
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
