export interface PromptVariable {
  name: string
  label?: string
  type?: 'string' | 'multiline'
  default?: string
}

export interface FewShotExample {
  input: Record<string, string>
  output: string
}

export interface PromptItem {
  id: string
  title: string
  template: string
  createdAt: string
  updatedAt: string
  category?: string
  context?: string
  description?: string
  tags?: string[]
  role?: string
  style?: string
  variables?: PromptVariable[]
  fewShot?: FewShotExample[]
  outputFormat?: string
  stop?: string[]
  temperature?: number
  top_p?: number
}
