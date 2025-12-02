/**
 * AI-powered prompt suggestions service (Sprint 4)
 */
import type {
  PromptSuggestion,
  PromptAnalysis,
  PromptScoreCategory,
  SuggestionRequest,
  SuggestionResponse,
  SuggestionType,
  SuggestionHistoryEntry,
  PromptImprovementStats,
} from '../types/suggestions'
import { updatePrompt } from './promptStore'

const API_BASE_RAW = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'
const API_BASE = API_BASE_RAW ? API_BASE_RAW.replace(/\/$/, '') : ''

// Local storage key
const SUGGESTIONS_HISTORY_KEY = 'suggestionHistory.v1'

// Configuration constants
const MAX_HISTORY_ENTRIES = 100
const SCORE_EXCELLENT_THRESHOLD = 80
const MIN_WORD_COUNT = 20
const MAX_WORD_COUNT = 500
const LONG_PROMPT_THRESHOLD = 100
const HIGH_CONFIDENCE = 0.9
const MEDIUM_CONFIDENCE = 0.85
const LOW_CONFIDENCE = 0.75

// In-memory store
let suggestionHistory: SuggestionHistoryEntry[] = []

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function nowIso(): string {
  return new Date().toISOString()
}

function loadFromStorage(): void {
  try {
    const raw = localStorage.getItem(SUGGESTIONS_HISTORY_KEY)
    if (raw) {
      suggestionHistory = JSON.parse(raw) as SuggestionHistoryEntry[]
    }
  } catch {
    suggestionHistory = []
  }
}

function saveToStorage(): void {
  const trimmed = suggestionHistory.slice(-MAX_HISTORY_ENTRIES)
  localStorage.setItem(SUGGESTIONS_HISTORY_KEY, JSON.stringify(trimmed))
}

// Initialize from storage
loadFromStorage()

/**
 * Analyze prompt structure and identify issues
 */
function analyzePromptStructure(content: string): {
  hasRole: boolean
  hasTask: boolean
  hasConstraints: boolean
  hasOutputFormat: boolean
  hasExamples: boolean
  wordCount: number
  variableCount: number
} {
  return {
    hasRole: /you are|act as|role:|as a/i.test(content),
    hasTask: /task:|your task|please|help|write|create|generate/i.test(content),
    hasConstraints: /constraint|limit|must|should not|avoid|keep|maximum|minimum/i.test(content),
    hasOutputFormat: /output|format:|respond with|return|json|markdown|structure/i.test(content),
    hasExamples: /example:|for example|e\.g\.|such as/i.test(content),
    wordCount: content.split(/\s+/).filter(Boolean).length,
    variableCount: (content.match(/\{\{[^}]+\}\}/g) || []).length,
  }
}

/**
 * Calculate scores for different prompt categories
 */
function calculateCategoryScores(
  content: string,
  structure: ReturnType<typeof analyzePromptStructure>
): PromptScoreCategory[] {
  const scores: PromptScoreCategory[] = []
  
  // Clarity score
  let clarityScore = 50
  if (structure.hasRole) clarityScore += 15
  if (structure.hasTask) clarityScore += 15
  if (structure.wordCount > MIN_WORD_COUNT && structure.wordCount < MAX_WORD_COUNT) clarityScore += 10
  if (/\?/.test(content)) clarityScore += 5
  scores.push({
    name: 'Clarity',
    score: Math.min(clarityScore, 100),
    weight: 0.25,
    feedback: clarityScore >= SCORE_EXCELLENT_THRESHOLD 
      ? 'Prompt has clear structure and purpose.'
      : 'Consider adding a clearer role definition and task description.',
  })
  
  // Specificity score
  let specificityScore = 40
  if (structure.hasConstraints) specificityScore += 20
  if (structure.hasOutputFormat) specificityScore += 20
  if (structure.variableCount > 0) specificityScore += 10
  if (/specific|exactly|precisely/i.test(content)) specificityScore += 10
  scores.push({
    name: 'Specificity',
    score: Math.min(specificityScore, 100),
    weight: 0.25,
    feedback: specificityScore >= SCORE_EXCELLENT_THRESHOLD
      ? 'Prompt includes specific constraints and output requirements.'
      : 'Add more specific constraints, expected output format, or quantifiable requirements.',
  })
  
  // Context score
  let contextScore = 50
  if (structure.hasRole) contextScore += 20
  if (structure.hasExamples) contextScore += 20
  if (content.length > LONG_PROMPT_THRESHOLD) contextScore += 10
  scores.push({
    name: 'Context',
    score: Math.min(contextScore, 100),
    weight: 0.2,
    feedback: contextScore >= SCORE_EXCELLENT_THRESHOLD
      ? 'Good context provided with role definition and examples.'
      : 'Consider adding more context, background information, or examples.',
  })
  
  // Structure score
  let structureScore = 40
  if (/\n/.test(content)) structureScore += 15 // Has line breaks
  if (/-|\*|•|[0-9]+\./.test(content)) structureScore += 15 // Has lists
  if (/#{1,3}|[A-Z][A-Z\s]+:/.test(content)) structureScore += 15 // Has headers
  if (structure.hasOutputFormat) structureScore += 15
  scores.push({
    name: 'Structure',
    score: Math.min(structureScore, 100),
    weight: 0.15,
    feedback: structureScore >= SCORE_EXCELLENT_THRESHOLD
      ? 'Well-organized with clear sections and formatting.'
      : 'Use formatting (line breaks, lists, headers) to improve readability.',
  })
  
  // Best Practices score
  let bestPracticesScore = 40
  if (structure.hasRole) bestPracticesScore += 15
  if (structure.hasConstraints) bestPracticesScore += 15
  if (structure.hasOutputFormat) bestPracticesScore += 15
  if (structure.hasExamples) bestPracticesScore += 15
  scores.push({
    name: 'Best Practices',
    score: Math.min(bestPracticesScore, 100),
    weight: 0.15,
    feedback: bestPracticesScore >= SCORE_EXCELLENT_THRESHOLD
      ? 'Follows prompt engineering best practices.'
      : 'Apply best practices: define role, add constraints, specify output format.',
  })
  
  return scores
}

/**
 * Generate suggestions based on prompt analysis
 */
function generateSuggestions(
  content: string,
  structure: ReturnType<typeof analyzePromptStructure>
): PromptSuggestion[] {
  const suggestions: PromptSuggestion[] = []
  
  // Role definition suggestion
  if (!structure.hasRole) {
    suggestions.push({
      id: uid(),
      type: 'clarity',
      priority: 'high',
      title: 'Add role definition',
      description: 'Define a clear role or persona for the AI to adopt.',
      suggestedText: 'You are an expert [role]. ',
      rationale: 'Role definitions help the AI understand the context and expected expertise level.',
      confidence: HIGH_CONFIDENCE,
      applied: false,
      dismissed: false,
      createdAt: nowIso(),
    })
  }
  
  // Task clarity suggestion
  if (!structure.hasTask) {
    suggestions.push({
      id: uid(),
      type: 'clarity',
      priority: 'high',
      title: 'Define the task clearly',
      description: 'Add a clear task description starting with an action verb.',
      suggestedText: 'Task: [Describe the specific task here]\n',
      rationale: 'Clear task definitions improve accuracy and reduce ambiguity.',
      confidence: MEDIUM_CONFIDENCE,
      applied: false,
      dismissed: false,
      createdAt: nowIso(),
    })
  }
  
  // Constraints suggestion
  if (!structure.hasConstraints) {
    suggestions.push({
      id: uid(),
      type: 'constraints',
      priority: 'medium',
      title: 'Add constraints',
      description: 'Include specific constraints or limitations for the response.',
      suggestedText: '\nConstraints:\n- Keep response under [N] words\n- Focus on [specific aspect]\n- Avoid [unwanted elements]',
      rationale: 'Constraints help control output length, scope, and quality.',
      confidence: 0.8,
      applied: false,
      dismissed: false,
      createdAt: nowIso(),
    })
  }
  
  // Output format suggestion
  if (!structure.hasOutputFormat) {
    suggestions.push({
      id: uid(),
      type: 'output_format',
      priority: 'medium',
      title: 'Specify output format',
      description: 'Define the expected format for the response.',
      suggestedText: '\nOutput Format: [JSON/Markdown/Plain text with specific structure]',
      rationale: 'Specifying output format ensures consistent and usable responses.',
      confidence: MEDIUM_CONFIDENCE,
      applied: false,
      dismissed: false,
      createdAt: nowIso(),
    })
  }
  
  // Examples suggestion
  if (!structure.hasExamples && structure.wordCount > 50) {
    suggestions.push({
      id: uid(),
      type: 'examples',
      priority: 'low',
      title: 'Add examples',
      description: 'Include one or more examples of expected input/output.',
      suggestedText: '\nExample:\nInput: [example input]\nOutput: [expected output]',
      rationale: 'Examples (few-shot learning) significantly improve response quality.',
      confidence: LOW_CONFIDENCE,
      applied: false,
      dismissed: false,
      createdAt: nowIso(),
    })
  }
  
  // Structure improvement suggestion
  if (structure.wordCount > LONG_PROMPT_THRESHOLD && !/\n/.test(content)) {
    suggestions.push({
      id: uid(),
      type: 'structure',
      priority: 'medium',
      title: 'Improve formatting',
      description: 'Break up long text into sections with line breaks.',
      rationale: 'Well-formatted prompts are easier to parse and follow.',
      confidence: 0.8,
      applied: false,
      dismissed: false,
      createdAt: nowIso(),
    })
  }
  
  // Variable usage suggestion
  if (structure.variableCount === 0 && /\[.*?\]/.test(content)) {
    suggestions.push({
      id: uid(),
      type: 'best_practice',
      priority: 'low',
      title: 'Use template variables',
      description: 'Replace placeholder brackets with template variables like {{variable_name}}.',
      originalText: content.match(/\[.*?\]/)?.[0],
      suggestedText: '{{variable_name}}',
      rationale: 'Template variables enable dynamic prompt reuse and automation.',
      confidence: 0.7,
      applied: false,
      dismissed: false,
      createdAt: nowIso(),
    })
  }
  
  return suggestions
}

/**
 * Identify prompt strengths
 */
function identifyStrengths(
  structure: ReturnType<typeof analyzePromptStructure>
): string[] {
  const strengths: string[] = []
  
  if (structure.hasRole) strengths.push('Clear role definition')
  if (structure.hasTask) strengths.push('Well-defined task')
  if (structure.hasConstraints) strengths.push('Specific constraints included')
  if (structure.hasOutputFormat) strengths.push('Output format specified')
  if (structure.hasExamples) strengths.push('Examples provided')
  if (structure.variableCount > 0) strengths.push('Uses template variables for flexibility')
  if (structure.wordCount >= 50 && structure.wordCount <= 300) {
    strengths.push('Appropriate length')
  }
  
  return strengths
}

/**
 * Identify prompt weaknesses
 */
function identifyWeaknesses(
  structure: ReturnType<typeof analyzePromptStructure>
): string[] {
  const weaknesses: string[] = []
  
  if (!structure.hasRole) weaknesses.push('Missing role definition')
  if (!structure.hasTask) weaknesses.push('Task not clearly defined')
  if (!structure.hasConstraints) weaknesses.push('No explicit constraints')
  if (!structure.hasOutputFormat) weaknesses.push('Output format not specified')
  if (!structure.hasExamples) weaknesses.push('No examples provided')
  if (structure.wordCount < 20) weaknesses.push('Prompt may be too brief')
  if (structure.wordCount > 500) weaknesses.push('Prompt may be overly long')
  
  return weaknesses
}

/**
 * Analyze a prompt and generate suggestions
 */
export function analyzePrompt(request: SuggestionRequest): PromptAnalysis {
  const content = request.promptContent
  const structure = analyzePromptStructure(content)
  const categories = calculateCategoryScores(content, structure)
  
  // Calculate overall score as weighted average
  const overallScore = Math.round(
    categories.reduce((sum, cat) => sum + cat.score * cat.weight, 0)
  )
  
  const suggestions = generateSuggestions(content, structure)
  const strengths = identifyStrengths(structure)
  const weaknesses = identifyWeaknesses(structure)
  
  const analysis: PromptAnalysis = {
    promptId: request.promptId,
    promptTitle: request.promptId, // Can be enhanced with actual title lookup
    overallScore,
    analysisDate: nowIso(),
    categories,
    suggestions,
    strengths,
    weaknesses,
  }
  
  // Record in history
  const historyEntry: SuggestionHistoryEntry = {
    id: uid(),
    promptId: request.promptId,
    analysisDate: analysis.analysisDate,
    overallScore,
    suggestionsCount: suggestions.length,
    appliedCount: 0,
    dismissedCount: 0,
  }
  suggestionHistory.push(historyEntry)
  saveToStorage()
  
  return analysis
}

/**
 * Get AI-powered suggestion response (for API integration)
 */
export async function getAISuggestions(
  request: SuggestionRequest
): Promise<SuggestionResponse> {
  const startTime = Date.now()
  
  // Try API first if available
  if (API_BASE) {
    try {
      const response = await fetch(`${API_BASE}/prompts/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      
      if (response.ok) {
        const data = await response.json()
        return {
          analysis: data.analysis || data,
          executionTime: Date.now() - startTime,
          model: data.model || 'api',
        }
      }
    } catch {
      // Fall through to local analysis
    }
  }
  
  // Fallback to local analysis
  const analysis = analyzePrompt(request)
  
  return {
    analysis,
    executionTime: Date.now() - startTime,
    model: 'local-heuristics',
  }
}

/**
 * Mark a suggestion as applied and update the prompt content
 */
export async function applySuggestion(
  promptId: string,
  suggestionId: string,
  currentPromptContent: string,
  suggestion: PromptSuggestion
): Promise<string> {
  // Update history counter
  const entry = suggestionHistory.find((h) => h.promptId === promptId)
  if (entry) {
    entry.appliedCount++
    saveToStorage()
  }
  
  // Apply the suggestion to the prompt content
  let updatedContent = currentPromptContent
  
  if (suggestion.suggestedText) {
    if (suggestion.originalText) {
      // Replace all occurrences of specific text
      updatedContent = currentPromptContent.replaceAll(suggestion.originalText, suggestion.suggestedText)
    } else {
      // Add suggested text based on suggestion type
      switch (suggestion.type) {
        case 'clarity':
          // Add at the beginning with proper spacing
          updatedContent = suggestion.suggestedText + ' ' + currentPromptContent
          break
        case 'constraints':
        case 'output_format':
        case 'examples':
          // Add at the end with newline
          updatedContent = currentPromptContent + '\n' + suggestion.suggestedText
          break
        default:
          // Default: append at the end with newline
          updatedContent = currentPromptContent + '\n' + suggestion.suggestedText
      }
    }
    
    // Update the prompt in the library
    try {
      await updatePrompt(promptId, { template: updatedContent })
    } catch (error) {
      console.error('Failed to update prompt:', error)
    }
  }
  
  return updatedContent
}

/**
 * Mark a suggestion as dismissed
 */
export function dismissSuggestion(promptId: string, _suggestionId: string): void {
  const entry = suggestionHistory.find((h) => h.promptId === promptId)
  if (entry) {
    entry.dismissedCount++
    saveToStorage()
  }
}

/**
 * Get suggestion history for a prompt
 */
export function getSuggestionHistory(promptId: string): SuggestionHistoryEntry[] {
  return suggestionHistory.filter((h) => h.promptId === promptId)
}

/**
 * Get overall improvement statistics
 */
export function getImprovementStats(): PromptImprovementStats {
  const totalSuggestions = suggestionHistory.reduce(
    (sum, h) => sum + h.suggestionsCount,
    0
  )
  const appliedSuggestions = suggestionHistory.reduce(
    (sum, h) => sum + h.appliedCount,
    0
  )
  
  // Calculate average score improvement (simplified)
  const recentEntries = suggestionHistory.slice(-20)
  const avgScoreImprovement = recentEntries.length > 1
    ? (recentEntries[recentEntries.length - 1].overallScore -
        recentEntries[0].overallScore)
    : 0
  
  // Count common issues (simplified - would be enhanced with actual tracking)
  const commonIssues: { type: SuggestionType; count: number }[] = [
    { type: 'clarity', count: Math.floor(totalSuggestions * 0.3) },
    { type: 'constraints', count: Math.floor(totalSuggestions * 0.25) },
    { type: 'output_format', count: Math.floor(totalSuggestions * 0.2) },
    { type: 'examples', count: Math.floor(totalSuggestions * 0.15) },
    { type: 'structure', count: Math.floor(totalSuggestions * 0.1) },
  ]
  
  return {
    totalSuggestions,
    appliedSuggestions,
    avgScoreImprovement,
    commonIssues,
  }
}

/**
 * Clear suggestion history
 */
export function clearSuggestionHistory(): void {
  suggestionHistory = []
  localStorage.removeItem(SUGGESTIONS_HISTORY_KEY)
}
