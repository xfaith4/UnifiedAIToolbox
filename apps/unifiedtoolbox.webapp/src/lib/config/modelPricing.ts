/**
 * Model pricing configuration for cost estimation
 * Prices are per 1,000 tokens (USD)
 */
export const MODEL_PRICING = {
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4': { input: 0.03, output: 0.06 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'claude-3.5-sonnet': { input: 0.003, output: 0.015 },
    'claude-3-opus': { input: 0.015, output: 0.075 },
    'claude-3-haiku': { input: 0.00025, output: 0.00125 },
} as const

export type ModelName = keyof typeof MODEL_PRICING

/**
 * Sustainability factors for environmental impact estimation
 */
export const SUSTAINABILITY_FACTORS = {
    // Approximate gCO2e per 1,000 tokens
    gCO2ePerKToken: {
        'gpt-4o-mini': 0.5,
        'gpt-4': 2.0,
        'gpt-4-turbo': 1.5,
        'claude-3.5-sonnet': 1.2,
        'claude-3-opus': 2.5,
        'claude-3-haiku': 0.4,
    } as Record<ModelName, number>,

    // Energy in kWh per 1,000 tokens (approximate)
    energyKWhPerKToken: 0.001,

    // Water in liters per 1,000 tokens (approximate)
    waterLitersPerKToken: 0.002,
} as const

/**
 * Calculate cost for a given model and token usage
 */
export function calculateCost(
    model: ModelName,
    inputTokens: number,
    outputTokens: number
): number {
    const pricing = MODEL_PRICING[model]
    if (!pricing) {
        console.warn(`Unknown model: ${model}, using gpt-4o-mini pricing`)
        return calculateCost('gpt-4o-mini', inputTokens, outputTokens)
    }

    const inputCost = (inputTokens / 1000) * pricing.input
    const outputCost = (outputTokens / 1000) * pricing.output
    return inputCost + outputCost
}

/**
 * Calculate CO2e emissions for a given model and token usage
 */
export function calculateCO2e(model: ModelName, totalTokens: number): number {
    const factor = SUSTAINABILITY_FACTORS.gCO2ePerKToken[model] || 1.0
    return (totalTokens / 1000) * factor
}

/**
 * Calculate energy consumption in kWh
 */
export function calculateEnergy(totalTokens: number): number {
    return (totalTokens / 1000) * SUSTAINABILITY_FACTORS.energyKWhPerKToken
}

/**
 * Calculate water usage in liters
 */
export function calculateWater(totalTokens: number): number {
    return (totalTokens / 1000) * SUSTAINABILITY_FACTORS.waterLitersPerKToken
}
