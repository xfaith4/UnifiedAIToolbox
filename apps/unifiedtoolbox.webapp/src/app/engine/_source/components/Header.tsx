import React from 'react';
// Fix: Corrected icon import path
import { HistoryIcon, BookIcon, ExportIcon, FeedbackIcon, SettingsIcon, LogoIcon, CostIcon, WaterIcon, TimerIcon } from './icons';

interface HeaderProps {
  onShowHistory: () => void;
  onShowDefinitions: () => void;
  onShowExport: () => void;
  onShowFeedback: () => void;
  onShowSettings: () => void;
  isOrchestrationComplete: boolean;
  totalCost: number | null;
  waterUsage: number | null;
  elapsedTime: number | null;
}

const Header: React.FC<HeaderProps> = ({ 
  onShowHistory, 
  onShowDefinitions, 
  onShowExport, 
  onShowFeedback, 
  onShowSettings,
  isOrchestrationComplete,
  totalCost,
  waterUsage,
  elapsedTime
}) => {
  // Format elapsed time as MM:SS
  const formatElapsedTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <header className="flex items-center justify-between p-3 bg-gray-800/50 border-b border-gray-700 backdrop-blur-sm">
      <div className="flex items-center">
        <LogoIcon className="w-8 h-8 mr-3 text-indigo-400" />
        <div className="flex flex-col">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-100">App Factory</h1>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-200 border border-indigo-500/25">
              Job Type: App Factory
            </span>
          </div>
          <p className="text-xs text-gray-400">
            Application Factory — generates full application artifacts from a goal + inputs.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {totalCost !== null && totalCost > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-gray-700/50">
            <CostIcon className="w-5 h-5 text-green-400" />
            <span className="font-semibold text-gray-300">Session Cost:</span>
            <span className="font-mono font-bold text-green-400">${totalCost.toFixed(6)}</span>
          </div>
        )}
        {waterUsage !== null && waterUsage > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-gray-700/50">
            <WaterIcon className="w-5 h-5 text-blue-400" />
            <span className="font-semibold text-gray-300">Water:</span>
            <span className="font-mono font-bold text-blue-400">{waterUsage.toFixed(3)}L</span>
          </div>
        )}
        {elapsedTime !== null && (
          <div className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-gray-700/50">
            <TimerIcon className="w-5 h-5 text-yellow-400" />
            <span className="font-semibold text-gray-300">Run Time:</span>
            <span className="font-mono font-bold text-yellow-400">{formatElapsedTime(elapsedTime)}</span>
          </div>
        )}
      </div>
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
