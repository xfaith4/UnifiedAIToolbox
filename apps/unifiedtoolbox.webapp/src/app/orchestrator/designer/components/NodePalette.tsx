'use client';

import { DragEvent } from 'react';
import { Bot, GitBranch, Merge, Play, Flag } from 'lucide-react';

interface AgentDefinition {
    id: string;
    name: string;
    role: string;
    type: 'agent';
}

const AVAILABLE_AGENTS: AgentDefinition[] = [
    { id: 'supervisor', name: 'Supervisor', role: 'Quality assessment & feedback', type: 'agent' },
    { id: 'researcher', name: 'Researcher', role: 'Research & analysis', type: 'agent' },
    { id: 'engineer', name: 'Engineer', role: 'Implementation planning', type: 'agent' },
    { id: 'critic', name: 'Critic', role: 'Quality review', type: 'agent' },
    { id: 'synthesizer', name: 'Synthesizer', role: 'Integration & synthesis', type: 'agent' },
    { id: 'commissioner', name: 'Commissioner', role: 'Final evaluation', type: 'agent' },
];

interface NodePaletteProps {
    onDragStart?: (event: DragEvent, nodeType: string, data: any) => void;
}

export default function NodePalette({ onDragStart }: NodePaletteProps) {
    const handleDragStart = (event: DragEvent, agent: AgentDefinition) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData(
            'application/reactflow',
            JSON.stringify({
                type: 'agent',
                data: {
                    agentId: agent.id,
                    agentName: agent.name,
                    agentRole: agent.role,
                },
            })
        );
        if (onDragStart) {
            onDragStart(event, 'agent', agent);
        }
    };

    return (
        <div className="w-64 h-full rounded-l-3xl border-r border-slate-800 bg-slate-900/80 p-4 overflow-y-auto">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">Agent Nodes</h3>

            <div className="space-y-2">
                {AVAILABLE_AGENTS.map((agent) => (
                    <div
                        key={agent.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, agent)}
                        className="p-3 bg-slate-800 border border-slate-700 rounded-lg cursor-move hover:bg-slate-750 hover:border-slate-600 transition-colors"
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <Bot className="w-4 h-4 text-blue-400" />
                            <span className="text-sm font-medium text-slate-200">{agent.name}</span>
                        </div>
                        <p className="text-xs text-slate-400">{agent.role}</p>
                    </div>
                ))}
            </div>

            <div className="mt-6">
                <h3 className="text-sm font-semibold text-slate-200 mb-4">Control Nodes</h3>
                <div className="space-y-2 opacity-50 pointer-events-none">
                    <div className="p-3 bg-slate-800 border border-slate-700 rounded-lg">
                        <div className="flex items-center gap-2">
                            <GitBranch className="w-4 h-4 text-purple-400" />
                            <span className="text-sm font-medium text-slate-200">Condition</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Coming soon</p>
                    </div>
                    <div className="p-3 bg-slate-800 border border-slate-700 rounded-lg">
                        <div className="flex items-center gap-2">
                            <Merge className="w-4 h-4 text-green-400" />
                            <span className="text-sm font-medium text-slate-200">Merge</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Coming soon</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
