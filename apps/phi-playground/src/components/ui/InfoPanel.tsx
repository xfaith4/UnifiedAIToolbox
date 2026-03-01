import { usePhiStore } from '../../state/store'
import { fibonacci, fibonacciRatio, fibonacciRatioError, PHI } from '../../math/phi'

const PANEL_INFO = {
  'golden-rect': {
    title: 'Golden Rectangle',
    color: 'border-phi-500',
    content: (subdivisionDepth: number) => (
      <div className="space-y-2">
        <p className="text-slate-300 text-sm leading-relaxed">
          A <strong className="text-phi-500">golden rectangle</strong> has sides in ratio φ ≈ 1.618.
          Remove the largest square from it and the remainder is another golden rectangle — infinitely
          self-similar.
        </p>
        <div className="font-mono text-xs bg-slate-800 rounded p-2 space-y-1">
          <div className="text-phi-500">φ = (1 + √5) / 2 ≈ {PHI.toFixed(8)}</div>
          <div className="text-slate-400">Width / Height = {PHI.toFixed(6)}</div>
          <div className="text-slate-400">Subdivision depth: {subdivisionDepth}</div>
        </div>
        <p className="text-slate-400 text-xs">
          Each subdivision reveals a smaller golden rectangle — self-similarity at every scale.
        </p>
      </div>
    ),
  },
  fibonacci: {
    title: 'Fibonacci Convergence',
    color: 'border-green-500',
    content: (fibN: number) => {
      const ratio = fibonacciRatio(fibN)
      const err = fibonacciRatioError(fibN)
      return (
        <div className="space-y-2">
          <p className="text-slate-300 text-sm leading-relaxed">
            Consecutive Fibonacci numbers converge to φ. As n → ∞, F(n+1)/F(n) → φ with
            exponentially decreasing error.
          </p>
          <div className="font-mono text-xs bg-slate-800 rounded p-2 space-y-1">
            <div className="text-green-400">n = {fibN}</div>
            <div className="text-slate-300">F(n) = {fibonacci(fibN).toLocaleString()}</div>
            <div className="text-slate-300">F(n+1) = {fibonacci(fibN + 1).toLocaleString()}</div>
            <div className="text-phi-500">Ratio = {ratio.toFixed(10)}</div>
            <div className="text-slate-400">φ     = {PHI.toFixed(10)}</div>
            <div className={`${err < 0.0001 ? 'text-green-400' : 'text-amber-400'}`}>
              Error = {err.toFixed(6)}%
            </div>
          </div>
        </div>
      )
    },
  },
  spiral: {
    title: 'Golden Spiral',
    color: 'border-blue-400',
    content: (spiralMode: string) => (
      <div className="space-y-2">
        <p className="text-slate-300 text-sm leading-relaxed">
          Two related spirals share the golden ratio:
        </p>
        <div className="font-mono text-xs bg-slate-800 rounded p-2 space-y-1">
          {spiralMode === 'fibonacci' ? (
            <>
              <div className="text-amber-400">⚠ Fibonacci-square spiral (approximation)</div>
              <div className="text-slate-300">Built from quarter-circle arcs in Fibonacci squares.</div>
              <div className="text-slate-400">Each arc radius = F(n); arc center shifts per square.</div>
              <div className="text-slate-400">Exact at arc junctions; smooth curve is an approximation.</div>
            </>
          ) : (
            <>
              <div className="text-blue-400">✓ Logarithmic golden spiral (idealized)</div>
              <div className="text-slate-300">r(θ) = a · φ^(θ / (π/2))</div>
              <div className="text-slate-400">Self-similar: grows by φ per quarter-turn.</div>
              <div className="text-slate-400">Also called equiangular spiral.</div>
            </>
          )}
        </div>
        <p className="text-slate-400 text-xs">
          The logarithmic spiral is the true mathematical ideal; the Fibonacci version is a
          beautiful approximation used in design and nature.
        </p>
      </div>
    ),
  },
  formula: {
    title: 'φ Derivation',
    color: 'border-phi-500',
    content: (formulaStep: number) => {
      const { title, body, value } = { title: '', body: '', value: '', ...({ title: '', body: '', value: undefined } as { title: string; body: string; value?: string }) }
      void title; void body; void value; void formulaStep
      return (
        <div className="space-y-2">
          <p className="text-slate-300 text-sm leading-relaxed">
            φ satisfies the unique equation <span className="text-phi-500 font-mono">x² = x + 1</span>.
            This self-referential property gives rise to its infinite continued-fraction expansion.
          </p>
          <div className="font-mono text-xs bg-slate-800 rounded p-2 space-y-1">
            <div className="text-phi-500">φ = (1 + √5) / 2</div>
            <div className="text-slate-300">φ ≈ {PHI.toFixed(15)}</div>
            <div className="text-slate-400">φ² = φ + 1 = {(PHI * PHI).toFixed(10)}</div>
            <div className="text-slate-400">1/φ = φ − 1 = {(1 / PHI).toFixed(10)}</div>
          </div>
          <p className="text-slate-400 text-xs">
            Click the tablet to step through the derivation.
          </p>
        </div>
      )
    },
  },
}

export function InfoPanel() {
  const { selectedExhibit, setSelectedExhibit, subdivisionDepth, fibN, spiralMode, formulaStep } =
    usePhiStore()

  if (!selectedExhibit) return null

  const info = PANEL_INFO[selectedExhibit]
  const content =
    selectedExhibit === 'golden-rect'
      ? info.content(subdivisionDepth)
      : selectedExhibit === 'fibonacci'
        ? info.content(fibN as number)
        : selectedExhibit === 'spiral'
          ? info.content(spiralMode as string)
          : info.content(formulaStep as number)

  return (
    <div
      className={`absolute top-16 right-4 w-72 bg-slate-900/90 backdrop-blur rounded-xl border-l-4 ${info.color} p-4 shadow-xl`}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white font-bold text-base">{info.title}</h2>
        <button
          onClick={() => setSelectedExhibit(null)}
          className="text-slate-400 hover:text-white text-lg leading-none"
          aria-label="Close panel"
        >
          ×
        </button>
      </div>
      {content}
    </div>
  )
}
