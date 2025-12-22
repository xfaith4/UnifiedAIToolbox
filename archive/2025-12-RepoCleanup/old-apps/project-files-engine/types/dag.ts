/** Agentic AI Orchestrator — DAG contracts (dashboard-side) */
export type AgentId = 'Supervisor'|'Researcher'|'Engineer'|'Critic'|'Synthesizer'|'Commissioner'|'Refiner';

export interface AONode {
  id: string;
  agent: AgentId;
  task: string;
  dependsOn: string[];
  params: Record<string, unknown>;
  status?: 'planned'|'queued'|'running'|'completed'|'failed';
}

export interface AODag {
  planName: string;
  concurrency: number;
  nodes: AONode[];
}

export interface ManifestV2 {
  version: 2;
  timestampUtc: string;
  planName: string;
  concurrency: number;
  dag: { order: string[]; nodes: AONode[] };
  sustainability: { kWh: number|null; gCO2e: number|null; waterL: number|null };
  costs: { estimatedUSD: number|null };
}
