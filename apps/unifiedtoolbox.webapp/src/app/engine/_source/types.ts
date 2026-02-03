export enum TaskStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum ArtifactType {
  TEXT = 'TEXT',
  REPORT = 'REPORT',
  CODE = 'CODE',
  IMAGE = 'IMAGE',
}

export interface Artifact {
  id: string;
  name: string;
  type: ArtifactType;
  content: string;
}

export interface Agent {
  role: string;
  specialization?: string;
  log: string[];
}

export interface Task {
  id: string;
  name: string;
  status: TaskStatus;
  dependencies: string[];
  agent: Agent;
  artifacts: Artifact[];
  cost?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface EnvironmentalImpact {
  co2e: number; // in grams
  water: number; // in liters
}

export interface Session {
  id: string;
  goal: string;
  fileContent: string | null;
  date: string;
  tasks: Task[];
  environmentalImpact: EnvironmentalImpact | null;
  planningCost?: number;
  totalCost?: number;
  startTime?: number; // timestamp when orchestration started
  waterUsage?: number; // water usage in liters
}