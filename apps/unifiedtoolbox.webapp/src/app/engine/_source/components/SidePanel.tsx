import React from 'react';
import type { Task } from '../types';
import { TaskStatus } from '../types';
import ArtifactViewer from './ArtifactViewer';
// Fix: Corrected icon import path
import { CloseIcon, InfoIcon, AgentIcon, LogIcon, PaperclipIcon, CostIcon } from './icons';

interface SidePanelProps {
  task: Task | null;
  clearSelection: () => void;
  onShowDefinitions: () => void;
  /** When true, renders as a floating overlay instead of a flex sibling (graph mode). */
  isOverlay?: boolean;
  /** Collapsed state — only relevant when isOverlay=true. */
  minimized?: boolean;
  onToggleMinimize?: () => void;
}

const statusInfo: Record<TaskStatus, { text: string; color: string }> = {
  [TaskStatus.PENDING]: { text: 'Pending', color: 'text-gray-400' },
  [TaskStatus.RUNNING]: { text: 'Running', color: 'text-blue-400' },
  [TaskStatus.COMPLETED]: { text: 'Completed', color: 'text-green-400' },
  [TaskStatus.FAILED]: { text: 'Failed', color: 'text-red-400' },
};

const ChevronRightIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 shrink-0">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const ChevronLeftIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 shrink-0">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

/** Shared body sections (status, agent, cost, log, artifacts). */
const PanelBody: React.FC<{ task: Task; onShowDefinitions: () => void }> = ({ task, onShowDefinitions }) => (
  <>
    <div className="mb-6 bg-gray-700/50 p-3 rounded-lg">
      <div className="flex items-center text-lg font-semibold mb-2">
        <InfoIcon className="w-5 h-5 mr-2 text-indigo-400" /> Status
      </div>
      <p className={`font-mono text-lg ${statusInfo[task.status].color}`}>
        {statusInfo[task.status].text}
      </p>
    </div>

    <div className="mb-6 bg-gray-700/50 p-3 rounded-lg">
      <div className="flex items-center text-lg font-semibold mb-2 justify-between">
        <div className="flex items-center">
          <AgentIcon className="w-5 h-5 mr-2 text-indigo-400" /> Agent
        </div>
        <button onClick={onShowDefinitions} className="text-xs flex items-center text-indigo-300 hover:text-indigo-200">
          <InfoIcon className="w-4 h-4 mr-1" /> View Definitions
        </button>
      </div>
      <p><strong>Role:</strong> {task.agent.role}</p>
      {task.agent.specialization && <p><strong>Specialization:</strong> {task.agent.specialization}</p>}
    </div>

    {task.cost !== undefined && (
      <div className="mb-6 bg-gray-700/50 p-3 rounded-lg">
        <div className="flex items-center text-lg font-semibold mb-2">
          <CostIcon className="w-5 h-5 mr-2 text-green-400" /> Cost Analysis
        </div>
        <div className="space-y-1 font-mono text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Input Tokens:</span>
            <span className="text-gray-200">{task.inputTokens?.toLocaleString() ?? 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Output Tokens:</span>
            <span className="text-gray-200">{task.outputTokens?.toLocaleString() ?? 'N/A'}</span>
          </div>
          <div className="flex justify-between font-bold pt-1 border-t border-gray-600 mt-1">
            <span className="text-green-400">Task Cost:</span>
            <span className="text-green-400">${task.cost.toFixed(6)}</span>
          </div>
        </div>
      </div>
    )}

    <div className="mb-6 bg-gray-700/50 p-3 rounded-lg">
      <div className="flex items-center text-lg font-semibold mb-2">
        <LogIcon className="w-5 h-5 mr-2 text-indigo-400" /> Agent Log
      </div>
      <div className="bg-black/50 p-2 rounded-md h-40 overflow-y-auto font-mono text-sm">
        {task.agent.log.map((entry, index) => (
          <p key={index} className="whitespace-pre-wrap">{`> ${entry}`}</p>
        ))}
      </div>
    </div>

    {task.artifacts.length > 0 && (
      <div className="bg-gray-700/50 p-3 rounded-lg">
        <div className="flex items-center text-lg font-semibold mb-2">
          <PaperclipIcon className="w-5 h-5 mr-2 text-indigo-400" /> Artifacts
        </div>
        {task.artifacts.map(artifact => (
          <ArtifactViewer key={artifact.id} artifact={artifact} />
        ))}
      </div>
    )}
  </>
);

const SidePanel: React.FC<SidePanelProps> = ({
  task,
  clearSelection,
  onShowDefinitions,
  isOverlay = false,
  minimized = false,
  onToggleMinimize,
}) => {

  // ── OVERLAY MODE (graph view) ────────────────────────────────────────────
  if (isOverlay) {
    // No task selected: nothing to show as overlay — graph takes full width
    if (!task) return null;

    const overlayBase = 'absolute right-4 z-20 bg-gray-800/85 backdrop-blur-xl border border-gray-600/40 rounded-xl shadow-2xl transition-all duration-300 ease-in-out';

    // Minimized: small collapsed strip at top-right
    if (minimized) {
      return (
        <aside className={`${overlayBase} top-4 w-64 overflow-hidden`}>
          <button
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-700/60 text-left"
            onClick={onToggleMinimize}
            title="Expand agent details"
          >
            <AgentIcon className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="text-sm text-gray-300 font-medium truncate flex-1">{task.name}</span>
            <ChevronLeftIcon />
          </button>
        </aside>
      );
    }

    // Fully expanded overlay card
    return (
      <aside className={`${overlayBase} top-4 bottom-4 w-96 flex flex-col overflow-hidden`}>
        <div className="p-4 flex-1 min-h-0 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-gray-100 truncate mr-2">{task.name}</h2>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={onToggleMinimize}
                className="p-1 rounded-full hover:bg-gray-700 text-gray-400 hover:text-gray-200"
                title="Minimize"
              >
                <ChevronRightIcon />
              </button>
              <button
                onClick={clearSelection}
                className="p-1 rounded-full hover:bg-gray-700"
                title="Close"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
          <PanelBody task={task} onShowDefinitions={onShowDefinitions} />
        </div>
      </aside>
    );
  }

  // ── NORMAL MODE (clusters view) ──────────────────────────────────────────
  const panelClasses = task ? 'w-96 border-l border-gray-700' : 'w-0 border-none';

  return (
    <aside
      className={`bg-gray-800/80 backdrop-blur-lg transition-all duration-300 ease-in-out overflow-hidden ${panelClasses}`}
    >
      <div className="flex flex-col h-full">
        {task ? (
          <div className="p-4 flex-1 overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-100">{task.name}</h2>
              <button
                onClick={clearSelection}
                className="p-1 rounded-full hover:bg-gray-700"
              >
                <CloseIcon className="w-6 h-6" />
              </button>
            </div>
            <PanelBody task={task} onShowDefinitions={onShowDefinitions} />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-500">
              <InfoIcon className="w-12 h-12 mx-auto mb-2" />
              <p>Select a node to view details</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

export default SidePanel;
