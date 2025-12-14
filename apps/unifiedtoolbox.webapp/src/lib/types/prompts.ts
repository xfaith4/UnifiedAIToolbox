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

export interface PromptQualitySubscores {
  clarity: number
  constraints: number
  outputFormat: number
  examples: number
  safety: number
  reusability: number
}

export interface PromptQuality {
  overallScore: number
  subscores: PromptQualitySubscores
  findings: string[]
  suggestions: string[]
  lastRatedAt: string
  raterVersion: string
}

export interface PromptRefine {
  draftText: string | null
  notes: string
  lastRefinedAt: string | null
}

export interface PromptHistoryEntry {
  versionId: string
  savedAt: string
  title: string
  promptText: string
  context?: string
  qualitySnapshot?: PromptQuality
  notes?: string
}

export interface PromptItem {
  id: string
  title: string
  template: string
  createdAt: string
  updatedAt: string
  version?: string
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
  quality?: PromptQuality
  refine?: PromptRefine
  history?: PromptHistoryEntry[]
}
