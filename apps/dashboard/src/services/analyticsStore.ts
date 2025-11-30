/**
 * Analytics service for prompt usage and performance tracking (Sprint 4)
 */
import type {
  AnalyticsDashboardData,
  AnalyticsSummary,
  AnalyticsTimeSeriesPoint,
  PromptUsageMetric,
  PromptPerformanceMetric,
  ProviderAnalytics,
  ModelAnalytics,
} from '../types/analytics'

const API_BASE_RAW = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'
const API_BASE = API_BASE_RAW ? API_BASE_RAW.replace(/\/$/, '') : ''

// Local storage key for analytics data
const ANALYTICS_STORAGE_KEY = 'promptAnalytics.v1'

// Configuration constants
const MAX_EVENTS_STORED = 1000
const TOP_PROMPTS_LIMIT = 10

interface AnalyticsEvent {
  id: string
  promptId: string
  promptTitle: string
  provider: string
  model: string
  timestamp: string
  responseTimeMs: number
  promptTokens: number
  completionTokens: number
  cost: number
  success: boolean
  errorMessage?: string
}

// In-memory analytics store
let analyticsEvents: AnalyticsEvent[] = []

function loadAnalyticsFromStorage(): AnalyticsEvent[] {
  try {
    const raw = localStorage.getItem(ANALYTICS_STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as AnalyticsEvent[]
  } catch {
    return []
  }
}

function saveAnalyticsToStorage(events: AnalyticsEvent[]): void {
  // Keep only last N events to avoid storage bloat
  const trimmed = events.slice(-MAX_EVENTS_STORED)
  localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(trimmed))
}

// Initialize from storage
analyticsEvents = loadAnalyticsFromStorage()

/**
 * Track a prompt execution for analytics
 */
export function trackPromptExecution(event: Omit<AnalyticsEvent, 'id'>): void {
  const newEvent: AnalyticsEvent = {
    ...event,
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
  }
  analyticsEvents.push(newEvent)
  saveAnalyticsToStorage(analyticsEvents)
}

/**
 * Get analytics summary for a time period
 */
export function getAnalyticsSummary(
  periodDays: number = 30
): AnalyticsSummary {
  const now = new Date()
  const startDate = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000)
  
  const filteredEvents = analyticsEvents.filter(
    (e) => new Date(e.timestamp) >= startDate
  )
  
  const totalExecutions = filteredEvents.length
  const successCount = filteredEvents.filter((e) => e.success).length
  const successRate = totalExecutions > 0 ? successCount / totalExecutions : 0
  const avgResponseTime =
    totalExecutions > 0
      ? filteredEvents.reduce((sum, e) => sum + e.responseTimeMs, 0) / totalExecutions
      : 0
  const totalCost = filteredEvents.reduce((sum, e) => sum + e.cost, 0)
  
  // Get unique prompts
  const promptMap = new Map<string, PromptUsageMetric>()
  for (const event of filteredEvents) {
    const existing = promptMap.get(event.promptId)
    if (existing) {
      existing.executionCount++
      existing.totalCost += event.cost
      existing.avgResponseTime =
        (existing.avgResponseTime * (existing.executionCount - 1) +
          event.responseTimeMs) /
        existing.executionCount
      existing.avgTokensUsed =
        (existing.avgTokensUsed * (existing.executionCount - 1) +
          event.promptTokens +
          event.completionTokens) /
        existing.executionCount
      if (event.success) {
        existing.successRate =
          (existing.successRate * (existing.executionCount - 1) + 1) /
          existing.executionCount
      }
      if (event.timestamp > existing.lastUsed) {
        existing.lastUsed = event.timestamp
      }
    } else {
      promptMap.set(event.promptId, {
        promptId: event.promptId,
        promptTitle: event.promptTitle,
        executionCount: 1,
        successRate: event.success ? 1 : 0,
        avgResponseTime: event.responseTimeMs,
        avgTokensUsed: event.promptTokens + event.completionTokens,
        totalCost: event.cost,
        lastUsed: event.timestamp,
      })
    }
  }
  
  const topPrompts = Array.from(promptMap.values())
    .sort((a, b) => b.executionCount - a.executionCount)
    .slice(0, TOP_PROMPTS_LIMIT)
  
  return {
    totalExecutions,
    successRate,
    avgResponseTime,
    totalCost,
    uniquePromptsUsed: promptMap.size,
    topPrompts,
    periodStart: startDate.toISOString(),
    periodEnd: now.toISOString(),
  }
}

/**
 * Get time series data for analytics charts
 */
export function getAnalyticsTimeSeries(
  periodDays: number = 30,
  granularity: 'hour' | 'day' = 'day'
): AnalyticsTimeSeriesPoint[] {
  const now = new Date()
  const startDate = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000)
  
  const filteredEvents = analyticsEvents.filter(
    (e) => new Date(e.timestamp) >= startDate
  )
  
  // Group by time bucket
  const bucketSize = granularity === 'hour' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  const buckets = new Map<number, AnalyticsEvent[]>()
  
  for (const event of filteredEvents) {
    const eventTime = new Date(event.timestamp).getTime()
    const bucketKey = Math.floor(eventTime / bucketSize) * bucketSize
    const bucket = buckets.get(bucketKey) || []
    bucket.push(event)
    buckets.set(bucketKey, bucket)
  }
  
  // Convert to time series points
  const points: AnalyticsTimeSeriesPoint[] = []
  const sortedKeys = Array.from(buckets.keys()).sort()
  
  for (const key of sortedKeys) {
    const events = buckets.get(key)!
    const successCount = events.filter((e) => e.success).length
    points.push({
      timestamp: new Date(key).toISOString(),
      executionCount: events.length,
      successRate: events.length > 0 ? successCount / events.length : 0,
      avgResponseTimeMs:
        events.reduce((sum, e) => sum + e.responseTimeMs, 0) / events.length,
      cost: events.reduce((sum, e) => sum + e.cost, 0),
    })
  }
  
  return points
}

/**
 * Get analytics breakdown by provider
 */
export function getAnalyticsByProvider(
  periodDays: number = 30
): ProviderAnalytics[] {
  const now = new Date()
  const startDate = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000)
  
  const filteredEvents = analyticsEvents.filter(
    (e) => new Date(e.timestamp) >= startDate
  )
  
  const providerMap = new Map<string, AnalyticsEvent[]>()
  for (const event of filteredEvents) {
    const provider = event.provider || 'unknown'
    const existing = providerMap.get(provider) || []
    existing.push(event)
    providerMap.set(provider, existing)
  }
  
  return Array.from(providerMap.entries()).map(([provider, events]) => {
    const successCount = events.filter((e) => e.success).length
    return {
      provider,
      executionCount: events.length,
      totalCost: events.reduce((sum, e) => sum + e.cost, 0),
      avgResponseTime:
        events.reduce((sum, e) => sum + e.responseTimeMs, 0) / events.length,
      successRate: events.length > 0 ? successCount / events.length : 0,
    }
  })
}

/**
 * Get analytics breakdown by model
 */
export function getAnalyticsByModel(
  periodDays: number = 30
): ModelAnalytics[] {
  const now = new Date()
  const startDate = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000)
  
  const filteredEvents = analyticsEvents.filter(
    (e) => new Date(e.timestamp) >= startDate
  )
  
  const modelMap = new Map<string, AnalyticsEvent[]>()
  for (const event of filteredEvents) {
    const model = event.model || 'unknown'
    const existing = modelMap.get(model) || []
    existing.push(event)
    modelMap.set(model, existing)
  }
  
  return Array.from(modelMap.entries()).map(([model, events]) => {
    return {
      model,
      provider: events[0]?.provider || 'unknown',
      executionCount: events.length,
      totalCost: events.reduce((sum, e) => sum + e.cost, 0),
      avgTokensPerRequest:
        events.reduce((sum, e) => sum + e.promptTokens + e.completionTokens, 0) /
        events.length,
      avgResponseTime:
        events.reduce((sum, e) => sum + e.responseTimeMs, 0) / events.length,
    }
  })
}

/**
 * Get prompt-specific performance metrics
 */
export function getPromptPerformanceHistory(
  promptId: string,
  periodDays: number = 30
): PromptPerformanceMetric[] {
  const now = new Date()
  const startDate = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000)
  
  const filteredEvents = analyticsEvents.filter(
    (e) => e.promptId === promptId && new Date(e.timestamp) >= startDate
  )
  
  // Group by day
  const dayBuckets = new Map<string, AnalyticsEvent[]>()
  for (const event of filteredEvents) {
    const day = event.timestamp.split('T')[0]
    const existing = dayBuckets.get(day) || []
    existing.push(event)
    dayBuckets.set(day, existing)
  }
  
  return Array.from(dayBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, events]) => {
      const successCount = events.filter((e) => e.success).length
      return {
        promptId,
        date,
        executionCount: events.length,
        successCount,
        errorCount: events.length - successCount,
        avgResponseTimeMs:
          events.reduce((sum, e) => sum + e.responseTimeMs, 0) / events.length,
        avgPromptTokens:
          events.reduce((sum, e) => sum + e.promptTokens, 0) / events.length,
        avgCompletionTokens:
          events.reduce((sum, e) => sum + e.completionTokens, 0) / events.length,
        totalCost: events.reduce((sum, e) => sum + e.cost, 0),
      }
    })
}

/**
 * Get full dashboard data
 */
export function getAnalyticsDashboardData(
  periodDays: number = 30
): AnalyticsDashboardData {
  return {
    summary: getAnalyticsSummary(periodDays),
    timeSeries: getAnalyticsTimeSeries(periodDays, 'day'),
    byProvider: getAnalyticsByProvider(periodDays),
    byModel: getAnalyticsByModel(periodDays),
  }
}

/**
 * Fetch analytics from API (if available)
 */
export async function fetchAnalyticsFromApi(
  periodDays: number = 30
): Promise<AnalyticsDashboardData | null> {
  if (!API_BASE) return null
  
  try {
    const response = await fetch(
      `${API_BASE}/analytics/dashboard?period_days=${periodDays}`
    )
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

/**
 * Clear analytics data
 */
export function clearAnalytics(): void {
  analyticsEvents = []
  localStorage.removeItem(ANALYTICS_STORAGE_KEY)
}

/**
 * Export analytics data as JSON
 */
export function exportAnalyticsData(): string {
  return JSON.stringify(analyticsEvents, null, 2)
}
