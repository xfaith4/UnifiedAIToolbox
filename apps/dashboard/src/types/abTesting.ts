/**
 * Types for A/B testing of prompts (Sprint 4)
 */

export type ABTestStatus = 'draft' | 'running' | 'paused' | 'completed' | 'archived'

export interface ABTestVariant {
  id: string
  name: string
  promptId: string
  trafficWeight: number // percentage of traffic (0-100)
  metrics: ABVariantMetrics
}

export interface ABVariantMetrics {
  impressions: number
  conversions: number
  conversionRate: number
  avgResponseTime: number
  avgTokensUsed: number
  totalCost: number
  userSatisfactionScore?: number
}

export interface ABTest {
  id: string
  name: string
  description: string
  status: ABTestStatus
  controlVariant: ABTestVariant
  treatmentVariants: ABTestVariant[]
  startDate?: string
  endDate?: string
  createdAt: string
  updatedAt: string
  createdBy?: string
  targetSampleSize?: number
  currentSampleSize: number
  statisticalSignificance?: number
  winningVariant?: string
  tags: string[]
}

export interface ABTestConfig {
  name: string
  description: string
  controlPromptId: string
  treatmentPromptIds: string[]
  trafficSplit: number[] // weights for each variant
  targetSampleSize?: number
  maxDuration?: number // in days
  tags?: string[]
}

export interface ABTestResult {
  testId: string
  status: ABTestStatus
  variants: ABTestVariant[]
  statisticalSignificance: number
  confidenceLevel: number
  winner?: {
    variantId: string
    improvement: number // percentage improvement over control
    metric: string
  }
  recommendation: string
}

export interface ABTestAssignment {
  testId: string
  variantId: string
  promptId: string
  timestamp: string
  sessionId?: string
}
