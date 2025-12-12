'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Bot, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface AgentNodeData {
    agentName: string;
    agentId: string;
    agentRole?: string;
    status?: 'idle' | 'running' | 'complete' | 'error';
    cost?: number;
}

function AgentNode({ data, selected }: NodeProps<AgentNodeData>) {
    const { agentName, agentRole, status = 'idle', cost } = data;

    const getStatusIcon = () => {
        switch (status) {
            case 'running':
                return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
            case 'complete':
                return <CheckCircle2 className="w-4 h-4 text-green-400" />;
            case 'error':
                return <AlertCircle className="w-4 h-4 text-red-400" />;
            default:
                return <Bot className="w-4 h-4 text-slate-400" />;
        }
    };

    const getStatusColor = () => {
        switch (status) {
            case 'running':
                return 'border-blue-500 bg-blue-950/50';
            case 'complete':
                return 'border-green-500 bg-green-950/50';
            case 'error':
                return 'border-red-500 bg-red-950/50';
            default:
                return 'border-slate-700 bg-slate-900';
        }
    };

    return (
        <div
            className={`px-4 py-3 rounded-lg border-2 min-w-[200px] transition-all ${getStatusColor()} ${selected ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-950' : ''
                }`}
        >
            <Handle
                type="target"
                position={Position.Top}
                className="w-3 h-3 !bg-slate-600 border-2 border-slate-400"
            />

            <div className="flex items-center gap-2 mb-1">
                {getStatusIcon()}
                <div className="font-semibold text-sm text-slate-100">{agentName}</div>
            </div>

            {agentRole && (
                <div className="text-xs text-slate-400 mb-2">{agentRole}</div>
            )}

            {cost !== undefined && (
                <div className="text-xs text-slate-500">
                    Cost: ${cost.toFixed(4)}
                </div>
            )}

            <Handle
                type="source"
                position={Position.Bottom}
                className="w-3 h-3 !bg-slate-600 border-2 border-slate-400"
            />
        </div>
    );
}

export default memo(AgentNode);
