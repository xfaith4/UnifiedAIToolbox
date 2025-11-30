/**
 * Types for AI-powered prompt suggestions (Sprint 4)
 */

export type SuggestionType = 
  | 'clarity' 
  | 'specificity' 
  | 'structure' 
  | 'context' 
  | 'examples' 
  | 'constraints' 
  | 'output_format'
  | 'best_practice'

export type SuggestionPriority = 'high' | 'medium' | 'low'

export interface PromptSuggestion {
  id: string
  type: SuggestionType
  priority: SuggestionPriority
  title: string
  description: string
  originalText?: string
  suggestedText?: string
  rationale: string
  confidence: number // 0-1 confidence score
  applied: boolean
  dismissed: boolean
  createdAt: string
}

export interface PromptAnalysis {
  promptId: string
  promptTitle: string
  overallScore: number // 0-100 quality score
  analysisDate: string
  categories: PromptScoreCategory[]
  suggestions: PromptSuggestion[]
  strengths: string[]
  weaknesses: string[]
  similarPrompts?: SimilarPrompt[]
}

export interface PromptScoreCategory {
  name: string
  score: number // 0-100
  weight: number // importance weight
  feedback: string
}

export interface SimilarPrompt {
  promptId: string
  title: string
  similarity: number // 0-1 similarity score
  category: string
}

export interface SuggestionRequest {
  promptId: string
  promptContent: string
  context?: string
  targetUseCase?: string
  preferredStyle?: string
}

export interface SuggestionResponse {
  analysis: PromptAnalysis
  executionTime: number
  model: string
}

export interface SuggestionHistoryEntry {
  id: string
  promptId: string
  analysisDate: string
  overallScore: number
  suggestionsCount: number
  appliedCount: number
  dismissedCount: number
}

export interface PromptImprovementStats {
  totalSuggestions: number
  appliedSuggestions: number
  avgScoreImprovement: number
  commonIssues: { type: SuggestionType; count: number }[]
}
