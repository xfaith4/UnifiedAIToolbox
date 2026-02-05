import React from 'react';
import { BookIcon } from './icons';
import type { EnginePipelinePayload, PipelineGateCheck, PipelineStatus } from '@/lib/app-factory/pipeline/pipelineStatus'

interface ExpectedOutputsPanelProps {
  onLearnMore?: () => void;
  pipeline?: EnginePipelinePayload | null
  onViewFile?: (relPath: string) => void
}

function statusToCheckbox(status: PipelineStatus): { checked: boolean; label: string; muted?: boolean } {
  if (status === 'passed') return { checked: true, label: 'passed' }
  if (status === 'failed') return { checked: false, label: 'failed' }
  if (status === 'running') return { checked: false, label: 'running' }
  if (status === 'skipped') return { checked: false, label: 'skipped', muted: true }
  return { checked: false, label: 'pending', muted: true }
}

function getCheckMeta(pipeline: EnginePipelinePayload | null | undefined, id: string): PipelineGateCheck | null {
  const checks = pipeline?.gates?.checks || []
  return (checks.find((c) => c.id === id) as PipelineGateCheck | undefined) || null
}

function getCheckStatus(pipeline: EnginePipelinePayload | null | undefined, id: string): PipelineStatus {
  const match = getCheckMeta(pipeline, id)
  return match?.status || (pipeline?.hardeningEnabled ? 'pending' : 'skipped')
}

const ExpectedOutputsPanel: React.FC<ExpectedOutputsPanelProps> = ({ onLearnMore, pipeline = null, onViewFile }) => {
  const build = getCheckStatus(pipeline, 'build')
  const lint = getCheckStatus(pipeline, 'lint')
  const test = getCheckStatus(pipeline, 'test')
  const boot = getCheckStatus(pipeline, 'boot')
  const envDocs = getCheckStatus(pipeline, 'env-docs')
  const ownership = getCheckStatus(pipeline, 'ownership')
  const assembler = getCheckStatus(pipeline, 'assembler')

  const lintTest: PipelineStatus =
    !pipeline?.hardeningEnabled
      ? 'skipped'
      : [lint, test].some((s) => s === 'failed')
        ? 'failed'
        : [lint, test].every((s) => s === 'passed' || s === 'skipped')
          ? 'passed'
          : 'pending'

  const acceptanceItems: { label: string; status: PipelineStatus; file?: string }[] = [
    { label: 'Project builds successfully', status: build, file: getCheckMeta(pipeline, 'build')?.logPath || 'GATE_REPORT.md' },
    {
      label: 'Lint/tests pass (if configured)',
      status: lintTest,
      file:
        (getCheckMeta(pipeline, lint === 'failed' ? 'lint' : test === 'failed' ? 'test' : 'lint')?.logPath || 'GATE_REPORT.md'),
    },
    { label: 'App starts and primary workflow loads', status: boot, file: getCheckMeta(pipeline, 'boot')?.logPath || 'GATE_REPORT.md' },
    { label: 'Any required env vars are documented', status: envDocs, file: 'REPO_CONTRACT.json' },
  ]

  if (pipeline?.parallelTeamsEnabled) {
    acceptanceItems.push({ label: 'Ownership boundaries respected', status: ownership, file: 'OWNERSHIP_REPORT.md' })
    acceptanceItems.push({ label: 'Assembler conflicts resolved deterministically', status: assembler, file: 'ASSEMBLER_REPORT.md' })
  }

  return (
    <section
      aria-label="Expected Outputs"
      className="p-4 border-b border-gray-700 bg-gray-900/30"
    >
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-200">Expected Outputs</h2>
          {onLearnMore && (
            <button
              type="button"
              onClick={onLearnMore}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md bg-gray-800 hover:bg-gray-700 border border-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <BookIcon className="w-4 h-4 text-indigo-300" />
              Learn more
            </button>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-3">
            <div className="text-xs font-semibold text-indigo-300 uppercase tracking-wide">Repo ZIP</div>
            <p className="mt-1 text-gray-300 text-sm">
              Exportable repository bundle (ZIP) containing generated source code.
            </p>
          </div>

          <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-3">
            <div className="text-xs font-semibold text-indigo-300 uppercase tracking-wide">Build Instructions</div>
            <p className="mt-1 text-gray-300 text-sm">
              README or BUILD.md describing setup, run, build, and test steps.
            </p>
          </div>

          <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-3">
            <div className="text-xs font-semibold text-indigo-300 uppercase tracking-wide">Acceptance Checks</div>
            <ul className="mt-2 space-y-1 text-gray-300 text-sm">
              {acceptanceItems.map((item) => {
                const meta = statusToCheckbox(item.status)
                return (
                <li key={item.label} className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                  <input
                    type="checkbox"
                    disabled
                    aria-hidden="true"
                    className="mt-0.5 h-3.5 w-3.5 rounded border-gray-600 bg-gray-900/40"
                    checked={meta.checked}
                  />
                  <div className="min-w-0">
                    <div className={`truncate ${meta.muted ? 'text-gray-500' : ''}`}>{item.label}</div>
                    <div className={`text-[10px] uppercase tracking-wide ${meta.muted ? 'text-gray-600' : 'text-gray-500'}`}>{meta.label}</div>
                  </div>
                  </div>
                  {onViewFile && pipeline?.runId && item.file && (item.status === 'failed' || item.status === 'passed') && (
                    <button
                      type="button"
                      onClick={() => onViewFile(item.file!)}
                      className="text-[11px] px-2 py-1 rounded border border-gray-700 hover:bg-gray-700 text-gray-300"
                    >
                      View logs
                    </button>
                  )}
                </li>
              )})}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ExpectedOutputsPanel;
