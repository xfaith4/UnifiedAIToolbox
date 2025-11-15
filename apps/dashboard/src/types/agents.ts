export type AgentStatus = 'draft' | 'ready' | 'archived'

export interface AgentInstruction {
  id: string
  name: string
  purpose: string
  mission: string
  owner?: string
  status: AgentStatus
  triggers: string[]
  inputs: string[]
  outputs: string[]
  tools: string[]
  playbook: string[]
  handoff?: string
  notes?: string
  tags: string[]
  updatedAt: string
  createdAt: string
}
