/**
 * Types for prompt analytics and insights (Sprint 4)
 */

export interface PromptUsageMetric {
  promptId: string
  promptTitle: string
  executionCount: number
  successRate: number
  avgResponseTime: number
  avgTokensUsed: number
  totalCost: number
  lastUsed: string
}

export interface PromptPerformanceMetric {
  promptId: string
  date: string
  executionCount: number
  successCount: number
  errorCount: number
  avgResponseTimeMs: number
  avgPromptTokens: number
  avgCompletionTokens: number
  totalCost: number
}

export interface AnalyticsSummary {
  totalExecutions: number
  successRate: number
  avgResponseTime: number
  totalCost: number
  uniquePromptsUsed: number
  topPrompts: PromptUsageMetric[]
  periodStart: string
  periodEnd: string
}

export interface AnalyticsTimeSeriesPoint {
  timestamp: string
  executionCount: number
  successRate: number
  avgResponseTimeMs: number
  cost: number
}

export interface AnalyticsDashboardData {
  summary: AnalyticsSummary
  timeSeries: AnalyticsTimeSeriesPoint[]
  byProvider: ProviderAnalytics[]
  byModel: ModelAnalytics[]
}

export interface ProviderAnalytics {
  provider: string
  executionCount: number
  totalCost: number
  avgResponseTime: number
  successRate: number
}

export interface ModelAnalytics {
  model: string
  provider: string
  executionCount: number
  totalCost: number
  avgTokensPerRequest: number
  avgResponseTime: number
}
