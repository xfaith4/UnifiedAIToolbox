/**
 * A/B Testing service for prompt experimentation (Sprint 4)
 */
import type {
  ABTest,
  ABTestConfig,
  ABTestResult,
  ABTestVariant,
  ABTestAssignment,
  ABTestStatus,
  ABVariantMetrics,
} from '../types/abTesting'

const API_BASE_RAW = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'
const API_BASE = API_BASE_RAW ? API_BASE_RAW.replace(/\/$/, '') : ''

// Local storage keys
const ABTESTS_STORAGE_KEY = 'abTests.v1'
const ASSIGNMENTS_STORAGE_KEY = 'abTestAssignments.v1'

// In-memory stores
let abTests: ABTest[] = []
let assignments: ABTestAssignment[] = []

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function nowIso(): string {
  return new Date().toISOString()
}

function loadFromStorage(): void {
  try {
    const testsRaw = localStorage.getItem(ABTESTS_STORAGE_KEY)
    if (testsRaw) {
      abTests = JSON.parse(testsRaw) as ABTest[]
    }
    const assignmentsRaw = localStorage.getItem(ASSIGNMENTS_STORAGE_KEY)
    if (assignmentsRaw) {
      assignments = JSON.parse(assignmentsRaw) as ABTestAssignment[]
    }
  } catch {
    abTests = []
    assignments = []
  }
}

function saveToStorage(): void {
  localStorage.setItem(ABTESTS_STORAGE_KEY, JSON.stringify(abTests))
  // Keep only last 500 assignments
  const trimmedAssignments = assignments.slice(-500)
  localStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(trimmedAssignments))
}

// Initialize from storage
loadFromStorage()

/**
 * Create initial metrics object
 */
function createEmptyMetrics(): ABVariantMetrics {
  return {
    impressions: 0,
    conversions: 0,
    conversionRate: 0,
    avgResponseTime: 0,
    avgTokensUsed: 0,
    totalCost: 0,
  }
}

/**
 * Create a new A/B test
 */
export function createABTest(config: ABTestConfig): ABTest {
  const now = nowIso()
  
  // Calculate traffic weights
  const totalVariants = 1 + config.treatmentPromptIds.length
  const defaultWeight = 100 / totalVariants
  const weights = config.trafficSplit.length === totalVariants 
    ? config.trafficSplit 
    : Array(totalVariants).fill(defaultWeight)
  
  const controlVariant: ABTestVariant = {
    id: uid(),
    name: 'Control',
    promptId: config.controlPromptId,
    trafficWeight: weights[0],
    metrics: createEmptyMetrics(),
  }
  
  const treatmentVariants: ABTestVariant[] = config.treatmentPromptIds.map(
    (promptId, index) => ({
      id: uid(),
      name: `Treatment ${index + 1}`,
      promptId,
      trafficWeight: weights[index + 1] || defaultWeight,
      metrics: createEmptyMetrics(),
    })
  )
  
  const test: ABTest = {
    id: uid(),
    name: config.name,
    description: config.description,
    status: 'draft',
    controlVariant,
    treatmentVariants,
    createdAt: now,
    updatedAt: now,
    targetSampleSize: config.targetSampleSize,
    currentSampleSize: 0,
    tags: config.tags || [],
  }
  
  abTests.push(test)
  saveToStorage()
  
  return test
}

/**
 * Get all A/B tests
 */
export function getABTests(status?: ABTestStatus): ABTest[] {
  if (status) {
    return abTests.filter((test) => test.status === status)
  }
  return [...abTests]
}

/**
 * Get a specific A/B test by ID
 */
export function getABTest(testId: string): ABTest | undefined {
  return abTests.find((test) => test.id === testId)
}

/**
 * Update A/B test status
 */
export function updateABTestStatus(testId: string, status: ABTestStatus): ABTest | null {
  const test = abTests.find((t) => t.id === testId)
  if (!test) return null
  
  test.status = status
  test.updatedAt = nowIso()
  
  if (status === 'running' && !test.startDate) {
    test.startDate = nowIso()
  }
  if (status === 'completed' || status === 'archived') {
    test.endDate = nowIso()
  }
  
  saveToStorage()
  return test
}

/**
 * Delete an A/B test
 */
export function deleteABTest(testId: string): boolean {
  const index = abTests.findIndex((t) => t.id === testId)
  if (index === -1) return false
  
  abTests.splice(index, 1)
  saveToStorage()
  return true
}

/**
 * Get variant assignment for a session
 * Uses weighted random selection based on traffic weights
 */
export function getVariantAssignment(
  testId: string,
  sessionId?: string
): ABTestAssignment | null {
  const test = abTests.find((t) => t.id === testId)
  if (!test || test.status !== 'running') return null
  
  // Check if session already has an assignment
  if (sessionId) {
    const existing = assignments.find(
      (a) => a.testId === testId && a.sessionId === sessionId
    )
    if (existing) return existing
  }
  
  // Weighted random selection
  const allVariants = [test.controlVariant, ...test.treatmentVariants]
  const totalWeight = allVariants.reduce((sum, v) => sum + v.trafficWeight, 0)
  let random = Math.random() * totalWeight
  
  let selectedVariant = allVariants[0]
  for (const variant of allVariants) {
    random -= variant.trafficWeight
    if (random <= 0) {
      selectedVariant = variant
      break
    }
  }
  
  const assignment: ABTestAssignment = {
    testId,
    variantId: selectedVariant.id,
    promptId: selectedVariant.promptId,
    timestamp: nowIso(),
    sessionId,
  }
  
  assignments.push(assignment)
  saveToStorage()
  
  return assignment
}

/**
 * Record a metric for a variant
 */
export function recordVariantMetric(
  testId: string,
  variantId: string,
  metric: {
    responseTime?: number
    tokensUsed?: number
    cost?: number
    isConversion?: boolean
  }
): boolean {
  const test = abTests.find((t) => t.id === testId)
  if (!test) return false
  
  const allVariants = [test.controlVariant, ...test.treatmentVariants]
  const variant = allVariants.find((v) => v.id === variantId)
  if (!variant) return false
  
  // Update metrics
  variant.metrics.impressions++
  
  if (metric.isConversion) {
    variant.metrics.conversions++
  }
  
  if (metric.responseTime !== undefined) {
    variant.metrics.avgResponseTime =
      (variant.metrics.avgResponseTime * (variant.metrics.impressions - 1) +
        metric.responseTime) /
      variant.metrics.impressions
  }
  
  if (metric.tokensUsed !== undefined) {
    variant.metrics.avgTokensUsed =
      (variant.metrics.avgTokensUsed * (variant.metrics.impressions - 1) +
        metric.tokensUsed) /
      variant.metrics.impressions
  }
  
  if (metric.cost !== undefined) {
    variant.metrics.totalCost += metric.cost
  }
  
  // Recalculate conversion rate
  variant.metrics.conversionRate =
    variant.metrics.impressions > 0
      ? variant.metrics.conversions / variant.metrics.impressions
      : 0
  
  // Update test sample size
  test.currentSampleSize = allVariants.reduce(
    (sum, v) => sum + v.metrics.impressions,
    0
  )
  test.updatedAt = nowIso()
  
  saveToStorage()
  return true
}

/**
 * Calculate statistical significance using simplified z-test
 */
function calculateSignificance(
  control: ABVariantMetrics,
  treatment: ABVariantMetrics
): number {
  if (control.impressions < 30 || treatment.impressions < 30) {
    return 0 // Not enough data
  }
  
  const p1 = control.conversionRate
  const p2 = treatment.conversionRate
  const n1 = control.impressions
  const n2 = treatment.impressions
  
  const pooledP = (p1 * n1 + p2 * n2) / (n1 + n2)
  const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / n1 + 1 / n2))
  
  if (se === 0) return 0
  
  const zScore = Math.abs(p1 - p2) / se
  
  // Convert z-score to approximate significance level
  // This is a simplified calculation
  if (zScore >= 2.576) return 0.99
  if (zScore >= 1.96) return 0.95
  if (zScore >= 1.645) return 0.90
  if (zScore >= 1.28) return 0.80
  return 0.5
}

/**
 * Get A/B test results with statistical analysis
 */
export function getABTestResults(testId: string): ABTestResult | null {
  const test = abTests.find((t) => t.id === testId)
  if (!test) return null
  
  const allVariants = [test.controlVariant, ...test.treatmentVariants]
  
  // Calculate significance for each treatment vs control
  let maxSignificance = 0
  let winner: ABTestResult['winner'] = undefined
  
  for (const treatment of test.treatmentVariants) {
    const significance = calculateSignificance(
      test.controlVariant.metrics,
      treatment.metrics
    )
    
    if (significance > maxSignificance) {
      maxSignificance = significance
      
      const improvement =
        test.controlVariant.metrics.conversionRate > 0
          ? ((treatment.metrics.conversionRate -
              test.controlVariant.metrics.conversionRate) /
              test.controlVariant.metrics.conversionRate) *
            100
          : 0
      
      if (improvement > 0 && significance >= 0.95) {
        winner = {
          variantId: treatment.id,
          improvement,
          metric: 'conversionRate',
        }
      }
    }
  }
  
  // Generate recommendation
  let recommendation = ''
  if (test.currentSampleSize < 100) {
    recommendation = 'Continue testing: Not enough data for reliable results.'
  } else if (maxSignificance < 0.95) {
    recommendation =
      'Continue testing: Results are not yet statistically significant.'
  } else if (winner) {
    recommendation = `Consider implementing ${
      allVariants.find((v) => v.id === winner!.variantId)?.name
    } as it shows a ${winner.improvement.toFixed(1)}% improvement.`
  } else {
    recommendation = 'No clear winner. Consider testing different variations.'
  }
  
  return {
    testId,
    status: test.status,
    variants: allVariants,
    statisticalSignificance: maxSignificance,
    confidenceLevel: maxSignificance,
    winner,
    recommendation,
  }
}

/**
 * Fetch A/B tests from API (if available)
 */
export async function fetchABTestsFromApi(): Promise<ABTest[] | null> {
  if (!API_BASE) return null
  
  try {
    const response = await fetch(`${API_BASE}/ab-tests`)
    if (!response.ok) return null
    const data = await response.json()
    return Array.isArray(data) ? data : data.tests
  } catch {
    return null
  }
}

/**
 * Clear all A/B test data
 */
export function clearABTests(): void {
  abTests = []
  assignments = []
  localStorage.removeItem(ABTESTS_STORAGE_KEY)
  localStorage.removeItem(ASSIGNMENTS_STORAGE_KEY)
}
