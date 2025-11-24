export type AgentStatus = 'draft' | 'ready' | 'archived'

export interface AgentInstruction {
  id: string
  name: string
  purpose: string
  mission?: string
  status: AgentStatus
  tags: string[]
  triggers?: string[]
  inputs?: string[]
  outputs?: string[]
  tools?: string[]
  playbook?: string[]
  owner?: string
  handoff?: string
  notes?: string
  createdAt: string
  updatedAt: string
}
