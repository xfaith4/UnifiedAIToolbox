
export enum AgentStatus {
  IDLE = 'IDLE',
  MOVING = 'MOVING',
  WORKING = 'WORKING',
  RELAYING = 'RELAYING',
  REVIEWING = 'REVIEWING', // Specific to Critic
  REJECTING = 'REJECTING',   // When Critic sends back to Engineer
  COMPLETED = 'COMPLETED'
}

export enum SwarmMode {
  DECENTRALIZED = 'DECENTRALIZED', 
  COLLABORATIVE = 'COLLABORATIVE', 
  NEURAL_RELAY = 'NEURAL_RELAY',
  HIERARCHICAL = 'HIERARCHICAL'    // New: Supervisor-led specialized pipeline
}

export enum AgentRole {
  SUPERVISOR = 'SUPERVISOR',
  ENGINEER = 'ENGINEER',
  CRITIC = 'CRITIC',
  REFINER = 'REFINER',
  SYNTHESIZER = 'SYNTHESIZER',
  WRITER = 'WRITER',
  WORKER = 'WORKER' // Default for swarm modes
}

export interface Position {
  x: number;
  y: number;
}

export interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  role: AgentRole;
  position: Position;
  targetId?: string;
  color: string;
  payload?: boolean;
}

export interface SubTask {
  id: string;
  title: string;
  description: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'REVIEW' | 'REFINING' | 'DONE';
  position: Position;
  assignedAgentIds: string[];
  progress: number;
  currentRoleRequired?: AgentRole; // For Hierarchical mode
  iterationCount: number; // How many times it was sent back by Critic
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  message: string;
  type: 'info' | 'success' | 'warning' | 'agent' | 'error';
  agentName?: string;
}
