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
}

const statusInfo: Record<TaskStatus, { text: string; color: string }> = {
  [TaskStatus.PENDING]: { text: 'Pending', color: 'text-gray-400' },
  [TaskStatus.RUNNING]: { text: 'Running', color: 'text-blue-400' },
  [TaskStatus.COMPLETED]: { text: 'Completed', color: 'text-green-400' },
  [TaskStatus.FAILED]: { text: 'Failed', color: 'text-red-400' },
};

const SidePanel: React.FC<SidePanelProps> = ({ task, clearSelection, onShowDefinitions }) => {
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