/**
 * Webapp-side model pricing and environmental factors used for estimates.
 *
 * CANONICAL SOURCE: services/prompt-api/config/model_costs.json owns model
 * names and prices. This table mirrors it for client-side estimates only —
 * when prices change, update model_costs.json first, then reflect it here.
 * tests/test_pricing_consistency.py (Python) fails the build if the two drift.
 *
 * Units:
 * - Pricing: USD per 1,000,000 tokens
 * - Energy: kWh per 1,000,000 tokens
 * - Water: liters per 1,000,000 tokens
 */
type TokenPricing = {
    inputPerMillion: number
    outputPerMillion: number
    cachedInputPerMillion?: number
}

type EnvironmentalFactors = {
    kwhPerMillion: number
    litersPerMillion: number
    gCO2ePerMillion: number
}

const DEFAULT_TEXT_MODEL = 'gpt-5.4-mini'

export const MODEL_PRICING: Record<string, TokenPricing> = {
    'gpt-5.5': { inputPerMillion: 5.0, cachedInputPerMillion: 0.5, outputPerMillion: 30.0 },
    'gpt-5.4': { inputPerMillion: 2.5, cachedInputPerMillion: 0.25, outputPerMillion: 15.0 },
    'gpt-5.4-mini': { inputPerMillion: 0.75, cachedInputPerMillion: 0.075, outputPerMillion: 4.5 },
    'gpt-5.4-nano': { inputPerMillion: 0.2, cachedInputPerMillion: 0.02, outputPerMillion: 1.25 },
    'gpt-5.3-codex': { inputPerMillion: 1.75, cachedInputPerMillion: 0.175, outputPerMillion: 14.0 },
    'claude-opus-4-8': { inputPerMillion: 5.0, cachedInputPerMillion: 0.5, outputPerMillion: 25.0 },
    'claude-sonnet-4-6': { inputPerMillion: 3.0, cachedInputPerMillion: 0.3, outputPerMillion: 15.0 },
    'claude-haiku-4-5': { inputPerMillion: 1.0, cachedInputPerMillion: 0.1, outputPerMillion: 5.0 },

    // Legacy entries retained for backward-compatible estimates.
    'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
    'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10.0 },
    'gpt-4': { inputPerMillion: 30.0, outputPerMillion: 60.0 },
    'gpt-4-turbo': { inputPerMillion: 10.0, outputPerMillion: 30.0 },
    'gpt-3.5-turbo': { inputPerMillion: 0.5, outputPerMillion: 1.5 },
    'claude-3-5-sonnet-20241022': { inputPerMillion: 3.0, outputPerMillion: 15.0 },
    'claude-3-opus-20240229': { inputPerMillion: 15.0, outputPerMillion: 75.0 },
    'claude-3-sonnet-20240229': { inputPerMillion: 3.0, outputPerMillion: 15.0 },
    'claude-3-haiku-20240307': { inputPerMillion: 0.25, outputPerMillion: 1.25 },
}

/** Known model ids. Retained for consumers that key on the pricing table. */
export type ModelName = keyof typeof MODEL_PRICING

const MODEL_ENVIRONMENTAL_FACTORS: Record<string, EnvironmentalFactors> = {
    'gpt-5.5': { kwhPerMillion: 2.0, litersPerMillion: 20.0, gCO2ePerMillion: 800.0 },
    'gpt-5.4': { kwhPerMillion: 1.5, litersPerMillion: 15.0, gCO2ePerMillion: 600.0 },
    'gpt-5.4-mini': { kwhPerMillion: 0.7, litersPerMillion: 7.0, gCO2ePerMillion: 280.0 },
    'gpt-5.4-nano': { kwhPerMillion: 0.35, litersPerMillion: 3.5, gCO2ePerMillion: 140.0 },
    'gpt-5.3-codex': { kwhPerMillion: 1.4, litersPerMillion: 14.0, gCO2ePerMillion: 560.0 },
    'claude-opus-4-8': { kwhPerMillion: 2.5, litersPerMillion: 25.0, gCO2ePerMillion: 1000.0 },
    'claude-sonnet-4-6': { kwhPerMillion: 1.5, litersPerMillion: 15.0, gCO2ePerMillion: 600.0 },
    'claude-haiku-4-5': { kwhPerMillion: 0.6, litersPerMillion: 6.0, gCO2ePerMillion: 240.0 },

    // Legacy entries retained for backward-compatible estimates.
    'gpt-4o-mini': { kwhPerMillion: 0.5, litersPerMillion: 5.0, gCO2ePerMillion: 200.0 },
    'gpt-4o': { kwhPerMillion: 1.5, litersPerMillion: 15.0, gCO2ePerMillion: 600.0 },
    'gpt-4': { kwhPerMillion: 2.0, litersPerMillion: 20.0, gCO2ePerMillion: 800.0 },
    'gpt-4-turbo': { kwhPerMillion: 1.8, litersPerMillion: 18.0, gCO2ePerMillion: 720.0 },
    'gpt-3.5-turbo': { kwhPerMillion: 0.3, litersPerMillion: 3.0, gCO2ePerMillion: 120.0 },
    'claude-3-5-sonnet-20241022': { kwhPerMillion: 1.2, litersPerMillion: 12.0, gCO2ePerMillion: 480.0 },
    'claude-3-opus-20240229': { kwhPerMillion: 2.5, litersPerMillion: 25.0, gCO2ePerMillion: 1000.0 },
    'claude-3-sonnet-20240229': { kwhPerMillion: 1.2, litersPerMillion: 12.0, gCO2ePerMillion: 480.0 },
    'claude-3-haiku-20240307': { kwhPerMillion: 0.4, litersPerMillion: 4.0, gCO2ePerMillion: 160.0 },
}

const IMAGE_PRICING: Record<string, number> = {
    'dall-e-3': 0.04,
}

/**
 * Calculate cost for a given model and token usage
 */
export function calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
    images: number = 0,
    cachedInputTokens: number = 0,
): number {
    const imagePrice = IMAGE_PRICING[model]
    if (imagePrice != null) {
        return images * imagePrice
    }

    const pricing = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_TEXT_MODEL]
    if (!MODEL_PRICING[model]) {
        console.warn(`Unknown model: ${model}, using ${DEFAULT_TEXT_MODEL} pricing`)
    }

    // Cached input tokens are a subset of inputTokens, not extra tokens. Clamp
    // and split so the cached portion is priced at the cached rate and the rest
    // at the full input rate — matching the backend calculator. Legacy models
    // without a cached rate fall back to pricing all input at the full rate.
    const cachedInput = pricing.cachedInputPerMillion != null ? Math.min(cachedInputTokens, inputTokens) : 0
    const uncachedInput = inputTokens - cachedInput
    const inputCost = (uncachedInput / 1_000_000) * pricing.inputPerMillion
    const cachedInputCost = (cachedInput / 1_000_000) * (pricing.cachedInputPerMillion ?? 0)
    const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion
    return inputCost + outputCost + cachedInputCost
}

/**
 * Calculate CO2e emissions for a given model and token usage
 */
export function calculateCO2e(model: string, totalTokens: number): number {
    const factors = MODEL_ENVIRONMENTAL_FACTORS[model] || MODEL_ENVIRONMENTAL_FACTORS[DEFAULT_TEXT_MODEL]
    return (totalTokens / 1_000_000) * factors.gCO2ePerMillion
}

/**
 * Calculate energy consumption in kWh
 */
export function calculateEnergy(totalTokens: number, model: string = DEFAULT_TEXT_MODEL): number {
    const factors = MODEL_ENVIRONMENTAL_FACTORS[model] || MODEL_ENVIRONMENTAL_FACTORS[DEFAULT_TEXT_MODEL]
    return (totalTokens / 1_000_000) * factors.kwhPerMillion
}

/**
 * Calculate water usage in liters
 */
export function calculateWater(totalTokens: number, model: string = DEFAULT_TEXT_MODEL): number {
    const factors = MODEL_ENVIRONMENTAL_FACTORS[model] || MODEL_ENVIRONMENTAL_FACTORS[DEFAULT_TEXT_MODEL]
    return (totalTokens / 1_000_000) * factors.litersPerMillion
}
