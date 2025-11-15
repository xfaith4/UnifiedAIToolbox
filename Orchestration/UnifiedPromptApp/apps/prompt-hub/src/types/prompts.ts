export type Provider = 'openai' | 'anthropic' | 'google' | 'ollama'

export type PromptVarType = 'string' | 'number' | 'boolean' | 'multiline' | 'json'

export interface PromptVariable {
  name: string
  label?: string
  type?: PromptVarType
  default?: string
  required?: boolean
  description?: string
}

export interface FewShotExample {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface PromptExampleBlock {
  input?: Record<string, unknown>
  output: string
}

export interface PromptBlocks {
  system?: string
  instructions?: string
  constraints?: string
  style?: string
  examples?: PromptExampleBlock[]
}

export interface PromptOutputs {
  format?: 'text' | 'markdown' | 'json' | string
  schema?: string
}

export interface PromptItem {
  id: string
  title: string
  category?: string
  context?: string
  description?: string
  tags?: string[]
  role?: 'system' | 'user' | 'assistant'
  style?: string
  template: string
  variables?: PromptVariable[]
  fewShot?: FewShotExample[]
  outputFormat?: string
  stop?: string[]
  temperature?: number
  top_p?: number
  updatedAt: string
  createdAt: string
  version?: string
  source?: string
  blocks?: PromptBlocks
  outputs?: PromptOutputs
  models?: Record<string, unknown>
}
