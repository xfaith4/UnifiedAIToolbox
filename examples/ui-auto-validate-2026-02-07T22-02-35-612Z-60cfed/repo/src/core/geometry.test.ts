// src/core/geometry.test.ts
import { describe, it, expect } from "vitest";

import { PHI, INV_PHI } from "./math";
import {
  goldenRectangleSplit,
  goldenShortSideAt,
  goldenSideLabel,
  unionRect,
  rectCenter,
  type Rect,
} from "./goldenRectangle";
import { generateFibonacciSpiral } from "./fibonacciSpiral";

function closeTo(a: number, b: number, eps = 1e-9) {
  expect(a).toBeCloseTo(b, Math.max(0, Math.ceil(-Math.log10(eps))));
}

function expectRectClose(r: Rect, e: Rect, eps = 1e-9) {
  closeTo(r.x, e.x, eps);
  closeTo(r.y, e.y, eps);
  closeTo(r.w, e.w, eps);
  closeTo(r.h, e.h, eps);
}

describe("goldenRectangleSplit", () => {
  it("creates correct outer rect for WIDE orientation", () => {
    const A = 100;
    const g = goldenRectangleSplit({ A, steps: 0, orientation: "WIDE" });
    closeTo(g.outer.w, A * PHI);
    closeTo(g.outer.h, A);
    closeTo(g.outer.x, 0);
    closeTo(g.outer.y, 0);
    expectRectClose(g.remainder, g.outer);
    expectRectClose(g.bounds, g.outer);
    expect(g.squares).toHaveLength(0);
  });

  it("creates correct outer rect for TALL orientation", () => {
    const A = 80;
    const g = goldenRectangleSplit({ A, steps: 0, orientation: "TALL" });
    closeTo(g.outer.w, A);
    closeTo(g.outer.h, A * PHI);
  });

  it("respects origin offset", () => {
    const A = 10;
    const origin = { x: 5, y: -3 };
    const g = goldenRectangleSplit({ A, steps: 0, origin });
    expect(g.outer.x).toBe(origin.x);
    expect(g.outer.y).toBe(origin.y);
    expect(g.remainder.x).toBe(origin.x);
    expect(g.remainder.y).toBe(origin.y);
  });

  it("produces square sides equal to successive short sides A*(1/φ)^i", () => {
    const A = 144;
    const steps = 6;
    const g = goldenRectangleSplit({ A, steps, orientation: "WIDE", turn: "CW" });

    expect(g.squares).toHaveLength(steps);
    g.squares.forEach((sq) => {
      expect(sq.i).toBeGreaterThanOrEqual(0);
      expect(sq.shortExponent).toBe(sq.i);
      closeTo(sq.side, A * Math.pow(INV_PHI, sq.i), 1e-9);
      // square rect is a square
      closeTo(sq.rect.w, sq.rect.h, 1e-9);
      closeTo(sq.rect.w, sq.side, 1e-9);
    });
  });

  it("CW edge cycle for WIDE starts LEFT then TOP then RIGHT then BOTTOM", () => {
    const g = goldenRectangleSplit({ A: 10, steps: 5, orientation: "WIDE", turn: "CW" });
    const edges = g.squares.map((s) => s.edge);
    expect(edges).toEqual(["LEFT", "TOP", "RIGHT", "BOTTOM", "LEFT"]);
  });

  it("CCW edge cycle for WIDE starts LEFT then BOTTOM then RIGHT then TOP", () => {
    const g = goldenRectangleSplit({ A: 10, steps: 5, orientation: "WIDE", turn: "CCW" });
    const edges = g.squares.map((s) => s.edge);
    expect(edges).toEqual(["LEFT", "BOTTOM", "RIGHT", "TOP", "LEFT"]);
  });

  it("CW edge cycle for TALL starts TOP (rotated cycle)", () => {
    const g = goldenRectangleSplit({ A: 10, steps: 5, orientation: "TALL", turn: "CW" });
    const edges = g.squares.map((s) => s.edge);
    expect(edges).toEqual(["TOP", "RIGHT", "BOTTOM", "LEFT", "TOP"]);
  });

  it("places first square correctly for WIDE and updates remainder dimensions", () => {
    const A = 100;
    const g = goldenRectangleSplit({ A, steps: 1, orientation: "WIDE", turn: "CW" });

    const sq0 = g.squares[0];
    expect(sq0.edge).toBe("LEFT");
    // square at outer top-left
    expectRectClose(sq0.rect, { x: 0, y: 0, w: A, h: A });
    // remainder should be to the right, same height, width = A*φ - A = A/φ
    expectRectClose(g.remainder, { x: A, y: 0, w: A * PHI - A, h: A });
    closeTo(g.remainder.w, A * INV_PHI, 1e-9);
  });

  it("all squares are within outer bounds (basic containment)", () => {
    const A = 50;
    const g = goldenRectangleSplit({ A, steps: 10, orientation: "WIDE", turn: "CW" });

    const outer = g.outer;
    for (const sq of g.squares) {
      expect(sq.rect.x).toBeGreaterThanOrEqual(outer.x - 1e-9);
      expect(sq.rect.y).toBeGreaterThanOrEqual(outer.y - 1e-9);
      expect(sq.rect.x + sq.rect.w).toBeLessThanOrEqual(outer.x + outer.w + 1e-9);
      expect(sq.rect.y + sq.rect.h).toBeLessThanOrEqual(outer.y + outer.h + 1e-9);
    }
    // remainder also within outer
    expect(g.remainder.x).toBeGreaterThanOrEqual(outer.x - 1e-9);
    expect(g.remainder.y).toBeGreaterThanOrEqual(outer.y - 1e-9);
    expect(g.remainder.x + g.remainder.w).toBeLessThanOrEqual(outer.x + outer.w + 1e-9);
    expect(g.remainder.y + g.remainder.h).toBeLessThanOrEqual(outer.y + outer.h + 1e-9);
  });

  it("goldenShortSideAt and goldenSideLabel behave as expected", () => {
    const A = 200;
    closeTo(goldenShortSideAt(A, 0), A);
    closeTo(goldenShortSideAt(A, 1), A * INV_PHI);
    closeTo(goldenShortSideAt(A, 2), A * INV_PHI * INV_PHI);

    expect(goldenSideLabel(0)).toBe("A");
    expect(goldenSideLabel(1)).toBe("A/φ");
    expect(goldenSideLabel(2)).toBe("A/φ^2");
  });

  it("unionRect and rectCenter utilities work", () => {
    const a: Rect = { x: 0, y: 0, w: 10, h: 10 };
    const b: Rect = { x: 5, y: -5, w: 10, h: 20 };
    const u = unionRect(a, b);
    expectRectClose(u, { x: 0, y: -5, w: 15, h: 20 });
    const c = rectCenter(u);
    closeTo(c.x, 7.5);
    closeTo(c.y, 5);
  });

  it("rejects invalid parameters", () => {
    expect(() => goldenRectangleSplit({ A: 0, steps: 0 })).toThrow();
    expect(() => goldenRectangleSplit({ A: -1, steps: 0 })).toThrow();
    expect(() => goldenRectangleSplit({ A: 1, steps: -1 })).toThrow();
    expect(() => goldenRectangleSplit({ A: 1, steps: 1.2 as any })).toThrow();
  });
});

describe("generateFibonacciSpiral", () => {
  it("count=0 returns empty geometry with zero bounds (plus offset)", () => {
    const g = generateFibonacciSpiral({ count: 0, offset: { x: 10, y: -2 } });
    expect(g.squares).toHaveLength(0);
    expect(g.arcs).toHaveLength(0);
    expect(g.bounds).toEqual({ x: 10, y: -2, w: 0, h: 0 });
    expect(g.scale).toBe(1);
  });

  it("creates matching number of squares and arcs; each arc has r == square size", () => {
    const count = 8;
    const g = generateFibonacciSpiral({ count });
    expect(g.squares).toHaveLength(count);
    expect(g.arcs).toHaveLength(count);
    for (let i = 0; i < count; i++) {
      expect(g.squares[i].i).toBe(i);
      expect(g.arcs[i].i).toBe(i);
      closeTo(g.arcs[i].r, g.squares[i].size, 1e-9);
      // squares are squares
      closeTo(g.squares[i].rect.w, g.squares[i].rect.h, 1e-9);
      closeTo(g.squares[i].rect.w, g.squares[i].size, 1e-9);
    }
  });

  it("first two squares placement follows convention: square1 to the right of square0", () => {
    const g = generateFibonacciSpiral({ count: 2 });
    const s0 = g.squares[0].rect;
    const s1 = g.squares[1].rect;
    expect(s0.x).toBe(0);
    expect(s0.y).toBe(0);
    expect(s1.y).toBe(0);
    closeTo(s1.x, s0.x + s0.w, 1e-9);
  });

  it("scales using baseLength/baseIndex so that F(baseIndex) maps to baseLength", () => {
    // baseIndex=6 => F6=8, so scale = 200/8=25
    const g = generateFibonacciSpiral({ count: 7, baseLength: 200, baseIndex: 6 });
    closeTo(g.scale, 25, 1e-12);

    // square i corresponds to F(i+1) (tiling uses F1..)
    // i=5 => F6=8 => size should be 200
    const sq = g.squares[5];
    closeTo(sq.fib, 8, 1e-12);
    closeTo(sq.size, 200, 1e-9);
  });

  it("applies offset translation to bounds and geometry", () => {
    const offset = { x: 123, y: -77 };
    const g0 = generateFibonacciSpiral({ count: 6 });
    const g1 = generateFibonacciSpiral({ count: 6, offset });

    // bounds shifted
    closeTo(g1.bounds.x, g0.bounds.x + offset.x, 1e-9);
    closeTo(g1.bounds.y, g0.bounds.y + offset.y, 1e-9);
    closeTo(g1.bounds.w, g0.bounds.w, 1e-9);
    closeTo(g1.bounds.h, g0.bounds.h, 1e-9);

    // a couple squares shifted
    for (const idx of [0, 3, 5]) {
      closeTo(g1.squares[idx].rect.x, g0.squares[idx].rect.x + offset.x, 1e-9);
      closeTo(g1.squares[idx].rect.y, g0.squares[idx].rect.y + offset.y, 1e-9);
    }

    // arcs centers shifted
    for (const idx of [0, 2, 4]) {
      closeTo(g1.arcs[idx].c.x, g0.arcs[idx].c.x + offset.x, 1e-9);
      closeTo(g1.arcs[idx].c.y, g0.arcs[idx].c.y + offset.y, 1e-9);
    }
  });

  it("bounds contain all squares (and thus arcs) for a non-trivial count", () => {
    const g = generateFibonacciSpiral({ count: 10, baseLength: 160, baseIndex: 6, clockwise: true });
    const b = g.bounds;

    for (const s of g.squares) {
      const r = s.rect;
      expect(r.x).toBeGreaterThanOrEqual(b.x - 1e-9);
      expect(r.y).toBeGreaterThanOrEqual(b.y - 1e-9);
      expect(r.x + r.w).toBeLessThanOrEqual(b.x + b.w + 1e-9);
      expect(r.y + r.h).toBeLessThanOrEqual(b.y + b.h + 1e-9);
    }
  });

  it("rejects invalid options", () => {
    expect(() => generateFibonacciSpiral({ count: -1 as any })).toThrow();
    expect(() => generateFibonacciSpiral({ count: 5, baseLength: 0 })).toThrow();
    expect(() => generateFibonacciSpiral({ count: 5, baseLength: -10 })).toThrow();
    expect(() => generateFibonacciSpiral({ count: 5, baseLength: 10, baseIndex: 0 })).toThrow();
  });
});