
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Cpu, 
  RefreshCw, 
  Terminal, 
  Activity, 
  Users, 
  Zap,
  Layers,
  Network,
  ShieldCheck,
  Workflow
} from 'lucide-react';
import { Agent, SubTask, LogEntry, AgentStatus, Position, SwarmMode, AgentRole } from './types';
import { decomposeTask } from './services/geminiService';
import SwarmCanvas from './components/SwarmCanvas';
import ControlPanel from './components/ControlPanel';
import ActivityLog from './components/ActivityLog';

const ROLE_COLORS: Record<AgentRole, string> = {
  [AgentRole.SUPERVISOR]: '#f8fafc', // White
  [AgentRole.ENGINEER]: '#6366f1',   // Indigo
  [AgentRole.CRITIC]: '#ef4444',     // Red
  [AgentRole.REFINER]: '#f59e0b',    // Amber
  [AgentRole.SYNTHESIZER]: '#10b981',// Emerald
  [AgentRole.WRITER]: '#06b6d4',     // Cyan
  [AgentRole.WORKER]: '#8b5cf6',     // Violet
};

const App: React.FC = () => {
  const [task, setTask] = useState("Develop a secure, cross-platform financial trading engine");
  const [swarmMode, setSwarmMode] = useState<SwarmMode>(SwarmMode.HIERARCHICAL);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [subTasks, setSubTasks] = useState<SubTask[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [nexusProgress, setNexusProgress] = useState(0);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info', agentName?: string) => {
    setLogs(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      message,
      type,
      agentName
    }, ...prev].slice(0, 50));
  }, []);

  const initializeSwarm = async () => {
    if (!task.trim()) return;
    
    setIsLoading(true);
    setIsSimulating(false);
    setLogs([]);
    setNexusProgress(0);
    addLog(`Initializing ${swarmMode} architecture...`, 'info');

    const decomposed = await decomposeTask(task);
    
    const newSubTasks: SubTask[] = decomposed.map((t: any, i: number) => ({
      id: `task-${i}`,
      title: t.title,
      description: t.description,
      status: 'PENDING',
      progress: 0,
      assignedAgentIds: [],
      iterationCount: 0,
      currentRoleRequired: swarmMode === SwarmMode.HIERARCHICAL ? AgentRole.ENGINEER : undefined,
      position: {
        x: 20 + (i * 12), // More structured layout for hierarchy
        y: 30 + (Math.random() * 40)
      }
    }));

    let newAgents: Agent[] = [];
    if (swarmMode === SwarmMode.HIERARCHICAL) {
      const roles = [
        AgentRole.SUPERVISOR, 
        AgentRole.ENGINEER, 
        AgentRole.ENGINEER, 
        AgentRole.CRITIC, 
        AgentRole.REFINER, 
        AgentRole.SYNTHESIZER, 
        AgentRole.WRITER
      ];
      newAgents = roles.map((role, i) => ({
        id: `agent-${i}`,
        name: role.charAt(0) + role.slice(1).toLowerCase(),
        status: AgentStatus.IDLE,
        role: role,
        position: { x: 10 + (i * 13), y: 15 }, // Top row for agents
        color: ROLE_COLORS[role],
        payload: false
      }));
    } else {
      newAgents = Array.from({ length: 8 }).map((_, i) => ({
        id: `agent-${i}`,
        name: `Agent-${String.fromCharCode(65 + i)}`,
        status: AgentStatus.IDLE,
        role: AgentRole.WORKER,
        position: { x: 50, y: 50 },
        color: ROLE_COLORS[AgentRole.WORKER],
        payload: false
      }));
    }

    setSubTasks(newSubTasks);
    setAgents(newAgents);
    setIsLoading(false);
    setIsSimulating(true);
    addLog(`System online. ${swarmMode} protocols active.`, 'success');
  };

  const stopSimulation = () => {
    setIsSimulating(false);
    addLog("Simulation paused.", 'warning');
  };

  // Simulation Engine
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      setAgents(prevAgents => {
        const nextAgents = [...prevAgents];
        const nextSubTasks = [...subTasks];

        nextAgents.forEach(agent => {
          // --- HIERARCHICAL LOGIC ---
          if (swarmMode === SwarmMode.HIERARCHICAL) {
            if (agent.status === AgentStatus.IDLE) {
              // Supervisor logic: Check for unassigned tasks
              if (agent.role === AgentRole.SUPERVISOR) {
                const unassigned = nextSubTasks.find(t => t.assignedAgentIds.length === 0);
                if (unassigned) {
                  addLog(`Supervisor assigning: ${unassigned.title}`, 'info', agent.name);
                  unassigned.assignedAgentIds.push(agent.id); // Temporary lock
                  setTimeout(() => { unassigned.assignedAgentIds = []; }, 500); // Release for Engineer
                }
              } else {
                // Other roles: Find task that needs their specific expertise
                const taskForMe = nextSubTasks.find(t => 
                  t.status !== 'DONE' && 
                  t.currentRoleRequired === agent.role && 
                  t.assignedAgentIds.length === 0
                );
                if (taskForMe) {
                  agent.status = AgentStatus.MOVING;
                  agent.targetId = taskForMe.id;
                  taskForMe.assignedAgentIds.push(agent.id);
                  addLog(`${agent.name} taking ownership of ${taskForMe.title}`, 'agent', agent.name);
                }
              }
            }

            if (agent.status === AgentStatus.MOVING && agent.targetId) {
              const target = nextSubTasks.find(t => t.id === agent.targetId);
              if (target) {
                const dx = target.position.x - agent.position.x;
                const dy = target.position.y - agent.position.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 3) agent.status = AgentStatus.WORKING;
                else {
                  agent.position = { x: agent.position.x + dx * 0.2, y: agent.position.y + dy * 0.2 };
                }
              }
            }

            if (agent.status === AgentStatus.WORKING && agent.targetId) {
              const target = nextSubTasks.find(t => t.id === agent.targetId);
              if (target) {
                target.progress = Math.min(100, target.progress + 4);
                if (target.progress >= 100) {
                  // Role-based handoff
                  if (agent.role === AgentRole.ENGINEER) {
                    target.status = 'REVIEW';
                    target.currentRoleRequired = AgentRole.CRITIC;
                    addLog(`${target.title} built. Requesting Critic review.`, 'info', agent.name);
                  } else if (agent.role === AgentRole.CRITIC) {
                    const passed = Math.random() > 0.3 || target.iterationCount > 1;
                    if (passed) {
                      target.status = 'REFINING';
                      target.currentRoleRequired = AgentRole.REFINER;
                      addLog(`Critic approved ${target.title}. Moving to Refiner.`, 'success', agent.name);
                    } else {
                      target.status = 'IN_PROGRESS';
                      target.currentRoleRequired = AgentRole.ENGINEER;
                      target.iterationCount++;
                      addLog(`Critic REJECTED ${target.title}. Sending back to Engineer.`, 'error', agent.name);
                    }
                  } else if (agent.role === AgentRole.REFINER) {
                    target.currentRoleRequired = AgentRole.SYNTHESIZER;
                    addLog(`Refiner optimized ${target.title}. Ready for Synthesis.`, 'info', agent.name);
                  } else if (agent.role === AgentRole.SYNTHESIZER) {
                    target.currentRoleRequired = AgentRole.WRITER;
                    addLog(`Synthesizer integrated ${target.title}. Finalizing docs.`, 'info', agent.name);
                  } else if (agent.role === AgentRole.WRITER) {
                    target.status = 'DONE';
                    target.currentRoleRequired = undefined;
                    addLog(`Mission Complete: ${target.title} documented.`, 'success', agent.name);
                  }
                  
                  target.progress = 0;
                  target.assignedAgentIds = [];
                  agent.status = AgentStatus.IDLE;
                  agent.targetId = undefined;
                }
              }
            }
          } 
          // --- SWARM LOGIC (Fallback to previous logic) ---
          else {
            // ... (Standard Swarm Logic as implemented before)
            if (agent.status === AgentStatus.IDLE) {
              const targetTask = nextSubTasks.find(t => t.status === 'PENDING' && t.assignedAgentIds.length === 0);
              if (targetTask) {
                agent.status = AgentStatus.MOVING;
                agent.targetId = targetTask.id;
                targetTask.assignedAgentIds.push(agent.id);
                targetTask.status = 'IN_PROGRESS';
              }
            }
            if (agent.status === AgentStatus.MOVING && agent.targetId) {
              const target = nextSubTasks.find(t => t.id === agent.targetId);
              if (target) {
                const dx = target.position.x - agent.position.x;
                const dy = target.position.y - agent.position.y;
                if (Math.sqrt(dx*dx + dy*dy) < 3) agent.status = AgentStatus.WORKING;
                else agent.position = { x: agent.position.x + dx * 0.15, y: agent.position.y + dy * 0.15 };
              }
            }
            if (agent.status === AgentStatus.WORKING && agent.targetId) {
              const target = nextSubTasks.find(t => t.id === agent.targetId);
              if (target) {
                target.progress = Math.min(100, target.progress + 2);
                if (target.progress >= 100) {
                  target.status = 'DONE';
                  agent.status = AgentStatus.IDLE;
                  agent.targetId = undefined;
                }
              }
            }
          }
        });

        setSubTasks(nextSubTasks);
        return nextAgents;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isSimulating, subTasks, swarmMode, addLog]);

  const totalProgress = subTasks.length > 0 
    ? (subTasks.filter(t => t.status === 'DONE').length / subTasks.length) * 100 
    : 0;

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-200 overflow-hidden">
      <div className="w-80 border-r border-slate-800 bg-slate-900/50 flex flex-col z-20">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-2 mb-6">
            <div className="p-2 bg-indigo-600 rounded-lg shadow-[0_0_15px_rgba(79,70,229,0.4)]">
              <Workflow className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">OrchestraAI</h1>
          </div>
          
          <ControlPanel 
            task={task}
            setTask={setTask}
            swarmMode={swarmMode}
            setSwarmMode={setSwarmMode}
            onStart={initializeSwarm}
            onStop={stopSimulation}
            isSimulating={isSimulating}
            isLoading={isLoading}
          />
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="px-6 py-4 flex items-center justify-between border-b border-slate-800 bg-slate-900/80">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">System Logs</span>
            </div>
          </div>
          <ActivityLog logs={logs} />
        </div>
      </div>

      <div className="flex-1 relative flex flex-col">
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-center gap-6 z-10 pointer-events-none">
          <StatCard icon={<Users className="w-4 h-4" />} label="Active Roles" value={agents.length.toString()} color="text-indigo-400" />
          <StatCard icon={<ShieldCheck className="w-4 h-4" />} label="Quality Gate" value={swarmMode === SwarmMode.HIERARCHICAL ? "Active" : "None"} color="text-red-400" />
          <StatCard icon={<Activity className="w-4 h-4" />} label="Throughput" value="Optimal" color="text-cyan-400" />
        </div>

        <div className="flex-1 swarm-grid relative overflow-hidden">
          <SwarmCanvas 
            agents={agents} 
            subTasks={subTasks} 
            swarmMode={swarmMode} 
            nexusProgress={nexusProgress}
          />
          
          {!isSimulating && !isLoading && subTasks.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center flex-col text-slate-500">
              <div className="relative mb-6">
                <Workflow className="w-20 h-20 opacity-10" />
              </div>
              <p className="text-lg font-medium text-slate-400">Awaiting Mission Parameters</p>
              <p className="text-sm opacity-40">Select Hierarchical for specialized roles</p>
            </div>
          )}

          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-md z-30">
              <div className="flex flex-col items-center">
                <RefreshCw className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
                <p className="text-indigo-300 font-bold tracking-widest uppercase text-xs animate-pulse">Gemini Decomposing Architecture...</p>
              </div>
            </div>
          )}
        </div>

        <div className="h-1.5 bg-slate-900 w-full relative">
          <motion.div 
            className="h-full bg-gradient-to-r from-indigo-600 via-red-500 to-emerald-500 shadow-[0_0_15px_rgba(99,102,241,0.6)]"
            initial={{ width: 0 }}
            animate={{ width: `${totalProgress}%` }}
          />
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ icon: React.ReactNode, label: string, value: string, color: string }> = ({ icon, label, value, color }) => (
  <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/50 px-5 py-2.5 rounded-2xl flex items-center gap-4 shadow-2xl">
    <div className={`${color} p-2 bg-slate-800/50 rounded-lg`}>{icon}</div>
    <div className="flex flex-col">
      <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest leading-none mb-1">{label}</span>
      <span className="text-sm font-bold text-white leading-none">{value}</span>
    </div>
  </div>
);

export default App;
