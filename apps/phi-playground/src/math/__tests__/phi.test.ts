import { describe, it, expect } from 'vitest'
import {
  PHI, PHI_INV, PHI_SQUARED,
  fibonacci, fibonacciRatio, fibonacciRatioError, goldenSpiralRadius,
} from '../phi'

describe('PHI constant', () => {
  it('satisfies φ² = φ + 1', () => {
    expect(PHI * PHI).toBeCloseTo(PHI + 1, 10)
  })

  it('satisfies 1/φ = φ − 1', () => {
    expect(1 / PHI).toBeCloseTo(PHI - 1, 10)
  })

  it('has value ≈ 1.6180339887', () => {
    expect(PHI).toBeCloseTo(1.6180339887, 9)
  })

  it('PHI_INV is 1/PHI', () => {
    expect(PHI_INV).toBeCloseTo(1 / PHI, 12)
  })

  it('PHI_SQUARED is PHI*PHI', () => {
    expect(PHI_SQUARED).toBeCloseTo(PHI * PHI, 12)
  })
})

describe('fibonacci()', () => {
  it('returns correct sequence values', () => {
    expect(fibonacci(0)).toBe(0)
    expect(fibonacci(1)).toBe(1)
    expect(fibonacci(2)).toBe(1)
    expect(fibonacci(3)).toBe(2)
    expect(fibonacci(4)).toBe(3)
    expect(fibonacci(5)).toBe(5)
    expect(fibonacci(6)).toBe(8)
    expect(fibonacci(10)).toBe(55)
    expect(fibonacci(15)).toBe(610)
  })

  it('throws for negative n', () => {
    expect(() => fibonacci(-1)).toThrow(RangeError)
  })
})

describe('fibonacciRatio()', () => {
  it('returns 0 for n < 1', () => {
    expect(fibonacciRatio(0)).toBe(0)
  })

  it('converges to PHI', () => {
    expect(fibonacciRatio(10)).toBeCloseTo(PHI, 3)
    expect(fibonacciRatio(20)).toBeCloseTo(PHI, 8)
  })

  it('F(n+1)/F(n) approaches PHI monotonically from both sides', () => {
    for (let n = 5; n < 15; n++) {
      expect(Math.abs(fibonacciRatio(n + 1) - PHI)).toBeLessThan(
        Math.abs(fibonacciRatio(n) - PHI)
      )
    }
  })
})

describe('fibonacciRatioError()', () => {
  it('error decreases as n increases', () => {
    for (let n = 2; n < 15; n++) {
      expect(fibonacciRatioError(n + 1)).toBeLessThan(fibonacciRatioError(n))
    }
  })

  it('error is < 0.001% by n=20', () => {
    expect(fibonacciRatioError(20)).toBeLessThan(0.001)
  })
})

describe('goldenSpiralRadius()', () => {
  it('radius at θ=0 equals scale factor a', () => {
    expect(goldenSpiralRadius(0, 1)).toBeCloseTo(1, 10)
    expect(goldenSpiralRadius(0, 2)).toBeCloseTo(2, 10)
  })

  it('radius at θ=π/2 equals PHI * a', () => {
    expect(goldenSpiralRadius(Math.PI / 2, 1)).toBeCloseTo(PHI, 10)
  })

  it('radius at θ=π equals PHI² * a', () => {
    expect(goldenSpiralRadius(Math.PI, 1)).toBeCloseTo(PHI_SQUARED, 10)
  })

  it('radius grows monotonically', () => {
    let prev = goldenSpiralRadius(0)
    for (let i = 1; i <= 10; i++) {
      const curr = goldenSpiralRadius((i * Math.PI) / 4)
      expect(curr).toBeGreaterThan(prev)
      prev = curr
    }
  })
})
