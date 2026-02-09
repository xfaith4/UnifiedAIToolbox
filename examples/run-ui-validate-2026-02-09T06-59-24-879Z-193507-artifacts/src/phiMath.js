// src/phiMath.js
// Core math utilities for phi demos (ES module)

/** Golden ratio φ */
export const PHI = (1 + Math.sqrt(5)) / 2;

/** Small epsilon for float comparisons */
export const EPS = 1e-12;

// -----------------------------
// Error measures vs φ
// -----------------------------
export function absoluteError(x, phi = PHI) {
  return Math.abs(x - phi);
}

export function relativeError(x, phi = PHI) {
  return Math.abs(x - phi) / phi;
}

// -----------------------------
// Continued fraction for φ = [1; 1, 1, 1, ...]
// Mapping (as specified):
//  k=1 => 1
//  k=2 => 2
//  k=3 => 3/2
//  k=4 => 5/3 ...
// -----------------------------

/**
 * Continued fraction numeric value (fast). Uses bottom-up iteration.
 * @param {number} k depth, integer >= 1
 * @returns {number}
 */
export function cfPhiValue(k) {
  k = Math.floor(Number(k));
  if (!Number.isFinite(k) || k <= 1) return 1;
  let x = 1;
  for (let i = 2; i <= k; i++) x = 1 + 1 / x;
  return x;
}

/**
 * Exact convergent p/q as BigInt for φ continued fraction at depth k.
 * @param {number} k integer >= 1
 * @returns {{p: bigint, q: bigint}}
 */
export function cfPhiConvergentPQ(k) {
  k = Math.floor(Number(k));
  if (!Number.isFinite(k) || k <= 1) return { p: 1n, q: 1n };

  const nMax = k - 1;
  let p_nm2 = 0n, p_nm1 = 1n;
  let q_nm2 = 1n, q_nm1 = 0n;

  for (let n = 0; n <= nMax; n++) {
    const a = 1n; // a0=1, a_n=1 for n>=1
    const p = a * p_nm1 + p_nm2;
    const q = a * q_nm1 + q_nm2;
    p_nm2 = p_nm1; p_nm1 = p;
    q_nm2 = q_nm1; q_nm1 = q;
  }
  return { p: p_nm1, q: q_nm1 };
}

/**
 * Approximate convergent p/q as Number. Valid while p,q are within safe range.
 * @param {bigint} p
 * @param {bigint} q
 * @returns {number}
 */
export function bigIntRatioToNumber(p, q) {
  return Number(p) / Number(q);
}

// -----------------------------
// BigInt decimal division for display: p/q to D digits after decimal
// -----------------------------

function _assertBigInt(x, name) {
  if (typeof x !== "bigint") throw new TypeError(`${name} must be a BigInt`);
}

/**
 * Convert a rational p/q into a decimal string with fixed digits after decimal.
 * Handles sign. Does not use floating-point.
 * @param {bigint} p numerator
 * @param {bigint} q denominator (non-zero)
 * @param {number} digits digits after decimal (>=0)
 * @returns {string}
 */
export function bigIntDivToDecimal(p, q, digits = 20) {
  _assertBigInt(p, "p");
  _assertBigInt(q, "q");
  if (q === 0n) throw new RangeError("Division by zero");
  digits = Math.max(0, Math.floor(Number(digits) || 0));

  // Normalize sign
  let sign = "";
  if ((p < 0n) !== (q < 0n)) sign = "-";
  p = p < 0n ? -p : p;
  q = q < 0n ? -q : q;

  const intPart = p / q;
  let rem = p % q;

  if (digits === 0) return `${sign}${intPart.toString()}`;

  let frac = "";
  for (let i = 0; i < digits; i++) {
    rem *= 10n;
    const d = rem / q;
    rem = rem % q;
    frac += d.toString();
    if (rem === 0n) {
      // pad remaining digits
      if (i < digits - 1) frac += "0".repeat(digits - 1 - i);
      break;
    }
  }
  return `${sign}${intPart.toString()}.${frac}`;
}

/**
 * Convert p/q into a JS Number safely only if within Number safe integer bounds.
 * @param {bigint} p
 * @param {bigint} q
 * @returns {{ok: boolean, value: number}}
 */
export function bigIntRatioToNumberSafe(p, q) {
  _assertBigInt(p, "p");
  _assertBigInt(q, "q");
  const MAX = BigInt(Number.MAX_SAFE_INTEGER);
  const ap = p < 0n ? -p : p;
  const aq = q < 0n ? -q : q;
  if (aq === 0n) return { ok: false, value: NaN };
  if (ap > MAX || aq > MAX) return { ok: false, value: NaN };
  return { ok: true, value: Number(p) / Number(q) };
}

// -----------------------------
// Fibonacci helpers
// -----------------------------

/**
 * Fibonacci numbers in Number (up to ~78 for safe integer exactness).
 * @param {number} nMax integer >= 0
 * @returns {number[]}
 */
export function fibNumbers(nMax) {
  nMax = Math.max(0, Math.floor(Number(nMax) || 0));
  const F = new Array(nMax + 1);
  F[0] = 0;
  if (nMax >= 1) F[1] = 1;
  for (let n = 2; n <= nMax; n++) F[n] = F[n - 1] + F[n - 2];
  return F;
}

/**
 * Fibonacci numbers in BigInt (exact).
 * @param {number} nMax integer >= 0
 * @returns {bigint[]}
 */
export function fibBigInt(nMax) {
  nMax = Math.max(0, Math.floor(Number(nMax) || 0));
  const F = new Array(nMax + 1);
  F[0] = 0n;
  if (nMax >= 1) F[1] = 1n;
  for (let n = 2; n <= nMax; n++) F[n] = F[n - 1] + F[n - 2];
  return F;
}

/**
 * Generate a table of Fibonacci ratios Rn = F(n+1)/F(n) for n>=1.
 * Uses Number arithmetic; intended for visualization and quick tables.
 * @param {number} nMax maximum n (>=1)
 * @param {number} phi reference value
 * @returns {{n:number, f:number, next:number, ratio:number, absErr:number, relErr:number}[]}
 */
export function fibRatioTable(nMax, phi = PHI) {
  nMax = Math.max(1, Math.floor(Number(nMax) || 1));
  const rows = [];
  let prev = 0;
  let curr = 1;
  for (let n = 1; n <= nMax; n++) {
    const next = prev + curr;       // F(n+1)
    const ratio = next / curr;      // F(n+1)/F(n)
    rows.push({
      n,
      f: curr,
      next,
      ratio,
      absErr: Math.abs(ratio - phi),
      relErr: Math.abs(ratio - phi) / phi
    });
    prev = curr;
    curr = next;
  }
  return rows;
}

/**
 * Exact Fibonacci ratio row using BigInt for the integers.
 * Ratio is returned as:
 * - ratioNumber: Number approximation (may lose precision for large n)
 * - ratioDecimal: optional exact decimal string to fixed digits (slow for large digits)
 * @param {number} n (>=1)
 * @param {number} digits decimal digits for ratioDecimal (>=0)
 * @returns {{n:number, f:bigint, next:bigint, ratioNumber:number, ratioDecimal:string}}
 */
export function fibRatioBigInt(n, digits = 20) {
  n = Math.max(1, Math.floor(Number(n) || 1));
  const F = fibBigInt(n + 1);
  const f = F[n];
  const next = F[n + 1];
  const ratioNumber = Number(next) / Number(f);
  const ratioDecimal = bigIntDivToDecimal(next, f, digits);
  return { n, f, next, ratioNumber, ratioDecimal };
}

// -----------------------------
// Golden rectangle tiling (square removal recursion)
// -----------------------------

/**
 * Produce a list of square tiles removed from a rectangle via greedy square removal.
 * Returns both squares and remainder rectangles for optional outlining.
 *
 * @param {number} x top-left x
 * @param {number} y top-left y
 * @param {number} w width (positive)
 * @param {number} h height (positive)
 * @param {object} opts
 * @param {number} opts.maxDepth maximum iterations
 * @param {number} opts.minSize stop when min(w,h) < minSize
 * @param {number} opts.eps stop when remainder becomes too small
 * @returns {{squares: {x:number,y:number,w:number,h:number,depth:number}[],
 *            remainders: {x:number,y:number,w:number,h:number,depth:number}[]}}
 */
export function goldenTiling(x, y, w, h, opts = {}) {
  const maxDepth = Math.max(0, Math.floor(Number(opts.maxDepth ?? 12)));
  const minSize = Math.max(0, Number(opts.minSize ?? 6));
  const eps = Number(opts.eps ?? EPS);

  x = Number(x); y = Number(y); w = Number(w); h = Number(h);
  if (![x, y, w, h].every(Number.isFinite)) {
    return { squares: [], remainders: [] };
  }
  if (w <= 0 || h <= 0 || maxDepth === 0) {
    return { squares: [], remainders: [] };
  }

  const squares = [];
  const remainders = [];
  let curr = { x, y, w, h };

  for (let d = 0; d < maxDepth; d++) {
    if (Math.min(curr.w, curr.h) < minSize) break;

    if (curr.w >= curr.h) {
      const s = curr.h;
      squares.push({ x: curr.x, y: curr.y, w: s, h: s, depth: d });
      const rem = { x: curr.x + s, y: curr.y, w: curr.w - s, h: curr.h, depth: d };
      remainders.push(rem);
      curr = { x: rem.x, y: rem.y, w: rem.w, h: rem.h };
      if (curr.w <= eps) break;
    } else {
      const s = curr.w;
      squares.push({ x: curr.x, y: curr.y, w: s, h: s, depth: d });
      const rem = { x: curr.x, y: curr.y + s, w: curr.w, h: curr.h - s, depth: d };
      remainders.push(rem);
      curr = { x: rem.x, y: rem.y, w: rem.w, h: rem.h };
      if (curr.h <= eps) break;
    }
  }

  return { squares, remainders };
}

// -----------------------------
// Spiral generation
// -----------------------------

/**
 * Generate points for a golden logarithmic spiral centered at (cx,cy).
 * Uses r(θ) = a * φ^(2θ/π) so that each +π/2 multiplies radius by φ.
 *
 * @param {object} params
 * @param {number} params.cx center x
 * @param {number} params.cy center y
 * @param {number} params.a base radius scale (>0)
 * @param {number} params.theta0 start angle (radians)
 * @param {number} params.theta1 end angle (radians), can be less than theta0
 * @param {number} params.steps number of segments (>=1)
 * @param {number} params.phi golden ratio override
 * @returns {{x:number,y:number,theta:number,r:number}[]}
 */
export function goldenSpiralPoints({
  cx = 0,
  cy = 0,
  a = 1,
  theta0 = 0,
  theta1 = 6 * Math.PI,
  steps = 600,
  phi = PHI
} = {}) {
  cx = Number(cx); cy = Number(cy); a = Number(a);
  theta0 = Number(theta0); theta1 = Number(theta1);
  steps = Math.max(1, Math.floor(Number(steps) || 1));
  phi = Number(phi);

  if (![cx, cy, a, theta0, theta1, steps, phi].every(Number.isFinite) || a <= 0 || phi <= 0) {
    return [];
  }

  const pts = [];
  const dTheta = (theta1 - theta0) / steps;

  for (let i = 0; i <= steps; i++) {
    const theta = theta0 + dTheta * i;
    const r = a * Math.pow(phi, (2 * theta) / Math.PI);
    pts.push({
      x: cx + r * Math.cos(theta),
      y: cy + r * Math.sin(theta),
      theta,
      r
    });
  }
  return pts;
}

/**
 * Generate Fibonacci square tiling layout (approximation basis for Fibonacci spiral arcs).
 * Returns N squares with side lengths 1,1,2,3,5,... scaled by `scale`.
 *
 * Orientation follows a common cycle: right, up, left, down (repeats),
 * starting with two squares placed horizontally (square1 to the right of square0).
 *
 * @param {number} N number of squares (>=1)
 * @param {number} scale side-length scale
 * @returns {{x:number,y:number,s:number,i:number,dir:string}[]}
 */
export function fibonacciSquares(N, scale = 1) {
  N = Math.max(1, Math.floor(Number(N) || 1));
  scale = Number(scale);
  if (!Number.isFinite(scale) || scale <= 0) return [];

  // Fibonacci side lengths (Number)
  const sides = new Array(N);
  sides[0] = 1;
  if (N >= 2) sides[1] = 1;
  for (let i = 2; i < N; i++) sides[i] = sides[i - 1] + sides[i - 2];
  for (let i = 0; i < N; i++) sides[i] *= scale;

  const squares = [];
  // Place first square at origin, second to the right
  squares.push({ x: 0, y: 0, s: sides[0], i: 0, dir: "start" });
  if (N === 1) return squares;

  squares.push({ x: sides[0], y: 0, s: sides[1], i: 1, dir: "right" });

  // Track bounding box of all squares
  let minX = 0, minY = 0, maxX = sides[0] + sides[1], maxY = Math.max(sides[0], sides[1]);

  // Direction cycle for new square attachment (i=2 corresponds to "up")
  const dirs = ["up", "left", "down", "right"];

  for (let i = 2; i < N; i++) {
    const s = sides[i];
    const dir = dirs[(i - 2) % 4];
    let x, y;

    if (dir === "up") {
      // attach above: align to the right edge
      x = maxX - s;
      y = minY - s;
      minY = y;
      // maxX unchanged
    } else if (dir === "left") {
      x = minX - s;
      y = minY;
      minX = x;
    } else if (dir === "down") {
      x = minX;
      y = maxY;
      maxY = y + s;
    } else { // right
      x = maxX;
      y = maxY - s;
      maxX = x + s;
    }

    squares.push({ x, y, s, i, dir });
    // update bbox robustly
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + s);
    maxY = Math.max(maxY, y + s);
  }

  return squares;
}

/**
 * Sample quarter-circle arc points for the Fibonacci spiral approximation.
 * For each square, creates a quarter arc along one corner depending on dir.
 *
 * Note: This is an approximation utility for visuals; conventions vary.
 * The produced arc sequence will be continuous for the `fibonacciSquares` layout above.
 *
 * @param {{x:number,y:number,s:number,i:number,dir:string}[]} squares
 * @param {number} pointsPerArc (>=2)
 * @returns {{x:number,y:number,squareIndex:number}[]}
 */
export function fibonacciSpiralArcPoints(squares, pointsPerArc = 30) {
  if (!Array.isArray(squares) || squares.length === 0) return [];
  pointsPerArc = Math.max(2, Math.floor(Number(pointsPerArc) || 2));

  const pts = [];

  for (const sq of squares) {
    const { x, y, s, i, dir } = sq;
    if (![x, y, s].every(Number.isFinite) || s <= 0) continue;

    // Determine arc center and angle span based on attachment direction.
    // With the chosen tiling, these choices produce a typical Fibonacci spiral path.
    let cx, cy, t0, t1;

    if (i === 0) {
      // First square: arc from bottom-left to top-left (a reasonable start)
      cx = x + s; cy = y + s;
      t0 = Math.PI; t1 = 1.5 * Math.PI;
    } else if (dir === "right") {
      cx = x; cy = y + s;
      t0 = 1.5 * Math.PI; t1 = 2 * Math.PI;
    } else if (dir === "up") {
      cx = x; cy = y;
      t0 = 0; t1 = 0.5 * Math.PI;
    } else if (dir === "left") {
      cx = x + s; cy = y;
      t0 = 0.5 * Math.PI; t1 = Math.PI;
    } else if (dir === "down") {
      cx = x + s; cy = y + s;
      t0 = Math.PI; t1 = 1.5 * Math.PI;
    } else {
      cx = x; cy = y + s;
      t0 = 1.5 * Math.PI; t1 = 2 * Math.PI;
    }

    const r = s;
    for (let j = 0; j < pointsPerArc; j++) {
      const u = j / (pointsPerArc - 1);
      const t = t0 + (t1 - t0) * u;
      pts.push({
        x: cx + r * Math.cos(t),
        y: cy + r * Math.sin(t),
        squareIndex: i
      });
    }
  }

  return pts;
}

// -----------------------------
// Convenience bundle export
// -----------------------------
export default {
  PHI,
  EPS,
  absoluteError,
  relativeError,
  cfPhiValue,
  cfPhiConvergentPQ,
  bigIntDivToDecimal,
  bigIntRatioToNumber,
  bigIntRatioToNumberSafe,
  fibNumbers,
  fibBigInt,
  fibRatioTable,
  fibRatioBigInt,
  goldenTiling,
  goldenSpiralPoints,
  fibonacciSquares,
  fibonacciSpiralArcPoints
};