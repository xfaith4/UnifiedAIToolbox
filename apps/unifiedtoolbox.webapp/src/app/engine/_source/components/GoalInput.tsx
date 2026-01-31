



import React, { useState, useRef } from 'react';
import { RunIcon, LoadingIcon, UploadIcon, CloseIcon, StopIcon } from './icons';

interface GoalInputProps {
  onGoalSubmit: (goal: string, fileContent: string | null) => void;
  isOrchestrating: boolean;
  onCancelOrchestration: () => void;
}

const GoalInput: React.FC<GoalInputProps> = ({ onGoalSubmit, isOrchestrating, onCancelOrchestration }) => {
  const [goal, setGoal] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (goal.trim() && !isOrchestrating) {
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          onGoalSubmit(goal, content);
        };
        reader.onerror = () => {
          alert("Error reading file.");
        }
        reader.readAsText(file);
      } else {
        onGoalSubmit(goal, null);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const clearFile = () => {
    setFile(null);
    if(fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  };

  return (
    <div className="p-4 border-b border-gray-700 bg-gray-900/50">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-3">
            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Enter your high-level goal, e.g., 'Summarize the provided document'"
              className="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              disabled={isOrchestrating}
            />
            {isOrchestrating ? (
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="px-4 py-3 bg-gray-700 text-white font-semibold rounded-lg flex items-center cursor-default">
                  <LoadingIcon className="w-5 h-5 mr-2 animate-spin" />
                  Running...
                </div>
                <button
                  type="button"
                  onClick={onCancelOrchestration}
                  className="px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg flex items-center transition-colors"
                  aria-label="Cancel orchestration run"
                >
                  <StopIcon className="w-5 h-5 mr-2" />
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="submit"
                disabled={!goal.trim() || isOrchestrating}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg flex items-center transition-colors disabled:bg-indigo-400 disabled:cursor-not-allowed"
              >
                <RunIcon className="w-5 h-5 mr-2" />
                Start App Factory
              </button>
            )}
        </div>
        <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-400">Optional:</span>
            <div className="flex items-center gap-2">
                <button 
                    type="button" 
                    onClick={() => fileInputRef.current?.click()} 
                    className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-gray-700 hover:bg-gray-600 transition-colors disabled:opacity-50"
                    disabled={isOrchestrating}
                >
                    <UploadIcon className="w-4 h-4" />
                    {file ? 'Change File' : 'Upload File'}
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".txt,.js,.py,.json,.md,.csv,.html,.css"/>
                {file && (
                    <div className="flex items-center gap-2 bg-gray-800 px-2 py-1 rounded">
                        <span className="font-mono text-xs">{file.name}</span>
                        <button onClick={clearFile} disabled={isOrchestrating} className="p-0.5 rounded-full hover:bg-gray-600">
                           <CloseIcon className="w-3 h-3" />
                        </button>
                    </div>
                )}
            </div>
        </div>
      </form>
    </div>
  );
};

export default GoalInput;
