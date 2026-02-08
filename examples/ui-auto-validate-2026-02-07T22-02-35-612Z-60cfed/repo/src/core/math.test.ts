// src/core/math.test.ts
import { describe, it, expect } from "vitest";
import {
  EPS,
  INV_PHI,
  PHI,
  PHI_MINUS_1,
  SQRT5,
  almostEqual,
  assertFinite,
  assertNonNegativeInt,
  assertPositive,
  clamp,
  continuedFractionConvergents,
  divideByPhiPow,
  fibBigInt,
  fibBinet,
  fibNumber,
  fibonacciRatioToPhi,
  fibonacciSequence,
  phiCalc,
  phiIdentities,
  scaleByPhi,

  // geometry / generators (present later in src/core/math.ts)
  fibonacciSpiral,
  goldenRectangleSplit,
} from "./math";

function expectThrow(fn: () => unknown, msgIncludes?: string) {
  try {
    fn();
    throw new Error("Expected function to throw, but it did not");
  } catch (e: any) {
    if (msgIncludes) expect(String(e?.message ?? e)).toContain(msgIncludes);
  }
}

describe("src/core/math.ts - constants", () => {
  it("PHI is (1+sqrt(5))/2 and INV_PHI ~ 1/PHI", () => {
    const phi = (1 + Math.sqrt(5)) / 2;
    expect(PHI).toBeCloseTo(phi, 15);
    expect(INV_PHI).toBeCloseTo(1 / PHI, 15);
    expect(SQRT5).toBeCloseTo(Math.sqrt(5), 15);
  });

  it("PHI_MINUS_1 is approximately INV_PHI", () => {
    // equality in reals; in JS doubles, extremely close
    expect(Math.abs(PHI_MINUS_1 - INV_PHI)).toBeLessThan(1e-15);
  });

  it("EPS is small and positive", () => {
    expect(EPS).toBeGreaterThan(0);
    expect(EPS).toBeLessThan(1e-6);
  });
});

describe("numeric assertions", () => {
  it("assertFinite accepts finite and rejects NaN/±Infinity", () => {
    expect(() => assertFinite(0)).not.toThrow();
    expect(() => assertFinite(-123.4)).not.toThrow();

    expectThrow(() => assertFinite(Number.NaN, "x"), "x must be a finite number");
    expectThrow(() => assertFinite(Number.POSITIVE_INFINITY, "x"), "x must be a finite number");
    expectThrow(() => assertFinite(Number.NEGATIVE_INFINITY, "x"), "x must be a finite number");
  });

  it("assertPositive accepts >0 and rejects 0/negatives/NaN", () => {
    expect(() => assertPositive(0.0001, "a")).not.toThrow();
    expectThrow(() => assertPositive(0, "a"), "a must be > 0");
    expectThrow(() => assertPositive(-1, "a"), "a must be > 0");
    expectThrow(() => assertPositive(Number.NaN, "a"), "a must be a finite number");
  });

  it("assertNonNegativeInt enforces safe integer >=0", () => {
    expect(() => assertNonNegativeInt(0, "n")).not.toThrow();
    expect(() => assertNonNegativeInt(10, "n")).not.toThrow();

    expectThrow(() => assertNonNegativeInt(-1, "n"), "n must be a non-negative safe integer");
    expectThrow(() => assertNonNegativeInt(1.5, "n"), "n must be a non-negative safe integer");
    expectThrow(
      () => assertNonNegativeInt(Number.MAX_SAFE_INTEGER + 1, "n"),
      "n must be a non-negative safe integer",
    );
  });
});

describe("clamp", () => {
  it("clamps within [min,max]", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("throws when min>max or inputs are non-finite", () => {
    expectThrow(() => clamp(0, 2, 1), "min must be <= max");
    expectThrow(() => clamp(Number.NaN, 0, 1), "x must be a finite number");
    expectThrow(() => clamp(0, Number.NaN, 1), "min must be a finite number");
    expectThrow(() => clamp(0, 0, Number.NaN), "max must be a finite number");
  });
});

describe("almostEqual", () => {
  it("uses scale-aware tolerance", () => {
    expect(almostEqual(1, 1 + 1e-13)).toBe(true);
    expect(almostEqual(1, 1 + 1e-8, 1e-12)).toBe(false);

    // scale-aware: large magnitude should allow larger absolute delta for same relative eps
    expect(almostEqual(1e9, 1e9 + 1e-3, 1e-12)).toBe(true); // 1e-3 <= 1e-12*1e9 = 1e-3
  });

  it("throws for non-finite a/b or non-positive eps", () => {
    expectThrow(() => almostEqual(Number.NaN, 0), "a must be a finite number");
    expectThrow(() => almostEqual(0, Number.NaN), "b must be a finite number");
    expectThrow(() => almostEqual(0, 0, 0), "eps must be > 0");
    expectThrow(() => almostEqual(0, 0, -1), "eps must be > 0");
  });
});

describe("phiCalc + identities", () => {
  it("phiCalc computes timesPhi, overPhi, and timesPhiMinus1 consistently", () => {
    const A = 10;
    const res = phiCalc(A);
    expect(res.A).toBe(A);
    expect(res.timesPhi).toBeCloseTo(A * PHI, 14);
    expect(res.overPhi).toBeCloseTo(A / PHI, 14);
    expect(res.timesPhiMinus1).toBeCloseTo(A * PHI_MINUS_1, 14);
    expect(res.overPhiMinusTimesPhiMinus1).toBeCloseTo(res.overPhi - res.timesPhiMinus1, 16);
    expect(Math.abs(res.overPhiMinusTimesPhiMinus1)).toBeLessThan(1e-12);
  });

  it("phiCalc throws for non-positive A", () => {
    expectThrow(() => phiCalc(0), "A must be > 0");
    expectThrow(() => phiCalc(-1), "A must be > 0");
    expectThrow(() => phiCalc(Number.NaN), "A must be a finite number");
  });

  it("phi identities are (near) zero", () => {
    expect(Math.abs(phiIdentities.phiSquaredMinusPhiMinus1())).toBeLessThan(1e-12);
    expect(Math.abs(phiIdentities.invPhiMinusPhiMinus1())).toBeLessThan(1e-15);
    expect(Math.abs(phiIdentities.phiMinus1MinusInvPhi())).toBeLessThan(1e-15);
  });
});

describe("scaleByPhi / divideByPhiPow", () => {
  it("scaleByPhi multiplies by phi^k, supports negative k", () => {
    expect(scaleByPhi(2, 0)).toBeCloseTo(2, 14);
    expect(scaleByPhi(2, 1)).toBeCloseTo(2 * PHI, 14);
    expect(scaleByPhi(2, -1)).toBeCloseTo(2 / PHI, 14);
  });

  it("divideByPhiPow equals A * (1/phi)^n", () => {
    expect(divideByPhiPow(10, 0)).toBeCloseTo(10, 14);
    expect(divideByPhiPow(10, 1)).toBeCloseTo(10 / PHI, 14);
    expect(divideByPhiPow(10, 5)).toBeCloseTo(10 * Math.pow(INV_PHI, 5), 14);
  });

  it("divideByPhiPow rejects non-integer or negative n", () => {
    expectThrow(() => divideByPhiPow(10, -1), "n must be a non-negative safe integer");
    expectThrow(() => divideByPhiPow(10, 1.1), "n must be a non-negative safe integer");
  });
});

describe("Fibonacci (Number/BigInt)", () => {
  it("fibNumber basic values", () => {
    const expected = [0, 1, 1, 2, 3, 5, 8, 13, 21, 34];
    for (let n = 0; n < expected.length; n++) {
      expect(fibNumber(n)).toBe(expected[n]);
    }
  });

  it("fibBigInt basic values", () => {
    const expected = [0n, 1n, 1n, 2n, 3n, 5n, 8n, 13n, 21n, 34n];
    for (let n = 0; n < expected.length; n++) {
      expect(fibBigInt(n)).toBe(expected[n]);
    }
  });

  it("fibBinet approximates fibNumber for modest n", () => {
    for (const n of [0, 1, 2, 3, 5, 10, 20, 30]) {
      const approx = fibBinet(n);
      const exact = fibNumber(n);
      // Binet should be extremely close; allow small tolerance due to float error.
      expect(Math.abs(approx - exact)).toBeLessThan(1e-6);
    }
  });

  it("fibonacciSequence number: includeZero=false yields [1,1,2,3,5...]", () => {
    expect(fibonacciSequence({ count: 0 })).toEqual([]);
    expect(fibonacciSequence({ count: 1 })).toEqual([1]);
    expect(fibonacciSequence({ count: 2 })).toEqual([1, 1]);
    expect(fibonacciSequence({ count: 7 })).toEqual([1, 1, 2, 3, 5, 8, 13]);
  });

  it("fibonacciSequence number: includeZero=true yields [0,1,1,2,3...]", () => {
    expect(fibonacciSequence({ count: 1, includeZero: true })).toEqual([0]);
    expect(fibonacciSequence({ count: 2, includeZero: true })).toEqual([0, 1]);
    expect(fibonacciSequence({ count: 6, includeZero: true })).toEqual([0, 1, 1, 2, 3, 5]);
  });

  it("fibonacciSequence bigint works for includeZero true/false", () => {
    expect(fibonacciSequence({ count: 5, bigint: true })).toEqual([1n, 1n, 2n, 3n, 5n]);
    expect(fibonacciSequence({ count: 6, bigint: true, includeZero: true })).toEqual([
      0n,
      1n,
      1n,
      2n,
      3n,
      5n,
    ]);
  });

  it("fibonacciRatioToPhi approaches phi as n grows", () => {
    const r5 = fibonacciRatioToPhi(5); // 8/5 = 1.6
    const r10 = fibonacciRatioToPhi(10); // 89/55 ~= 1.61818
    const r20 = fibonacciRatioToPhi(20); // 10946/6765 ~= 1.618033...
    expect(r5.ratio).toBeCloseTo(1.6, 12);
    expect(Math.abs(r10.error)).toBeLessThan(Math.abs(r5.error));
    expect(Math.abs(r20.error)).toBeLessThan(Math.abs(r10.error));
    expect(r20.absError).toBeLessThan(1e-6);
  });

  it("fibonacciRatioToPhi rejects n<1", () => {
    expectThrow(() => fibonacciRatioToPhi(0), "n must be >= 1");
  });
});

describe("continued fraction convergents", () => {
  it("convergents for phi (all 1s) match ratios of Fibonacci numbers", () => {
    // For φ = [1; 1,1,1,...], convergents are F(k+2)/F(k+1) for k>=0:
    // 1/1, 2/1, 3/2, 5/3, 8/5, ...
    const conv = continuedFractionConvergents({ a0: 1, terms: Array(6).fill(1) });
    // expected k=0..5
    const expected = [
      { p: 1, q: 1 },
      { p: 2, q: 1 },
      { p: 3, q: 2 },
      { p: 5, q: 3 },
      { p: 8, q: 5 },
      { p: 13, q: 8 },
    ];
    expect(conv.length).toBe(expected.length);
    for (let k = 0; k < expected.length; k++) {
      expect(conv[k].k).toBe(k);
      expect(conv[k].p).toBe(expected[k].p);
      expect(conv[k].q).toBe(expected[k].q);
      expect(conv[k].value).toBeCloseTo(expected[k].p / expected[k].q, 14);
    }
    // last one close to PHI
    expect(Math.abs(conv.at(-1)!.value - PHI)).toBeLessThan(1e-3);
  });

  it("rejects invalid term lists", () => {
    expectThrow(
      () => continuedFractionConvergents({ a0: Number.NaN, terms: [1, 2] }),
      "a0 must be a finite number",
    );
    expectThrow(
      () => continuedFractionConvergents({ a0: 1, terms: [Number.NaN] }),
      "a must be a finite number",
    );
  });
});

describe("geometry generators", () => {
  it("goldenRectangleSplit preserves area and produces golden proportions", () => {
    // goldenRectangleSplit expected to create a rectangle with sides A and A*phi,
    // then split into square + smaller golden rectangle.
    const A = 100;
    const g = goldenRectangleSplit(A);

    // minimal structural checks (avoid depending on exact property names too much)
    expect(g).toBeTruthy();
    expect(g.A).toBeCloseTo(A, 12);
    expect(g.longSide).toBeCloseTo(A * PHI, 10);

    // area invariants
    expect(g.area).toBeCloseTo(A * (A * PHI), 8);
    expect(g.square.area + g.remaining.area).toBeCloseTo(g.area, 8);

    // square side == short side (A)
    expect(g.square.w).toBeCloseTo(A, 10);
    expect(g.square.h).toBeCloseTo(A, 10);

    // remaining rectangle should be golden: long/short ≈ phi
    const remLong = Math.max(g.remaining.w, g.remaining.h);
    const remShort = Math.min(g.remaining.w, g.remaining.h);
    expect(remLong / remShort).toBeCloseTo(PHI, 8);
  });

  it("goldenRectangleSplit rejects non-positive A", () => {
    expectThrow(() => goldenRectangleSplit(0), "A must be > 0");
    expectThrow(() => goldenRectangleSplit(-1), "A must be > 0");
  });

  it("fibonacciSpiral generates monotone increasing squares based on Fibonacci", () => {
    const base = 10;
    const count = 8;
    const s = fibonacciSpiral({ base, count });

    expect(s).toBeTruthy();
    expect(s.base).toBe(base);
    expect(s.count).toBe(count);

    // squares: side lengths should follow fibonacciSequence (starting 1,1,2...)
    const fib = fibonacciSequence({ count, includeZero: false }) as number[];
    const sides = s.squares.map((q: any) => q.size);
    expect(sides.length).toBe(count);
    for (let i = 0; i < count; i++) {
      expect(sides[i]).toBeCloseTo(base * fib[i], 12);
    }

    // arcs count equals squares count (typical spiral construction)
    expect(s.arcs.length).toBe(count);

    // bounding box should have finite dimensions
    expect(Number.isFinite(s.bounds.x)).toBe(true);
    expect(Number.isFinite(s.bounds.y)).toBe(true);
    expect(Number.isFinite(s.bounds.w)).toBe(true);
    expect(Number.isFinite(s.bounds.h)).toBe(true);
    expect(s.bounds.w).toBeGreaterThan(0);
    expect(s.bounds.h).toBeGreaterThan(0);
  });

  it("fibonacciSpiral rejects invalid options", () => {
    expectThrow(() => fibonacciSpiral({ base: 0, count: 5 } as any), "base must be > 0");
    expectThrow(() => fibonacciSpiral({ base: 10, count: -1 } as any), "count must be");
  });
});