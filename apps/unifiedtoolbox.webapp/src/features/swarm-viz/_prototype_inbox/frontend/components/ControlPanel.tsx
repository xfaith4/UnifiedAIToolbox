
import React from 'react';
import { Play, Square, RefreshCw, Sparkles, Zap, Network, Share2, Workflow } from 'lucide-react';
import { SwarmMode } from '../types';

interface ControlPanelProps {
  task: string;
  setTask: (task: string) => void;
  swarmMode: SwarmMode;
  setSwarmMode: (mode: SwarmMode) => void;
  onStart: () => void;
  onStop: () => void;
  isSimulating: boolean;
  isLoading: boolean;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ 
  task, 
  setTask, 
  swarmMode,
  setSwarmMode,
  onStart, 
  onStop, 
  isSimulating, 
  isLoading 
}) => {
  const modes = [
    { id: SwarmMode.HIERARCHICAL, label: 'Hierarchical', icon: <Workflow className="w-3 h-3" />, desc: 'Supervisor & Specialists' },
    { id: SwarmMode.DECENTRALIZED, label: 'Decentralized', icon: <Share2 className="w-3 h-3" />, desc: 'Emergent Swarm' },
    { id: SwarmMode.COLLABORATIVE, label: 'Collaborative', icon: <Zap className="w-3 h-3" />, desc: 'Parallel Synthesis' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">
          Mission Objective
        </label>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="Define complex objective..."
          className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-sm text-slate-200 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all resize-none h-28 shadow-inner"
          disabled={isSimulating || isLoading}
        />
      </div>

      <div>
        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">
          Operational Mode
        </label>
        <div className="grid grid-cols-1 gap-2">
          {modes.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setSwarmMode(mode.id)}
              disabled={isSimulating || isLoading}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                swarmMode === mode.id 
                  ? 'bg-indigo-600/20 border-indigo-500 text-indigo-100 shadow-[0_0_15px_rgba(79,70,229,0.1)]' 
                  : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className={`p-2 rounded-lg ${swarmMode === mode.id ? 'bg-indigo-500 text-white' : 'bg-slate-800'}`}>
                {mode.icon}
              </div>
              <div>
                <div className="text-xs font-bold">{mode.label}</div>
                <div className="text-[10px] opacity-60">{mode.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        {!isSimulating ? (
          <button
            onClick={onStart}
            disabled={isLoading || !task.trim()}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-4 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-indigo-900/30 group"
          >
            {isLoading ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" />
            )}
            <span className="tracking-tight">Deploy Agents</span>
          </button>
        ) : (
          <button
            onClick={onStop}
            className="flex-1 bg-slate-800 hover:bg-red-900/40 hover:border-red-500/50 border border-slate-700 text-white font-bold py-4 px-4 rounded-2xl flex items-center justify-center gap-3 transition-all"
          >
            <Square className="w-4 h-4 fill-current" />
            Halt Operations
          </button>
        )}
      </div>
    </div>
  );
};

export default ControlPanel;
