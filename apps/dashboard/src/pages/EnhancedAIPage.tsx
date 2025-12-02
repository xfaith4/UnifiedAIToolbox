/**
 * Enhanced AI Page (Sprint 4)
 * Combines analytics, A/B testing, fine-tuning, and AI suggestions
 */
import React, { useState, useEffect } from 'react'
import AnalyticsDashboard from '../components/AnalyticsDashboard'
import ABTestingManager from '../components/ABTestingManager'
import FineTuneManager from '../components/FineTuneManager'
import SuggestionPanel from '../components/SuggestionPanel'
import { fetchPromptLibrary } from '../services/promptStore'
import type { PromptItem } from '../types/prompts'

type TabId = 'analytics' | 'abtesting' | 'finetuning' | 'suggestions'

interface TabConfig {
  id: TabId
  label: string
  icon: string
  description: string
}

const TABS: TabConfig[] = [
  {
    id: 'analytics',
    label: 'Analytics',
    icon: '📊',
    description: 'Track prompt usage and performance metrics',
  },
  {
    id: 'abtesting',
    label: 'A/B Testing',
    icon: '🧪',
    description: 'Compare prompt variants and find winners',
  },
  {
    id: 'finetuning',
    label: 'Fine-Tuning',
    icon: '🎯',
    description: 'Create custom fine-tuned models',
  },
  {
    id: 'suggestions',
    label: 'AI Suggestions',
    icon: '✨',
    description: 'Get AI-powered prompt improvements',
  },
]

export default function EnhancedAIPage() {
  const [activeTab, setActiveTab] = useState<TabId>('analytics')
  const [prompts, setPrompts] = useState<PromptItem[]>([])
  const [selectedPromptId, setSelectedPromptId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    fetchPromptLibrary()
      .then((list) => {
        setPrompts(list)
        if (list.length > 0 && selectedPromptId === '') {
          setSelectedPromptId(list[0].id)
        }
      })
      .catch((error) => {
        console.error('Failed to fetch prompt library:', error)
      })
      .finally(() => {
        setIsLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  const selectedPrompt = prompts.find((p) => p.id === selectedPromptId)
  const promptIds = prompts.map((p) => p.id)

  const renderTabContent = () => {
    switch (activeTab) {
      case 'analytics':
        return <AnalyticsDashboard />
      
      case 'abtesting':
        return <ABTestingManager promptIds={promptIds} />
      
      case 'finetuning':
        return <FineTuneManager />
      
      case 'suggestions':
        return (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <span>✨</span> AI-Powered Suggestions
                </h2>
                <p className="text-sm text-neutral-400 mt-1">
                  Get intelligent recommendations to improve your prompts
                </p>
              </div>
            </div>

            {/* Prompt Selector */}
            <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950">
              <label className="block text-sm text-neutral-400 mb-2">
                Select a prompt to analyze:
              </label>
              <select
                className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800"
                value={selectedPromptId}
                onChange={(e) => setSelectedPromptId(e.target.value)}
              >
                <option value="">Choose a prompt...</option>
                {prompts.map((prompt) => (
                  <option key={prompt.id} value={prompt.id}>
                    {prompt.title} ({prompt.category || 'uncategorized'})
                  </option>
                ))}
              </select>
            </div>

            {/* Selected Prompt Preview */}
            {selectedPrompt && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950">
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <span>📝</span> Prompt Content
                  </h3>
                  <div className="text-sm text-neutral-400 mb-2">
                    {selectedPrompt.description || selectedPrompt.context}
                  </div>
                  <pre className="p-3 rounded bg-neutral-900 text-xs whitespace-pre-wrap max-h-64 overflow-y-auto">
                    {selectedPrompt.template}
                  </pre>
                </div>

                <SuggestionPanel
                  promptId={selectedPromptId}
                  promptContent={selectedPrompt.template}
                  onApplySuggestion={(suggestion) => {
                    console.log('Applied suggestion:', suggestion)
                    // Refresh the prompt library to show updated content
                    setRefreshKey(prev => prev + 1)
                  }}
                />
              </div>
            )}

            {!selectedPromptId && !isLoading && (
              <div className="text-center py-12">
                <span className="text-4xl block mb-4">✨</span>
                <p className="text-neutral-400">Select a prompt to get AI-powered suggestions</p>
                <p className="text-sm text-neutral-500 mt-1">
                  Our analysis will help you improve clarity, structure, and effectiveness
                </p>
              </div>
            )}
          </div>
        )
      
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen">
      {/* Page Header */}
      <div className="p-4 border-b border-neutral-800">
        <h1 className="text-2xl font-bold">Enhanced AI Capabilities</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Sprint 4 features: Analytics, A/B Testing, Fine-Tuning, and AI Suggestions
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-neutral-800">
        <div className="flex overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-emerald-500 text-emerald-400 bg-emerald-950/20'
                  : 'border-transparent text-neutral-400 hover:text-white hover:bg-neutral-900'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="text-lg">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Description */}
      <div className="px-4 py-2 bg-neutral-900/50 border-b border-neutral-800">
        <p className="text-xs text-neutral-500">
          {TABS.find((t) => t.id === activeTab)?.description}
        </p>
      </div>

      {/* Tab Content */}
      <div className="min-h-[calc(100vh-200px)]">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <span className="text-3xl animate-pulse block mb-2">⚙️</span>
              <p className="text-neutral-400">Loading...</p>
            </div>
          </div>
        ) : (
          renderTabContent()
        )}
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-neutral-800 bg-neutral-950">
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>Sprint 4: Enhanced AI Capabilities</span>
          <span>
            {prompts.length} prompts loaded • {new Date().toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  )
}
