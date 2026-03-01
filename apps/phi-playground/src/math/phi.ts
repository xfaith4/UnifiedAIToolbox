/** Golden ratio φ = (1 + √5) / 2 */
export const PHI = (1 + Math.sqrt(5)) / 2

/** φ² = φ + 1 */
export const PHI_SQUARED = PHI * PHI

/** 1/φ = φ - 1  (the reciprocal of the golden ratio) */
export const PHI_INV = 1 / PHI

/**
 * Fibonacci sequence (0-indexed, iterative).
 * F(0)=0, F(1)=1, F(2)=1, F(3)=2, ...
 */
export function fibonacci(n: number): number {
  if (n < 0) throw new RangeError('n must be >= 0')
  if (n === 0) return 0
  let a = 0, b = 1
  for (let i = 2; i <= n; i++) {
    ;[a, b] = [b, a + b]
  }
  return b
}

/**
 * Ratio of consecutive Fibonacci numbers: F(n+1) / F(n).
 * Converges to PHI as n → ∞.
 */
export function fibonacciRatio(n: number): number {
  if (n < 1) return 0
  return fibonacci(n + 1) / fibonacci(n)
}

/**
 * Error of the Fibonacci ratio approximation relative to φ.
 * Expressed as a percentage.
 */
export function fibonacciRatioError(n: number): number {
  return Math.abs((fibonacciRatio(n) - PHI) / PHI) * 100
}

/**
 * Golden spiral radius at angle θ (radians).
 * r = a * φ^(θ / (π/2))
 */
export function goldenSpiralRadius(theta: number, a = 1): number {
  return a * Math.pow(PHI, theta / (Math.PI / 2))
}

/**
 * Cartesian point on a golden spiral at angle θ.
 */
export function goldenSpiralPoint(theta: number, a = 1): [number, number] {
  const r = goldenSpiralRadius(theta, a)
  return [r * Math.cos(theta), r * Math.sin(theta)]
}

/**
 * Fibonacci-square spiral approximation.
 * Returns arc control points for the first `turns` quarter-circle arcs.
 * Each arc lives inside a Fibonacci square of side F(n+1) starting from F(2)=1.
 */
export function fibonacciSpiralArcs(turns = 8): Array<{
  cx: number; cy: number   // arc center
  r: number                // arc radius = Fibonacci(n)
  startAngle: number       // radians
  endAngle: number         // radians
}> {
  const arcs: Array<{ cx: number; cy: number; r: number; startAngle: number; endAngle: number }> = []
  let x = 0, y = 0
  let fx = fibonacci(2), fy = fibonacci(1)

  // Directions cycle: right, up, left, down — quarter arcs
  const directions = [
    { dx: 1, dy: 0, startAngle: Math.PI, endAngle: Math.PI * 1.5 },
    { dx: 0, dy: 1, startAngle: Math.PI * 1.5, endAngle: Math.PI * 2 },
    { dx: -1, dy: 0, startAngle: 0, endAngle: Math.PI * 0.5 },
    { dx: 0, dy: -1, startAngle: Math.PI * 0.5, endAngle: Math.PI },
  ]

  for (let i = 0; i < turns; i++) {
    const n = i + 2
    const r = fibonacci(n)
    const dir = directions[i % 4]
    arcs.push({ cx: x, cy: y, r, startAngle: dir.startAngle, endAngle: dir.endAngle })

    x += dir.dx * r
    y += dir.dy * r
    fx = fibonacci(n + 1)
    fy = r
    void fx; void fy
  }
  return arcs
}

/**
 * Explanation steps for the Formula Exhibit (cycling derivation).
 */
export const PHI_DERIVATION_STEPS: ReadonlyArray<{ title: string; body: string; value?: string }> = [
  {
    title: 'The Golden Ratio',
    body: 'φ (phi) is the unique positive solution to: x² = x + 1',
    value: 'φ² − φ − 1 = 0',
  },
  {
    title: 'Solving the Equation',
    body: 'Using the quadratic formula on x² − x − 1 = 0:',
    value: 'φ = (1 + √5) / 2',
  },
  {
    title: 'Numerical Value',
    body: 'φ is irrational — its decimal expansion never repeats:',
    value: `φ ≈ ${PHI.toFixed(15)}`,
  },
  {
    title: 'Self-Similarity',
    body: 'φ has a unique continued-fraction expansion of all 1s:',
    value: 'φ = 1 + 1/(1 + 1/(1 + 1/(1 + …)))',
  },
  {
    title: 'Reciprocal Identity',
    body: 'Its reciprocal differs from it by exactly 1:',
    value: `1/φ = φ − 1 ≈ ${PHI_INV.toFixed(10)}`,
  },
]
