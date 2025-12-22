'use client';

import { useState, useCallback } from 'react';
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    Node,
    Edge,
    addEdge,
    Connection,
    useNodesState,
    useEdgesState,
    NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { WorkflowNode, WorkflowEdge } from '../types/workflow';
import AgentNode from './AgentNode';

const nodeTypes: NodeTypes = {
    agent: AgentNode,
};

interface WorkflowCanvasProps {
    initialNodes?: Node[];
    initialEdges?: Edge[];
    onNodesChange?: (nodes: Node[]) => void;
    onEdgesChange?: (edges: Edge[]) => void;
}

export default function WorkflowCanvas({
    initialNodes = [],
    initialEdges = [],
    onNodesChange,
    onEdgesChange,
}: WorkflowCanvasProps) {
    const [nodes, setNodes, handleNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, handleEdgesChange] = useEdgesState(initialEdges);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);

    const onConnect = useCallback(
        (connection: Connection) => {
            setEdges((eds) => addEdge(connection, eds));
        },
        [setEdges]
    );

    const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
        setSelectedNode(node);
    }, []);

    const onPaneClick = useCallback(() => {
        setSelectedNode(null);
    }, []);

    // Notify parent of changes
    const handleNodesChangeWrapper = useCallback(
        (changes: any) => {
            handleNodesChange(changes);
            if (onNodesChange) {
                // Get updated nodes after change
                setTimeout(() => onNodesChange(nodes), 0);
            }
        },
        [handleNodesChange, onNodesChange, nodes]
    );

    const handleEdgesChangeWrapper = useCallback(
        (changes: any) => {
            handleEdgesChange(changes);
            if (onEdgesChange) {
                setTimeout(() => onEdgesChange(edges), 0);
            }
        },
        [handleEdgesChange, onEdgesChange, edges]
    );

    return (
        <div className="w-full h-full rounded-r-3xl overflow-hidden">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={handleNodesChangeWrapper}
                onEdgesChange={handleEdgesChangeWrapper}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                nodeTypes={nodeTypes}
                fitView
                className="h-full bg-slate-950"
            >
                <Background color="#334155" gap={16} />
                <Controls className="bg-slate-800 border-slate-700" />
                <MiniMap
                    className="bg-slate-800 border-slate-700"
                    nodeColor={(node) => {
                        switch (node.data.status) {
                            case 'running':
                                return '#3b82f6';
                            case 'complete':
                                return '#10b981';
                            case 'error':
                                return '#ef4444';
                            default:
                                return '#64748b';
                        }
                    }}
                />
            </ReactFlow>
        </div>
    );
}
