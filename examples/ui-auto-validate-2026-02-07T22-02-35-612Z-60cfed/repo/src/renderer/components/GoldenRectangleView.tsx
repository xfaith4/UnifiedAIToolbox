// src/renderer/components/GoldenRectangleView.tsx
import React from "react";
import {
  goldenRectangleSplit,
  goldenSideLabel,
  type GoldenSquare,
  type GoldenRectangleSplit,
  type Rect,
} from "../../core/goldenRectangle";

type RectOrientation = "wide" | "tall";
type TurnDirection = "cw" | "ccw";

export type GoldenRectangleViewProps = {
  A: number;
  steps: number;
  orientation: RectOrientation;
  turn: TurnDirection;
  showLabels: boolean;
  showOutlines: boolean;
  strokeWidth: number;
  theme: "light" | "dark" | "highContrast";
  decimals: 3 | 6 | 10 | 15;
  /** Optional: cap labels to avoid clutter (defaults to 6) */
  maxLabels?: number;
  /** Optional className for layout */
  className?: string;
  /** Optional style for outer container */
  style?: React.CSSProperties;
};

/** Simple clamp; keep local to avoid importing renderer-wide utils. */
function clamp(x: number, min: number, max: number) {
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, x));
}

function formatNumber(x: number, decimals: number): string {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(decimals);
}

function rectToSvgProps(r: Rect) {
  return { x: r.x, y: r.y, width: r.w, height: r.h };
}

function useResizeObserver<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null);
  const [size, setSize] = React.useState<{ w: number; h: number }>({ w: 0, h: 0 });

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const obs = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      const cr = e.contentRect;
      setSize({ w: cr.width, h: cr.height });
    });
    obs.observe(el);

    // Initial
    const rect = el.getBoundingClientRect();
    setSize({ w: rect.width, h: rect.height });

    return () => obs.disconnect();
  }, []);

  return { ref, size };
}

type Palette = {
  background: string;
  outerFill: string;
  outline: string;
  label: string;
  remainderOutline: string;
  squareFills: string[];
  squareOutline: string;
  crosshair: string;
};

function paletteFor(theme: GoldenRectangleViewProps["theme"]): Palette {
  switch (theme) {
    case "dark":
      return {
        background: "#0b1220",
        outerFill: "#0f1b33",
        outline: "#93c5fd",
        remainderOutline: "#c7d2fe",
        label: "#e5e7eb",
        squareOutline: "#93c5fd",
        squareFills: ["#1f2a44", "#223456", "#283a61", "#2b446f", "#2f4b7c", "#355388"],
        crosshair: "rgba(147,197,253,0.35)",
      };
    case "highContrast":
      return {
        background: "#ffffff",
        outerFill: "#ffffff",
        outline: "#000000",
        remainderOutline: "#000000",
        label: "#000000",
        squareOutline: "#000000",
        squareFills: ["#ffffff", "#f3f4f6", "#ffffff", "#f3f4f6", "#ffffff", "#f3f4f6"],
        crosshair: "rgba(0,0,0,0.25)",
      };
    case "light":
    default:
      return {
        background: "#ffffff",
        outerFill: "#f8fafc",
        outline: "#1f2937",
        remainderOutline: "#374151",
        label: "#111827",
        squareOutline: "#111827",
        squareFills: ["#e5e7eb", "#dbeafe", "#fde68a", "#bbf7d0", "#fecaca", "#ddd6fe"],
        crosshair: "rgba(31,41,55,0.15)",
      };
  }
}

function computeViewBox(bounds: Rect, padding: number) {
  return {
    x: bounds.x - padding,
    y: bounds.y - padding,
    w: bounds.w + padding * 2,
    h: bounds.h + padding * 2,
  };
}

function squareTooltip(sq: GoldenSquare, decimals: number) {
  const side = formatNumber(sq.side, decimals);
  const k = sq.shortExponent;
  const label = goldenSideLabel(k);
  return `Step ${sq.i}\nSide: ${side}\nLabel: ${label}\nEdge: ${sq.edge}`;
}

export function GoldenRectangleView(props: GoldenRectangleViewProps) {
  const {
    A,
    steps,
    orientation,
    turn,
    showLabels,
    showOutlines,
    strokeWidth,
    theme,
    decimals,
    maxLabels = 6,
    className,
    style,
  } = props;

  const { ref, size } = useResizeObserver<HTMLDivElement>();
  const pal = paletteFor(theme);

  const safeA = Number.isFinite(A) ? Math.max(A, 1e-6) : 1e-6;
  const safeSteps = Math.round(clamp(steps, 0, 12));
  const coreOrientation = orientation === "tall" ? "TALL" : "WIDE";
  const coreTurn = turn === "ccw" ? "CCW" : "CW";

  const geom: GoldenRectangleSplit = React.useMemo(() => {
    return goldenRectangleSplit({
      A: safeA,
      steps: safeSteps,
      orientation: coreOrientation,
      turn: coreTurn,
      origin: { x: 0, y: 0 },
    });
  }, [safeA, safeSteps, coreOrientation, coreTurn]);

  // Stroke widths in SVG are in CSS pixels. We'll keep them constant-ish.
  const pxStroke = clamp(strokeWidth, 1, 6);

  // Fit-to-view: use viewBox + preserveAspectRatio.
  // Add padding scaled to geometry size; minimum padding for tiny A.
  const padding = Math.max(8, 0.04 * Math.max(geom.bounds.w, geom.bounds.h));
  const vb = computeViewBox(geom.bounds, padding);

  // Label sizing: heuristic based on available pixels and step count.
  const fontSize = React.useMemo(() => {
    const minDim = Math.min(size.w || 0, size.h || 0);
    // Keep it readable but not huge.
    return clamp(minDim / 26, 10, 16);
  }, [size.w, size.h]);

  const labeledSquares = showLabels ? geom.squares.slice(0, Math.max(0, maxLabels)) : [];

  return (
    <div
      ref={ref}
      className={className}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 240,
        borderRadius: 12,
        border: theme === "dark" ? "1px solid #1f2a44" : "1px solid #e5e7eb",
        background: pal.background,
        overflow: "hidden",
        ...style,
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Golden rectangle split visualization"
      >
        {/* Background fill inside viewBox */}
        <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill={pal.background} />

        {/* Outer rectangle fill */}
        <rect {...rectToSvgProps(geom.outer)} fill={pal.outerFill} />

        {/* Squares */}
        {geom.squares.map((sq, idx) => {
          const fill = pal.squareFills[idx % pal.squareFills.length];
          return (
            <g key={`sq-${sq.i}`}>
              <rect
                {...rectToSvgProps(sq.rect)}
                fill={fill}
                stroke={showOutlines ? pal.squareOutline : "none"}
                strokeWidth={showOutlines ? pxStroke : 0}
                vectorEffect="non-scaling-stroke"
              >
                <title>{squareTooltip(sq, decimals)}</title>
              </rect>
            </g>
          );
        })}

        {/* Outer border */}
        <rect
          {...rectToSvgProps(geom.outer)}
          fill="none"
          stroke={pal.outline}
          strokeWidth={pxStroke}
          vectorEffect="non-scaling-stroke"
        />

        {/* Remainder outline (optional; shown when outlines enabled and steps > 0) */}
        {showOutlines && safeSteps > 0 ? (
          <rect
            {...rectToSvgProps(geom.remainder)}
            fill="none"
            stroke={pal.remainderOutline}
            strokeWidth={Math.max(1, pxStroke - 0.5)}
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {/* Labels */}
        {labeledSquares.map((sq) => {
          const cx = sq.rect.x + sq.rect.w / 2;
          const cy = sq.rect.y + sq.rect.h / 2;

          // Decide label content: A/φ^k is the most educational; include i if space allows.
          const label = goldenSideLabel(sq.shortExponent);
          const sub = `i=${sq.i}`;

          // Hide text for extremely small squares to avoid noise.
          const minSideForText = 0.28 * fontSize * (vb.w / Math.max(size.w || 1, 1)); // rough world-space threshold
          if (sq.side < minSideForText) return null;

          return (
            <g key={`label-${sq.i}`} pointerEvents="none">
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
                fontSize={fontSize}
                fill={pal.label}
                opacity={0.95}
              >
                {label}
              </text>
              {/* Secondary line if the square is large enough */}
              {sq.side > minSideForText * 1.8 ? (
                <text
                  x={cx}
                  y={cy + fontSize * 0.95}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
                  fontSize={Math.max(10, fontSize * 0.85)}
                  fill={pal.label}
                  opacity={0.8}
                >
                  {sub}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default GoldenRectangleView;