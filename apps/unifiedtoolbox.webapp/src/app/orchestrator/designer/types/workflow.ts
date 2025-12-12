// Workflow type definitions
export interface Workflow {
    id: string;
    name: string;
    description?: string;
    version: string;
    createdAt: string;
    updatedAt: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    metadata: {
        estimatedCost?: number;
        estimatedDuration?: number;
        tags?: string[];
    };
}

export interface WorkflowNode {
    id: string;
    type: 'agent' | 'condition' | 'merge' | 'start' | 'end';
    position: { x: number; y: number };
    data: {
        agentId?: string;
        agentName?: string;
        agentRole?: string;
        config?: Record<string, any>;
        prompt?: string;
        condition?: string;
        status?: 'idle' | 'running' | 'complete' | 'error';
        cost?: number;
    };
}

export interface WorkflowEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
    type?: 'default' | 'conditional';
    data?: {
        condition?: string;
        label?: string;
    };
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings?: string[];
}

export interface AgentDefinition {
    id: string;
    name: string;
    role: string;
    capabilities: string[];
    style?: string;
    constraints?: string[];
}
