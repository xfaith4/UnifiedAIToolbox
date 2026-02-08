// src/core/math.ts

/**
 * Core φ (golden ratio) and Fibonacci utilities.
 *
 * Design goals:
 * - Pure, dependency-free functions (offline-friendly).
 * - Stable numeric helpers for UI + rendering computations.
 * - Support both Number (fast, practical) and BigInt (exact Fibonacci terms).
 *
 * Note: For geometry/rendering the app can safely use Number; BigInt utilities
 * are mainly for exact integer sequence/reference display.
 */

/** Golden ratio φ = (1 + √5) / 2 */
export const PHI = (1 + Math.sqrt(5)) / 2;

/** 1/φ */
export const INV_PHI = 1 / PHI;

/** φ - 1 (exactly equal to 1/φ in real arithmetic; numerically extremely close) */
export const PHI_MINUS_1 = PHI - 1;

/** √5 */
export const SQRT5 = Math.sqrt(5);

/** Small epsilon default for floating comparisons in this app */
export const EPS = 1e-12;

export type PhiCalc = {
  /** Base length A */
  A: number;
  /** A·φ */
  timesPhi: number;
  /** A/φ */
  overPhi: number;
  /** A·(φ-1) (should equal A/φ) */
  timesPhiMinus1: number;
  /** Consistency difference: (A/φ) - (A·(φ-1)) */
  overPhiMinusTimesPhiMinus1: number;
};

/**
 * Ensure a numeric input is finite. Throws on NaN/±Inf.
 */
export function assertFinite(value: number, name = "value"): void {
  if (!Number.isFinite(value)) throw new Error(`${name} must be a finite number`);
}

/**
 * Ensure a numeric input is finite and > 0. Throws on invalid.
 */
export function assertPositive(value: number, name = "value"): void {
  assertFinite(value, name);
  if (!(value > 0)) throw new Error(`${name} must be > 0`);
}

/**
 * Ensure an integer input is finite, safe integer, and >= 0. Throws on invalid.
 */
export function assertNonNegativeInt(value: number, name = "value"): void {
  assertFinite(value, name);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
}

/**
 * Clamp a number into [min, max].
 */
export function clamp(x: number, min: number, max: number): number {
  assertFinite(x, "x");
  assertFinite(min, "min");
  assertFinite(max, "max");
  if (min > max) throw new Error("min must be <= max");
  return Math.min(max, Math.max(min, x));
}

/**
 * Floating comparison for UI/math identity displays.
 */
export function almostEqual(a: number, b: number, eps = EPS): boolean {
  assertFinite(a, "a");
  assertFinite(b, "b");
  assertPositive(eps, "eps");
  // Scale-aware comparison
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= eps * scale;
}

/**
 * Calculator helper: given base length A (>0), compute common φ-related values.
 */
export function phiCalc(A: number): PhiCalc {
  assertPositive(A, "A");
  const timesPhi = A * PHI;
  const overPhi = A / PHI;
  const timesPhiMinus1 = A * PHI_MINUS_1;
  return {
    A,
    timesPhi,
    overPhi,
    timesPhiMinus1,
    overPhiMinusTimesPhiMinus1: overPhi - timesPhiMinus1,
  };
}

/**
 * Identity helpers (mostly for reference tab / education).
 */
export const phiIdentities = {
  /**
   * φ^2 = φ + 1
   */
  phiSquaredMinusPhiMinus1(): number {
    return PHI * PHI - PHI - 1;
  },

  /**
   * 1/φ = φ - 1
   */
  invPhiMinusPhiMinus1(): number {
    return INV_PHI - PHI_MINUS_1;
  },

  /**
   * φ = 1 + 1/φ
   */
  phiMinus1MinusInvPhi(): number {
    return (PHI - 1) - INV_PHI;
  },
} as const;

/**
 * Convert a length by multiplying with φ^k (k can be negative).
 * Useful when labeling A/φ^n etc.
 */
export function scaleByPhi(length: number, k: number): number {
  assertFinite(length, "length");
  assertFinite(k, "k");
  // k might be non-integer for advanced uses; allow any finite exponent.
  return length * Math.pow(PHI, k);
}

/**
 * A/φ^n convenience (n should be integer >= 0 for typical UI labels).
 */
export function divideByPhiPow(A: number, n: number): number {
  assertFinite(A, "A");
  assertNonNegativeInt(n, "n");
  return A * Math.pow(INV_PHI, n);
}

/**
 * Binet formula approximation for Fibonacci numbers (Number).
 * Good for reference/estimation, not for exact large n.
 *
 * F(n) where F(0)=0, F(1)=1.
 */
export function fibBinet(n: number): number {
  assertNonNegativeInt(n, "n");
  // F(n) = (φ^n - (−1/φ)^n) / √5
  const a = Math.pow(PHI, n);
  const b = Math.pow(-INV_PHI, n);
  return (a - b) / SQRT5;
}

/**
 * Exact Fibonacci using Number arithmetic (safe up to n where result <= Number.MAX_SAFE_INTEGER).
 *
 * Returns F(n) with F(0)=0, F(1)=1.
 */
export function fibNumber(n: number): number {
  assertNonNegativeInt(n, "n");
  let a = 0;
  let b = 1;
  for (let i = 0; i < n; i++) {
    const t = a + b;
    a = b;
    b = t;
  }
  return a;
}

/**
 * Exact Fibonacci using BigInt (no overflow).
 *
 * Returns F(n) with F(0)=0n, F(1)=1n.
 */
export function fibBigInt(n: number): bigint {
  assertNonNegativeInt(n, "n");
  let a = 0n;
  let b = 1n;
  for (let i = 0; i < n; i++) {
    const t = a + b;
    a = b;
    b = t;
  }
  return a;
}

export type FibonacciSequenceOptions = {
  /**
   * Include F0=0 at the beginning.
   * - true: [0,1,1,2,3,...]
   * - false: start from 1,1 for tiling: [1,1,2,3,5,...]
   */
  includeZero?: boolean;

  /** How many terms to return. Must be >= 0. */
  count: number;

  /**
   * Use BigInt instead of Number.
   * If true, returns bigint[].
   */
  bigint?: boolean;
};

export function fibonacciSequence(opts: FibonacciSequenceOptions & { bigint: true }): bigint[];
export function fibonacciSequence(opts: FibonacciSequenceOptions & { bigint?: false }): number[];
export function fibonacciSequence(opts: FibonacciSequenceOptions): Array<number | bigint> {
  const { includeZero = false, count, bigint = false } = opts;
  assertNonNegativeInt(count, "count");

  if (count === 0) return [];

  if (bigint) {
    // Build [F0..] then slice if needed
    const out: bigint[] = [];
    let a = 0n;
    let b = 1n;

    // push sequence terms
    if (includeZero) out.push(0n);
    while (out.length < count) {
      out.push(b); // F1 then onward if includeZero, else starts at 1
      const t = a + b;
      a = b;
      b = t;
      if (includeZero && out.length === 2 && count >= 3) {
        // With includeZero, sequence should be 0,1,1,2...
        // Current method yields 0,1,2,... unless we handle the second 1.
        // Fix by resetting after first push? Easier: special-case after pushing first 1.
      }
    }

    // Correct for includeZero to ensure 0,1,1,2,3...
    if (includeZero && count >= 3) {
      // Rebuild properly (simple and safe)
      const out2: bigint[] = [];
      let x = 0n;
      let y = 1n;
      for (let i = 0; i < count; i++) {
        out2.push(x);
        const t = x + y;
        x = y;
        y = t;
      }
      return out2;
    }

    // If includeZero=false, out is [1,1,2,3,...] already? Actually method above gives [1,1,2,3,...]
    // because starting a=0,b=1 -> push b(=1), then a=1,b=1 -> push b(=1) ...
    return out;
  }

  // number version
  const out: number[] = [];
  let a = 0;
  let b = 1;

  if (includeZero) {
    for (let i = 0; i < count; i++) {
      out.push(a);
      const t = a + b;
      a = b;
      b = t;
    }
    return out;
  }

  // start from 1,1,...
  for (let i = 0; i < count; i++) {
    out.push(b);
    const t = a + b;
    a = b;
    b = t;
  }
  return out;
}

export type FibRatio = {
  /** n used for ratio F(n+1)/F(n) */
  n: number;
  Fn: number;
  Fn1: number;
  ratio: number;
  /** ratio - φ (signed) */
  error: number;
  /** |ratio - φ| */
  absError: number;
};

/**
 * Ratio approximation to φ via Fibonacci: F(n+1)/F(n), for n>=1.
 */
export function fibonacciRatioToPhi(n: number): FibRatio {
  assertNonNegativeInt(n, "n");
  if (n < 1) throw new Error("n must be >= 1 for F(n+1)/F(n)");

  const Fn = fibNumber(n);
  const Fn1 = fibNumber(n + 1);
  const ratio = Fn1 / Fn;
  const error = ratio - PHI;
  return { n, Fn, Fn1, ratio, error, absError: Math.abs(error) };
}

export type ContinuedFractionConvergent = {
  /** convergent index (0-based) */
  k: number;
  /** numerator */
  p: bigint;
  /** denominator */
  q: bigint;
  /** numeric value p/q as Number (may lose precision for huge terms) */
  value: number;
  /** error vs φ (value - φ) */
  error: number;
};

/**
 * Convergents of φ's continued fraction [1; 1, 1, 1, ...].
 *
 * For φ, convergents are ratios of consecutive Fibonacci numbers:
 * C_k = F(k+2) / F(k+1) (with k>=0).
 *
 * This returns first `count` convergents as exact BigInt p/q plus Number value.
 */
export function phiContinuedFractionConvergents(count: number): ContinuedFractionConvergent[] {
  assertNonNegativeInt(count, "count");
  const out: ContinuedFractionConvergent[] = [];
  for (let k = 0; k < count; k++) {
    // p/q = F(k+2)/F(k+1)
    const p = fibBigInt(k + 2);
    const q = fibBigInt(k + 1);
    const value = Number(p) / Number(q);
    const error = value - PHI;
    out.push({ k, p, q, value, error });
  }
  return out;
}

/**
 * For spiral tiling, square sizes usually start: 1,1,2,3,5,8,...
 * This is a convenience wrapper.
 */
export function fibonacciTilingSizes(count: number): number[] {
  return fibonacciSequence({ count, includeZero: false, bigint: false }) as number[];
}