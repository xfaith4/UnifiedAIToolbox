// src/renderer/components/PhiCalculator.tsx
import React from "react";
import { INV_PHI, PHI, PHI_MINUS_1, phiCalc } from "../../core/math";

type Decimals = 3 | 6 | 10 | 15;

function formatNumber(x: number, decimals: number): string {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(decimals);
}

async function copyText(text: string) {
  // Offline desktop (Electron-like) environment should have clipboard available.
  // If unavailable, fail silently.
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore
  }
}

function Row(props: {
  label: React.ReactNode;
  value: string;
  onCopy?: () => void;
  mono?: boolean;
}) {
  const { label, value, onCopy, mono = true } = props;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "180px 1fr auto",
        alignItems: "center",
        gap: 10,
        padding: "8px 0",
        borderBottom: "1px solid #eef2f7",
      }}
    >
      <div style={{ fontSize: 13, color: "#111827" }}>{label}</div>
      <div
        style={{
          fontSize: 13,
          color: "#111827",
          fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" : undefined,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={value}
      >
        {value}
      </div>
      {onCopy ? (
        <button
          type="button"
          onClick={onCopy}
          style={{
            appearance: "none",
            border: "1px solid #d1d5db",
            background: "#fff",
            color: "#111827",
            padding: "6px 10px",
            borderRadius: 8,
            fontSize: 12,
            cursor: "pointer",
          }}
          title="Copy value"
        >
          Copy
        </button>
      ) : (
        <div />
      )}
    </div>
  );
}

export default function PhiCalculator(props: {
  A: number;
  onChangeA: (next: number) => void;
  decimals: Decimals;
  onChangeDecimals: (next: Decimals) => void;
}) {
  const { A, onChangeA, decimals, onChangeDecimals } = props;

  const calc = React.useMemo(() => {
    try {
      // phiCalc requires A > 0 and finite
      return phiCalc(A);
    } catch {
      return null;
    }
  }, [A]);

  const timesPhi = calc ? formatNumber(calc.timesPhi, decimals) : "—";
  const overPhi = calc ? formatNumber(calc.overPhi, decimals) : "—";
  const timesPhiMinus1 = calc ? formatNumber(calc.timesPhiMinus1, decimals) : "—";
  const identityDiff = calc ? formatNumber(calc.overPhiMinusTimesPhiMinus1, decimals) : "—";

  const phiStr = formatNumber(PHI, decimals);
  const invPhiStr = formatNumber(INV_PHI, decimals);

  return (
    <div style={{ display: "grid", gap: 14, padding: 16 }}>
      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          alignItems: "center",
          padding: 12,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          background: "#fff",
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "#111827" }}>A (base)</span>
          <input
            type="number"
            value={Number.isFinite(A) ? A : ""}
            min={1e-6}
            max={1e9}
            step={1}
            onChange={(e) => onChangeA(e.currentTarget.valueAsNumber)}
            style={{
              width: 180,
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              fontSize: 13,
            }}
          />
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "#111827" }}>Decimals</span>
          <select
            value={decimals}
            onChange={(e) => onChangeDecimals(Number(e.currentTarget.value) as Decimals)}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              fontSize: 13,
              background: "#fff",
            }}
          >
            <option value={3}>3</option>
            <option value={6}>6</option>
            <option value={10}>10</option>
            <option value={15}>15</option>
          </select>
        </label>

        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Uses φ = (1 + √5) / 2
        </div>
      </div>

      <div
        style={{
          padding: 12,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          background: "#fff",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 650, color: "#111827", marginBottom: 6 }}>Results</div>

        <Row
          label={
            <>
              A·φ <span style={{ color: "#6b7280" }}>(multiply)</span>
            </>
          }
          value={timesPhi}
          onCopy={timesPhi === "—" ? undefined : () => copyText(timesPhi)}
        />

        <Row
          label={
            <>
              A/φ <span style={{ color: "#6b7280" }}>(divide)</span>
            </>
          }
          value={overPhi}
          onCopy={overPhi === "—" ? undefined : () => copyText(overPhi)}
        />

        <div style={{ height: 8 }} />

        <div style={{ fontSize: 14, fontWeight: 650, color: "#111827", marginBottom: 6 }}>
          Identity check (educational)
        </div>

        <Row
          label={
            <>
              A·(φ − 1) <span style={{ color: "#6b7280" }}>(should equal A/φ)</span>
            </>
          }
          value={timesPhiMinus1}
          onCopy={timesPhiMinus1 === "—" ? undefined : () => copyText(timesPhiMinus1)}
        />

        <Row
          label={
            <>
              (A/φ) − A·(φ − 1) <span style={{ color: "#6b7280" }}>(difference)</span>
            </>
          }
          value={identityDiff}
          onCopy={identityDiff === "—" ? undefined : () => copyText(identityDiff)}
        />
      </div>

      <div
        style={{
          padding: 12,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          background: "#fff",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 650, color: "#111827", marginBottom: 6 }}>Quick reference</div>

        <div style={{ display: "grid", gap: 6, fontSize: 13, color: "#111827" }}>
          <div>
            φ = (1 + √5) / 2 ≈{" "}
            <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" }}>
              {phiStr}
            </span>
          </div>
          <div>
            1/φ = φ − 1 ≈{" "}
            <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" }}>
              {invPhiStr}
            </span>{" "}
            <span style={{ color: "#6b7280" }}>
              (φ − 1 = {formatNumber(PHI_MINUS_1, decimals)})
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}