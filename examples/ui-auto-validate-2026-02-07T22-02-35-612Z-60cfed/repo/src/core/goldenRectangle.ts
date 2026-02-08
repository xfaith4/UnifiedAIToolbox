// src/core/goldenRectangle.ts

/**
 * Golden rectangle split (exact φ-based) geometry generator.
 *
 * Produces a list of square cuts that iteratively decompose a golden rectangle:
 * remove a square of the short side; the remainder is a smaller golden rectangle,
 * rotated 90° relative to the previous remainder.
 *
 * This module is pure and renderer-agnostic. It outputs rectangles and metadata
 * suitable for drawing with Canvas/Qt/SVG etc.
 */

import { PHI, INV_PHI, assertPositive, assertNonNegativeInt, assertFinite } from "./math";

export type Vec2 = { x: number; y: number };

export type Rect = {
  /** top-left x */
  x: number;
  /** top-left y */
  y: number;
  /** width >= 0 */
  w: number;
  /** height >= 0 */
  h: number;
};

export type Orientation = "WIDE" | "TALL";
export type TurnDirection = "CW" | "CCW";

/**
 * Which edge of the current rectangle the removed square touches.
 * (Useful for consistent rendering and for optional arc overlay logic.)
 */
export type Edge = "LEFT" | "TOP" | "RIGHT" | "BOTTOM";

export type GoldenSquare = {
  /** 0-based index */
  i: number;
  /** Square rect in the same coordinate system as outer rect */
  rect: Rect;
  /** side length of the square (== min(rect.w, rect.h)) */
  side: number;
  /** The edge of the current remainder rectangle from which this square was removed */
  edge: Edge;
  /**
   * Short-side exponent k such that side = A * (1/φ)^k.
   * - i=0 => k=0 => side = A
   * - i=1 => k=1 => side = A/φ
   * etc.
   */
  shortExponent: number;
};

export type GoldenRectangleSplit = {
  /** Outer (initial) golden rectangle */
  outer: Rect;
  /** Squares removed, in order */
  squares: GoldenSquare[];
  /** Final remainder rectangle after all steps (0 steps => equals outer) */
  remainder: Rect;
  /** Convenience: bounding box of all produced geometry (equals outer here, but kept generic) */
  bounds: Rect;
  /** Parameters used */
  params: Required<GoldenRectangleSplitParams>;
};

export type GoldenRectangleSplitParams = {
  /**
   * Base short side length A (>0).
   * For WIDE: height=A, width=A*φ.
   * For TALL: width=A, height=A*φ.
   */
  A: number;

  /** Number of square-removal steps (>=0). */
  steps: number;

  /** Initial orientation of the golden rectangle. Default: "WIDE". */
  orientation?: Orientation;

  /**
   * Turning direction as the remainder rectangle rotates each step.
   * This affects *where* the next square is removed (a classic “whirling squares” layout).
   *
   * Default: "CW".
   */
  turn?: TurnDirection;

  /**
   * Top-left of outer rectangle. Default: (0,0).
   * Useful for placing into a larger scene before applying fit-to-view transforms.
   */
  origin?: Vec2;
};

/**
 * Compute a golden rectangle split geometry.
 *
 * Placement rules (deterministic):
 * - Step 0 removes a square from the "LEFT" (for WIDE) or "TOP" (for TALL).
 * - Subsequent steps remove from edges cycling by 90° each time.
 *   For CW: LEFT -> TOP -> RIGHT -> BOTTOM -> LEFT -> ...
 *   For CCW: LEFT -> BOTTOM -> RIGHT -> TOP -> LEFT -> ...
 * - For TALL, the cycle is rotated so step0 begins at TOP.
 *
 * This matches the common golden-rectangle subdivision / whirling-square layout.
 */
export function goldenRectangleSplit(params: GoldenRectangleSplitParams): GoldenRectangleSplit {
  const {
    A,
    steps,
    orientation = "WIDE",
    turn = "CW",
    origin = { x: 0, y: 0 },
  } = params;

  assertPositive(A, "A");
  assertNonNegativeInt(steps, "steps");
  assertFinite(origin.x, "origin.x");
  assertFinite(origin.y, "origin.y");

  const outer: Rect =
    orientation === "WIDE"
      ? { x: origin.x, y: origin.y, w: A * PHI, h: A }
      : { x: origin.x, y: origin.y, w: A, h: A * PHI };

  let remainder: Rect = { ...outer };

  const squares: GoldenSquare[] = [];

  for (let i = 0; i < steps; i++) {
    const edge = edgeForStep(i, orientation, turn);

    // In exact golden-rectangle splitting, the square side is always the current short side.
    const side = Math.min(remainder.w, remainder.h);

    // Remove a square of size side x side against 'edge'
    const sq = squareFromEdge(remainder, side, edge);

    squares.push({
      i,
      rect: sq,
      side,
      edge,
      shortExponent: i, // side = A*(1/φ)^i (given exact φ geometry)
    });

    // Compute new remainder rectangle after removing the square
    remainder = remainderAfterRemovingSquare(remainder, sq, edge);
  }

  // Bounds is just outer in this construction (all squares and remainder lie within it),
  // but keeping it explicit is convenient for render code.
  const bounds = { ...outer };

  return {
    outer,
    squares,
    remainder,
    bounds,
    params: { A, steps, orientation, turn, origin },
  };
}

/**
 * Return the theoretical short-side length after k steps: A*(1/φ)^k.
 * Useful for labels even if the UI chooses a subset of steps.
 */
export function goldenShortSideAt(A: number, k: number): number {
  assertPositive(A, "A");
  assertNonNegativeInt(k, "k");
  return A * Math.pow(INV_PHI, k);
}

/**
 * Return a compact text label for a step side:
 * - k=0: "A"
 * - k=1: "A/φ"
 * - k=2: "A/φ²"
 * etc.
 */
export function goldenSideLabel(k: number): string {
  assertNonNegativeInt(k, "k");
  if (k === 0) return "A";
  if (k === 1) return "A/φ";
  return `A/φ^${k}`;
}

/** Simple rect bounds union (utility for future extensions). */
export function unionRect(a: Rect, b: Rect): Rect {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.w, b.x + b.w);
  const y2 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** Center point of a rect. */
export function rectCenter(r: Rect): Vec2 {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/* ---------------------------- internal helpers ---------------------------- */

function edgeForStep(i: number, orientation: Orientation, turn: TurnDirection): Edge {
  // Base cycle for WIDE start at LEFT
  const cw: Edge[] = ["LEFT", "TOP", "RIGHT", "BOTTOM"];
  const ccw: Edge[] = ["LEFT", "BOTTOM", "RIGHT", "TOP"];
  const cycle = turn === "CW" ? cw : ccw;

  const baseIndexWide = 0; // LEFT
  const baseIndexTall = indexOfEdge(cycle, "TOP"); // rotate so step0 is TOP for tall

  const baseIndex = orientation === "WIDE" ? baseIndexWide : baseIndexTall;
  return cycle[(baseIndex + (i % 4)) % 4];
}

function indexOfEdge(cycle: Edge[], edge: Edge): number {
  const idx = cycle.indexOf(edge);
  if (idx < 0) throw new Error("Invalid edge cycle");
  return idx;
}

function squareFromEdge(r: Rect, side: number, edge: Edge): Rect {
  // Assumes side is current short side (fits).
  switch (edge) {
    case "LEFT":
      return { x: r.x, y: r.y, w: side, h: side };
    case "TOP":
      return { x: r.x, y: r.y, w: side, h: side };
    case "RIGHT":
      return { x: r.x + r.w - side, y: r.y, w: side, h: side };
    case "BOTTOM":
      return { x: r.x, y: r.y + r.h - side, w: side, h: side };
  }
}

function remainderAfterRemovingSquare(r: Rect, sq: Rect, edge: Edge): Rect {
  // Remove sq area from r; result is the remaining rectangle.
  // Since the square is aligned to an edge, remainder remains axis-aligned rectangle.
  switch (edge) {
    case "LEFT": {
      const newX = sq.x + sq.w;
      return { x: newX, y: r.y, w: r.w - sq.w, h: r.h };
    }
    case "RIGHT": {
      return { x: r.x, y: r.y, w: r.w - sq.w, h: r.h };
    }
    case "TOP": {
      const newY = sq.y + sq.h;
      return { x: r.x, y: newY, w: r.w, h: r.h - sq.h };
    }
    case "BOTTOM": {
      return { x: r.x, y: r.y, w: r.w, h: r.h - sq.h };
    }
  }
}