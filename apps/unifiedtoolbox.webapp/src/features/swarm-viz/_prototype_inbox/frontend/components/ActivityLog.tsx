
import React from 'react';
import { LogEntry } from '../types';
import { motion, AnimatePresence } from 'framer-motion';

interface ActivityLogProps {
  logs: LogEntry[];
}

const ActivityLog: React.FC<ActivityLogProps> = ({ logs }) => {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
      <AnimatePresence initial={false}>
        {logs.map((log) => (
          <motion.div
            key={log.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`p-3 rounded-lg border text-[11px] leading-relaxed ${
              log.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' :
              log.type === 'warning' ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' :
              log.type === 'agent' ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300' :
              'bg-slate-800/50 border-slate-700/50 text-slate-400'
            }`}
          >
            <div className="flex justify-between items-start mb-1">
              <span className="font-bold opacity-70">
                {log.agentName ? `[${log.agentName}]` : '[SYSTEM]'}
              </span>
              <span className="opacity-40 text-[9px]">
                {log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
            <p>{log.message}</p>
          </motion.div>
        ))}
      </AnimatePresence>
      {logs.length === 0 && (
        <div className="h-full flex items-center justify-center text-slate-600 italic text-xs">
          Waiting for swarm activity...
        </div>
      )}
    </div>
  );
};

export default ActivityLog;
