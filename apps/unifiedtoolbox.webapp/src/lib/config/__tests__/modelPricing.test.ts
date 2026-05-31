import { describe, it, expect } from 'vitest'
import { calculateCost } from '../modelPricing'

describe('calculateCost cached input', () => {
    it('prices uncached input + cached input + output correctly', () => {
        // gpt-5.4: input 2.5 / cached 0.25 / output 15.0 per million.
        // 1,000,000 input (400,000 cached -> 600,000 uncached), 1,000,000 output:
        //   uncached 0.6 * 2.5 = 1.50, cached 0.4 * 0.25 = 0.10, output 1 * 15 = 15
        const cost = calculateCost('gpt-5.4', 1_000_000, 1_000_000, 0, 400_000)
        expect(cost).toBeCloseTo(16.6, 9)
    })

    it('clamps cached tokens so they cannot exceed input or overbill', () => {
        // 2,000,000 cached reported against 1,000,000 input must price 1,000,000
        // cached tokens (0.25) and never exceed full input pricing (2.5).
        const cost = calculateCost('gpt-5.4', 1_000_000, 0, 0, 2_000_000)
        const fullInput = calculateCost('gpt-5.4', 1_000_000, 0)
        expect(cost).toBeCloseTo(0.25, 9)
        expect(cost).toBeLessThanOrEqual(fullInput)
    })

    it('matches legacy behavior when no cached data is supplied', () => {
        // (1M * 2.5) + (1M * 15) = 17.5 with no cached discount.
        expect(calculateCost('gpt-5.4', 1_000_000, 1_000_000)).toBeCloseTo(17.5, 9)
        expect(calculateCost('gpt-5.4', 1_000_000, 1_000_000, 0, 0)).toBeCloseTo(17.5, 9)
    })
})
