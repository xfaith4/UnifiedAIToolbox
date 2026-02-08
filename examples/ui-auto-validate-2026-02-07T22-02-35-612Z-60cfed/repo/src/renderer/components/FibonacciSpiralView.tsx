// src/renderer/components/FibonacciSpiralView.tsx
import React from "react";
import {
  type FibonacciSpiralGeometry,
  fibonacciSpiralGeometry,
} from "../../core/fibonacciSpiral";

type SpiralDirection = "clockwise" | "counter";
type SpiralArcMode = "quarterArcs" | "smooth";

type Theme = "light" | "dark" | "highContrast";

function clamp(x: number, min: number, max: number) {
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, x));
}

function formatNumber(x: number, decimals: number): string {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(decimals);
}

function themeColors(theme: Theme) {
  if (theme === "dark") {
    return {
      bg: "#0b1220",
      panel: "#0f172a",
      text: "#e5e7eb",
      subtle: "#94a3b8",
      stroke: "#e5e7eb",
      outline: "#334155",
      arc: "#60a5fa",
      fills: ["#111827", "#0b1220", "#111827", "#0b1220"],
    };
  }
  if (theme === "highContrast") {
    return {
      bg: "#000000",
      panel: "#000000",
      text: "#ffffff",
      subtle: "#ffffff",
      stroke: "#ffffff",
      outline: "#ffffff",
      arc: "#ffff00",
      fills: ["#000000", "#0a0a0a", "#000000", "#0a0a0a"],
    };
  }
  // light
  return {
    bg: "#ffffff",
    panel: "#ffffff",
    text: "#111827",
    subtle: "#6b7280",
    stroke: "#111827",
    outline: "#d1d5db",
    arc: "#2563eb",
    fills: ["#f8fafc", "#ffffff", "#f1f5f9", "#ffffff"],
  };
}

function computeViewBoxTransform(bounds: { minX: number; minY: number; w: number; h: number }, padFrac = 0.08) {
  const padX = bounds.w * padFrac;
  const padY = bounds.h * padFrac;
  const minX = bounds.minX - padX;
  const minY = bounds.minY - padY;
  const w = bounds.w + 2 * padX;
  const h = bounds.h + 2 * padY;

  // Avoid degenerate viewBox
  const safeW = w > 0 ? w : 1;
  const safeH = h > 0 ? h : 1;

  return { minX, minY, w: safeW, h: safeH };
}

function arcPathFromCorner(
  square: { x: number; y: number; w: number; h: number },
  centerCorner: "TL" | "TR" | "BR" | "BL"
) {
  const r = square.w;
  const x = square.x;
  const y = square.y;

  // Start/end points consistent with core's arcForSquare intent.
  // Using SVG arc command with sweep to trace inside the square.
  let cx = 0,
    cy = 0;
  let sx = 0,
    sy = 0;
  let ex = 0,
    ey = 0;
  // sweepFlag chosen to follow the “spiral” direction inside the square for screen coords.
  // This is robust enough visually for quarter arcs.
  let sweepFlag = 1;

  switch (centerCorner) {
    case "TL":
      cx = x;
      cy = y;
      sx = x;
      sy = y + r;
      ex = x + r;
      ey = y;
      sweepFlag = 0;
      break;
    case "TR":
      cx = x + r;
      cy = y;
      sx = x;
      sy = y;
      ex = x + r;
      ey = y + r;
      sweepFlag = 0;
      break;
    case "BR":
      cx = x + r;
      cy = y + r;
      sx = x + r;
      sy = y;
      ex = x;
      ey = y + r;
      sweepFlag = 0;
      break;
    case "BL":
      cx = x;
      cy = y + r;
      sx = x + r;
      sy = y + r;
      ex = x;
      ey = y;
      sweepFlag = 0;
      break;
  }

  // SVG A command: A rx ry xAxisRotation largeArcFlag sweepFlag x y
  // We always draw quarter arc => largeArcFlag=0
  return `M ${sx} ${sy} A ${r} ${r} 0 0 ${sweepFlag} ${ex} ${ey}`;
}

function smoothSpiralPath(arcs: FibonacciSpiralGeometry["arcs"]) {
  // “Smooth” mode: just concatenate the quarter-arc segments into one path.
  // Since each arc is its own quarter circle, this produces a continuous-looking spiral.
  if (arcs.length === 0) return "";
  const segs = arcs.map((a) => arcPathFromCorner(a.square, a.centerCorner));
  return segs.join(" ");
}

export function FibonacciSpiralView(props: {
  baseA: number;
  decimals: 3 | 6 | 10 | 15;

  squares: number;
  direction: SpiralDirection;
  arcMode: SpiralArcMode;
  showLabels: boolean;
  showOutlines: boolean;
  strokeWidth: number;
  theme: Theme;

  // Dispatchers (match App.tsx reducer actions pattern)
  onSetSquares?: (n: number) => void;
  onSetDirection?: (d: SpiralDirection) => void;
  onSetArcMode?: (m: SpiralArcMode) => void;
  onToggleLabels?: () => void;
  onToggleOutlines?: () => void;
  onSetStrokeWidth?: (w: number) => void;
  onSetTheme?: (t: Theme) => void;
}) {
  const {
    baseA,
    decimals,
    squares,
    direction,
    arcMode,
    showLabels,
    showOutlines,
    strokeWidth,
    theme,
    onSetSquares,
    onSetDirection,
    onSetArcMode,
    onToggleLabels,
    onToggleOutlines,
    onSetStrokeWidth,
    onSetTheme,
  } = props;

  // Interactive base length for this view (as requested) while still defaulting to app baseA.
  const [localBase, setLocalBase] = React.useState<number>(baseA);
  React.useEffect(() => {
    // Keep local base in sync if baseA changes and user hasn't diverged drastically.
    // (If user is actively manipulating localBase, they can keep it; this is a gentle sync.)
    setLocalBase((prev) => (Number.isFinite(prev) ? prev : baseA));
  }, [baseA]);

  const unit = clamp(localBase, 1e-6, 1e9);
  const count = Math.round(clamp(squares, 1, 14));
  const clockwise = direction === "clockwise";

  const geom = React.useMemo(() => {
    return fibonacciSpiralGeometry({
      count,
      unit,
      clockwise,
      startDir: "R",
      origin: { x: 0, y: 0 },
    });
  }, [count, unit, clockwise]);

  const colors = themeColors(theme);
  const vb = computeViewBoxTransform(geom.bounds);

  const tileStroke = showOutlines ? colors.outline : "transparent";
  const sw = clamp(strokeWidth, 1, 6);

  const arcPath =
    arcMode === "smooth"
      ? smoothSpiralPath(geom.arcs)
      : ""; // quarterArcs draws per-arc paths

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, alignItems: "start" }}>
      <div
        style={{
          border: `1px solid ${theme === "dark" ? "#1f2937" : "#e5e7eb"}`,
          borderRadius: 12,
          padding: 12,
          background: colors.panel,
          color: colors.text,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Fibonacci Spiral</div>

        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: colors.subtle }}>Base length (unit)</span>
            <input
              type="number"
              value={Number.isFinite(localBase) ? localBase : ""}
              min={1e-6}
              max={1e9}
              step={1}
              onChange={(e) => setLocalBase(e.currentTarget.valueAsNumber)}
              style={{
                padding: "6px 8px",
                borderRadius: 8,
                border: `1px solid ${theme === "dark" ? "#334155" : "#d1d5db"}`,
                background: theme === "dark" ? "#0b1220" : "#fff",
                color: colors.text,
                fontSize: 13,
              }}
            />
            <div style={{ fontSize: 12, color: colors.subtle }}>
              Using unit = {formatNumber(unit, decimals)} (square side = Fib(n) × unit)
            </div>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: colors.subtle }}>Squares: {count}</span>
            <input
              type="range"
              min={1}
              max={14}
              step={1}
              value={count}
              onChange={(e) => onSetSquares?.(e.currentTarget.valueAsNumber)}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: colors.subtle }}>Direction</span>
            <select
              value={direction}
              onChange={(e) => onSetDirection?.(e.currentTarget.value as SpiralDirection)}
              style={{
                padding: "6px 8px",
                borderRadius: 8,
                border: `1px solid ${theme === "dark" ? "#334155" : "#d1d5db"}`,
                background: theme === "dark" ? "#0b1220" : "#fff",
                color: colors.text,
                fontSize: 13,
              }}
            >
              <option value="clockwise">Clockwise</option>
              <option value="counter">Counterclockwise</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: colors.subtle }}>Arc mode</span>
            <select
              value={arcMode}
              onChange={(e) => onSetArcMode?.(e.currentTarget.value as SpiralArcMode)}
              style={{
                padding: "6px 8px",
                borderRadius: 8,
                border: `1px solid ${theme === "dark" ? "#334155" : "#d1d5db"}`,
                background: theme === "dark" ? "#0b1220" : "#fff",
                color: colors.text,
                fontSize: 13,
              }}
            >
              <option value="quarterArcs">Quarter arcs</option>
              <option value="smooth">Smooth (connected)</option>
            </select>
          </label>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={showOutlines} onChange={() => onToggleOutlines?.()} />
              <span style={{ fontSize: 13 }}>Outlines</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={showLabels} onChange={() => onToggleLabels?.()} />
              <span style={{ fontSize: 13 }}>Labels</span>
            </label>
          </div>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: colors.subtle }}>Stroke width: {sw}px</span>
            <input
              type="range"
              min={1}
              max={6}
              step={1}
              value={sw}
              onChange={(e) => onSetStrokeWidth?.(e.currentTarget.valueAsNumber)}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: colors.subtle }}>Theme</span>
            <select
              value={theme}
              onChange={(e) => onSetTheme?.(e.currentTarget.value as Theme)}
              style={{
                padding: "6px 8px",
                borderRadius: 8,
                border: `1px solid ${theme === "dark" ? "#334155" : "#d1d5db"}`,
                background: theme === "dark" ? "#0b1220" : "#fff",
                color: colors.text,
                fontSize: 13,
              }}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="highContrast">High Contrast</option>
            </select>
          </label>

          <div style={{ fontSize: 12, color: colors.subtle, lineHeight: 1.35 }}>
            Bounds: {formatNumber(geom.bounds.w, decimals)} × {formatNumber(geom.bounds.h, decimals)}
          </div>
        </div>
      </div>

      <div
        style={{
          border: `1px solid ${theme === "dark" ? "#1f2937" : "#e5e7eb"}`,
          borderRadius: 12,
          overflow: "hidden",
          background: colors.bg,
          minHeight: 520,
        }}
      >
        <svg
          viewBox={`${vb.minX} ${vb.minY} ${vb.w} ${vb.h}`}
          preserveAspectRatio="xMidYMid meet"
          width="100%"
          height="100%"
          style={{ display: "block" }}
        >
          {/* Squares */}
          {geom.squares.map((sq) => {
            const fill = colors.fills[sq.i % colors.fills.length];
            return (
              <g key={`sq-${sq.i}`}>
                <rect
                  x={sq.rect.x}
                  y={sq.rect.y}
                  width={sq.rect.w}
                  height={sq.rect.h}
                  fill={fill}
                  stroke={tileStroke}
                  strokeWidth={sw}
                />
                {showLabels ? (
                  <text
                    x={sq.rect.x + sq.rect.w * 0.5}
                    y={sq.rect.y + sq.rect.h * 0.5}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={Math.max(8, sq.rect.w * 0.18)}
                    fill={colors.subtle}
                  >
                    {sq.fib}
                  </text>
                ) : null}
              </g>
            );
          })}

          {/* Arcs */}
          {arcMode === "smooth" ? (
            <path d={arcPath} fill="none" stroke={colors.arc} strokeWidth={sw} />
          ) : (
            geom.arcs.map((a) => (
              <path
                key={`arc-${a.i}`}
                d={arcPathFromCorner(a.square, a.centerCorner)}
                fill="none"
                stroke={colors.arc}
                strokeWidth={sw}
              />
            ))
          )}
        </svg>
      </div>
    </div>
  );
}

export default FibonacciSpiralView;