/**
 * Prompt Suggestion Panel Component (Sprint 4)
 * AI-powered suggestions for improving prompts
 */
import React, { useState, useEffect } from 'react'
import { analyzePrompt, applySuggestion, dismissSuggestion } from '../services/suggestionStore'
import type { PromptAnalysis, PromptSuggestion, PromptScoreCategory } from '../types/suggestions'

interface SuggestionPanelProps {
  promptId: string
  promptContent: string
  onApplySuggestion?: (suggestion: PromptSuggestion) => void
  compact?: boolean
}

interface ScoreRingProps {
  score: number
  size?: number
  strokeWidth?: number
}

function ScoreRing({ score, size = 80, strokeWidth = 8 }: ScoreRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (score / 100) * circumference

  const getColor = (s: number) => {
    if (s >= 80) return '#10b981' // emerald
    if (s >= 60) return '#eab308' // yellow
    return '#ef4444' // red
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          className="text-neutral-800"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke={getColor(score)}
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold">{score}</span>
      </div>
    </div>
  )
}

interface CategoryScoreProps {
  category: PromptScoreCategory
}

function CategoryScore({ category }: CategoryScoreProps) {
  const getColor = (score: number) => {
    if (score >= 80) return 'bg-emerald-500'
    if (score >= 60) return 'bg-yellow-500'
    return 'bg-rose-500'
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-neutral-400">{category.name}</span>
        <span className="font-medium">{category.score}</span>
      </div>
      <div className="h-1.5 bg-neutral-800 rounded overflow-hidden">
        <div
          className={`h-full ${getColor(category.score)} transition-all duration-300`}
          style={{ width: `${category.score}%` }}
        />
      </div>
      <p className="text-[10px] text-neutral-500">{category.feedback}</p>
    </div>
  )
}

interface SuggestionCardProps {
  suggestion: PromptSuggestion
  onApply: () => void
  onDismiss: () => void
}

function SuggestionCard({ suggestion, onApply, onDismiss }: SuggestionCardProps) {
  const priorityColors = {
    high: 'border-rose-800 bg-rose-950/20',
    medium: 'border-yellow-800 bg-yellow-950/20',
    low: 'border-blue-800 bg-blue-950/20',
  }

  const priorityIcons = {
    high: '🔴',
    medium: '🟡',
    low: '🔵',
  }

  const typeIcons: Record<string, string> = {
    clarity: '🎯',
    specificity: '📌',
    structure: '📐',
    context: '📖',
    examples: '💡',
    constraints: '🚧',
    output_format: '📝',
    best_practice: '✨',
  }

  if (suggestion.applied || suggestion.dismissed) {
    return null
  }

  return (
    <div className={`p-3 rounded-lg border ${priorityColors[suggestion.priority]}`}>
      <div className="flex items-start gap-2">
        <span className="text-lg">{typeIcons[suggestion.type] || '💡'}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{suggestion.title}</span>
            <span className="text-[10px] text-neutral-500">
              {priorityIcons[suggestion.priority]} {suggestion.priority}
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-1">{suggestion.description}</p>
          
          {suggestion.suggestedText && (
            <div className="mt-2 p-2 rounded bg-neutral-900/50 text-xs font-mono">
              <div className="text-neutral-500 text-[10px] mb-1">Suggested:</div>
              <div className="text-emerald-400">{suggestion.suggestedText}</div>
            </div>
          )}

          <p className="text-[10px] text-neutral-500 mt-2 italic">
            {suggestion.rationale}
          </p>

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1 text-[10px] text-neutral-500">
              <span>Confidence:</span>
              <span className="font-medium">{(suggestion.confidence * 100).toFixed(0)}%</span>
            </div>
            <div className="flex gap-2">
              <button
                className="px-2 py-1 rounded text-xs bg-neutral-800 hover:bg-neutral-700"
                onClick={onDismiss}
              >
                Dismiss
              </button>
              {suggestion.suggestedText && (
                <button
                  className="px-2 py-1 rounded text-xs bg-emerald-600 hover:bg-emerald-500"
                  onClick={onApply}
                >
                  Apply
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SuggestionPanel({
  promptId,
  promptContent,
  onApplySuggestion,
  compact = false,
}: SuggestionPanelProps) {
  const [analysis, setAnalysis] = useState<PromptAnalysis | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [expandedSections, setExpandedSections] = useState({
    suggestions: true,
    categories: true,
    strengths: false,
  })

  const runAnalysis = () => {
    if (!promptContent.trim()) return
    
    setIsAnalyzing(true)
    // Simulate async analysis
    setTimeout(() => {
      const result = analyzePrompt({
        promptId,
        promptContent,
      })
      setAnalysis(result)
      setIsAnalyzing(false)
    }, 500)
  }

  useEffect(() => {
    if (promptContent.length > 20) {
      runAnalysis()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptId, promptContent])

  const handleApply = async (suggestion: PromptSuggestion) => {
    try {
      await applySuggestion(promptId, suggestion.id, promptContent, suggestion)
      
      // Mark suggestion as applied in local state
      if (analysis) {
        setAnalysis({
          ...analysis,
          suggestions: analysis.suggestions.map((s) =>
            s.id === suggestion.id ? { ...s, applied: true } : s
          ),
        })
      }
      
      if (onApplySuggestion) {
        onApplySuggestion(suggestion)
      }
      
      // Re-run analysis after a brief delay to allow state to update
      setTimeout(() => runAnalysis(), 1000)
    } catch (error) {
      console.error('Failed to apply suggestion:', error)
    }
  }

  const handleDismiss = (suggestion: PromptSuggestion) => {
    dismissSuggestion(promptId, suggestion.id)
    // Update local state
    if (analysis) {
      setAnalysis({
        ...analysis,
        suggestions: analysis.suggestions.map((s) =>
          s.id === suggestion.id ? { ...s, dismissed: true } : s
        ),
      })
    }
  }

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  const activeSuggestions = analysis?.suggestions.filter(
    (s) => !s.applied && !s.dismissed
  ) || []

  if (compact) {
    return (
      <div className="p-3 rounded-lg border border-neutral-800 bg-neutral-950">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>✨</span>
            <span className="text-sm font-medium">AI Suggestions</span>
            {analysis && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-800">
                Score: {analysis.overallScore}/100
              </span>
            )}
          </div>
          <button
            className="px-2 py-1 rounded text-xs bg-emerald-600 hover:bg-emerald-500"
            onClick={runAnalysis}
            disabled={isAnalyzing || !promptContent.trim()}
          >
            {isAnalyzing ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>

        {activeSuggestions.length > 0 && (
          <div className="mt-2 text-xs text-neutral-400">
            {activeSuggestions.length} suggestion{activeSuggestions.length !== 1 ? 's' : ''} available
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <span>✨</span> AI Prompt Analysis
        </h3>
        <button
          className="px-3 py-1.5 rounded text-sm bg-emerald-600 hover:bg-emerald-500 flex items-center gap-1"
          onClick={runAnalysis}
          disabled={isAnalyzing || !promptContent.trim()}
        >
          {isAnalyzing ? (
            <>
              <span className="animate-spin">⟳</span> Analyzing...
            </>
          ) : (
            <>🔍 Analyze</>
          )}
        </button>
      </div>

      {!analysis && !isAnalyzing && (
        <div className="text-center py-8 text-neutral-500">
          <span className="text-3xl block mb-2">🔍</span>
          <p className="text-sm">Click "Analyze" to get AI-powered suggestions</p>
          <p className="text-xs mt-1">for improving your prompt</p>
        </div>
      )}

      {isAnalyzing && (
        <div className="text-center py-8 text-neutral-400">
          <span className="text-3xl block mb-2 animate-pulse">✨</span>
          <p className="text-sm">Analyzing your prompt...</p>
        </div>
      )}

      {analysis && !isAnalyzing && (
        <>
          {/* Overall Score */}
          <div className="flex items-center gap-4 p-4 rounded-xl border border-neutral-800 bg-neutral-950">
            <ScoreRing score={analysis.overallScore} />
            <div>
              <div className="font-semibold">
                {analysis.overallScore >= 80
                  ? 'Excellent Prompt'
                  : analysis.overallScore >= 60
                    ? 'Good Prompt'
                    : 'Needs Improvement'}
              </div>
              <p className="text-sm text-neutral-400 mt-1">
                {activeSuggestions.length > 0
                  ? `${activeSuggestions.length} suggestion${activeSuggestions.length !== 1 ? 's' : ''} to improve`
                  : 'No suggestions - looking good!'}
              </p>
            </div>
          </div>

          {/* Category Scores */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
            <button
              className="w-full p-3 flex items-center justify-between text-sm font-medium hover:bg-neutral-900"
              onClick={() => toggleSection('categories')}
            >
              <span>📊 Category Breakdown</span>
              <span>{expandedSections.categories ? '▼' : '▶'}</span>
            </button>
            {expandedSections.categories && (
              <div className="p-3 border-t border-neutral-800 space-y-3">
                {analysis.categories.map((cat, index) => (
                  <CategoryScore key={index} category={cat} />
                ))}
              </div>
            )}
          </div>

          {/* Suggestions */}
          {activeSuggestions.length > 0 && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
              <button
                className="w-full p-3 flex items-center justify-between text-sm font-medium hover:bg-neutral-900"
                onClick={() => toggleSection('suggestions')}
              >
                <span>💡 Suggestions ({activeSuggestions.length})</span>
                <span>{expandedSections.suggestions ? '▼' : '▶'}</span>
              </button>
              {expandedSections.suggestions && (
                <div className="p-3 border-t border-neutral-800 space-y-3">
                  {activeSuggestions.map((suggestion) => (
                    <SuggestionCard
                      key={suggestion.id}
                      suggestion={suggestion}
                      onApply={() => handleApply(suggestion)}
                      onDismiss={() => handleDismiss(suggestion)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Strengths & Weaknesses */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
            <button
              className="w-full p-3 flex items-center justify-between text-sm font-medium hover:bg-neutral-900"
              onClick={() => toggleSection('strengths')}
            >
              <span>📝 Strengths & Weaknesses</span>
              <span>{expandedSections.strengths ? '▼' : '▶'}</span>
            </button>
            {expandedSections.strengths && (
              <div className="p-3 border-t border-neutral-800 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-medium text-emerald-400 mb-2">✓ Strengths</div>
                  {analysis.strengths.length > 0 ? (
                    <ul className="text-xs text-neutral-400 space-y-1">
                      {analysis.strengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-1">
                          <span className="text-emerald-500">•</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-neutral-500">None identified</p>
                  )}
                </div>
                <div>
                  <div className="text-xs font-medium text-rose-400 mb-2">✗ Areas to Improve</div>
                  {analysis.weaknesses.length > 0 ? (
                    <ul className="text-xs text-neutral-400 space-y-1">
                      {analysis.weaknesses.map((w, i) => (
                        <li key={i} className="flex items-start gap-1">
                          <span className="text-rose-500">•</span>
                          {w}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-neutral-500">None identified</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
