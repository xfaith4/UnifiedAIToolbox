
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Agent, SubTask, AgentStatus, SwarmMode, AgentRole } from '../types';
import { 
  CheckCircle2, 
  Circle, 
  Loader2, 
  Database, 
  Zap, 
  Cpu, 
  ShieldAlert, 
  PenTool, 
  Code2, 
  Eye, 
  Settings, 
  Layers 
} from 'lucide-react';

interface SwarmCanvasProps {
  agents: Agent[];
  subTasks: SubTask[];
  swarmMode: SwarmMode;
  nexusProgress: number;
}

const ROLE_ICONS: Record<AgentRole, React.ReactNode> = {
  [AgentRole.SUPERVISOR]: <Eye className="w-3 h-3" />,
  [AgentRole.ENGINEER]: <Code2 className="w-3 h-3" />,
  [AgentRole.CRITIC]: <ShieldAlert className="w-3 h-3" />,
  [AgentRole.REFINER]: <Settings className="w-3 h-3" />,
  [AgentRole.SYNTHESIZER]: <Layers className="w-3 h-3" />,
  [AgentRole.WRITER]: <PenTool className="w-3 h-3" />,
  [AgentRole.WORKER]: <Cpu className="w-3 h-3" />,
};

const SwarmCanvas: React.FC<SwarmCanvasProps> = ({ agents, subTasks, swarmMode, nexusProgress }) => {
  return (
    <div className="absolute inset-0 w-full h-full">
      {/* SVG Layer for connections */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
        <AnimatePresence>
          {agents.map(agent => {
            if (agent.targetId) {
              const task = subTasks.find(t => t.id === agent.targetId);
              if (task) {
                return (
                  <motion.line
                    key={`conn-${agent.id}-${task.id}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.3 }}
                    exit={{ opacity: 0 }}
                    x1={`${agent.position.x}%`}
                    y1={`${agent.position.y}%`}
                    x2={`${task.position.x}%`}
                    y2={`${task.position.y}%`}
                    stroke={agent.color}
                    strokeWidth="1.5"
                    strokeDasharray="5 5"
                  />
                );
              }
            }
            return null;
          })}
        </AnimatePresence>
      </svg>

      {/* Sub-Tasks Layer */}
      <AnimatePresence>
        {subTasks.map((task) => (
          <motion.div
            key={task.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
            style={{ left: `${task.position.x}%`, top: `${task.position.y}%` }}
          >
            <div className="group relative flex flex-col items-center">
              {/* Progress Ring */}
              <svg className="absolute -inset-2 w-14 h-14 -rotate-90">
                <circle cx="28" cy="28" r="24" fill="transparent" stroke="#1e293b" strokeWidth="2" />
                <motion.circle
                  cx="28" cy="28" r="24" fill="transparent" stroke={task.status === 'DONE' ? '#10b981' : '#6366f1'}
                  strokeWidth="2" strokeDasharray="150.8"
                  animate={{ strokeDashoffset: 150.8 - (150.8 * task.progress) / 100 }}
                />
              </svg>

              <div className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-all duration-500 z-10 ${
                task.status === 'DONE' ? 'bg-emerald-500/10 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]' :
                task.status === 'REVIEW' ? 'bg-red-500/10 border-red-500 animate-pulse' :
                task.status === 'IN_PROGRESS' ? 'bg-slate-900 border-indigo-500' :
                'bg-slate-950 border-slate-800'
              }`}>
                {task.status === 'DONE' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : task.status === 'REVIEW' ? (
                  <ShieldAlert className="w-5 h-5 text-red-400" />
                ) : task.status === 'IN_PROGRESS' ? (
                  <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                ) : (
                  <Circle className="w-5 h-5 text-slate-700" />
                )}
              </div>
              
              <div className="absolute top-14 w-40 text-center pointer-events-none">
                <h5 className={`text-[9px] font-black uppercase tracking-widest transition-colors ${
                  task.status === 'DONE' ? 'text-emerald-400' : 'text-slate-500'
                }`}>
                  {task.title}
                </h5>
                {task.iterationCount > 0 && (
                  <div className="text-[8px] text-red-500 font-bold">REWORK x{task.iterationCount}</div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Agents Layer */}
      {agents.map((agent) => (
        <motion.div
          key={agent.id}
          className="absolute -translate-x-1/2 -translate-y-1/2 z-20"
          animate={{ 
            left: `${agent.position.x}%`, 
            top: `${agent.position.y}%`,
            scale: agent.status === AgentStatus.WORKING ? 1.2 : 1
          }}
          transition={{ type: 'spring', stiffness: 60, damping: 12 }}
        >
          <div className="relative">
            <div 
              className="w-8 h-8 rounded-xl border-2 flex items-center justify-center shadow-2xl transition-all duration-300"
              style={{ 
                backgroundColor: `${agent.color}20`, 
                borderColor: agent.color,
                boxShadow: agent.status === AgentStatus.WORKING ? `0 0 20px ${agent.color}60` : 'none'
              }}
            >
              <div className="text-white">{ROLE_ICONS[agent.role]}</div>
            </div>

            {agent.status === AgentStatus.WORKING && (
              <motion.div 
                className="absolute -bottom-1 -right-1"
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ repeat: Infinity, duration: 0.5 }}
              >
                <Zap className="w-3 h-3 text-yellow-400 fill-yellow-400" />
              </motion.div>
            )}

            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-slate-900/90 border border-slate-800 text-slate-400 uppercase tracking-tighter">
                {agent.name}
              </span>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export default SwarmCanvas;
