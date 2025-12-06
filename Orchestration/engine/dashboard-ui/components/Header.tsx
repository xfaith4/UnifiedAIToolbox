import React from 'react';
// Fix: Corrected icon import path
import { HistoryIcon, BookIcon, ExportIcon, FeedbackIcon, SettingsIcon, LogoIcon, CostIcon } from './icons';

interface HeaderProps {
  onShowHistory: () => void;
  onShowDefinitions: () => void;
  onShowExport: () => void;
  onShowFeedback: () => void;
  onShowSettings: () => void;
  isOrchestrationComplete: boolean;
  totalCost: number | null;
}

const Header: React.FC<HeaderProps> = ({ 
  onShowHistory, 
  onShowDefinitions, 
  onShowExport, 
  onShowFeedback, 
  onShowSettings,
  isOrchestrationComplete,
  totalCost
}) => {
  return (
    <header className="flex items-center justify-between p-3 bg-gray-800/50 border-b border-gray-700 backdrop-blur-sm">
      <div className="flex items-center">
        <LogoIcon className="w-8 h-8 mr-3 text-indigo-400" />
        <h1 className="text-xl font-bold text-gray-100">AI Orchestrator</h1>
      </div>
       {totalCost !== null && totalCost > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-gray-700/50">
            <CostIcon className="w-5 h-5 text-green-400" />
            <span className="font-semibold text-gray-300">Session Cost:</span>
            <span className="font-mono font-bold text-green-400">${totalCost.toFixed(6)}</span>
        </div>
      )}
      <nav className="flex items-center gap-2">
        <button onClick={onShowHistory} className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-gray-700 transition-colors">
          <HistoryIcon className="w-5 h-5" />
          History
        </button>
        <button onClick={onShowDefinitions} className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-gray-700 transition-colors">
          <BookIcon className="w-5 h-5" />
          Help & Concepts
        </button>
        <button 
          onClick={onShowExport} 
          disabled={!isOrchestrationComplete}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ExportIcon className="w-5 h-5" />
          Export
        </button>
        <div className="w-px h-6 bg-gray-600 mx-2"></div>
        <button onClick={onShowFeedback} className="p-2 rounded-full hover:bg-gray-700 transition-colors" title="Provide Feedback">
          <FeedbackIcon className="w-5 h-5" />
        </button>
        <button onClick={onShowSettings} className="p-2 rounded-full hover:bg-gray-700 transition-colors relative" title="Settings">
          <SettingsIcon className="w-5 h-5" />
          {/* Fix: Removed API key status dot, assuming key is always present via environment variables. */}
          <span className={`absolute top-1 right-1 block h-2.5 w-2.5 rounded-full bg-green-500`}></span>
        </button>
      </nav>
    </header>
  );
};

export default Header;