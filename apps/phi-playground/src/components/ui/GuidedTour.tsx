import { useEffect } from 'react'
import { usePhiStore, TOUR_STEPS } from '../../state/store'

const TOUR_NAMES: Record<string, string> = {
  'golden-rect': 'Golden Rectangle',
  'fibonacci':   'Fibonacci Ratio',
  'spiral':      'Golden Spiral',
  'formula':     'φ Derivation',
}

const TOUR_HINTS: Record<string, string> = {
  'golden-rect': 'Click the rectangle to subdivide it.',
  'fibonacci':   'Click any block to advance Fibonacci n.',
  'spiral':      'Click the spiral to toggle approximation vs idealized.',
  'formula':     'Click the tablet to cycle through the derivation.',
}

export function GuidedTour() {
  const {
    tourActive, tourStep, startTour, nextTourStep, exitTour,
    selectedExhibit, incrementSubdivision, incrementFibN,
    toggleSpiralMode, cycleFormulaStep,
  } = usePhiStore()

  // Auto-trigger the interaction for the current exhibit when tour advances
  useEffect(() => {
    if (!tourActive || !selectedExhibit) return
    const timer = setTimeout(() => {
      switch (selectedExhibit) {
        case 'golden-rect': incrementSubdivision(); break
        case 'fibonacci':   incrementFibN(); break
        case 'spiral':      toggleSpiralMode(); break
        case 'formula':     cycleFormulaStep(); break
      }
    }, 800)
    return () => clearTimeout(timer)
  }, [tourActive, selectedExhibit, incrementSubdivision, incrementFibN, toggleSpiralMode, cycleFormulaStep])

  if (tourActive) {
    const exhibitId = TOUR_STEPS[tourStep]
    const isLast = tourStep === TOUR_STEPS.length - 1

    return (
      <div className="bg-slate-900/90 backdrop-blur rounded-xl border border-phi-700 p-4 shadow-xl max-w-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="text-phi-500 font-bold text-sm">
            Guided Tour — {tourStep + 1}/{TOUR_STEPS.length}
          </span>
          <button
            onClick={exitTour}
            className="text-slate-400 hover:text-white text-sm"
            aria-label="Exit guided tour"
          >
            ✕ Exit
          </button>
        </div>

        <div className="text-white font-semibold text-sm mb-1">
          {TOUR_NAMES[exhibitId]}
        </div>
        <div className="text-slate-400 text-xs mb-3">
          {TOUR_HINTS[exhibitId]}
        </div>

        {/* Progress dots */}
        <div className="flex gap-1.5 mb-3">
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i < tourStep ? 'bg-phi-500' : i === tourStep ? 'bg-phi-400' : 'bg-slate-700'
              }`}
            />
          ))}
        </div>

        <button
          onClick={nextTourStep}
          className="w-full px-3 py-1.5 rounded-lg text-sm font-semibold bg-phi-700 hover:bg-phi-500 text-white transition-colors"
        >
          {isLast ? 'Finish Tour' : 'Next →'}
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={startTour}
      className="px-4 py-2 rounded-xl text-sm font-semibold bg-phi-900/80 hover:bg-phi-700/80 text-phi-500 hover:text-white border border-phi-700 hover:border-phi-500 backdrop-blur transition-all"
    >
      ▶ Guided Tour
    </button>
  )
}
