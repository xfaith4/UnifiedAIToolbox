import { create } from 'zustand'

export type ExhibitId = 'golden-rect' | 'fibonacci' | 'spiral' | 'formula'
export type SpiralMode = 'fibonacci' | 'logarithmic'
export type Quality = 'low' | 'high'

export const TOUR_STEPS: ReadonlyArray<ExhibitId> = ['golden-rect', 'fibonacci', 'spiral', 'formula']

export interface PhiState {
  // Exhibit selection
  selectedExhibit: ExhibitId | null
  setSelectedExhibit: (id: ExhibitId | null) => void

  // Exhibit A — Golden Rectangle
  subdivisionDepth: number
  incrementSubdivision: () => void
  resetSubdivision: () => void

  // Exhibit B — Fibonacci
  fibN: number
  incrementFibN: () => void
  resetFibN: () => void

  // Exhibit C — Spiral
  spiralMode: SpiralMode
  toggleSpiralMode: () => void

  // Exhibit D — Formula derivation
  formulaStep: number
  cycleFormulaStep: () => void

  // Controls
  paused: boolean
  togglePaused: () => void

  quality: Quality
  toggleQuality: () => void

  // Guided tour
  tourActive: boolean
  tourStep: number
  startTour: () => void
  nextTourStep: () => void
  exitTour: () => void
}

export const usePhiStore = create<PhiState>((set) => ({
  selectedExhibit: null,
  setSelectedExhibit: (id) => set({ selectedExhibit: id }),

  // --- Golden Rectangle ---
  subdivisionDepth: 0,
  incrementSubdivision: () =>
    set((s) => ({ subdivisionDepth: Math.min(s.subdivisionDepth + 1, 8) })),
  resetSubdivision: () => set({ subdivisionDepth: 0 }),

  // --- Fibonacci ---
  fibN: 1,
  incrementFibN: () => set((s) => ({ fibN: Math.min(s.fibN + 1, 30) })),
  resetFibN: () => set({ fibN: 1 }),

  // --- Spiral ---
  spiralMode: 'fibonacci',
  toggleSpiralMode: () =>
    set((s) => ({ spiralMode: s.spiralMode === 'fibonacci' ? 'logarithmic' : 'fibonacci' })),

  // --- Formula ---
  formulaStep: 0,
  cycleFormulaStep: () =>
    set((s) => ({ formulaStep: (s.formulaStep + 1) % 5 })),

  // --- Controls ---
  paused: false,
  togglePaused: () => set((s) => ({ paused: !s.paused })),

  quality: 'high',
  toggleQuality: () =>
    set((s) => ({ quality: s.quality === 'high' ? 'low' : 'high' })),

  // --- Guided tour ---
  tourActive: false,
  tourStep: 0,
  startTour: () => set({ tourActive: true, tourStep: 0, selectedExhibit: TOUR_STEPS[0] }),
  nextTourStep: () =>
    set((s) => {
      const next = s.tourStep + 1
      if (next >= TOUR_STEPS.length) {
        return { tourActive: false, tourStep: 0, selectedExhibit: null }
      }
      return { tourStep: next, selectedExhibit: TOUR_STEPS[next] }
    }),
  exitTour: () => set({ tourActive: false, tourStep: 0 }),
}))
