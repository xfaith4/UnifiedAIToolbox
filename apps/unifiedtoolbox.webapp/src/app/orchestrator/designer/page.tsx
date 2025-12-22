'use client';

import { useState, useCallback, DragEvent, useRef } from 'react';
import { Node, Edge, ReactFlowProvider } from 'reactflow';
import dagre from 'dagre';

import WorkflowCanvas from './components/WorkflowCanvas';
import NodePalette from './components/NodePalette';
import WorkflowToolbar from './components/WorkflowToolbar';
import ConfigPanel from './components/ConfigPanel';

let nodeId = 0;
const getId = () => `node_${nodeId++}`;

export default function DesignerPage() {
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [workflowName, setWorkflowName] = useState('New Workflow');
    const [isSaving, setIsSaving] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const reactFlowWrapper = useRef<HTMLDivElement>(null);

    const onDragOver = useCallback((event: DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: DragEvent) => {
            event.preventDefault();

            const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
            if (!reactFlowBounds) return;

            const data = event.dataTransfer.getData('application/reactflow');
            if (!data) return;

            const { type, data: nodeData } = JSON.parse(data);

            const position = {
                x: event.clientX - reactFlowBounds.left - 100,
                y: event.clientY - reactFlowBounds.top - 50,
            };

            const newNode: Node = {
                id: getId(),
                type,
                position,
                data: nodeData,
            };

            setNodes((nds) => nds.concat(newNode));
        },
        []
    );

    const handleNodeClick = useCallback((node: Node) => {
        setSelectedNode(node);
    }, []);

    const handleUpdateNode = useCallback((nodeId: string, data: any) => {
        setNodes((nds) =>
            nds.map((node) =>
                node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
            )
        );
    }, []);

    const handleSave = useCallback(async () => {
        setIsSaving(true);
        try {
            const workflow = {
                id: Date.now().toString(),
                name: workflowName,
                version: '1.0.0',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                nodes: nodes.map((node) => ({
                    id: node.id,
                    type: node.type || 'agent',
                    position: node.position,
                    data: node.data,
                })),
                edges: edges.map((edge) => ({
                    id: edge.id,
                    source: edge.source,
                    target: edge.target,
                    sourceHandle: edge.sourceHandle,
                    targetHandle: edge.targetHandle,
                })),
                metadata: {},
            };

            // Save to localStorage for now (will be API call later)
            const savedWorkflows = JSON.parse(
                localStorage.getItem('workflows') || '[]'
            );
            savedWorkflows.push(workflow);
            localStorage.setItem('workflows', JSON.stringify(savedWorkflows));

            alert('Workflow saved successfully!');
        } catch (error) {
            console.error('Error saving workflow:', error);
            alert('Failed to save workflow');
        } finally {
            setIsSaving(false);
        }
    }, [workflowName, nodes, edges]);

    const handleLoad = useCallback(() => {
        try {
            const savedWorkflows = JSON.parse(
                localStorage.getItem('workflows') || '[]'
            );
            if (savedWorkflows.length === 0) {
                alert('No saved workflows found');
                return;
            }

            // Load the most recent workflow
            const workflow = savedWorkflows[savedWorkflows.length - 1];
            setWorkflowName(workflow.name);
            setNodes(workflow.nodes);
            setEdges(workflow.edges);
        } catch (error) {
            console.error('Error loading workflow:', error);
            alert('Failed to load workflow');
        }
    }, []);

    const handleRun = useCallback(() => {
        setIsRunning(true);
        // TODO: Implement workflow execution
        alert('Workflow execution not yet implemented');
        setTimeout(() => setIsRunning(false), 1000);
    }, []);

    const handleAutoLayout = useCallback(() => {
        const dagreGraph = new dagre.graphlib.Graph();
        dagreGraph.setDefaultEdgeLabel(() => ({}));
        dagreGraph.setGraph({ rankdir: 'TB', nodesep: 100, ranksep: 100 });

        nodes.forEach((node) => {
            dagreGraph.setNode(node.id, { width: 200, height: 100 });
        });

        edges.forEach((edge) => {
            dagreGraph.setEdge(edge.source, edge.target);
        });

        dagre.layout(dagreGraph);

        const layoutedNodes = nodes.map((node) => {
            const nodeWithPosition = dagreGraph.node(node.id);
            return {
                ...node,
                position: {
                    x: nodeWithPosition.x - 100,
                    y: nodeWithPosition.y - 50,
                },
            };
        });

        setNodes(layoutedNodes);
    }, [nodes, edges]);

    const handleClear = useCallback(() => {
        if (confirm('Are you sure you want to clear the workflow?')) {
            setNodes([]);
            setEdges([]);
            setWorkflowName('New Workflow');
        }
    }, []);

    return (
        <ReactFlowProvider>
            <div className="min-h-screen flex flex-col gap-4 bg-gradient-to-br from-slate-950/90 to-slate-900/70 p-4">
                <WorkflowToolbar
                    workflowName={workflowName}
                    onSave={handleSave}
                    onLoad={handleLoad}
                    onRun={handleRun}
                    onAutoLayout={handleAutoLayout}
                    onClear={handleClear}
                    isSaving={isSaving}
                    isRunning={isRunning}
                />

                <div className="flex-1 flex overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/80 shadow-[0_25px_60px_rgba(2,6,23,0.75)]">
                    <NodePalette />

                    <div
                        ref={reactFlowWrapper}
                        className="flex-1 rounded-r-3xl"
                        onDrop={onDrop}
                        onDragOver={onDragOver}
                    >
                        <WorkflowCanvas
                            initialNodes={nodes}
                            initialEdges={edges}
                            onNodesChange={setNodes}
                            onEdgesChange={setEdges}
                        />
                    </div>

                    {selectedNode && (
                        <ConfigPanel
                            node={selectedNode}
                            onClose={() => setSelectedNode(null)}
                            onUpdate={handleUpdateNode}
                        />
                    )}
                </div>
            </div>
        </ReactFlowProvider>
    );
}
