import { usePhiStore } from '../../state/store'

export function Controls() {
  const { paused, togglePaused, quality, toggleQuality, resetSubdivision, resetFibN } =
    usePhiStore()

  return (
    <div className="flex flex-col gap-2 items-end">
      {/* Quality toggle */}
      <button
        onClick={toggleQuality}
        className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${
          quality === 'high'
            ? 'bg-phi-900/80 text-phi-500 border-phi-700 hover:bg-phi-800/80'
            : 'bg-slate-800/80 text-slate-400 border-slate-600 hover:bg-slate-700/80'
        }`}
        title="Toggle render quality (antialiasing, shadows, HDR)"
      >
        Quality: {quality.toUpperCase()}
      </button>

      {/* Pause motion */}
      <button
        onClick={togglePaused}
        className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${
          paused
            ? 'bg-amber-900/80 text-amber-400 border-amber-700 hover:bg-amber-800/80'
            : 'bg-slate-800/80 text-slate-400 border-slate-600 hover:bg-slate-700/80'
        }`}
        title="Pause floating animations"
      >
        {paused ? '▶ Resume' : '⏸ Pause'}
      </button>

      {/* Reset scene */}
      <button
        onClick={() => {
          resetSubdivision()
          resetFibN()
        }}
        className="px-3 py-1.5 rounded-lg text-xs font-mono bg-slate-800/80 text-slate-400 border border-slate-600 hover:bg-slate-700/80 hover:text-white transition-colors"
        title="Reset all exhibit states"
      >
        ↺ Reset Scene
      </button>
    </div>
  )
}
