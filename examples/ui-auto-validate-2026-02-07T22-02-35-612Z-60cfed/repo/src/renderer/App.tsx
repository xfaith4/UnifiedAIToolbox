// src/renderer/App.tsx
import React, { useEffect, useMemo, useState } from "react";

import PhiCalculator from "./components/PhiCalculator";
import GoldenRectangleSplitView from "./components/GoldenRectangleSplitView";
import FibonacciSpiralView from "./components/FibonacciSpiralView";
import QuickReferences from "./components/QuickReferences";

// Defensive import to avoid renderer/core drift: some repos export generateFibonacciSpiral,
// others export fibonacciSpiral. We keep this local to App to avoid breaking builds.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import * as SpiralModule from "../core/fibonacciSpiral";

const PHI = (1 + Math.sqrt(5)) / 2;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function isFinitePositive(n: number) {
  return Number.isFinite(n) && n > 0;
}

function resolveSpiralFn(): unknown {
  // Prefer the symbol currently used by renderer components if present.
  const m: any = SpiralModule as any;
  return m.fibonacciSpiral ?? m.generateFibonacciSpiral ?? m.default;
}

export default function App() {
  // Shared base length A for visualizations/calculator.
  const [a, setA] = useState<number>(100);

  // For better UX: allow the input field to be empty without committing NaN into state.
  const [aText, setAText] = useState<string>(String(100));
  const [aTouched, setATouched] = useState(false);

  // Global focus-visible styles (QA recommendation).
  useEffect(() => {
    const id = "phi-explorer-focus-visible";
    if (document.getElementById(id)) return;

    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      :where(button, [role="button"], input, select, textarea, a):focus-visible {
        outline: 2px solid rgba(99, 102, 241, 0.95); /* indigo-500-ish */
        outline-offset: 2px;
      }
    `;
    document.head.appendChild(style);
  }, []);

  const aIsValid = useMemo(() => isFinitePositive(a), [a]);

  const inputError = useMemo(() => {
    if (!aTouched) return "";
    if (aText.trim() === "") return "Enter a positive number for A.";
    const parsed = Number(aText);
    if (!Number.isFinite(parsed) || parsed <= 0) return "A must be a positive finite number.";
    return "";
  }, [aText, aTouched]);

  const spiralFn = useMemo(() => resolveSpiralFn(), []);

  // Canvas quality improvement (QA recommendation): use fractional DPR clamped to 2.
  const dpr = useMemo(() => clamp(window.devicePixelRatio || 1, 1, 2), []);

  const onChangeAShared: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    setATouched(true);
    const nextText = e.currentTarget.value;
    setAText(nextText);

    // If the field is cleared, do not push NaN into app state; keep last valid numeric A.
    if (nextText.trim() === "") return;

    const next = Number(nextText);
    if (isFinitePositive(next)) setA(next);
  };

  return (
    <div
      style={{
        padding: 16,
        fontFamily:
          'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
        color: "var(--fg, #111827)",
        background: "var(--bg, #ffffff)",
      }}
    >
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Golden Ratio (φ) Explorer</h1>
        <p style={{ margin: "8px 0 0", color: "var(--muted, #4b5563)" }}>
          φ ≈ {PHI.toFixed(10)} — explore proportional relationships, golden rectangles, and the Fibonacci spiral (offline).
        </p>
      </header>

      <section
        aria-label="Shared controls"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 8,
          marginBottom: 16,
          padding: 12,
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ minWidth: 140, color: "var(--muted, #4b5563)" }}>Base length A</span>
            <input
              type="number"
              inputMode="decimal"
              value={aText}
              onChange={onChangeAShared}
              onBlur={() => setATouched(true)}
              min={0}
              step="any"
              style={{
                width: 180,
                padding: "6px 8px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.18)",
              }}
              aria-invalid={Boolean(inputError)}
              aria-describedby={inputError ? "a-error" : undefined}
            />
          </label>

          <div style={{ color: "var(--muted, #4b5563)" }}>
            <span style={{ marginRight: 8 }}>Units:</span>
            <span>arbitrary (px, cm, etc.)</span>
          </div>
        </div>

        {inputError ? (
          <div id="a-error" style={{ color: "#b91c1c", fontSize: 13 }}>
            {inputError}
          </div>
        ) : null}
      </section>

      <main style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
        {/* Calculator */}
        <section
          style={{
            padding: 12,
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 10,
          }}
        >
          <PhiCalculator
            // Keep calculator in sync; only pass numeric A.
            // If A was invalid, we still pass the last valid numeric A (since we preserve it).
            initialA={a}
          />
        </section>

        {/* Visualizations */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 16,
          }}
        >
          <div
            style={{
              padding: 12,
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 10,
            }}
          >
            <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Golden Rectangle Split</h2>
            <GoldenRectangleSplitView a={aIsValid ? a : 100} />
          </div>

          <div
            style={{
              padding: 12,
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 10,
            }}
          >
            <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Fibonacci (≈ φ) Spiral</h2>

            {/* If FibonacciSpiralView supports passing a generator/DPR, supply it.
                Otherwise, render with existing props only (no breaking change). */}
            {(() => {
              const props: any = { a: aIsValid ? a : 100 };

              // Optional props, only if the component supports them (duck-typed).
              // This avoids TypeScript errors if the prop types do not include these keys
              // while still improving runtime behavior in builds that do.
              if (spiralFn) props.spiralFn = spiralFn;
              props.dpr = dpr;

              return <FibonacciSpiralView {...props} />;
            })()}
          </div>
        </section>

        {/* References */}
        <section
          style={{
            padding: 12,
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 10,
          }}
        >
          <QuickReferences />
        </section>
      </main>

      <footer style={{ marginTop: 16, color: "var(--muted, #4b5563)", fontSize: 12 }}>
        <div>Offline app: no network calls required.</div>
      </footer>
    </div>
  );
}